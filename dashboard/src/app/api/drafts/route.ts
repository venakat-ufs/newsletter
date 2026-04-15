import { NextRequest, NextResponse } from "next/server";

import { listDrafts, mapRouteError } from "@/server/workflow";
import type { DraftStatus } from "@/server/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const status = request.nextUrl.searchParams.get("status") as DraftStatus | null;
    return NextResponse.json(await listDrafts(status ?? undefined));
  } catch (error) {
    const mapped = mapRouteError(error);
    return NextResponse.json({ detail: mapped.detail }, { status: mapped.status });
  }
}
