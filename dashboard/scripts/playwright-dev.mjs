import { spawn } from "node:child_process";
import path from "node:path";

const args = process.argv.slice(2);
const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");

const child = spawn(process.execPath, [nextBin, "dev", "--webpack", ...args], {
  stdio: "inherit",
  env: {
    ...process.env,
    PLAYWRIGHT: "1",
    NEXT_DEV_DIST_DIR: ".next-playwright-runtime",
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
