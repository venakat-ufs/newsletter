import { NextRequest, NextResponse } from "next/server";

import { getDraft, mapRouteError, updateDraft } from "@/server/workflow";
import type { DraftSection, DraftStatus } from "@/server/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function badRequest(message: string): Error {
  const error = new Error(message);
  error.name = "BadRequestError";
  return error;
}

function parseDraftId(id: string): number {
  if (!/^\d+$/.test(id)) {
    throw badRequest("Invalid draft id");
  }

  const parsed = Number.parseInt(id, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw badRequest("Invalid draft id");
  }
  return parsed;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    return NextResponse.json(await getDraft(parseDraftId(id)));
  } catch (error) {
    const mapped = mapRouteError(error);
    return NextResponse.json({ detail: mapped.detail }, { status: mapped.status });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      human_edits?: { sections: DraftSection[] } | null;
      status?: DraftStatus;
      reviewer_email?: string;
      notes?: string;
    };

    return NextResponse.json(
      await updateDraft(parseDraftId(id), {
        human_edits: body.human_edits,
        status: body.status,
        reviewer_email: body.reviewer_email,
        notes: body.notes,
      }),
    );
  } catch (error) {
    const mapped = mapRouteError(error);
    return NextResponse.json({ detail: mapped.detail }, { status: mapped.status });
  }
}
