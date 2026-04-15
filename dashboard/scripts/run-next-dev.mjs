import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";

const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const hostname = process.env.HOSTNAME?.trim() || process.env.HOST?.trim() || "127.0.0.1";
const requestedPort = Number.parseInt(process.env.PORT || "3000", 10);

async function canBindPort(port) {
  return await new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on("error", () => resolve(false));
    server.listen({ port, host: hostname }, () => {
      server.close(() => resolve(true));
    });
  });
}

async function findAvailablePort(startPort, attempts = 20) {
  for (let candidate = startPort; candidate < startPort + attempts; candidate += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (await canBindPort(candidate)) {
      return candidate;
    }
  }
  return startPort;
}

const resolvedPort = await findAvailablePort(Number.isFinite(requestedPort) ? requestedPort : 3000);
const distDir = process.env.NEXT_DEV_DIST_DIR?.trim() || ".next-dev-runtime";

console.log(
  `[dev-guard] Starting next dev with webpack on ${hostname}:${resolvedPort} using ${distDir}`,
);

const child = spawn(
  process.execPath,
  [nextBin, "dev", "--webpack", "--hostname", hostname, "--port", String(resolvedPort)],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      NEXT_DEV_DIST_DIR: distDir,
      PORT: String(resolvedPort),
    },
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
