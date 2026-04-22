import { NextRequest, NextResponse } from "next/server";

import { mapRouteError, runPipeline } from "@/server/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const force = request.nextUrl.searchParams.get("force") === "true";
    return NextResponse.json(await runPipeline(force));
  } catch (error) {
    const mapped = mapRouteError(error);
    return NextResponse.json({ detail: mapped.detail }, { status: mapped.status });
  }
}
