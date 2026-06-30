import { Buffer } from "buffer";

import { buildNewsletterHtml } from "@/lib/newsletter-html";
import { getSettings } from "@/server/env";
import { appendWorkflowLog } from "@/server/logs";
import type { ArticleRecord, DraftSection, NewsletterRecord } from "@/server/types";

export function getMailchimpBlockReason(): string | null {
  const settings = getSettings();
  if (settings.mailchimpOnHold) {
    return "Mailchimp delivery is on hold. Set MAILCHIMP_ON_HOLD=false to enable scheduling.";
  }
  const missing: string[] = [];

  if (!settings.mailchimpApiKey) {
    missing.push("MAILCHIMP_API_KEY");
  }
  if (!settings.mailchimpServerPrefix) {
    missing.push("MAILCHIMP_SERVER_PREFIX");
  }
  if (!settings.mailchimpListId) {
    missing.push("MAILCHIMP_LIST_ID");
  }

  if (missing.length > 0) {
    return `Mailchimp not configured: ${missing.join(", ")}`;
  }

  return null;
}

function requireMailchimpSettings() {
  const reason = getMailchimpBlockReason();
  if (reason) {
    throw new Error(reason);
  }

  return getSettings();
}

function mailchimpHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Basic ${Buffer.from(`ufs:${apiKey}`).toString("base64")}`,
    "Content-Type": "application/json",
  };
}

function nextTuesdayAt9Utc(): string {
  const now = new Date();
  const next = new Date(now);
  const daysUntilTuesday = (2 - now.getUTCDay() + 7) % 7;
  next.setUTCDate(now.getUTCDate() + (daysUntilTuesday === 0 && now.getUTCHours() >= 9 ? 7 : daysUntilTuesday));
  next.setUTCHours(9, 0, 0, 0);
  return next.toISOString();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// When a campaign is created via the API, Mailchimp computes the recipient
// count asynchronously. Calling /actions/send before that finishes returns
// "Your Campaign is not ready to send. recipients not ready". Poll the campaign
// until the recipient count is populated (or we run out of attempts).
async function waitForRecipientsReady(
  baseUrl: string,
  headers: HeadersInit,
  campaignId: string,
  attempts = 8,
): Promise<number> {
  let lastCount = 0;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetch(
      `${baseUrl}/campaigns/${campaignId}?fields=recipients.recipient_count,status`,
      { headers, cache: "no-store" },
    );
    if (response.ok) {
      const payload = (await response.json()) as {
        recipients?: { recipient_count?: number };
      };
      lastCount = payload.recipients?.recipient_count ?? 0;
      if (lastCount > 0) {
        return lastCount;
      }
    }
    await delay(1500);
  }
  return lastCount;
}

export function buildHtmlContent(
  newsletter: NewsletterRecord,
  articles: ArticleRecord[],
  sections?: DraftSection[],
): string {
  const contentBlocks =
    sections && sections.length > 0
      ? sections.map((section) => ({
          section_type: section.section_type,
          title: section.title,
          teaser: section.teaser,
          body: section.body,
          audience_tag: section.audience_tag ?? "REO",
          metadata: section.metadata ?? null,
        }))
      : articles;

  return buildNewsletterHtml(newsletter, contentBlocks);
}

export async function scheduleCampaign(
  newsletter: NewsletterRecord,
  articles: ArticleRecord[],
  sections?: DraftSection[],
  listId?: string,
): Promise<string> {
  const settings = requireMailchimpSettings();
  const targetListId = listId || settings.mailchimpListId;
  const baseUrl = `https://${settings.mailchimpServerPrefix}.api.mailchimp.com/3.0`;
  const headers = mailchimpHeaders(settings.mailchimpApiKey);

  await appendWorkflowLog({
    scope: "delivery",
    step: "mailchimp.create_campaign",
    status: "info",
    message: "Creating Mailchimp campaign.",
    context: {
      newsletter_id: newsletter.id,
      issue_number: newsletter.issue_number,
      article_count: articles.length,
      audience_id: targetListId,
    },
  });

  const createResponse = await fetch(`${baseUrl}/campaigns`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      type: "regular",
      recipients: { list_id: targetListId },
      settings: {
        subject_line: `The Disposition Desk - Issue #${newsletter.issue_number}`,
        from_name: "United Field Services",
        reply_to: "newsletter@unitedffs.com",
        title: `Disposition Desk #${newsletter.issue_number}`,
      },
    }),
  });

  if (!createResponse.ok) {
    const detail = await createResponse.text();
    await appendWorkflowLog({
      scope: "delivery",
      step: "mailchimp.create_campaign",
      status: "error",
      message: "Mailchimp campaign creation failed.",
      context: {
        newsletter_id: newsletter.id,
        issue_number: newsletter.issue_number,
        error: detail,
      },
    });
    throw new Error(`Mailchimp create campaign failed: ${detail}`);
  }

  const created = (await createResponse.json()) as { id?: string };
  const campaignId = created.id;
  if (!campaignId) {
    throw new Error("Mailchimp did not return a campaign id");
  }

  await appendWorkflowLog({
    scope: "delivery",
    step: "mailchimp.create_campaign",
    status: "success",
    message: "Mailchimp campaign created.",
    context: {
      newsletter_id: newsletter.id,
      issue_number: newsletter.issue_number,
      campaign_id: campaignId,
    },
  });

  const contentResponse = await fetch(`${baseUrl}/campaigns/${campaignId}/content`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      html: buildHtmlContent(newsletter, articles, sections),
    }),
  });

  if (!contentResponse.ok) {
    const detail = await contentResponse.text();
    await appendWorkflowLog({
      scope: "delivery",
      step: "mailchimp.set_content",
      status: "error",
      message: "Mailchimp content upload failed.",
      context: {
        newsletter_id: newsletter.id,
        issue_number: newsletter.issue_number,
        campaign_id: campaignId,
        error: detail,
      },
    });
    throw new Error(`Mailchimp set content failed: ${detail}`);
  }

  await appendWorkflowLog({
    scope: "delivery",
    step: "mailchimp.set_content",
    status: "success",
    message: "Mailchimp campaign content updated.",
    context: {
      newsletter_id: newsletter.id,
      issue_number: newsletter.issue_number,
      campaign_id: campaignId,
    },
  });

  // Mailchimp computes the recipient list asynchronously after a campaign is
  // created. Wait for it to be ready before sending, otherwise /actions/send
  // returns "Your Campaign is not ready to send. recipients not ready".
  const recipientCount = await waitForRecipientsReady(baseUrl, headers, campaignId);
  await appendWorkflowLog({
    scope: "delivery",
    step: "mailchimp.recipients_ready",
    status: recipientCount > 0 ? "info" : "warning",
    message:
      recipientCount > 0
        ? `Recipient list ready (${recipientCount}).`
        : "Recipient list still showing 0 after polling; attempting send anyway.",
    context: {
      newsletter_id: newsletter.id,
      issue_number: newsletter.issue_number,
      campaign_id: campaignId,
      recipient_count: recipientCount,
    },
  });

  // Send immediately on approval. (Scheduling can be re-introduced later via
  // the /actions/schedule endpoint + nextTuesdayAt9Utc helper below.)
  // Retry on the transient "recipients not ready" error.
  let sendResponse: Response | null = null;
  let sendDetail = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    sendResponse = await fetch(`${baseUrl}/campaigns/${campaignId}/actions/send`, {
      method: "POST",
      headers,
    });
    if (sendResponse.ok) {
      break;
    }
    sendDetail = await sendResponse.text();
    if (!sendDetail.includes("recipients not ready") || attempt === 3) {
      break;
    }
    await delay(2000);
  }

  if (!sendResponse || !sendResponse.ok) {
    await appendWorkflowLog({
      scope: "delivery",
      step: "mailchimp.send",
      status: "error",
      message: "Mailchimp send request failed.",
      context: {
        newsletter_id: newsletter.id,
        issue_number: newsletter.issue_number,
        campaign_id: campaignId,
        error: sendDetail,
      },
    });
    throw new Error(`Mailchimp send failed: ${sendDetail}`);
  }

  await appendWorkflowLog({
    scope: "delivery",
    step: "mailchimp.send",
    status: "success",
    message: "Mailchimp campaign sent.",
    context: {
      newsletter_id: newsletter.id,
      issue_number: newsletter.issue_number,
      campaign_id: campaignId,
    },
  });

  return campaignId;
}

export async function getCampaignStatus(campaignId: string): Promise<Record<string, unknown>> {
  const settings = getSettings();
  if (settings.mailchimpOnHold) {
    return {
      status: "hold",
      campaign_id: campaignId,
      error: "Mailchimp delivery is on hold",
    };
  }
  if (!settings.mailchimpApiKey || !settings.mailchimpServerPrefix) {
    return {
      status: "unconfigured",
      campaign_id: campaignId,
      error: "Mailchimp not configured",
    };
  }

  const response = await fetch(
    `https://${settings.mailchimpServerPrefix}.api.mailchimp.com/3.0/campaigns/${campaignId}`,
    {
      headers: mailchimpHeaders(settings.mailchimpApiKey),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    return {
      status: "error",
      campaign_id: campaignId,
      error: await response.text(),
    };
  }

  const payload = (await response.json()) as Record<string, unknown>;
  return {
    status: payload.status ?? "unknown",
    send_time: payload.send_time ?? null,
    emails_sent: payload.emails_sent ?? null,
  };
}
