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

async function persistDatabase(
  tx: Prisma.TransactionClient,
  data: DatabaseRecord,
): Promise<void> {
  await tx.approvalLog.deleteMany();
  await tx.article.deleteMany();
  await tx.draft.deleteMany();
  await tx.newsletter.deleteMany();

  if (data.newsletters.length > 0) {
    await tx.newsletter.createMany({
      data: data.newsletters.map((newsletter) => ({
        id: newsletter.id,
        issueNumber: newsletter.issue_number,
        issueDate: newsletter.issue_date,
        status: newsletter.status,
        mailchimpCampaignId: newsletter.mailchimp_campaign_id,
        createdAt: newsletter.created_at,
        updatedAt: newsletter.updated_at,
      })),
    });
  }

  if (data.drafts.length > 0) {
    await tx.draft.createMany({
      data: data.drafts.map((draft) => ({
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
      })),
    });
  }

  if (data.articles.length > 0) {
    await tx.article.createMany({
      data: data.articles.map((article) => ({
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
      })),
    });
  }

  if (data.approval_logs.length > 0) {
    await tx.approvalLog.createMany({
      data: data.approval_logs.map((log) => ({
        id: log.id,
        draftId: log.draft_id,
        action: log.action,
        reviewer: log.reviewer,
        notes: log.notes,
        timestamp: log.timestamp,
      })),
    });
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

        const updated = await updater(db);
        await persistDatabase(tx, db);
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
