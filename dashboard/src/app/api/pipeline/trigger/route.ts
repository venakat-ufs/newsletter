import { NextRequest, NextResponse } from "next/server";

import { AUTH_COOKIE_NAME, verifySessionToken } from "@/server/auth";
import { createPipelineJob, startPipelineJob } from "@/server/pipeline-jobs";
import { mapRouteError, runPipeline } from "@/server/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const force = request.nextUrl.searchParams.get("force") === "true";
    const asyncMode = request.nextUrl.searchParams.get("async") === "true";

    if (!asyncMode) {
      return NextResponse.json(await runPipeline(force));
    }

    const sessionToken = request.cookies.get(AUTH_COOKIE_NAME)?.value;
    const session = await verifySessionToken(sessionToken);
    const job = await createPipelineJob(force, session?.username ?? null);
    startPipelineJob(job.id);

    return NextResponse.json(
      {
        ...job,
        message: "Pipeline queued. Poll job status for progress updates.",
      },
      { status: 202 },
    );

  } catch (error) {
    const mapped = mapRouteError(error);
    return NextResponse.json({ detail: mapped.detail }, { status: mapped.status });
  }
}
