import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  const response = await page.request.post("/api/auth/login", {
    data: {
      username: process.env.AUTH_USERNAME || "admin",
      password: process.env.AUTH_PASSWORD || "admin123!",
    },
  });
  expect(response.ok()).toBeTruthy();
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
}

async function dismissTourIfVisible(page: Page) {
  const tourHeading = page.getByRole("heading", { name: /How the Disposition Desk works/i });
  const visible = await tourHeading.isVisible().catch(() => false);
  if (visible) {
    await page.getByRole("button", { name: /skip for now/i }).click();
  }
}

test("newsletter preview renders the new data-first sections", async ({ page }) => {
  test.setTimeout(420_000);

  await login(page);
  await dismissTourIfVisible(page);

  const draftId = await page.evaluate(async () => {
    const triggerRes = await fetch("/api/pipeline/trigger?force=true", {
      method: "POST",
      credentials: "include",
    });
    if (!triggerRes.ok) {
      throw new Error(`pipeline trigger failed: ${triggerRes.status}`);
    }

    const draftsRes = await fetch("/api/drafts", {
      credentials: "include",
    });
    if (!draftsRes.ok) {
      throw new Error(`draft list failed: ${draftsRes.status}`);
    }

    const drafts = (await draftsRes.json()) as Array<{
      id: number;
      newsletter_id: number;
    }>;
    const latestDraft = drafts[0];
    if (!latestDraft) {
      throw new Error("no draft found after pipeline run");
    }

    const generateRes = await fetch(`/api/drafts/generate/${latestDraft.newsletter_id}`, {
      method: "POST",
      credentials: "include",
    });
    if (!generateRes.ok) {
      throw new Error(`draft generation failed: ${generateRes.status}`);
    }

    return latestDraft.id;
  });

  await page.goto(`/drafts/${draftId}`);
  await expect(page.getByRole("heading", { level: 1, name: /Issue #\d+/ })).toBeVisible({
    timeout: 120_000,
  });

  const emptyDraftNotice = page.getByText(/No draft text yet\. Click Generate draft\./i);
  if (await emptyDraftNotice.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: /generate draft/i }).click();
  }

  await expect(page.getByRole("button", { name: /open full newsletter preview/i })).toBeVisible({
    timeout: 120_000,
  });
  await page.getByRole("button", { name: /open full newsletter preview/i }).click();

  const frame = page.frameLocator('iframe[title="Full newsletter preview"]');
  await expect(frame.getByText("Where Distressed Inventory Is Building", { exact: true })).toBeVisible();
  await expect(frame.getByText(/Inventory by source|No source rows available/i)).toBeVisible();
  await expect(frame.getByText("What Changed Across Foreclosure and REO This Week", { exact: true })).toBeVisible();
  await expect(frame.getByText("Who Is Staffing Up Across Default and REO", { exact: true })).toBeVisible();
  await expect(frame.getByText("Field Coverage Built for Distressed Asset Workflows", { exact: true })).toBeVisible();
  await expect(frame.getByText("Freddie Mac / HomeSteps", { exact: true })).toBeVisible();
  await expect(frame.getByText("Top 5 Counties This Week", { exact: true })).toBeVisible();
});
