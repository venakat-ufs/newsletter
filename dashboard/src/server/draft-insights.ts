import type { Draft } from "@/lib/api";
import { prisma, ensureDatabaseReady } from "@/server/prisma";

const DRAFT_SELECT = {
  id: true,
  newsletterId: true,
  rawData: true,
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
} as const;

type DraftRow = {
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
};

// Fields the insights view actually reads off each raw source item
// (source cards / counts / source links). Everything else — full article
// bodies, summaries, nested payloads — is dropped to keep the page light.
const ITEM_KEEP_FIELDS = [
  "type",
  "url",
  "title",
  "name",
  "search_url",
  "market_url",
  "address",
  "state",
  "metro",
  "total_listings",
  "listing_signal_count",
  "city_count",
  "count",
];

function slimItem(item: unknown): unknown {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return item;
  }
  const record = item as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const field of ITEM_KEEP_FIELDS) {
    if (record[field] !== undefined) {
      out[field] = record[field];
    }
  }
  if (Array.isArray(record.sample_listings)) {
    out.sample_listings = (record.sample_listings as unknown[]).slice(0, 5).map((listing) => {
      const l = (listing ?? {}) as Record<string, unknown>;
      return { url: l.url, title: l.title, address: l.address };
    });
  }
  return out;
}

// Slim raw_data for the insights view: keep source structure + counts + links,
// drop heavy text. Item counts are preserved (we map, not cap) so source counts
// stay accurate. The full raw_data remains untouched in the database.
function slimRawData(rawData: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  const sources = rawData.sources;
  if (sources && typeof sources === "object") {
    const slimSources: Record<string, unknown> = {};
    for (const [key, src] of Object.entries(sources as Record<string, unknown>)) {
      if (!src || typeof src !== "object") {
        slimSources[key] = src;
        continue;
      }
      const s = src as Record<string, unknown>;
      slimSources[key] = {
        source: s.source,
        success: s.success,
        errors: s.errors,
        collected_at: s.collected_at,
        no_signal_reason: s.no_signal_reason,
        data: Array.isArray(s.data) ? (s.data as unknown[]).map(slimItem) : s.data,
      };
    }
    result.sources = slimSources;
  }

  // Sections: keep only the description (used by the topic-source map); drop
  // the duplicated heavy data arrays.
  const sections = rawData.sections;
  if (sections && typeof sections === "object") {
    const slimSections: Record<string, unknown> = {};
    for (const [key, sec] of Object.entries(sections as Record<string, unknown>)) {
      const section = (sec ?? {}) as Record<string, unknown>;
      slimSections[key] = { description: section.description };
    }
    result.sections = slimSections;
  }

  return result;
}

function mapDraftRow(draft: DraftRow, issueNumber: number | null): Draft {
  const aiDraft = JSON.parse(draft.aiDraft) as Record<string, unknown>;
  const humanEdits = draft.humanEdits
    ? (JSON.parse(draft.humanEdits) as Record<string, unknown>)
    : null;

  let rawData: Record<string, unknown> = {};
  try {
    const parsed = draft.rawData ? (JSON.parse(draft.rawData) as Record<string, unknown>) : {};
    rawData = slimRawData(parsed);
  } catch {
    rawData = {};
  }

  return {
    id: draft.id,
    newsletter_id: draft.newsletterId,
    issue_number: issueNumber ?? draft.newsletterId,
    raw_data: rawData,
    ai_draft: {
      sections: Array.isArray(aiDraft.sections) ? aiDraft.sections : [],
      errors: Array.isArray(aiDraft.errors) ? aiDraft.errors : [],
      generated_at: typeof aiDraft.generated_at === "string" ? aiDraft.generated_at : undefined,
    },
    human_edits: humanEdits
      ? { sections: Array.isArray(humanEdits.sections) ? humanEdits.sections : [] }
      : null,
    status: (draft.status as Draft["status"]) ?? "pending",
    reviewer_email: draft.reviewerEmail,
    reviewed_at: draft.reviewedAt,
    sources_used: draft.sourcesUsed ? JSON.parse(draft.sourcesUsed) : null,
    sources_warning: draft.sourcesWarning ? JSON.parse(draft.sourcesWarning) : null,
    sources_failed: draft.sourcesFailed ? JSON.parse(draft.sourcesFailed) : null,
    created_at: draft.createdAt,
    updated_at: draft.updatedAt,
  };
}

export async function fetchDraftForInsights(draftId: number): Promise<Draft | null> {
  try {
    await ensureDatabaseReady();

    const draft = await prisma.draft.findUnique({
      where: { id: draftId },
      select: DRAFT_SELECT,
    });

    if (!draft) return null;

    const newsletter = await prisma.newsletter.findUnique({
      where: { id: draft.newsletterId },
      select: { issueNumber: true },
    });

    return mapDraftRow(draft as DraftRow, newsletter?.issueNumber ?? null);
  } catch {
    return null;
  }
}

export async function fetchLatestDraftForInsights(): Promise<Draft | null> {
  try {
    await ensureDatabaseReady();

    const draft = await prisma.draft.findFirst({
      orderBy: { updatedAt: "desc" },
      select: DRAFT_SELECT,
    });

    if (!draft) return null;

    const newsletter = await prisma.newsletter.findUnique({
      where: { id: draft.newsletterId },
      select: { issueNumber: true },
    });

    return mapDraftRow(draft as DraftRow, newsletter?.issueNumber ?? null);
  } catch {
    return null;
  }
}
