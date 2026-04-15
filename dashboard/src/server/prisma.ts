import fs from "fs/promises";
import path from "path";

import { PrismaClient } from "@prisma/client";

import { getSettings } from "@/server/env";
import { resolveDashboardPath, resolveRepoPath } from "@/server/paths";
import type { DatabaseRecord, DraftSection } from "@/server/types";

const DATA_DIR = resolveRepoPath("data");
const LEGACY_DATA_FILE = resolveRepoPath("data", "ufs-newsletter.json");
const PRISMA_SCHEMA_DIR = resolveDashboardPath("prisma");

const globalForPrisma = globalThis as typeof globalThis & {
  __ufsPrisma?: PrismaClient;
};

function normalizeDatabaseUrl(databaseUrl: string): string {
  if (!databaseUrl.startsWith("file:")) {
    return databaseUrl;
  }

  const target = databaseUrl.slice("file:".length);
  if (!target || path.isAbsolute(target)) {
    return databaseUrl;
  }

  return `file:${path.resolve(PRISMA_SCHEMA_DIR, target)}`;
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export const prisma =
  globalForPrisma.__ufsPrisma ??
  new PrismaClient({
    datasourceUrl: normalizeDatabaseUrl(getSettings().databaseUrl),
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__ufsPrisma = prisma;
}

let initializationPromise: Promise<void> | null = null;

async function readLegacyDatabase(): Promise<DatabaseRecord | null> {
  try {
    const raw = await fs.readFile(LEGACY_DATA_FILE, "utf8");
    return JSON.parse(raw) as DatabaseRecord;
  } catch {
    return null;
  }
}

async function importLegacyJsonIfNeeded(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });

  const newsletterCount = await prisma.newsletter.count();
  if (newsletterCount > 0) {
    return;
  }

  const legacyDatabase = await readLegacyDatabase();
  if (!legacyDatabase) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (legacyDatabase.newsletters.length > 0) {
      await tx.newsletter.createMany({
        data: legacyDatabase.newsletters.map((newsletter) => ({
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

    if (legacyDatabase.drafts.length > 0) {
      await tx.draft.createMany({
        data: legacyDatabase.drafts.map((draft) => ({
          id: draft.id,
          newsletterId: draft.newsletter_id,
          rawData: stringifyJson(draft.raw_data),
          aiDraft: stringifyJson(draft.ai_draft),
          humanEdits: draft.human_edits ? stringifyJson(draft.human_edits) : null,
          status: draft.status,
          reviewerEmail: draft.reviewer_email,
          reviewedAt: draft.reviewed_at,
          sourcesUsed: draft.sources_used ? stringifyJson(draft.sources_used) : null,
          sourcesWarning: draft.sources_warning ? stringifyJson(draft.sources_warning) : null,
          sourcesFailed: draft.sources_failed ? stringifyJson(draft.sources_failed) : null,
          createdAt: draft.created_at,
          updatedAt: draft.updated_at,
        })),
      });
    }

    if (legacyDatabase.articles.length > 0) {
      await tx.article.createMany({
        data: legacyDatabase.articles.map((article) => ({
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

    if (legacyDatabase.approval_logs.length > 0) {
      await tx.approvalLog.createMany({
        data: legacyDatabase.approval_logs.map((log) => ({
          id: log.id,
          draftId: log.draft_id,
          action: log.action,
          reviewer: log.reviewer,
          notes: log.notes,
          timestamp: log.timestamp,
        })),
      });
    }
  });
}

export async function ensureDatabaseReady(): Promise<void> {
  if (!initializationPromise) {
    initializationPromise = importLegacyJsonIfNeeded().catch((error) => {
      initializationPromise = null;
      throw error;
    });
  }

  await initializationPromise;
}

export function mapDatabaseRows(rows: {
  newsletters: Array<{
    id: number;
    issueNumber: number;
    issueDate: string;
    status: string;
    mailchimpCampaignId: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  drafts: Array<{
    id: number;
    newsletterId: number;
    rawData: string;
    aiDraft: string;
    humanEdits: string | null;
    status: string;
    reviewerEmail: string | null;
    reviewedAt: string | null;
    sourcesUsed: string | null;
    sourcesWarning: string | null;
    sourcesFailed: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  articles: Array<{
    id: number;
    newsletterId: number;
    sectionType: string;
    title: string;
    teaser: string;
    body: string;
    audienceTag: string;
    publishDate: string | null;
    msPlatformUrl: string | null;
    createdAt: string;
  }>;
  approvalLogs: Array<{
    id: number;
    draftId: number;
    action: string;
    reviewer: string;
    notes: string | null;
    timestamp: string;
  }>;
}): DatabaseRecord {
  return {
    newsletters: rows.newsletters.map((newsletter) => ({
      id: newsletter.id,
      issue_number: newsletter.issueNumber,
      issue_date: newsletter.issueDate,
      status: newsletter.status as DatabaseRecord["newsletters"][number]["status"],
      mailchimp_campaign_id: newsletter.mailchimpCampaignId,
      created_at: newsletter.createdAt,
      updated_at: newsletter.updatedAt,
    })),
    drafts: rows.drafts.map((draft) => ({
      id: draft.id,
      newsletter_id: draft.newsletterId,
      raw_data: parseJson<Record<string, unknown>>(draft.rawData, {}),
      ai_draft: parseJson<Record<string, unknown>>(draft.aiDraft, {}),
      human_edits: parseJson<{ sections?: DraftSection[] } | null>(draft.humanEdits, null),
      status: draft.status as DatabaseRecord["drafts"][number]["status"],
      reviewer_email: draft.reviewerEmail,
      reviewed_at: draft.reviewedAt,
      sources_used: parseJson<string[] | null>(draft.sourcesUsed, null),
      sources_warning: parseJson<string[] | null>(draft.sourcesWarning, null),
      sources_failed: parseJson<string[] | null>(draft.sourcesFailed, null),
      created_at: draft.createdAt,
      updated_at: draft.updatedAt,
    })),
    articles: rows.articles.map((article) => ({
      id: article.id,
      newsletter_id: article.newsletterId,
      section_type: article.sectionType,
      title: article.title,
      teaser: article.teaser,
      body: article.body,
      audience_tag: article.audienceTag,
      publish_date: article.publishDate,
      ms_platform_url: article.msPlatformUrl,
      created_at: article.createdAt,
    })),
    approval_logs: rows.approvalLogs.map((log) => ({
      id: log.id,
      draft_id: log.draftId,
      action: log.action as DatabaseRecord["approval_logs"][number]["action"],
      reviewer: log.reviewer,
      notes: log.notes,
      timestamp: log.timestamp,
    })),
  };
}
