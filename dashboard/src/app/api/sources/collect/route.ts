import { NextResponse } from "next/server";

import { collectAllSources } from "@/server/sources";
import { mapRouteError } from "@/server/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const { rawData, sourcesUsed, sourcesWarning, sourcesFailed } =
      await collectAllSources();

    return NextResponse.json({
      sources: rawData,
      sources_used: sourcesUsed,
      sources_warning: sourcesWarning,
      sources_failed: sourcesFailed,
    });
  } catch (error) {
    const mapped = mapRouteError(error);
    return NextResponse.json({ detail: mapped.detail }, { status: mapped.status });
  }
}
