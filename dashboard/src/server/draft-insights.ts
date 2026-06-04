import type { Draft } from "@/lib/api";
import { prisma, ensureDatabaseReady } from "@/server/prisma";

export async function fetchDraftForInsights(draftId: number): Promise<Draft | null> {
  try {
    await ensureDatabaseReady();

    const draft = await prisma.draft.findUnique({
      where: { id: draftId },
      select: {
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
      },
    });

    if (!draft) return null;

    const newsletter = await prisma.newsletter.findUnique({
      where: { id: draft.newsletterId },
      select: { issueNumber: true },
    });

    const aiDraft = JSON.parse(draft.aiDraft as string) as Record<string, unknown>;
    const humanEdits = draft.humanEdits
      ? (JSON.parse(draft.humanEdits as string) as Record<string, unknown>)
      : null;

    return {
      id: draft.id,
      newsletter_id: draft.newsletterId,
      issue_number: newsletter?.issueNumber ?? draft.newsletterId,
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
      sources_used: draft.sourcesUsed ? JSON.parse(draft.sourcesUsed as string) : null,
      sources_warning: draft.sourcesWarning ? JSON.parse(draft.sourcesWarning as string) : null,
      sources_failed: draft.sourcesFailed ? JSON.parse(draft.sourcesFailed as string) : null,
      created_at: draft.createdAt,
      updated_at: draft.updatedAt,
    };
  } catch {
    return null;
  }
}
