import fs from "fs/promises";
import path from "path";

import { resolveRepoPath } from "@/server/paths";
import { ensureDatabaseReady, prisma } from "@/server/prisma";

export interface WorkflowLogEntry {
  id: string;
  timestamp: string;
  scope: string;
  step: string;
  status: "info" | "success" | "warning" | "error";
  message: string;
  context?: Record<string, unknown>;
}

// On Vercel, /var/task is read-only — use /tmp for ephemeral log storage.
function getLogDir(): string {
  if (process.env.VERCEL || process.env.VERCEL_ENV) return "/tmp";
  const repoPath = resolveRepoPath("data");
  if (repoPath.startsWith("/var/task")) return "/tmp";
  return repoPath;
}

const LOG_DIR = getLogDir();
const LOG_FILE = path.join(LOG_DIR, "workflow-log.json");
const MAX_LOG_ENTRIES = 400;

function safeParseContext(value: string | null): Record<string, unknown> | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Ignore malformed rows from legacy writes.
  }
  return undefined;
}

// File writes stay serial to prevent JSON corruption.
let fileWriteQueue: Promise<void> = Promise.resolve();

async function ensureLogFile(): Promise<void> {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
  } catch {
    return;
  }
  try {
    await fs.access(LOG_FILE);
  } catch {
    await fs.writeFile(LOG_FILE, "[]", "utf8");
  }
}

async function readLogFile(): Promise<WorkflowLogEntry[]> {
  await ensureLogFile();
  try {
    const raw = await fs.readFile(LOG_FILE, "utf8");
    const parsed = JSON.parse(raw) as WorkflowLogEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeToFile(logEntry: WorkflowLogEntry): Promise<void> {
  const pendingWrite = fileWriteQueue.then(async () => {
    try {
      const logs = await readLogFile();
      logs.unshift(logEntry);
      await fs.writeFile(LOG_FILE, JSON.stringify(logs.slice(0, MAX_LOG_ENTRIES), null, 2), "utf8");
    } catch {
      // Filesystem not writable — silently skip.
    }
  });
  fileWriteQueue = pendingWrite.catch(() => undefined);
  await pendingWrite;
}

/**
 * Writes a log entry. DB writes are concurrent (no queue) so 29 parallel
 * source collections don't serialize behind each other. File writes are still
 * serial to prevent JSON corruption.
 *
 * Returns a Promise that resolves when the write completes — callers that
 * don't need to wait can fire-and-forget by not awaiting the return value.
 */
export function appendWorkflowLog(
  entry: Omit<WorkflowLogEntry, "id" | "timestamp"> & { timestamp?: string },
): Promise<void> {
  const logEntry: WorkflowLogEntry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    timestamp: entry.timestamp ?? new Date().toISOString(),
    scope: entry.scope,
    step: entry.step,
    status: entry.status,
    message: entry.message,
    context: entry.context,
  };

  // DB write is concurrent — each call starts immediately, no queue.
  const dbWrite = (async () => {
    try {
      await ensureDatabaseReady();
      await prisma.workflowLog.create({
        data: {
          id: logEntry.id,
          timestamp: logEntry.timestamp,
          scope: logEntry.scope,
          step: logEntry.step,
          status: logEntry.status,
          message: logEntry.message,
          contextJson: logEntry.context ? JSON.stringify(logEntry.context) : null,
        },
      });
      return; // DB write succeeded — skip file.
    } catch {
      // DB unavailable — fall through to file.
    }
    await writeToFile(logEntry);
  })();

  return dbWrite.catch(() => undefined);
}

export async function listWorkflowLogs(limit = 80): Promise<WorkflowLogEntry[]> {
  try {
    await ensureDatabaseReady();
    const rows = await prisma.workflowLog.findMany({
      orderBy: { timestamp: "desc" },
      take: Math.min(Math.max(limit, 1), 200),
    });

    return rows.map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      scope: row.scope,
      step: row.step,
      status: row.status as WorkflowLogEntry["status"],
      message: row.message,
      context: safeParseContext(row.contextJson),
    }));
  } catch {
    const logs = await readLogFile();
    return logs.slice(0, limit);
  }
}
