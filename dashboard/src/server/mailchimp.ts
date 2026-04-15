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
): Promise<string> {
  const settings = requireMailchimpSettings();
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
      audience_id: settings.mailchimpListId,
    },
  });

  const createResponse = await fetch(`${baseUrl}/campaigns`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      type: "regular",
      recipients: { list_id: settings.mailchimpListId },
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

  const scheduleResponse = await fetch(`${baseUrl}/campaigns/${campaignId}/actions/schedule`, {
    method: "POST",
    headers,
    body: JSON.stringify({ schedule_time: nextTuesdayAt9Utc() }),
  });

  if (!scheduleResponse.ok) {
    const detail = await scheduleResponse.text();
    await appendWorkflowLog({
      scope: "delivery",
      step: "mailchimp.schedule",
      status: "error",
      message: "Mailchimp schedule request failed.",
      context: {
        newsletter_id: newsletter.id,
        issue_number: newsletter.issue_number,
        campaign_id: campaignId,
        error: detail,
      },
    });
    throw new Error(`Mailchimp schedule failed: ${detail}`);
  }

  await appendWorkflowLog({
    scope: "delivery",
    step: "mailchimp.schedule",
    status: "success",
    message: "Mailchimp campaign scheduled.",
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
