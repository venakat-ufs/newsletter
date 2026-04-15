import fs from "fs/promises";

import { resolveRepoPath } from "@/server/paths";

export interface WorkflowLogEntry {
  id: string;
  timestamp: string;
  scope: string;
  step: string;
  status: "info" | "success" | "warning" | "error";
  message: string;
  context?: Record<string, unknown>;
}

const LOG_FILE = resolveRepoPath("data", "workflow-log.json");
const MAX_LOG_ENTRIES = 400;

let writeQueue: Promise<void> = Promise.resolve();

async function ensureLogFile(): Promise<void> {
  await fs.mkdir(resolveRepoPath("data"), { recursive: true });
  try {
    await fs.access(LOG_FILE);
  } catch {
    await fs.writeFile(LOG_FILE, "[]", "utf8");
  }
}

async function readLogFile(): Promise<WorkflowLogEntry[]> {
  await ensureLogFile();
  const raw = await fs.readFile(LOG_FILE, "utf8");

  try {
    const parsed = JSON.parse(raw) as WorkflowLogEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function appendWorkflowLog(
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

  const pendingWrite = writeQueue.then(async () => {
    const logs = await readLogFile();
    logs.unshift(logEntry);
    await fs.writeFile(LOG_FILE, JSON.stringify(logs.slice(0, MAX_LOG_ENTRIES), null, 2), "utf8");
  });

  writeQueue = pendingWrite.catch(() => undefined);
  await pendingWrite;
}

export async function listWorkflowLogs(limit = 80): Promise<WorkflowLogEntry[]> {
  const logs = await readLogFile();
  return logs.slice(0, limit);
}
