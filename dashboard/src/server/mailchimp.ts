import { Buffer } from "buffer";

import { buildNewsletterHtml } from "@/lib/newsletter-html";
import { getSettings } from "@/server/env";
import { appendWorkflowLog } from "@/server/logs";
import type { ArticleRecord, DraftSection, NewsletterRecord } from "@/server/types";

// ---------------------------------------------------------------------------
// Mailzzy helpers
// ---------------------------------------------------------------------------

function mailzzyBasicAuth(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

async function getMailzzyToken(clientId: string, clientSecret: string): Promise<string> {
  const response = await fetch("https://api.mailzzy.com/core/public/api/access", {
    headers: {
      App: "mailzzy",
      Authorization: mailzzyBasicAuth(clientId, clientSecret),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Mailzzy auth HTTP ${response.status}: ${await response.text()}`);
  }

  if (!response.ok) {
    throw new Error(`Mailzzy auth failed: ${await response.text()}`);
  }

  const data = (await response.json()) as { Token?: string };
  if (!data.Token) {
    throw new Error("Mailzzy auth returned no token");
  }
  return data.Token;
}

async function initMcpSession(token: string): Promise<string> {
  const response = await fetch("https://api.mailzzy.com/crm/mcp", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "ufs-newsletter", version: "1.0" },
      },
    }),
    cache: "no-store",
  });

  const sessionId = response.headers.get("Mcp-Session-Id");
  if (!sessionId) {
    throw new Error("Mailzzy MCP did not return a session ID");
  }
  return sessionId;
}

async function mcpToolCall(
  token: string,
  sessionId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch("https://api.mailzzy.com/crm/mcp", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "Mcp-Session-Id": sessionId,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
    cache: "no-store",
  });

  const text = await response.text();

  // Parse SSE: extract the data: {...} line
  const dataLine = text
    .split("\n")
    .find((line) => line.startsWith("data:"));
  const json = dataLine ? JSON.parse(dataLine.slice(5).trim()) : JSON.parse(text);

  const result = (json as { result?: { content?: Array<{ text?: string }>; isError?: boolean } })
    .result;
  if (!result) {
    throw new Error(`MCP call failed: ${text.slice(0, 300)}`);
  }
  if (result.isError) {
    const msg = result.content?.[0]?.text ?? "unknown MCP error";
    throw new Error(`Mailzzy MCP tool error: ${msg}`);
  }

  const raw = result.content?.[0]?.text;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

// ---------------------------------------------------------------------------
// Public API (mirrors the previous Mailchimp interface)
// ---------------------------------------------------------------------------

export function getMailchimpBlockReason(): string | null {
  const settings = getSettings();
  const missing: string[] = [];

  if (!settings.mailzzyClientId) missing.push("MAILZZY_CLIENT_ID");
  if (!settings.mailzzyClientSecret) missing.push("MAILZZY_CLIENT_SECRET");
  if (!settings.mailzzyGroupId) missing.push("MAILZZY_GROUP_ID");

  if (missing.length > 0) {
    return `Mailzzy not configured: ${missing.join(", ")}`;
  }
  return null;
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

const MAX_SUBJECT_LENGTH = 100;

function buildCampaignSubject(
  newsletter: NewsletterRecord,
  articles: ArticleRecord[],
  sections?: DraftSection[],
): string {
  const lead = (sections && sections.length > 0 ? sections[0] : articles[0]) as
    | { title?: string; teaser?: string }
    | undefined;

  const headline = lead?.title?.trim();
  if (!headline) {
    return `UFS Newsletter - Issue #${newsletter.issue_number}`;
  }

  const subject = `${headline} — UFS Weekly Issue #${newsletter.issue_number}`;
  if (subject.length <= MAX_SUBJECT_LENGTH) {
    return subject;
  }

  // Keep the headline intact (that's the catchy, meaningful part) and drop
  // the issue tag first; only truncate the headline itself as a last resort.
  if (headline.length <= MAX_SUBJECT_LENGTH) {
    return headline;
  }
  return `${headline.slice(0, MAX_SUBJECT_LENGTH - 1).trimEnd()}…`;
}

export async function scheduleCampaign(
  newsletter: NewsletterRecord,
  articles: ArticleRecord[],
  sections?: DraftSection[],
  groupId?: string,
): Promise<string> {
  const settings = getSettings();
  const targetGroupId = groupId ?? settings.mailzzyGroupId;

  await appendWorkflowLog({
    scope: "delivery",
    step: "mailchimp.create_campaign",
    status: "info",
    message: "Creating Mailzzy campaign.",
    context: {
      newsletter_id: newsletter.id,
      issue_number: newsletter.issue_number,
      article_count: articles.length,
      group_id: targetGroupId,
    },
  });

  const token = await getMailzzyToken(settings.mailzzyClientId, settings.mailzzyClientSecret);
  const sessionId = await initMcpSession(token);

  const html = buildHtmlContent(newsletter, articles, sections);
  const subject = buildCampaignSubject(newsletter, articles, sections);
  const campaignName = `UFS Newsletter #${newsletter.issue_number}`;

  const result = await mcpToolCall(token, sessionId, "mcp_crm_campaigns_send", {
    campaign: {
      name: campaignName,
      subject,
      content: html,
      displayName: "United Field Services",
      senderEmail: settings.mailzzySenderEmail || "venakat@unitedffs.com",
      replyToEmail: "newsletter@unitedffs.com",
    },
    campaignSegments: {
      segmentTypeId: 1,
      segmentIds: [Number(targetGroupId)],
    },
  }) as Record<string, unknown> | null;

  const campaignId = String(
    (result as Record<string, unknown>)?.campaignId ??
    (result as Record<string, unknown>)?.id ??
    Date.now(),
  );

  await appendWorkflowLog({
    scope: "delivery",
    step: "mailchimp.send",
    status: "success",
    message: "Mailzzy campaign sent.",
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

  if (settings.mailzzyOnHold) {
    return { status: "hold", campaign_id: campaignId, error: "Mailzzy delivery is on hold" };
  }
  if (!settings.mailzzyClientId || !settings.mailzzyClientSecret) {
    return { status: "unconfigured", campaign_id: campaignId };
  }

  try {
    const token = await getMailzzyToken(settings.mailzzyClientId, settings.mailzzyClientSecret);
    const sessionId = await initMcpSession(token);

    const numericId = Number(campaignId);
    if (!Number.isNaN(numericId)) {
      const campaign = await mcpToolCall(token, sessionId, "mcp_crm_campaigns_get", {
        campaignId: numericId,
      }) as Record<string, unknown> | null;

      return {
        status: campaign?.status ?? "unknown",
        campaign_id: campaignId,
        emails_sent: campaign?.sentCount ?? null,
      };
    }
  } catch {
    // fall through
  }

  return { status: "unknown", campaign_id: campaignId };
}

export interface MailzzySender {
  email: string;
  displayName: string;
  domainVerified: boolean;
}

// Confirmed live 2026-09-02: there is no per-group count tool. The real tool
// is mcp_crm_groups_list, which returns every group with its contactCount:
//   { items: [{ id, name, contactCount, visibility }], page, limit, hasMore, sort }
export async function getMailzzyGroupCounts(): Promise<Record<string, number>> {
  const settings = getSettings();
  const token = await getMailzzyToken(settings.mailzzyClientId, settings.mailzzyClientSecret);
  const sessionId = await initMcpSession(token);

  const result = (await mcpToolCall(token, sessionId, "mcp_crm_groups_list", {
    page: 1,
    limit: 100,
  })) as { items?: Array<Record<string, unknown>> } | null;

  const counts: Record<string, number> = {};
  for (const item of result?.items ?? []) {
    const id = item.id;
    const contactCount = item.contactCount;
    if ((typeof id === "number" || typeof id === "string") && typeof contactCount === "number") {
      counts[String(id)] = contactCount;
    }
  }
  return counts;
}

// Confirmed live 2026-09-02:
//   { items: [{ id, email, name, status, domainVerified }], page, limit, hasMore, sort }
export async function getMailzzySenders(): Promise<MailzzySender[]> {
  const settings = getSettings();
  const token = await getMailzzyToken(settings.mailzzyClientId, settings.mailzzyClientSecret);
  const sessionId = await initMcpSession(token);

  const result = (await mcpToolCall(token, sessionId, "mcp_crm_senders_list", {})) as
    | { items?: Array<Record<string, unknown>> }
    | null;

  return (result?.items ?? [])
    .map((row) => ({
      email: String(row.email ?? ""),
      displayName: String(row.name ?? ""),
      domainVerified: Boolean(row.domainVerified ?? false),
    }))
    .filter((sender) => sender.email);
}
