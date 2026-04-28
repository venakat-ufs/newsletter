import { appendWorkflowLog } from "@/server/logs";
import { ensureDatabaseReady, prisma } from "@/server/prisma";
import { getSettings } from "@/server/env";
import { runPipeline } from "@/server/workflow";

const JOB_LEASE_MS = 10 * 60 * 1000;

export type PipelineJobStatus = "queued" | "running" | "succeeded" | "failed";

export interface PipelineJobSummary {
  id: string;
  status: PipelineJobStatus;
  force: boolean;
  requestedBy: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  retryAfterSeconds: number;
  result: Record<string, unknown> | null;
  error: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function safeParseResult(value: string | null): Record<string, unknown> | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Ignore malformed payloads from legacy rows.
  }
  return null;
}

function toPipelineJobSummary(row: {
  id: string;
  status: string;
  force: boolean;
  requestedBy: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  resultJson: string | null;
  errorDetail: string | null;
}): PipelineJobSummary {
  return {
    id: row.id,
    status: row.status as PipelineJobStatus,
    force: row.force,
    requestedBy: row.requestedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    retryAfterSeconds: row.status === "running" ? 3 : 0,
    result: safeParseResult(row.resultJson),
    error: row.errorDetail,
  };
}

function truncateErrorDetail(value: unknown): string {
  const raw = value instanceof Error ? value.message : "Pipeline job failed.";
  return raw.slice(0, 700);
}

export async function createPipelineJob(
  force: boolean,
  requestedBy: string | null,
): Promise<PipelineJobSummary> {
  await ensureDatabaseReady();
  const createdAt = nowIso();
  const row = await prisma.pipelineJob.create({
    data: {
      id: crypto.randomUUID(),
      status: "queued",
      force,
      requestedBy,
      createdAt,
      updatedAt: createdAt,
    },
  });
  return toPipelineJobSummary(row);
}

export async function getPipelineJob(jobId: string): Promise<PipelineJobSummary | null> {
  await ensureDatabaseReady();
  const row = await prisma.pipelineJob.findUnique({ where: { id: jobId } });
  return row ? toPipelineJobSummary(row) : null;
}

async function tryClaimJob(jobId: string): Promise<PipelineJobSummary | null> {
  await ensureDatabaseReady();
  const current = await prisma.pipelineJob.findUnique({ where: { id: jobId } });
  if (!current) {
    return null;
  }

  if (current.status === "succeeded" || current.status === "failed") {
    return toPipelineJobSummary(current);
  }

  const now = nowIso();
  if (
    current.status === "running" &&
    current.leaseExpiresAt &&
    current.leaseExpiresAt >= now
  ) {
    return toPipelineJobSummary(current);
  }

  const claimed = await prisma.pipelineJob.updateMany({
    where: {
      id: current.id,
      updatedAt: current.updatedAt,
      OR: [
        { status: "queued" },
        { status: "running", leaseExpiresAt: null },
        { status: "running", leaseExpiresAt: { lt: now } },
      ],
    },
    data: {
      status: "running",
      startedAt: current.startedAt ?? now,
      updatedAt: now,
      leaseExpiresAt: new Date(Date.now() + JOB_LEASE_MS).toISOString(),
      errorDetail: null,
    },
  });

  if (claimed.count === 0) {
    const latest = await prisma.pipelineJob.findUnique({ where: { id: jobId } });
    return latest ? toPipelineJobSummary(latest) : null;
  }

  const row = await prisma.pipelineJob.findUnique({ where: { id: jobId } });
  return row ? toPipelineJobSummary(row) : null;
}

export function startPipelineJob(jobId: string): void {
  const { appPublicUrl } = getSettings();
  // Fire a real HTTP POST so the job runs in its own serverless function (maxDuration=120),
  // not inside the trigger function that gets killed after the 202 response is sent.
  fetch(`${appPublicUrl}/api/pipeline/jobs/${jobId}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  }).catch(() => {
    // Best-effort; the job stays "queued" and can be retried by the UI if this fails.
  });
}

export async function runPipelineJob(jobId: string): Promise<PipelineJobSummary | null> {
  const claimed = await tryClaimJob(jobId);
  if (!claimed) {
    return null;
  }

  if (claimed.status !== "running") {
    return claimed;
  }

  await appendWorkflowLog({
    scope: "pipeline_job",
    step: "pipeline_job.start",
    status: "info",
    message: `Started pipeline job ${jobId}.`,
    context: {
      job_id: jobId,
      force: claimed.force,
    },
  });

  try {
    const result = await runPipeline(claimed.force);
    const finishedAt = nowIso();
    const row = await prisma.pipelineJob.update({
      where: { id: jobId },
      data: {
        status: "succeeded",
        completedAt: finishedAt,
        updatedAt: finishedAt,
        leaseExpiresAt: null,
        resultJson: JSON.stringify(result),
        errorDetail: null,
      },
    });

    await appendWorkflowLog({
      scope: "pipeline_job",
      step: "pipeline_job.complete",
      status: "success",
      message: `Pipeline job ${jobId} completed successfully.`,
      context: {
        job_id: jobId,
        newsletter_id: result.newsletter_id,
        draft_id: result.draft_id,
      },
    });

    return toPipelineJobSummary(row);
  } catch (error) {
    const finishedAt = nowIso();
    const row = await prisma.pipelineJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        completedAt: finishedAt,
        updatedAt: finishedAt,
        leaseExpiresAt: null,
        resultJson: null,
        errorDetail: truncateErrorDetail(error),
      },
    });

    await appendWorkflowLog({
      scope: "pipeline_job",
      step: "pipeline_job.complete",
      status: "error",
      message: `Pipeline job ${jobId} failed.`,
      context: {
        job_id: jobId,
      },
    });

    return toPipelineJobSummary(row);
  }
}

