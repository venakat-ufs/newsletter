import { expect, test, type Locator, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

type DraftSection = {
  section_type: string;
  title: string;
  teaser: string;
  body: string;
  audience_tag?: string;
  metadata?: Record<string, unknown>;
};

type DraftApiResponse = {
  id: number;
  newsletter_id: number;
  ai_draft?: { sections?: DraftSection[] };
  human_edits?: { sections?: DraftSection[] } | null;
};

function getTestCredentials() {
  const isProduction = process.env.NODE_ENV === "production";

  return {
    username: process.env.AUTH_USERNAME || "admin",
    password:
      process.env.AUTH_PASSWORD || (isProduction ? "" : "admin123!"),
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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

async function prepareGeneratedDraft(page: Page): Promise<{ draftId: number; newsletterId: number }> {
  const triggerRes = await page.request.post("/api/pipeline/trigger?force=true");
  expect(triggerRes.ok()).toBeTruthy();

  const triggerPayload = (await triggerRes.json().catch(() => null)) as
    | {
        draft_id?: number;
        newsletter_id?: number;
      }
    | null;

  let draftId = triggerPayload?.draft_id;
  let newsletterId = triggerPayload?.newsletter_id;

  if (!draftId || !newsletterId) {
    const draftsRes = await page.request.get("/api/drafts");
    expect(draftsRes.ok()).toBeTruthy();

    const drafts = (await draftsRes.json()) as Array<{ id: number; newsletter_id: number }>;
    const latestDraft = drafts[0];
    expect(latestDraft).toBeTruthy();
    draftId = latestDraft.id;
    newsletterId = latestDraft.newsletter_id;
  }

  const generateRes = await page.request.post(`/api/drafts/generate/${newsletterId}`);
  expect(generateRes.ok()).toBeTruthy();

  return {
    draftId,
    newsletterId,
  };
}

function buildSectionWithDefaults(
  sectionType: string,
  draftId: number,
  existing?: DraftSection,
): DraftSection {
  if (sectionType === "market_pulse") {
    return {
      section_type: "market_pulse",
      title: existing?.title ?? "Market Pulse",
      teaser: existing?.teaser ?? "Market pulse link test section.",
      body: existing?.body ?? "Market pulse body.",
      audience_tag: existing?.audience_tag ?? "REO",
      metadata: {
        ...(existing?.metadata ?? {}),
        cta_label: "More Pulse →",
        cta_url: `/insights/listings/${draftId}?tab=pulse`,
      },
    };
  }

  if (sectionType === "industry_news") {
    const baseMetadata = { ...(existing?.metadata ?? {}) };
    const stories = Array.isArray(baseMetadata.stories)
      ? (baseMetadata.stories as Array<Record<string, unknown>>)
      : [];

    const ensuredStories = stories.length
      ? stories
      : [
          {
            source: "UFS Wire",
            title: "Deterministic industry news story",
            detail: "Story detail for preview rendering.",
            published_at: "2026-01-01",
            url: `https://example.com/news/${draftId}`,
          },
        ];

    return {
      section_type: "industry_news",
      title: existing?.title ?? "Industry News",
      teaser: existing?.teaser ?? "Industry news link test section.",
      body: existing?.body ?? "Industry news body.",
      audience_tag: existing?.audience_tag ?? "REO",
      metadata: {
        ...baseMetadata,
        stories: ensuredStories,
        cta_label: "Read More →",
        cta_url: `/insights/listings/${draftId}?tab=news`,
      },
    };
  }

  return {
    section_type: "bank_hiring_intel",
    title: existing?.title ?? "Bank Hiring Intel",
    teaser: existing?.teaser ?? "Hiring link test section.",
    body: existing?.body ?? "Hiring body.",
    audience_tag: existing?.audience_tag ?? "REO",
    metadata: {
      ...(existing?.metadata ?? {}),
      total_jobs: 1,
      employer_count: 1,
      focus_rows: [{ focus: "Loss Mitigation", count: 1 }],
      employers: [
        {
          company: "Deterministic Bank",
          total_jobs: 1,
          sample_roles: ["Loss Mitigation Specialist"],
          sample_job_urls: ["https://example.com/jobs/loss-mitigation-specialist"],
          locations: ["Remote"],
          hiring_focus: ["Loss Mitigation"],
        },
      ],
      cta_url: `/insights/listings/${draftId}?tab=sources`,
    },
  };
}

function upsertSection(
  sections: DraftSection[],
  sectionType: "market_pulse" | "industry_news" | "bank_hiring_intel",
  draftId: number,
) {
  const index = sections.findIndex((section) => section.section_type === sectionType);

  if (index >= 0) {
    sections[index] = buildSectionWithDefaults(sectionType, draftId, sections[index]);
    return;
  }

  sections.push(buildSectionWithDefaults(sectionType, draftId));
}

async function applyDeterministicHumanEdits(
  page: Page,
  draftId: number,
): Promise<{ originalHumanEdits: DraftApiResponse["human_edits"] }> {
  const draftRes = await page.request.get(`/api/drafts/${draftId}`);
  expect(draftRes.ok()).toBeTruthy();

  const draft = (await draftRes.json()) as DraftApiResponse;
  const originalHumanEdits = deepClone(draft.human_edits ?? null);

  const baseSections =
    Array.isArray(draft.human_edits?.sections) && draft.human_edits.sections.length > 0
      ? deepClone(draft.human_edits.sections)
      : Array.isArray(draft.ai_draft?.sections)
        ? deepClone(draft.ai_draft.sections)
        : [];

  upsertSection(baseSections, "market_pulse", draftId);
  upsertSection(baseSections, "industry_news", draftId);
  upsertSection(baseSections, "bank_hiring_intel", draftId);

  const patchRes = await page.request.patch(`/api/drafts/${draftId}`, {
    data: {
      human_edits: {
        sections: baseSections,
      },
    },
  });
  expect(patchRes.ok()).toBeTruthy();

  return { originalHumanEdits };
}

async function restoreHumanEdits(
  page: Page,
  draftId: number,
  originalHumanEdits: DraftApiResponse["human_edits"],
) {
  const restoreRes = await page.request.patch(`/api/drafts/${draftId}`, {
    data: {
      human_edits: originalHumanEdits,
    },
  });
  expect(restoreRes.ok()).toBeTruthy();
}

async function expectLinkToOpenExpectedTarget(page: Page, link: Locator) {
  const href = await link.getAttribute("href");
  expect(href).toBeTruthy();

  const expectedUrl = new URL(href ?? "", page.url());
  const appHost = new URL(page.url()).host;
  const target = ((await link.getAttribute("target")) ?? "").toLowerCase();

  if (target === "_blank") {
    const popupPromise = page.waitForEvent("popup");
    await link.click();

    const popup = await popupPromise;
    await popup.waitForLoadState("domcontentloaded", { timeout: 20_000 }).catch(() => undefined);

    const openedUrl = popup.url();
    expect(openedUrl && openedUrl !== "about:blank").toBeTruthy();

    const opened = new URL(openedUrl);
    expect(opened.protocol === "http:" || opened.protocol === "https:").toBeTruthy();
    if (expectedUrl.host === appHost) {
      expect(opened.host).toBe(expectedUrl.host);
    }

    await popup.close();
    return;
  }

  await link.click();
  await expect(page).toHaveURL(new RegExp(escapeRegex(expectedUrl.pathname)));
}

test("newsletter preview and intelligence links click through to expected destinations", async ({
  page,
}) => {
  test.setTimeout(420_000);

  await login(page);
  await dismissTourIfVisible(page);

  const { draftId } = await prepareGeneratedDraft(page);
  const { originalHumanEdits } = await applyDeterministicHumanEdits(page, draftId);

  try {
    await page.goto(`/drafts/${draftId}`);
    await expect(page.getByRole("heading", { level: 1, name: /Issue #\d+/ })).toBeVisible({
      timeout: 120_000,
    });

    await expect(page.getByRole("button", { name: /open full newsletter preview/i })).toBeVisible({
      timeout: 120_000,
    });
    await page.getByRole("button", { name: /open full newsletter preview/i }).click();

    const frame = page.frameLocator('iframe[title="Full newsletter preview"]');

    const morePulseCta = frame.getByRole("link", { name: /more pulse/i }).first();
    await expect(morePulseCta).toBeVisible();
    await morePulseCta.click();
    await expect(page).toHaveURL(new RegExp(`/insights/listings/${draftId}\\?tab=pulse`));

    await page.goto(`/drafts/${draftId}`);
    await page.getByRole("button", { name: /open full newsletter preview/i }).click();

    const readMoreCta = frame.getByRole("link", { name: /read more/i }).first();
    await expect(readMoreCta).toBeVisible();
    await readMoreCta.click();
    await expect(page).toHaveURL(new RegExp(`/insights/news/${draftId}`));

    const storyLinks = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: /full story list/i }) })
      .locator("a[href]");

    await expect(storyLinks.first()).toBeVisible();
    await expectLinkToOpenExpectedTarget(page, storyLinks.first());

    await page.goto(`/insights/listings/${draftId}?tab=employers`);
    const hiringJobLink = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: /employers and role signals/i }) })
      .locator("tbody a[href]")
      .first();

    await expect(hiringJobLink).toBeVisible();
    await expect(hiringJobLink).toHaveAttribute("href", /example\.com\/jobs\/loss-mitigation-specialist/i);
    await expectLinkToOpenExpectedTarget(page, hiringJobLink);

    await page.goto(`/insights/listings/${draftId}?tab=sources`);
    const sourceLink = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: /raw source urls and listing links/i }) })
      .locator("tbody a[href]")
      .first();

    await expect(sourceLink).toBeVisible();
    await expectLinkToOpenExpectedTarget(page, sourceLink);
  } finally {
    await restoreHumanEdits(page, draftId, originalHumanEdits);
  }
});
