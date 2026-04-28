import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

function getTestCredentials() {
  const isProduction = process.env.NODE_ENV === "production";

  return {
    username: process.env.AUTH_USERNAME || "admin",
    password:
      process.env.AUTH_PASSWORD || (isProduction ? "" : "admin123!"),
  };
}

async function login(page: Page) {
  const credentials = getTestCredentials();
  const response = await page.request.post("/api/auth/login", {
    data: credentials,
  });
  expect(response.ok()).toBeTruthy();
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
}

async function dismissTourIfVisible(page: Page) {
  const tourHeading = page.getByRole("heading", {
    name: /How the Disposition Desk works/i,
  });

  const visible = await tourHeading.isVisible().catch(() => false);
  if (!visible) {
    return;
  }

  await page.getByRole("button", { name: /skip for now/i }).click();
}

test("protected routes redirect to login and health stays public", async ({
  page,
  request,
}) => {
  const healthResponse = await request.get("/api/health");
  expect(healthResponse.ok()).toBeTruthy();

  const draftsResponse = await request.get("/api/drafts");
  expect(draftsResponse.status()).toBe(401);

  await page.goto("/");
  await expect(page).toHaveURL(/\/login\?next=%2F$/);
});

test("draft dashboard pipeline flow renders and navigates", async ({ page }) => {
  await login(page);
  await dismissTourIfVisible(page);

  await expect(
    page.getByRole("heading", { name: "Build the newsletter in 3 steps" }),
  ).toBeVisible();
  // These headings are inside a loading-state guard — wait up to 15s for the API call to resolve
  await expect(
    page.getByRole("heading", { name: "Where the data is coming from" }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Current issue" })).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: /run step 1/i }).click();
  await expect(
    page.getByRole("button", { name: /run step 1/i }),
  ).toBeVisible({ timeout: 120_000 });

  const draftCards = page.locator('a[href^="/drafts/"]');
  await expect(draftCards.first()).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("Bank Hiring Intel")).toBeVisible();

  await draftCards.first().click();

  await expect(page).toHaveURL(/\/drafts\/\d+$/);
  await expect(page.getByRole("heading", { level: 1, name: /Issue #\d+/ })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Where this issue pulled data from" }),
  ).toBeVisible();

  const emptyDraftNotice = page.getByText(/No draft text yet\. Click Generate draft\./i);
  if (await emptyDraftNotice.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: /generate draft/i }).click();
    await expect(page.getByRole("button", { name: /save changes/i })).toBeVisible({
      timeout: 120_000,
    });
  }

  await expect(
    page.getByRole("button", { name: /open full newsletter preview/i }),
  ).toBeVisible();

  await page.goto("/insights/listings");
  await expect(page.getByRole("heading", { name: /Market Pulse \+ Listings Analytics/i })).toBeVisible();
  await page.getByRole("link", { name: /^open$/i }).first().click();
  await expect(page).toHaveURL(/\/insights\/listings\/\d+$/);
  await expect(page.getByRole("heading", { name: /Data View/i })).toBeVisible();
  await page.getByRole("button", { name: /^Listings$/i }).click();
  await expect(page.getByRole("heading", { name: /Servicer \/ Bank movement/i })).toBeVisible();
});

test("history page renders newsletter archive", async ({ page }) => {
  await login(page);
  await dismissTourIfVisible(page);
  await page.goto("/history");

  await expect(page.getByRole("heading", { name: "Newsletter History" })).toBeVisible();
  await expect(page.getByText(/Archive/i)).toBeVisible();
});
