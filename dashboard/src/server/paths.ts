import fs from "fs";
import path from "path";

function isDashboardRoot(dir: string): boolean {
  return (
    fs.existsSync(path.join(dir, "package.json")) &&
    fs.existsSync(path.join(dir, "src", "app"))
  );
}

export function getDashboardRoot(): string {
  const cwd = process.cwd();
  if (isDashboardRoot(cwd)) {
    return cwd;
  }

  const nestedDashboard = path.join(cwd, "dashboard");
  if (isDashboardRoot(nestedDashboard)) {
    return nestedDashboard;
  }

  return cwd;
}

export function getRepoRoot(): string {
  const dashboardRoot = getDashboardRoot();
  const parent = path.dirname(dashboardRoot);
  return path.basename(dashboardRoot) === "dashboard" ? parent : dashboardRoot;
}

export function resolveDashboardPath(...segments: string[]): string {
  return path.join(getDashboardRoot(), ...segments);
}

export function resolveRepoPath(...segments: string[]): string {
  return path.join(getRepoRoot(), ...segments);
}
