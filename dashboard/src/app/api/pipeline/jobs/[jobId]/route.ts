import { NextRequest, NextResponse } from "next/server";

import { getPipelineJob, startPipelineJob } from "@/server/pipeline-jobs";
import { mapRouteError } from "@/server/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await context.params;
    const job = await getPipelineJob(jobId);
    if (!job) {
      return NextResponse.json({ detail: "Pipeline job not found." }, { status: 404 });
    }

    if (job.status === "queued") {
      startPipelineJob(job.id);
    }

    return NextResponse.json(job, { status: job.status === "running" ? 202 : 200 });
  } catch (error) {
    const mapped = mapRouteError(error);
    return NextResponse.json({ detail: mapped.detail }, { status: mapped.status });
  }
}

