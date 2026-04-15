import fs from "node:fs/promises";
import path from "node:path";

const dashboardDir = process.cwd();
const DEV_DIST_DIRS = [".next-dev-runtime", ".next-dev", ".next"];

function parsePidFromLock(content) {
  const match = content.match(/\b(\d{2,})\b/);
  if (!match) {
    return null;
  }

  const pid = Number.parseInt(match[1], 10);
  return Number.isFinite(pid) ? pid : null;
}

function isPidRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function stopPid(pid) {
  if (!isPidRunning(pid)) {
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // no-op
  }

  for (let i = 0; i < 8; i += 1) {
    if (!isPidRunning(pid)) {
      return;
    }
    await sleep(250);
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // no-op
  }

  for (let i = 0; i < 8; i += 1) {
    if (!isPidRunning(pid)) {
      return;
    }
    await sleep(200);
  }
}

async function clearLock(lockPath) {
  let lockContent = "";

  try {
    lockContent = await fs.readFile(lockPath, "utf8");
  } catch {
    // Continue so we can still attempt forced cleanup below.
  }

  const pid = parsePidFromLock(lockContent);
  if (pid && isPidRunning(pid)) {
    console.log(`[dev-guard] next dev lock owner detected (pid ${pid}). Stopping it...`);
    await stopPid(pid);
  } else {
    console.log("[dev-guard] stale next dev lock detected. Clearing it...");
  }

  try {
    await fs.unlink(lockPath);
  } catch {
    // no-op
  }

  // If lock cleanup still fails because of stale file handles, clear the whole dev folder.
  try {
    await fs.rm(path.dirname(lockPath), { recursive: true, force: true });
  } catch {
    // no-op
  }
}

for (const distDir of DEV_DIST_DIRS) {
  const lockPath = path.join(dashboardDir, distDir, "dev", "lock");
  await clearLock(lockPath);
}
