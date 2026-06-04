import type { Draft } from "@/lib/api";
import { prisma, ensureDatabaseReady } from "@/server/prisma";

const DRAFT_SELECT = {
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
} as const;

type DraftRow = {
  id: number;
  newsletterId: number;
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

function mapDraftRow(draft: DraftRow, issueNumber: number | null): Draft {
  const aiDraft = JSON.parse(draft.aiDraft) as Record<string, unknown>;
  const humanEdits = draft.humanEdits
    ? (JSON.parse(draft.humanEdits) as Record<string, unknown>)
    : null;

  return {
    id: draft.id,
    newsletter_id: draft.newsletterId,
    issue_number: issueNumber ?? draft.newsletterId,
    raw_data: {},
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
