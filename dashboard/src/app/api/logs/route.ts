import { NextRequest, NextResponse } from "next/server";

import { listWorkflowLogs } from "@/server/logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limitRaw = request.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 80;
  const safeLimit = Number.isNaN(limit) ? 80 : Math.min(Math.max(limit, 1), 200);

  return NextResponse.json(await listWorkflowLogs(safeLimit));
}
