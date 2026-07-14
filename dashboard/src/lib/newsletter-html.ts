import type { DraftSection } from "@/lib/api";

export interface NewsletterHtmlIssue {
  issue_number: number;
  issue_date: string;
}

export interface NewsletterHtmlArticle {
  section_type: string;
  title: string;
  teaser: string;
  body: string;
  audience_tag?: string | null;
  ms_platform_url?: string | null;
  metadata?: Record<string, unknown> | null;
}

// ---- Portal design tokens ----
const FONT = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";
const BLUE = "#2563EB";
const INK = "#111827";
const BODY = "#475569";
const MUTED = "#64748B";
const BORDER = "#E5E7EB";
const TILE_BG = "#F8FAFC";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatIssueWeek(issueDate: string): string {
  const date = new Date(issueDate);
  if (Number.isNaN(date.getTime())) {
    return "Current issue";
  }

  const start = new Date(date);
  const day = start.getUTCDay();
  const distanceToMonday = (day + 6) % 7;
  start.setUTCDate(start.getUTCDate() - distanceToMonday);

  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);

  const startMonth = start.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  const endMonth = end.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  const startDay = start.toLocaleDateString("en-US", { day: "numeric", timeZone: "UTC" });
  const endDay = end.toLocaleDateString("en-US", { day: "numeric", timeZone: "UTC" });
  const year = end.toLocaleDateString("en-US", { year: "numeric", timeZone: "UTC" });

  return startMonth === endMonth
    ? `Week of ${startMonth} ${startDay}-${endDay}, ${year}`
    : `Week of ${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
}

function sectionLabel(sectionType: string): string {
  return sectionType
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function excerptText(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit).trimEnd()}...`;
}

function splitIntoReadableSentences(value: string): string[] {
  return value
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 24);
}

function extractBulletPoints(article: NewsletterHtmlArticle, limit = 4): string[] {
  const candidates = [
    ...splitIntoReadableSentences(article.body),
    ...splitIntoReadableSentences(article.teaser),
  ];
  const seen = new Set<string>();
  const bullets: string[] = [];

  for (const sentence of candidates) {
    const normalized = sentence.replace(/\s+/g, " ").trim();
    if (!normalized || seen.has(normalized.toLowerCase())) {
      continue;
    }
    seen.add(normalized.toLowerCase());
    bullets.push(normalized);
    if (bullets.length >= limit) {
      break;
    }
  }
  return bullets;
}

function extractStatSnippets(article: NewsletterHtmlArticle, limit = 4): string[] {
  const snippets = splitIntoReadableSentences(`${article.teaser} ${article.body}`);
  const ranked = snippets.filter((snippet) =>
    /\$[\d,]+|\b\d+(?:\.\d+)?%|\b\d[\d,]*\b/.test(snippet),
  );

  const results: string[] = [];
  const seen = new Set<string>();

  for (const snippet of ranked) {
    const short = excerptText(snippet, 74);
    if (seen.has(short.toLowerCase())) {
      continue;
    }
    seen.add(short.toLowerCase());
    results.push(short);
    if (results.length >= limit) {
      break;
    }
  }
  return results;
}

function safeRows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
}

function numericValue(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number.parseFloat(value.replaceAll(",", ""));
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function textValue(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function normalizeNavigationUrl(url: string): string {
  return url || "#";
}

// ---- Portal building blocks ----

function cardOpen(): string {
  return `<div style="background:#ffffff;border:1px solid ${BORDER};border-radius:16px;padding:24px 22px;margin:0 0 16px;">`;
}

function sectionHeader(eyebrow: string, headline: string, accent: string = BLUE): string {
  const eyebrowColor = accent === INK ? MUTED : BLUE;
  return `
    <div style="border-left:3px solid ${accent};padding-left:14px;margin-bottom:16px;">
      <div style="font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:${eyebrowColor};margin-bottom:3px;">${escapeHtml(eyebrow)}</div>
      <div style="font-family:${FONT};font-size:18px;font-weight:700;color:${INK};">${escapeHtml(headline)}</div>
    </div>`;
}

function renderIntro(article: NewsletterHtmlArticle): string {
  if (!article.teaser.trim()) {
    return "";
  }
  return `<p style="font-family:${FONT};font-size:14px;line-height:1.7;color:${BODY};margin:0 0 18px;">${escapeHtml(article.teaser)}</p>`;
}

function renderDeltaBadge(delta: number | null, status = ""): string {
  // Only a real, non-zero change earns a pill. No "insufficient data" / "no change" noise.
  if (
    delta === null ||
    Number.isNaN(delta) ||
    delta === 0 ||
    status === "insufficient_data" ||
    status === "unchanged"
  ) {
    return "";
  }
  const up = delta > 0;
  const bg = up ? "#DCFCE7" : "#FEE2E2";
  const fg = up ? "#15803D" : "#B91C1C";
  const arrow = up ? "↑" : "↓";
  const sign = up ? "+" : "";
  return `<span style="display:inline-block;padding:3px 9px;background:${bg};border-radius:999px;font-family:${FONT};font-size:11px;font-weight:600;color:${fg};">${arrow} ${sign}${delta}%</span>`;
}

function renderSectionCta(label: string, url: string): string {
  if (!url || url === "#") {
    return "";
  }
  return `
    <table cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;">
      <tr><td style="background:${BLUE};border-radius:8px;">
        <a href="${escapeHtml(url)}" target="_top" style="display:inline-block;padding:11px 22px;font-family:${FONT};font-size:13px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(label)}</a>
      </td></tr>
    </table>`;
}

// Stat tiles rendered 2-per-row so they fit narrow mobile screens AND desktop
// (4 cards => 2x2). Each row's cells share height; no media query needed.
function renderStatCards(cards: Array<Record<string, unknown>>): string {
  if (cards.length === 0) {
    return "";
  }
  const pairs: Array<Array<Record<string, unknown>>> = [];
  for (let i = 0; i < cards.length; i += 2) {
    pairs.push(cards.slice(i, i + 2));
  }
  const cell = (card: Record<string, unknown>) => `
    <td width="50%" style="background:${TILE_BG};border:1px solid ${BORDER};border-radius:10px;padding:14px;vertical-align:top;">
      <div style="font-family:${FONT};font-size:22px;font-weight:800;color:${INK};line-height:1;">${escapeHtml((numericValue(card.value) ?? 0).toLocaleString("en-US"))}</div>
      <div style="font-family:${FONT};font-size:11px;font-weight:600;color:${BLUE};margin-top:6px;">${escapeHtml(textValue(card.label, "Metric"))}</div>
      ${textValue(card.detail) ? `<div style="font-family:${FONT};font-size:11px;line-height:1.5;color:${MUTED};margin-top:3px;">${escapeHtml(textValue(card.detail))}</div>` : ""}
    </td>`;
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:8px;margin:0 0 6px;">
      ${pairs
        .map(
          (pair) => `<tr>${pair.map(cell).join("")}${pair.length === 1 ? `<td width="50%" style="border:0;"></td>` : ""}</tr>`,
        )
        .join("")}
    </table>`;
}

function renderSourcePills(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) {
    return "";
  }
  return `
    <div style="margin:0 0 16px;">
      ${rows
        .map(
          (row) => `
            <span style="display:inline-block;margin:0 6px 6px 0;padding:5px 11px;background:${TILE_BG};border:1px solid ${BORDER};border-radius:999px;font-family:${FONT};font-size:11px;font-weight:600;color:${MUTED};">
              ${escapeHtml(textValue(row.source, row.focus))}: ${escapeHtml(String(numericValue(row.count) ?? 0))}
            </span>`,
        )
        .join("")}
    </div>`;
}

function renderTopBanksSection(article: NewsletterHtmlArticle): string | null {
  const rows = safeRows(article.metadata?.rows);
  if (rows.length === 0) {
    return null;
  }
  const headline = textValue(article.metadata?.headline, article.title, "Who's Moving This Week");
  const eyebrow = textValue(article.metadata?.eyebrow, "Top Banks Listing");
  const ctaLabel = textValue(article.metadata?.cta_label, "Full Bank Rankings →");
  const ctaUrl = normalizeNavigationUrl(textValue(article.metadata?.cta_url, "/insights/listings?tab=listings"));

  return `
    ${cardOpen()}
      ${sectionHeader(eyebrow, headline, INK)}
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${BORDER};border-radius:10px;overflow:hidden;table-layout:fixed;">
        <tr style="background:${TILE_BG};">
          <td style="width:42%;padding:10px 8px 10px 12px;font-family:${FONT};font-size:10px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:${MUTED};">Servicer / Bank</td>
          <td style="width:18%;padding:10px 6px;font-family:${FONT};font-size:10px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:${MUTED};">Listings</td>
          <td style="width:22%;padding:10px 6px;font-family:${FONT};font-size:10px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:${MUTED};">State</td>
          <td style="width:18%;padding:10px 8px 10px 6px;font-family:${FONT};font-size:10px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:${MUTED};">WoW</td>
        </tr>
        ${rows
          .map(
            (row) => `
              <tr style="background:#ffffff;">
                <td style="padding:11px 8px 11px 12px;border-top:1px solid #F1F5F9;font-family:${FONT};font-size:13px;font-weight:600;color:${INK};">${escapeHtml(textValue(row.name, "Institution"))}</td>
                <td style="padding:11px 6px;border-top:1px solid #F1F5F9;font-family:${FONT};font-size:13px;color:${BODY};">${escapeHtml((numericValue(row.count) ?? 0).toLocaleString("en-US"))}</td>
                <td style="padding:11px 6px;border-top:1px solid #F1F5F9;font-family:${FONT};font-size:13px;color:${BODY};">${escapeHtml(textValue(row.top_state, "National"))}</td>
                <td style="padding:11px 8px 11px 6px;border-top:1px solid #F1F5F9;">${renderDeltaBadge(numericValue(row.wow_delta_pct), textValue(row.wow_delta_status))}</td>
              </tr>`,
          )
          .join("")}
      </table>
      ${renderSectionCta(ctaLabel, ctaUrl)}
    </div>`;
}

function renderHotMarketsSection(article: NewsletterHtmlArticle): string | null {
  const rows = safeRows(article.metadata?.rows);
  if (rows.length === 0) {
    return null;
  }
  const headline = textValue(article.metadata?.headline, article.title, "Top Counties This Week");
  const eyebrow = textValue(article.metadata?.eyebrow, "Hot Markets");
  const ctaLabel = textValue(article.metadata?.cta_label, "More Listings →");
  const ctaUrl = normalizeNavigationUrl(textValue(article.metadata?.cta_url, "/insights/listings?tab=listings"));

  return `
    ${cardOpen()}
      ${sectionHeader(eyebrow, headline, BLUE)}
      ${rows
        .map(
          (row, index) => `
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${TILE_BG};border:1px solid ${BORDER};border-radius:10px;margin:0 0 10px;">
              <tr>
                <td width="44" style="padding:14px 0 14px 16px;vertical-align:middle;font-family:${FONT};font-size:18px;font-weight:800;color:${index < 2 ? BLUE : MUTED};">${escapeHtml(String(numericValue(row.rank) ?? index + 1))}</td>
                <td style="padding:14px;vertical-align:middle;">
                  <div style="font-family:${FONT};font-size:14px;font-weight:600;color:${INK};">${escapeHtml(textValue(row.name, "Market"))}</div>
                  <div style="font-family:${FONT};font-size:12px;color:${MUTED};margin-top:2px;">${escapeHtml(textValue(row.metro, "Active market"))} · ${escapeHtml((numericValue(row.count) ?? 0).toLocaleString("en-US"))} active REO</div>
                </td>
                <td style="padding:14px 16px;text-align:right;vertical-align:middle;white-space:nowrap;">${renderDeltaBadge(numericValue(row.wow_delta_pct), textValue(row.wow_delta_status))}</td>
              </tr>
            </table>`,
        )
        .join("")}
      ${renderSectionCta(ctaLabel, ctaUrl)}
    </div>`;
}

function renderMarketPulseSection(article: NewsletterHtmlArticle): string | null {
  const statCards = safeRows(article.metadata?.stat_cards);
  const sourceCards = safeRows(article.metadata?.source_cards);
  const geographyRows = safeRows(article.metadata?.geography_rows);
  const ctaLabel = textValue(article.metadata?.cta_label, "More Market Pulse →");
  const ctaUrl = normalizeNavigationUrl(textValue(article.metadata?.cta_url, "/insights/listings?tab=pulse"));
  const headline = textValue(article.metadata?.headline, article.title, "Where Distressed Inventory Is Building");
  const eyebrow = textValue(article.metadata?.eyebrow, "Market Pulse");

  return `
    ${cardOpen()}
      ${sectionHeader(eyebrow, headline, BLUE)}
      ${renderIntro(article)}
      ${renderStatCards(statCards)}
      ${
        sourceCards.length > 0
          ? `<div style="margin-top:16px;">
              <div style="font-family:${FONT};font-size:10px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${MUTED};margin-bottom:10px;">Inventory by source</div>
              ${sourceCards
                .map(
                  (card) => `
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${TILE_BG};border:1px solid ${BORDER};border-radius:10px;margin:0 0 8px;"><tr>
                      <td style="padding:12px 14px;">
                        <div style="font-family:${FONT};font-size:14px;font-weight:600;color:${INK};">${escapeHtml(textValue(card.source, "Source"))}</div>
                        <div style="font-family:${FONT};font-size:12px;color:${MUTED};margin-top:2px;">${escapeHtml(textValue(card.detail, "Current activity"))}</div>
                      </td>
                      <td style="padding:12px 14px;text-align:right;font-family:${FONT};font-size:20px;font-weight:800;color:${BLUE};white-space:nowrap;">${escapeHtml((numericValue(card.value) ?? 0).toLocaleString("en-US"))}</td>
                    </tr></table>`,
                )
                .join("")}
            </div>`
          : ""
      }
      ${
        geographyRows.length > 0
          ? `<div style="margin-top:16px;">
              <div style="font-family:${FONT};font-size:10px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${MUTED};margin-bottom:10px;">Most active geographies</div>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${BORDER};border-radius:10px;overflow:hidden;">
                ${geographyRows
                  .map(
                    (row) => `
                      <tr style="background:#ffffff;">
                        <td style="padding:12px 14px;border-top:1px solid #F1F5F9;font-family:${FONT};font-size:14px;font-weight:600;color:${INK};">${escapeHtml(textValue(row.label, "Market"))}</td>
                        <td style="padding:12px 14px;border-top:1px solid #F1F5F9;font-family:${FONT};font-size:13px;color:${MUTED};">${escapeHtml(textValue(row.sublabel, "Inventory source"))}</td>
                        <td style="padding:12px 14px;border-top:1px solid #F1F5F9;text-align:right;font-family:${FONT};font-size:18px;font-weight:800;color:${BLUE};">${escapeHtml((numericValue(row.value) ?? 0).toLocaleString("en-US"))}</td>
                      </tr>`,
                  )
                  .join("")}
              </table>
            </div>`
          : ""
      }
      ${renderSectionCta(ctaLabel, ctaUrl)}
    </div>`;
}

function renderIndustryNewsSection(article: NewsletterHtmlArticle): string | null {
  const stories = safeRows(article.metadata?.stories);
  const sourceRows = safeRows(article.metadata?.source_rows);
  // The email stays concise (top 6); the insights News tab shows the full set.
  const validStories = stories
    .filter((story) => textValue(story.title) && textValue(story.source))
    .slice(0, 6);
  const validSourceRows = sourceRows.filter((row) => textValue(row.source));
  const ctaLabel = textValue(article.metadata?.cta_label, "Read More →");
  const ctaUrl = normalizeNavigationUrl(textValue(article.metadata?.cta_url, "/insights/news"));
  if (validStories.length === 0) {
    return null;
  }
  const headline = textValue(article.metadata?.headline, article.title, "What Changed Across Foreclosure and REO This Week");
  const eyebrow = textValue(article.metadata?.eyebrow, "Industry News");

  return `
    ${cardOpen()}
      ${sectionHeader(eyebrow, headline, INK)}
      ${renderIntro(article)}
      ${renderSourcePills(validSourceRows)}
      ${validStories
        .map(
          (story, index) => `
            <a href="${escapeHtml(ctaUrl)}" target="_top" style="display:block;text-decoration:none;padding:0 0 16px;margin:0 0 16px;${index < validStories.length - 1 ? `border-bottom:1px solid #F1F5F9;` : ""}">
              <span style="font-family:${FONT};font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${BLUE};">${escapeHtml(textValue(story.source))}${textValue(story.published_at) ? ` · ${escapeHtml(textValue(story.published_at))}` : ""}</span>
              <div style="font-family:${FONT};font-size:16px;font-weight:700;line-height:1.35;color:${INK};margin:5px 0 6px;">${escapeHtml(textValue(story.title))}</div>
              <div style="font-family:${FONT};font-size:13px;line-height:1.65;color:${MUTED};">${escapeHtml(excerptText(textValue(story.detail, article.teaser), 180))}</div>
            </a>`,
        )
        .join("")}
      ${renderSectionCta(ctaLabel, ctaUrl)}
    </div>`;
}

function renderHiringSection(article: NewsletterHtmlArticle): string | null {
  const employers = safeRows(article.metadata?.employers);
  const focusRows = safeRows(article.metadata?.focus_rows);
  const ctaLabel = textValue(article.metadata?.cta_label, "Open Employers Hub →");
  const ctaUrl = normalizeNavigationUrl(textValue(article.metadata?.cta_url, "/insights/listings?tab=employers"));
  if (employers.length === 0) {
    return null;
  }
  const headline = textValue(article.metadata?.headline, article.title, "Who Is Staffing Up Across Default and REO");
  const eyebrow = textValue(article.metadata?.eyebrow, "Bank Hiring Intel");

  return `
    ${cardOpen()}
      ${sectionHeader(eyebrow, headline, BLUE)}
      ${renderIntro(article)}
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;"><tr>
        <td width="50%" style="padding-right:10px;vertical-align:top;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${TILE_BG};border:1px solid ${BORDER};border-radius:10px;"><tr><td style="padding:14px;text-align:center;">
            <div style="font-family:${FONT};font-size:22px;font-weight:800;color:${INK};">${escapeHtml((numericValue(article.metadata?.total_jobs) ?? 0).toLocaleString("en-US"))}</div>
            <div style="font-family:${FONT};font-size:11px;font-weight:600;color:${BLUE};margin-top:6px;">Open roles tracked</div>
          </td></tr></table>
        </td>
        <td width="50%" style="vertical-align:top;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${TILE_BG};border:1px solid ${BORDER};border-radius:10px;"><tr><td style="padding:14px;text-align:center;">
            <div style="font-family:${FONT};font-size:22px;font-weight:800;color:${INK};">${escapeHtml((numericValue(article.metadata?.employer_count) ?? employers.length).toLocaleString("en-US"))}</div>
            <div style="font-family:${FONT};font-size:11px;font-weight:600;color:${BLUE};margin-top:6px;">Active employers</div>
          </td></tr></table>
        </td>
      </tr></table>
      ${renderSourcePills(focusRows)}
      ${employers
        .map(
          (employer) => `
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${TILE_BG};border:1px solid ${BORDER};border-radius:10px;margin:0 0 8px;"><tr>
              <td style="padding:14px 16px;">
                <div style="font-family:${FONT};font-size:15px;font-weight:600;color:${INK};">${escapeHtml(textValue(employer.company, "Employer"))}</div>
                <div style="font-family:${FONT};font-size:13px;line-height:1.6;color:${BODY};margin-top:4px;">${escapeHtml(textValue(...safeRows(employer.sample_roles).map((item) => textValue(item)), "Role mix not available"))}</div>
                <div style="font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED};margin-top:4px;">${escapeHtml(textValue(...safeRows(employer.locations).map((item) => textValue(item)), "Location not listed"))}</div>
              </td>
              <td style="padding:14px 16px;text-align:right;font-family:${FONT};font-size:20px;font-weight:800;color:${BLUE};white-space:nowrap;">${escapeHtml(String(numericValue(employer.total_jobs) ?? 0))}</td>
            </tr></table>`,
        )
        .join("")}
      ${renderSectionCta(ctaLabel, ctaUrl)}
    </div>`;
}

function renderSpotlightSection(article: NewsletterHtmlArticle): string | null {
  const bullets = safeRows(article.metadata?.bullets);
  const ctaLabel = textValue(article.metadata?.cta_label, "Set Up Your Account →");
  const ctaUrl = textValue(article.metadata?.cta_url, article.ms_platform_url, "#");
  const headline = textValue(article.metadata?.headline, article.title, "One Platform. Every Field Service.");
  const eyebrow = textValue(article.metadata?.eyebrow, "UFS Spotlight");

  return `
    <div style="background:#2563EB;background-image:linear-gradient(135deg,#2563EB 0%,#3B82F6 100%);border-radius:16px;padding:30px;margin:0 0 16px;">
      <div style="font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#BFDBFE;margin-bottom:10px;">${escapeHtml(eyebrow)}</div>
      <div style="font-family:${FONT};font-size:20px;font-weight:700;line-height:1.3;color:#ffffff;margin-bottom:12px;">${escapeHtml(headline)}</div>
      <div style="font-family:${FONT};font-size:14px;line-height:1.7;color:rgba(255,255,255,0.82);margin-bottom:16px;">${escapeHtml(article.teaser)}</div>
      ${
        bullets.length > 0
          ? `<ul style="margin:0 0 18px;padding-left:18px;font-family:${FONT};font-size:13px;line-height:1.9;color:rgba(255,255,255,0.85);">
              ${bullets.map((bullet) => `<li style="margin:0 0 8px;">${escapeHtml(textValue(bullet, "UFS service support"))}</li>`).join("")}
            </ul>`
          : ""
      }
      ${
        article.body.trim()
          ? `<div style="font-family:${FONT};font-size:13px;line-height:1.7;color:rgba(255,255,255,0.72);margin-bottom:20px;">${escapeHtml(excerptText(article.body, 280))}</div>`
          : ""
      }
      <table cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#ffffff;border-radius:8px;">
        <a href="${escapeHtml(ctaUrl)}" target="_top" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:13px;font-weight:700;color:#1E3A8A;text-decoration:none;">${escapeHtml(ctaLabel)}</a>
      </td></tr></table>
    </div>`;
}

function renderSectionBlock(article: NewsletterHtmlArticle, index: number): string {
  if (article.section_type === "market_pulse") {
    const block = renderMarketPulseSection(article);
    if (block) return block;
  }
  if (article.section_type === "top_banks") {
    const block = renderTopBanksSection(article);
    if (block) return block;
  }
  if (article.section_type === "hot_markets") {
    const block = renderHotMarketsSection(article);
    if (block) return block;
  }
  if (article.section_type === "industry_news") {
    const block = renderIndustryNewsSection(article);
    if (block) return block;
  }
  if (article.section_type === "bank_hiring_intel") {
    const block = renderHiringSection(article);
    if (block) return block;
  }
  if (article.section_type === "ufs_spotlight") {
    const block = renderSpotlightSection(article);
    if (block) return block;
  }

  // Generic fallback card
  const stats = extractStatSnippets(article, 3);
  const bullets = extractBulletPoints(article, 4);

  return `
    ${cardOpen()}
      ${sectionHeader(sectionLabel(article.section_type), article.title, INK)}
      ${renderIntro(article)}
      ${
        stats.length > 0
          ? `<div style="margin:0 0 14px;">${stats
              .map(
                (stat) =>
                  `<span style="display:inline-block;margin:0 6px 6px 0;padding:6px 11px;background:${TILE_BG};border:1px solid ${BORDER};border-radius:999px;font-family:${FONT};font-size:11px;font-weight:600;color:${BODY};">${escapeHtml(stat)}</span>`,
              )
              .join("")}</div>`
          : ""
      }
      ${
        bullets.length > 0
          ? `<ul style="margin:0 0 14px;padding-left:18px;font-family:${FONT};font-size:13px;line-height:1.8;color:${BODY};">
              ${bullets.map((point) => `<li style="margin:0 0 8px;">${escapeHtml(point)}</li>`).join("")}
            </ul>`
          : ""
      }
      <div style="font-family:${FONT};font-size:13px;line-height:1.75;color:${BODY};">${escapeHtml(excerptText(article.body, 520))}</div>
    </div>`;
}

export function buildNewsletterHtml(
  newsletter: NewsletterHtmlIssue,
  articles: NewsletterHtmlArticle[],
): string {
  const leadArticle = articles[0];
  const secondaryArticles = articles.slice(1);
  const issueWeek = formatIssueWeek(newsletter.issue_date);
  const leadStats = leadArticle ? extractStatSnippets(leadArticle, 3) : [];
  const leadDetailBlock = leadArticle ? renderSectionBlock(leadArticle, -1) : "";
  const sectionBlocks = secondaryArticles.map((article, index) => renderSectionBlock(article, index)).join("");

  return `
    <div style="margin:0;background:#F1F5F9;padding:28px 16px;font-family:${FONT};color:${INK};">
      <div style="max-width:600px;margin:0 auto;">

        <!-- Header card -->
        <div style="background:#ffffff;border:1px solid ${BORDER};border-radius:16px;padding:24px 30px;margin:0 0 16px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="vertical-align:middle;">
                <img src="https://insights.unitedffs.com/logo.jpeg" alt="United Field Services" width="120" height="auto" style="display:block;border:0;max-width:120px;" />
              </td>
              <td style="vertical-align:middle;text-align:right;font-family:${FONT};font-size:12px;color:${MUTED};">Issue #${newsletter.issue_number}<br><span style="color:#9CA3AF;">${escapeHtml(issueWeek)}</span></td>
            </tr>
          </table>
          <div style="margin-top:16px;">
            <h1 style="font-family:${FONT};font-size:24px;font-weight:800;color:${INK};margin:0;letter-spacing:-0.02em;">The Disposition Desk</h1>
            <p style="font-family:${FONT};font-size:13px;color:${MUTED};margin:4px 0 0;font-weight:500;">Your weekly REO &amp; foreclosure market brief</p>
          </div>
        </div>

        <!-- Blue gradient hero (lead story) -->
        <div style="background:#3B82F6;background-image:linear-gradient(135deg,#3B82F6 0%,#60A5FA 100%);border-radius:16px;padding:28px 30px;margin:0 0 16px;">
          <div style="font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#DBEAFE;margin-bottom:8px;">This Week's Lead Story</div>
          <div style="font-family:${FONT};font-size:20px;font-weight:700;line-height:1.3;color:#ffffff;margin-bottom:10px;">
            ${escapeHtml(leadArticle?.title ?? `Issue #${newsletter.issue_number} editorial brief`)}
          </div>
          <div style="font-family:${FONT};font-size:14px;line-height:1.7;color:rgba(255,255,255,0.88);">
            ${escapeHtml(leadArticle?.teaser ?? "The lead story summary will appear here after the draft is generated.")}
          </div>
          ${
            leadStats.length > 0
              ? `<div style="margin-top:16px;">${leadStats
                  .map(
                    (stat) =>
                      `<span style="display:inline-block;margin:0 6px 6px 0;padding:6px 11px;background:rgba(255,255,255,0.18);border-radius:999px;font-family:${FONT};font-size:11px;font-weight:600;color:#ffffff;">${escapeHtml(stat)}</span>`,
                  )
                  .join("")}</div>`
              : ""
          }
        </div>

        ${leadDetailBlock}
        ${sectionBlocks}

        <!-- Footer -->
        <div style="padding:8px 30px 0;text-align:center;">
          <p style="font-family:${FONT};font-size:11px;color:#94A3B8;margin:0 0 10px;line-height:1.7;">
            <a href="https://clients.unitedffs.com" style="color:${MUTED};text-decoration:none;font-weight:500;">Client Portal</a>
            &nbsp;·&nbsp;
            <a href="https://unitedffs.com/help-center-for-clients/" style="color:${MUTED};text-decoration:none;font-weight:500;">Help Center</a>
            &nbsp;·&nbsp;
            <a href="https://clients.unitedffs.com/register/client" style="color:${MUTED};text-decoration:none;font-weight:500;">Register</a>
            &nbsp;·&nbsp;
            <a href="*|UNSUB|*" style="color:${MUTED};text-decoration:none;font-weight:500;">Unsubscribe</a>
          </p>
          <p style="font-family:${FONT};font-size:11px;color:#94A3B8;margin:0 0 4px;">United Field Services · Published weekly for registered REO agents &amp; partners</p>
          <p style="font-family:${FONT};font-size:10px;color:#CBD5E1;margin:0 0 6px;">*|LIST:ADDRESS|*</p>
          <p style="font-family:${FONT};font-size:10px;color:#CBD5E1;margin:0;">© ${new Date(newsletter.issue_date).getUTCFullYear() || 2026} United Field Services. All rights reserved.</p>
        </div>

      </div>
    </div>
  `;
}

export function buildPreviewNewsletterHtmlFromSections(
  issueNumber: number,
  issueDate: string,
  sections: DraftSection[],
  articleUrl: string,
): string {
  let baseOrigin = "";
  try {
    baseOrigin = new URL(articleUrl).origin;
  } catch {
    baseOrigin = "";
  }

  const toAbsolute = (url: string): string =>
    baseOrigin && url.startsWith("/") ? `${baseOrigin}${url}` : url;

  const draftIdMatch = articleUrl.match(/\/insights\/(?:listings|pulse|news)\/(\d+)/i);
  const draftId = draftIdMatch?.[1];

  const defaultCtaForSection = (sectionType: string): string | null => {
    if (!draftId) {
      return null;
    }
    if (sectionType === "market_pulse") {
      return toAbsolute(`/insights/listings/${draftId}?tab=pulse`);
    }
    if (sectionType === "industry_news") {
      return toAbsolute(`/insights/news/${draftId}`);
    }
    if (sectionType === "top_banks" || sectionType === "hot_markets") {
      return toAbsolute(`/insights/listings/${draftId}?tab=listings`);
    }
    if (sectionType === "bank_hiring_intel") {
      return toAbsolute(`/insights/listings/${draftId}?tab=employers`);
    }
    return toAbsolute(`/insights/listings/${draftId}`);
  };

  const previewArticles: NewsletterHtmlArticle[] = sections.map((section) => {
    const metadata = { ...(section.metadata ?? {}) };
    if (section.section_type !== "ufs_spotlight") {
      const fallbackCta = defaultCtaForSection(section.section_type);
      if (fallbackCta) {
        metadata.cta_url = fallbackCta;
      }
    }

    return {
      section_type: section.section_type,
      title: section.title,
      teaser: section.teaser,
      body: section.body,
      audience_tag: section.audience_tag ?? "REO",
      ms_platform_url: articleUrl,
      metadata,
    };
  });

  const html = buildNewsletterHtml(
    {
      issue_number: issueNumber,
      issue_date: issueDate,
    },
    previewArticles,
  );

  const baseTag = baseOrigin
    ? `<base href="${escapeHtml(`${baseOrigin}/`)}" target="_top">`
    : '<base target="_top">';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    ${baseTag}
  </head>
  <body style="margin:0;padding:0;">
    ${html}
  </body>
</html>`;
}
