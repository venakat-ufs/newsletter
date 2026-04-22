import type { Prisma } from "@prisma/client";

import { prisma, ensureDatabaseReady, mapDatabaseRows } from "@/server/prisma";
import type { DatabaseRecord } from "@/server/types";

let writeQueue: Promise<unknown> = Promise.resolve();

export async function readDatabase(): Promise<DatabaseRecord> {
  await ensureDatabaseReady();
  const [newsletters, drafts, articles, approvalLogs] = await Promise.all([
    prisma.newsletter.findMany({ orderBy: { id: "asc" } }),
    prisma.draft.findMany({ orderBy: { id: "asc" } }),
    prisma.article.findMany({ orderBy: { id: "asc" } }),
    prisma.approvalLog.findMany({ orderBy: { id: "asc" } }),
  ]);

  return mapDatabaseRows({
    newsletters,
    drafts,
    articles,
    approvalLogs,
  });
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
          createdAt: newsletter.created_at,
          updatedAt: newsletter.updated_at,
        },
        update: {
          issueNumber: newsletter.issue_number,
          issueDate: newsletter.issue_date,
          status: newsletter.status,
          mailchimpCampaignId: newsletter.mailchimp_campaign_id,
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
      await tx.draft.upsert({
        where: { id: draft.id },
        create: {
          id: draft.id,
          newsletterId: draft.newsletter_id,
          rawData: JSON.stringify(draft.raw_data ?? {}),
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
          rawData: JSON.stringify(draft.raw_data ?? {}),
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
    result = await prisma.$transaction(
      async (tx) => {
        const [newsletters, drafts, articles, approvalLogs] = await Promise.all([
          tx.newsletter.findMany({ orderBy: { id: "asc" } }),
          tx.draft.findMany({ orderBy: { id: "asc" } }),
          tx.article.findMany({ orderBy: { id: "asc" } }),
          tx.approvalLog.findMany({ orderBy: { id: "asc" } }),
        ]);

        const db = mapDatabaseRows({
          newsletters,
          drafts,
          articles,
          approvalLogs,
        });
        const beforeUpdate = JSON.parse(JSON.stringify(db)) as DatabaseRecord;

        const updated = await updater(db);
        await persistDatabase(tx, beforeUpdate, db);
        return updated;
      },
      {
        maxWait: 120000,
        timeout: 120000,
      },
    );
  });

  writeQueue = pendingWrite.catch(() => undefined);
  await pendingWrite;
  return result as T;
}

export function nextId(values: Array<{ id: number }>): number {
  return values.reduce((maxId, value) => Math.max(maxId, value.id), 0) + 1;
}
