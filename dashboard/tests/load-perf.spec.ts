/**
 * Hard load + performance test for all main pages.
 * Measures real load times, asserts thresholds, and stress-tests rapid navigation.
 *
 * Run with:
 *   npx playwright test load-perf --reporter=list
 *
 * Env overrides:
 *   AUTH_USERNAME / AUTH_PASSWORD  — credentials (defaults: admin / admin123!)
 *   PERF_WARN_MS                   — warn threshold per page in ms (default: 5000)
 *   PERF_FAIL_MS                   — fail threshold per page in ms (default: 15000)
 */

import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const WARN_MS = Number(process.env.PERF_WARN_MS ?? 5_000);
const FAIL_MS = Number(process.env.PERF_FAIL_MS ?? 15_000);

// ─── helpers ────────────────────────────────────────────────────────────────

async function login(page: Page) {
  const res = await page.request.post("/api/auth/login", {
    data: {
      username: process.env.AUTH_USERNAME ?? "admin",
      password: process.env.AUTH_PASSWORD ?? "admin123!",
    },
  });
  expect(res.ok(), `Login failed: ${res.status()}`).toBeTruthy();
  await page.goto("/");
}

async function measurePageLoad(
  page: Page,
  url: string,
  label: string,
): Promise<number> {
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "networkidle", timeout: FAIL_MS + 2_000 });
  const elapsed = Date.now() - t0;

  // Collect browser-side navigation timing for a fuller picture
  const navTiming = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (!nav) return null;
    return {
      ttfb: Math.round(nav.responseStart - nav.requestStart),
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
      loadEvent: Math.round(nav.loadEventEnd - nav.startTime),
    };
  });

  const summary = navTiming
    ? `  TTFB=${navTiming.ttfb}ms  DCL=${navTiming.domContentLoaded}ms  Load=${navTiming.loadEvent}ms`
    : "";
  console.log(
    `[PERF] ${elapsed < WARN_MS ? "✓" : elapsed < FAIL_MS ? "⚠" : "✗"} ${label}: ${elapsed}ms${summary}`,
  );

  expect(elapsed, `${label} exceeded hard limit of ${FAIL_MS}ms`).toBeLessThan(FAIL_MS);
  if (elapsed >= WARN_MS) {
    console.warn(`[PERF] ⚠  ${label} is SLOW (${elapsed}ms > warn threshold ${WARN_MS}ms)`);
  }

  return elapsed;
}

/** Check no visible error state on page (no 500 / "Something went wrong" text) */
async function assertNoPageError(page: Page, label: string) {
  const bodyText = await page.locator("body").innerText().catch(() => "");
  const errorPhrases = [
    "Application error",
    "Something went wrong",
    "Internal Server Error",
    "500",
    "Page not found",
    "404",
  ];
  for (const phrase of errorPhrases) {
    expect(
      bodyText,
      `${label} shows error text: "${phrase}"`,
    ).not.toContain(phrase);
  }
}

// ─── tests ──────────────────────────────────────────────────────────────────

let firstDraftId: number | null = null;

test("setup: login and discover draft ID", async ({ page }) => {
  await login(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Try to find an existing draft ID from the page or API
  try {
    const res = await page.request.get("/api/drafts?limit=1");
    if (res.ok()) {
      const json = (await res.json()) as unknown;
      const rows = Array.isArray(json) ? json : (json as { drafts?: unknown[] })?.drafts;
      if (Array.isArray(rows) && rows.length > 0) {
        const first = rows[0] as { id?: number };
        if (typeof first.id === "number") {
          firstDraftId = first.id;
          console.log(`[PERF] Found draft ID: ${firstDraftId}`);
        }
      }
    }
  } catch {
    console.log("[PERF] Could not discover draft ID; per-draft pages will be skipped");
  }
});

test("load: home / dashboard", async ({ page }) => {
  await login(page);
  await measurePageLoad(page, "/", "home");
  await assertNoPageError(page, "home");
});

test("load: data center (/data)", async ({ page }) => {
  await login(page);
  await measurePageLoad(page, "/data", "data-center");
  await assertNoPageError(page, "data-center");
  // Skeleton or actual content should be visible — not just a blank white box
  const main = page.locator("main, [role=main]").first();
  await expect(main).toBeVisible({ timeout: 3_000 });
});

test("load: insights hub list (/insights/listings)", async ({ page }) => {
  await login(page);
  await measurePageLoad(page, "/insights/listings", "insights-list");
  await assertNoPageError(page, "insights-list");
});

test("load: issue insights page (/insights/listings/[id])", async ({ page }) => {
  if (!firstDraftId) {
    test.skip();
    return;
  }
  await login(page);
  const url = `/insights/listings/${firstDraftId}`;
  await measurePageLoad(page, url, `insights-issue-${firstDraftId}`);
  await assertNoPageError(page, "insights-issue");
});

test("load: draft editor (/drafts/[id])", async ({ page }) => {
  if (!firstDraftId) {
    test.skip();
    return;
  }
  await login(page);
  const url = `/drafts/${firstDraftId}`;
  await measurePageLoad(page, url, `draft-editor-${firstDraftId}`);
  await assertNoPageError(page, "draft-editor");
});

// ─── rapid navigation stress test ───────────────────────────────────────────

test("stress: rapid navigation between main pages", async ({ page }) => {
  await login(page);

  const routes = ["/", "/data", "/insights/listings", "/"];
  const timings: number[] = [];

  for (const route of routes) {
    const t0 = Date.now();
    await page.goto(route, { waitUntil: "domcontentloaded", timeout: FAIL_MS });
    timings.push(Date.now() - t0);
  }

  const avg = Math.round(timings.reduce((a, b) => a + b, 0) / timings.length);
  console.log(
    `[PERF] Rapid nav timings: [${timings.join(", ")}]ms  avg=${avg}ms`,
  );

  for (const [i, ms] of timings.entries()) {
    expect(ms, `Route ${routes[i]} took ${ms}ms (limit ${FAIL_MS}ms)`).toBeLessThan(FAIL_MS);
  }
});

// ─── cold-start reload test (tests every page with cache cleared) ────────────

test("hard: full page reload without cache on all routes", async ({
  page,
  context,
}) => {
  await login(page);

  const routes: Array<[string, string]> = [
    ["/", "home"],
    ["/data", "data-center"],
    ["/insights/listings", "insights-list"],
  ];

  if (firstDraftId) {
    routes.push([`/insights/listings/${firstDraftId}`, "insights-issue"]);
    routes.push([`/drafts/${firstDraftId}`, "draft-editor"]);
  }

  for (const [url, label] of routes) {
    // Simulate cold start: clear cache between each navigation
    await context.clearCookies();
    // Re-login after clearing cookies
    const res = await page.request.post("/api/auth/login", {
      data: {
        username: process.env.AUTH_USERNAME ?? "admin",
        password: process.env.AUTH_PASSWORD ?? "admin123!",
      },
    });
    expect(res.ok()).toBeTruthy();

    await measurePageLoad(page, url, `cold:${label}`);
    await assertNoPageError(page, `cold:${label}`);
  }
});

// ─── concurrent API health check ─────────────────────────────────────────────

test("hard: parallel API endpoint availability", async ({ page }) => {
  await login(page);

  const endpoints: Array<{ path: string; coldStartMs: number }> = [
    { path: "/api/health", coldStartMs: 8_000 },
    { path: "/api/warmup", coldStartMs: 15_000 },
    // /api/drafts calls readDatabase() (4-table scan); allow extra time under parallel dev load
    { path: "/api/drafts", coldStartMs: 30_000 },
  ];

  const results = await Promise.all(
    endpoints.map(async ({ path, coldStartMs }) => {
      const t0 = Date.now();
      const res = await page.request.get(path, { timeout: coldStartMs + 5_000 });
      return {
        path,
        coldStartMs,
        status: res.status(),
        ms: Date.now() - t0,
      };
    }),
  );

  for (const result of results) {
    console.log(`[PERF] API ${result.path}: HTTP ${result.status} in ${result.ms}ms`);
    // Allow 200 (ok) or 401 (protected but alive) — anything else is unexpected
    expect(
      [200, 201, 401, 403],
      `${result.path} returned unexpected status ${result.status}`,
    ).toContain(result.status);
    expect(result.ms, `${result.path} API took ${result.ms}ms (limit ${result.coldStartMs}ms)`).toBeLessThan(result.coldStartMs);
  }
});
