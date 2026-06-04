import { type NextRequest, NextResponse } from "next/server";

import { prisma, ensureDatabaseReady } from "@/server/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const draftId = Number.parseInt(id, 10);
    if (!Number.isInteger(draftId) || draftId <= 0) {
      return NextResponse.json({ detail: "Invalid draft id" }, { status: 400 });
    }

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

    if (!draft) {
      return NextResponse.json({ detail: "Draft not found" }, { status: 404 });
    }

    const newsletter = await prisma.newsletter.findUnique({
      where: { id: draft.newsletterId },
      select: { issueNumber: true },
    });


    return NextResponse.json({
      id: draft.id,
      newsletter_id: draft.newsletterId,
      issue_number: newsletter?.issueNumber ?? draft.newsletterId,
      ai_draft: JSON.parse(draft.aiDraft as string),
      human_edits: draft.humanEdits ? JSON.parse(draft.humanEdits as string) : null,
      status: draft.status,
      reviewer_email: draft.reviewerEmail,
      reviewed_at: draft.reviewedAt,
      sources_used: draft.sourcesUsed ? JSON.parse(draft.sourcesUsed as string) : null,
      sources_warning: draft.sourcesWarning ? JSON.parse(draft.sourcesWarning as string) : null,
      sources_failed: draft.sourcesFailed ? JSON.parse(draft.sourcesFailed as string) : null,
      created_at: draft.createdAt,
      updated_at: draft.updatedAt,
      raw_data: {},
    });
  } catch (error) {
    console.error("[insights] failed to load draft:", error);
    return NextResponse.json({ detail: "Internal server error" }, { status: 500 });
  }
}
