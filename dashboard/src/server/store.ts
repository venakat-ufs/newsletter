import type { Prisma } from "@prisma/client";

import { prisma, ensureDatabaseReady, mapDatabaseRows } from "@/server/prisma";
import { isRawDataLoaded } from "@/server/types";
import type { DatabaseRecord } from "@/server/types";

let writeQueue: Promise<unknown> = Promise.resolve();

// The Supabase transaction pooler drops idle connections (e.g. while a long
// OpenAI generation runs). The next query then fails with "Server has closed
// the connection". Retry once after forcing a reconnect.
function isConnectionDropError(error: unknown): boolean {
  const message = String((error as { message?: string })?.message ?? "");
  return (
    message.includes("Server has closed the connection") ||
    message.includes("Can't reach database server") ||
    message.includes("ECONNRESET") ||
    message.includes("Connection terminated") ||
    message.includes("connection closed")
  );
}

async function runWithDbRetry<T>(op: () => Promise<T>, attempts = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await op();
    } catch (error) {
      lastError = error;
      if (!isConnectionDropError(error) || attempt === attempts - 1) {
        throw error;
      }
      // Force a fresh connection before retrying.
      try {
        await prisma.$disconnect();
      } catch {
        /* ignore */
      }
      try {
        await prisma.$connect();
      } catch {
        /* ignore */
      }
    }
  }
  throw lastError;
}

// drafts.raw_data can run 500-700KB per row once the table has real pipeline
// history (52 rows / ~26MB total observed) - Prisma's query engine hangs
// indefinitely (not just slowly, confirmed by letting it run 4+ minutes vs.
// ~4 seconds for the same data over a raw driver, reproduced against both
// the transaction pooler and the session pooler) when findMany() pulls many
// rows with that field included. It is never needed for the bulk
// read-everything/diff/write pattern this store uses - only a handful of
// call sites need one or a few specific drafts' raw_data (AI draft
// generation, comparing against historical issues), and they fetch it
// on demand via getDraftsRawData() below. This scales however large the
// drafts table gets, since the one large field is never part of the bulk
// fetch, no matter how many rows exist.
const DRAFT_BULK_SELECT = {
  id: true,
  newsletterId: true,
  aiDraft: true,
  humanEdits: true,
  status: true,
  reviewerEmail: true,
  reviewedAt: true,
  sourcesUsed: true,
  sourcesWarning: true,
  sourcesFailed: true,
  createdAt: true,
  updatedAt: true,
  // rawData intentionally excluded - see comment above.
} as const;

interface FetchClient {
  newsletter: { findMany: (args: { orderBy: { id: "asc" } }) => Promise<unknown[]> };
  draft: {
    findMany: (args: {
      orderBy: { id: "asc" };
      select: typeof DRAFT_BULK_SELECT;
    }) => Promise<unknown[]>;
  };
  article: { findMany: (args: { orderBy: { id: "asc" } }) => Promise<unknown[]> };
  approvalLog: { findMany: (args: { orderBy: { id: "asc" } }) => Promise<unknown[]> };
}

async function fetchAllTables(client: FetchClient) {
  const [newsletters, drafts, articles, approvalLogs] = await Promise.all([
    client.newsletter.findMany({ orderBy: { id: "asc" } }),
    client.draft.findMany({ orderBy: { id: "asc" }, select: DRAFT_BULK_SELECT }),
    client.article.findMany({ orderBy: { id: "asc" } }),
    client.approvalLog.findMany({ orderBy: { id: "asc" } }),
  ]);
  return { newsletters, drafts, articles, approvalLogs } as Parameters<typeof mapDatabaseRows>[0];
}

export async function readDatabase(): Promise<DatabaseRecord> {
  await ensureDatabaseReady();
  const rows = await runWithDbRetry(() => fetchAllTables(prisma));
  return mapDatabaseRows(rows);
}

// Fetch raw_data for a small, specific set of drafts on demand. This is the
// only place raw_data is ever read for more than one draft at a time - use
// it instead of pulling raw_data through the bulk readDatabase()/
// withDatabase() path (which never carries it - see DRAFT_BULK_SELECT above).
export async function getDraftsRawData(
  draftIds: number[],
): Promise<Map<number, Record<string, unknown>>> {
  if (draftIds.length === 0) {
    return new Map();
  }
  await ensureDatabaseReady();
  const rows = await runWithDbRetry(() =>
    prisma.draft.findMany({
      where: { id: { in: draftIds } },
      select: { id: true, rawData: true },
    }),
  );
  return new Map(
    rows.map((row) => {
      try {
        return [row.id, JSON.parse(row.rawData) as Record<string, unknown>];
      } catch {
        return [row.id, {}];
      }
    }),
  );
}

function mapById<T extends { id: number }>(rows: T[]): Map<number, T> {
  return new Map(rows.map((row) => [row.id, row]));
}

function rowsDiffer<T>(previous: T, next: T): boolean {
  return JSON.stringify(previous) !== JSON.stringify(next);
}

function deletedIds<T extends { id: number }>(previous: T[], next: T[]): number[] {
  const nextIds = new Set(next.map((row) => row.id));
  return previous.filter((row) => !nextIds.has(row.id)).map((row) => row.id);
}

async function persistDatabase(
  tx: Prisma.TransactionClient,
  previous: DatabaseRecord,
  next: DatabaseRecord,
): Promise<void> {
  const deletedApprovalLogIds = deletedIds(previous.approval_logs, next.approval_logs);
  if (deletedApprovalLogIds.length > 0) {
    await tx.approvalLog.deleteMany({ where: { id: { in: deletedApprovalLogIds } } });
  }

  const deletedArticleIds = deletedIds(previous.articles, next.articles);
  if (deletedArticleIds.length > 0) {
    await tx.article.deleteMany({ where: { id: { in: deletedArticleIds } } });
  }

  const deletedDraftIds = deletedIds(previous.drafts, next.drafts);
  if (deletedDraftIds.length > 0) {
    await tx.draft.deleteMany({ where: { id: { in: deletedDraftIds } } });
  }

  const deletedNewsletterIds = deletedIds(previous.newsletters, next.newsletters);
  if (deletedNewsletterIds.length > 0) {
    await tx.newsletter.deleteMany({ where: { id: { in: deletedNewsletterIds } } });
  }

  const previousNewsletters = mapById(previous.newsletters);
  for (const newsletter of next.newsletters) {
    const previousRow = previousNewsletters.get(newsletter.id);
    if (!previousRow || rowsDiffer(previousRow, newsletter)) {
      await tx.newsletter.upsert({
        where: { id: newsletter.id },
        create: {
          id: newsletter.id,
          issueNumber: newsletter.issue_number,
          issueDate: newsletter.issue_date,
          status: newsletter.status,
          mailchimpCampaignId: newsletter.mailchimp_campaign_id,
          registeredSendStatus: newsletter.registered_send_status,
          registeredCampaignId: newsletter.registered_campaign_id,
          prospectSendStatus: newsletter.prospect_send_status,
          prospectCampaignId: newsletter.prospect_campaign_id,
          senderEmail: newsletter.sender_email,
          createdAt: newsletter.created_at,
          updatedAt: newsletter.updated_at,
        },
        update: {
          issueNumber: newsletter.issue_number,
          issueDate: newsletter.issue_date,
          status: newsletter.status,
          mailchimpCampaignId: newsletter.mailchimp_campaign_id,
          registeredSendStatus: newsletter.registered_send_status,
          registeredCampaignId: newsletter.registered_campaign_id,
          prospectSendStatus: newsletter.prospect_send_status,
          prospectCampaignId: newsletter.prospect_campaign_id,
          senderEmail: newsletter.sender_email,
          createdAt: newsletter.created_at,
          updatedAt: newsletter.updated_at,
        },
      });
    }
  }

  const previousDrafts = mapById(previous.drafts);
  for (const draft of next.drafts) {
    const previousRow = previousDrafts.get(draft.id);
    if (!previousRow || rowsDiffer(previousRow, draft)) {
      // raw_data is never part of the bulk-loaded snapshot (see
      // DRAFT_BULK_SELECT in readDatabase/withDatabase above) - it carries
      // the RAW_DATA_NOT_LOADED sentinel unless something explicitly
      // hydrated it via getDraftsRawData(). Only include it in the write
      // when it was genuinely hydrated/set, so an update triggered by some
      // other field (status, human_edits, ...) can never overwrite a
      // draft's real stored raw_data with this placeholder.
      const rawDataLoaded = isRawDataLoaded(draft.raw_data);
      await tx.draft.upsert({
        where: { id: draft.id },
        create: {
          id: draft.id,
          newsletterId: draft.newsletter_id,
          // NOT NULL column - a genuinely new draft must supply real data
          // (it was just constructed in memory, never lazy-loaded), but
          // fall back to {} rather than throw if that invariant is ever
          // violated, since a new empty draft row is still valid.
          rawData: JSON.stringify(rawDataLoaded ? draft.raw_data : {}),
          aiDraft: JSON.stringify(draft.ai_draft ?? {}),
          humanEdits: draft.human_edits ? JSON.stringify(draft.human_edits) : null,
          status: draft.status,
          reviewerEmail: draft.reviewer_email,
          reviewedAt: draft.reviewed_at,
          sourcesUsed: draft.sources_used ? JSON.stringify(draft.sources_used) : null,
          sourcesWarning: draft.sources_warning ? JSON.stringify(draft.sources_warning) : null,
          sourcesFailed: draft.sources_failed ? JSON.stringify(draft.sources_failed) : null,
          createdAt: draft.created_at,
          updatedAt: draft.updated_at,
        },
        update: {
          newsletterId: draft.newsletter_id,
          ...(rawDataLoaded ? { rawData: JSON.stringify(draft.raw_data) } : {}),
          aiDraft: JSON.stringify(draft.ai_draft ?? {}),
          humanEdits: draft.human_edits ? JSON.stringify(draft.human_edits) : null,
          status: draft.status,
          reviewerEmail: draft.reviewer_email,
          reviewedAt: draft.reviewed_at,
          sourcesUsed: draft.sources_used ? JSON.stringify(draft.sources_used) : null,
          sourcesWarning: draft.sources_warning ? JSON.stringify(draft.sources_warning) : null,
          sourcesFailed: draft.sources_failed ? JSON.stringify(draft.sources_failed) : null,
          createdAt: draft.created_at,
          updatedAt: draft.updated_at,
        },
      });
    }
  }

  const previousArticles = mapById(previous.articles);
  for (const article of next.articles) {
    const previousRow = previousArticles.get(article.id);
    if (!previousRow || rowsDiffer(previousRow, article)) {
      await tx.article.upsert({
        where: { id: article.id },
        create: {
          id: article.id,
          newsletterId: article.newsletter_id,
          sectionType: article.section_type,
          title: article.title,
          teaser: article.teaser,
          body: article.body,
          audienceTag: article.audience_tag,
          publishDate: article.publish_date,
          msPlatformUrl: article.ms_platform_url,
          createdAt: article.created_at,
        },
        update: {
          newsletterId: article.newsletter_id,
          sectionType: article.section_type,
          title: article.title,
          teaser: article.teaser,
          body: article.body,
          audienceTag: article.audience_tag,
          publishDate: article.publish_date,
          msPlatformUrl: article.ms_platform_url,
          createdAt: article.created_at,
        },
      });
    }
  }

  const previousApprovalLogs = mapById(previous.approval_logs);
  for (const log of next.approval_logs) {
    const previousRow = previousApprovalLogs.get(log.id);
    if (!previousRow || rowsDiffer(previousRow, log)) {
      await tx.approvalLog.upsert({
        where: { id: log.id },
        create: {
          id: log.id,
          draftId: log.draft_id,
          action: log.action,
          reviewer: log.reviewer,
          notes: log.notes,
          timestamp: log.timestamp,
        },
        update: {
          draftId: log.draft_id,
          action: log.action,
          reviewer: log.reviewer,
          notes: log.notes,
          timestamp: log.timestamp,
        },
      });
    }
  }
}

export async function withDatabase<T>(
  updater: (db: DatabaseRecord) => Promise<T> | T,
): Promise<T> {
  let result: T | undefined;

  const pendingWrite = writeQueue.then(async () => {
    await ensureDatabaseReady();
    result = await runWithDbRetry(() =>
      prisma.$transaction(
      async (tx) => {
        const rows = await fetchAllTables(tx);
        const db = mapDatabaseRows(rows);
        const beforeUpdate = JSON.parse(JSON.stringify(db)) as DatabaseRecord;

        const updated = await updater(db);
        await persistDatabase(tx, beforeUpdate, db);
        return updated;
      },
      {
        maxWait: 120000,
        timeout: 120000,
      },
      ),
    );
  });

  writeQueue = pendingWrite.catch(() => undefined);
  await pendingWrite;
  return result as T;
}

export function nextId(values: Array<{ id: number }>): number {
  return values.reduce((maxId, value) => Math.max(maxId, value.id), 0) + 1;
}
