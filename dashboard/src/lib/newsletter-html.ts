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

  const startMonth = start.toLocaleDateString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
  const endMonth = end.toLocaleDateString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
  const startDay = start.toLocaleDateString("en-US", {
    day: "numeric",
    timeZone: "UTC",
  });
  const endDay = end.toLocaleDateString("en-US", {
    day: "numeric",
    timeZone: "UTC",
  });
  const year = end.toLocaleDateString("en-US", {
    year: "numeric",
    timeZone: "UTC",
  });

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

function renderStatPills(stats: string[]): string {
  if (stats.length === 0) {
    return "";
  }

  return `
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 18px;">
      ${stats
        .map(
          (stat) => `
            <span style="display:inline-block;padding:8px 12px;background:#f3e7e8;border:1px solid #e3c8cb;border-radius:999px;font-family:'DM Sans',Arial,sans-serif;font-size:11px;font-weight:bold;line-height:1.4;color:#72262a;">
              ${escapeHtml(stat)}
            </span>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderBulletList(points: string[]): string {
  if (points.length === 0) {
    return "";
  }

  return `
    <div style="margin-top:12px;">
      <div style="font-family:'DM Sans',Arial,sans-serif;font-size:10px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#8a8480;margin-bottom:10px;">
        Key takeaways
      </div>
      <ul style="margin:0;padding-left:18px;font-family:'DM Sans',Arial,sans-serif;font-size:13px;line-height:1.8;color:#3a3a3a;">
        ${points
          .map(
            (point) => `
              <li style="margin:0 0 10px;">${escapeHtml(point)}</li>
            `,
          )
          .join("")}
      </ul>
    </div>
  `;
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
  if (!url || url === "#") {
    return url;
  }

  try {
    const parsed = new URL(url);
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return url;
  } catch {
    return url;
  }
}

function renderDeltaBadge(delta: number | null, status = ""): string {
  if (status === "insufficient_data") {
    return `<span style="font-family:'DM Sans',Arial,sans-serif;font-size:13px;font-weight:700;color:#8c8175;">Insufficient data</span>`;
  }

  if (status === "unchanged") {
    return `<span style="font-family:'DM Sans',Arial,sans-serif;font-size:13px;font-weight:700;color:#6b7280;">No change</span>`;
  }

  if (delta === null || Number.isNaN(delta)) {
    return `<span style="font-family:'DM Sans',Arial,sans-serif;font-size:13px;font-weight:700;color:#8c8175;">Insufficient data</span>`;
  }

  if (delta === 0) {
    return `<span style="font-family:'DM Sans',Arial,sans-serif;font-size:13px;font-weight:700;color:#6b7280;">No change</span>`;
  }

  const tone = delta > 0 ? "#0f7a37" : "#9b2c24";
  const arrow = delta > 0 ? "\u2191" : "\u2193";
  const sign = delta > 0 ? "+" : "";

  return `<span style="font-family:'DM Sans',Arial,sans-serif;font-size:16px;font-weight:700;color:${tone};">${arrow} ${sign}${delta}%</span>`;
}

function renderSectionCta(label: string, url: string): string {
  if (!url || url === "#") {
    return "";
  }

  return `
    <div style="margin-top:18px;">
      <a href="${escapeHtml(url)}" target="_top" style="display:inline-block;background:#1a1a1a;color:#ffffff;font-family:'DM Sans',Arial,sans-serif;font-size:14px;font-weight:700;letter-spacing:0.4px;padding:12px 20px;text-decoration:none;border-radius:2px;">
        ${escapeHtml(label)}
      </a>
    </div>
  `;
}

function renderTopBanksSection(article: NewsletterHtmlArticle): string | null {
  const rows = safeRows(article.metadata?.rows);
  if (rows.length === 0) {
    return null;
  }

  const headline = textValue(article.metadata?.headline, article.title, "Who's Moving This Week");
  const eyebrow = textValue(article.metadata?.eyebrow, "Top Banks Listing");
  const ctaLabel = textValue(article.metadata?.cta_label, "Full Bank Rankings \u2192");
  const ctaUrl = normalizeNavigationUrl(
    textValue(article.metadata?.cta_url, "/insights/listings?tab=listings"),
  );

  return `
    <div style="padding:34px 26px 22px;background:#f2eee8;border-bottom:1px solid #e3ddd6;">
      <div style="font-family:'DM Sans',Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#72262a;margin-bottom:10px;border-left:4px solid #1a1a1a;padding-left:12px;">
        ${escapeHtml(eyebrow)}
      </div>
      <div style="font-family:'Playfair Display',Georgia,serif;font-size:30px;font-weight:700;line-height:1.15;color:#09111f;margin-bottom:18px;">
        ${escapeHtml(headline)}
      </div>
      <table style="width:100%;border-collapse:collapse;background:#ffffff;">
        <thead>
          <tr style="background:#1a1a1a;color:#ffffff;">
            <th style="padding:16px 18px;text-align:left;font-family:'DM Sans',Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Servicer / Bank</th>
            <th style="padding:16px 18px;text-align:left;font-family:'DM Sans',Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">New Listings</th>
            <th style="padding:16px 18px;text-align:left;font-family:'DM Sans',Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Top State</th>
            <th style="padding:16px 18px;text-align:left;font-family:'DM Sans',Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">WoW Δ</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row, index) => `
                <tr style="background:${index % 2 === 0 ? "#f6f2ed" : "#ffffff"};">
                  <td style="padding:16px 18px;font-family:'DM Sans',Arial,sans-serif;font-size:16px;font-weight:700;color:#09111f;">${escapeHtml(textValue(row.name, "Institution"))}</td>
                  <td style="padding:16px 18px;font-family:'DM Sans',Arial,sans-serif;font-size:15px;color:#09111f;">${escapeHtml((numericValue(row.count) ?? 0).toLocaleString("en-US"))}</td>
                  <td style="padding:16px 18px;font-family:'DM Sans',Arial,sans-serif;font-size:15px;color:#374151;">${escapeHtml(textValue(row.top_state, "National"))}</td>
                  <td style="padding:16px 18px;">${renderDeltaBadge(numericValue(row.wow_delta_pct), textValue(row.wow_delta_status))}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
      <div style="margin-top:22px;">
        <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#1a1a1a;color:#ffffff;font-family:'DM Sans',Arial,sans-serif;font-size:14px;font-weight:700;letter-spacing:0.4px;padding:14px 22px;text-decoration:none;border-radius:2px;">
          ${escapeHtml(ctaLabel)}
        </a>
      </div>
    </div>
  `;
}

function renderHotMarketsSection(article: NewsletterHtmlArticle): string | null {
  const rows = safeRows(article.metadata?.rows);
  if (rows.length === 0) {
    return null;
  }

  const headline = textValue(article.metadata?.headline, article.title, "Top 5 Counties This Week");
  const eyebrow = textValue(article.metadata?.eyebrow, "Hot Markets");
  const ctaLabel = textValue(article.metadata?.cta_label, "More Listings \u2192");
  const ctaUrl = normalizeNavigationUrl(
    textValue(article.metadata?.cta_url, "/insights/listings?tab=listings"),
  );

  return `
    <div style="padding:34px 26px 24px;background:#f2eee8;border-bottom:1px solid #e3ddd6;">
      <div style="font-family:'DM Sans',Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#72262a;margin-bottom:10px;border-left:4px solid #72262a;padding-left:12px;">
        ${escapeHtml(eyebrow)}
      </div>
      <div style="font-family:'Playfair Display',Georgia,serif;font-size:30px;font-weight:700;line-height:1.15;color:#09111f;margin-bottom:20px;">
        ${escapeHtml(headline)}
      </div>
      ${rows
        .map(
          (row) => `
            <div style="display:flex;align-items:center;gap:18px;background:#ffffff;border-radius:4px;padding:18px 20px;margin-bottom:12px;">
              <div style="width:26px;font-family:'Playfair Display',Georgia,serif;font-size:18px;font-weight:700;color:#72262a;text-align:center;">
                ${escapeHtml(String(numericValue(row.rank) ?? ""))}
              </div>
              <div style="flex:1 1 auto;">
                <div style="font-family:'DM Sans',Arial,sans-serif;font-size:16px;font-weight:700;color:#09111f;">
                  ${escapeHtml(textValue(row.name, "Market"))}
                </div>
                <div style="font-family:'DM Sans',Arial,sans-serif;font-size:14px;color:#7a6b60;margin-top:2px;">
                  ${escapeHtml(textValue(row.metro, "Active market"))} · ${escapeHtml((numericValue(row.count) ?? 0).toLocaleString("en-US"))} active REO listings
                </div>
              </div>
              <div style="white-space:nowrap;">
                ${renderDeltaBadge(numericValue(row.wow_delta_pct), textValue(row.wow_delta_status))}
              </div>
            </div>
          `,
        )
        .join("")}
      ${renderSectionCta(ctaLabel, ctaUrl)}
    </div>
  `;
}

function renderSectionIntro(article: NewsletterHtmlArticle): string {
  return `
    <div style="font-family:'DM Sans',Arial,sans-serif;font-size:13px;line-height:1.7;color:#5f5348;margin:0 0 16px;">
      ${escapeHtml(article.teaser)}
    </div>
  `;
}

function renderMarketPulseSection(article: NewsletterHtmlArticle): string | null {
  const statCards = safeRows(article.metadata?.stat_cards);
  const sourceCards = safeRows(article.metadata?.source_cards);
  const geographyRows = safeRows(article.metadata?.geography_rows);
  const ctaLabel = textValue(article.metadata?.cta_label, "More Pulse \u2192");
  const ctaUrl = normalizeNavigationUrl(
    textValue(article.metadata?.cta_url, "/insights/listings?tab=pulse"),
  );

  return `
    <div style="padding:34px 26px 24px;background:#f7f5f2;border-bottom:1px solid #e3ddd6;">
      <div style="font-family:'DM Sans',Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#72262a;margin-bottom:10px;border-left:4px solid #72262a;padding-left:12px;">
        ${escapeHtml(textValue(article.metadata?.eyebrow, "Market Pulse"))}
      </div>
      <div style="font-family:'Playfair Display',Georgia,serif;font-size:30px;font-weight:700;line-height:1.15;color:#09111f;margin-bottom:14px;">
        ${escapeHtml(textValue(article.metadata?.headline, article.title, "Where Distressed Inventory Is Building"))}
      </div>
      ${renderSectionIntro(article)}
      ${
        statCards.length > 0
          ? `<table style="width:100%;border-collapse:separate;border-spacing:10px 0;margin:8px 0 18px;">
              <tr>
                ${statCards
                  .map(
                    (card) => `
                      <td style="background:#ffffff;border:1px solid #e3ddd6;border-top:3px solid #72262a;padding:14px 12px;vertical-align:top;">
                        <div style="font-family:'Playfair Display',Georgia,serif;font-size:24px;font-weight:700;color:#09111f;line-height:1;">
                          ${escapeHtml((numericValue(card.value) ?? 0).toLocaleString("en-US"))}
                        </div>
                        <div style="font-family:'DM Sans',Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#72262a;margin-top:8px;">
                          ${escapeHtml(textValue(card.label, "Metric"))}
                        </div>
                        <div style="font-family:'DM Sans',Arial,sans-serif;font-size:11px;line-height:1.6;color:#6d5b49;margin-top:4px;">
                          ${escapeHtml(textValue(card.detail))}
                        </div>
                      </td>
                    `,
                  )
                  .join("")}
              </tr>
            </table>`
          : ""
      }
      ${
        sourceCards.length > 0
          ? `<div style="margin-top:4px;margin-bottom:18px;">
              <div style="font-family:'DM Sans',Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#8a8480;margin-bottom:10px;">
                Inventory by source
              </div>
              ${sourceCards
                .map(
                  (card) => `
                    <div style="display:flex;justify-content:space-between;gap:14px;background:#ffffff;border-radius:4px;padding:12px 14px;margin-bottom:10px;border:1px solid #ebe5de;">
                      <div>
                        <div style="font-family:'DM Sans',Arial,sans-serif;font-size:15px;font-weight:700;color:#09111f;">${escapeHtml(textValue(card.source, "Source"))}</div>
                        <div style="font-family:'DM Sans',Arial,sans-serif;font-size:12px;color:#7a6b60;margin-top:2px;">${escapeHtml(textValue(card.detail, "Current activity"))}</div>
                      </div>
                      <div style="font-family:'Playfair Display',Georgia,serif;font-size:24px;font-weight:700;color:#72262a;white-space:nowrap;">${escapeHtml((numericValue(card.value) ?? 0).toLocaleString("en-US"))}</div>
                    </div>
                  `,
                )
                .join("")}
            </div>`
          : ""
      }
      ${
        geographyRows.length > 0
          ? `<div style="margin-top:6px;">
              <div style="font-family:'DM Sans',Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#8a8480;margin-bottom:10px;">
                Most active geographies
              </div>
              <table style="width:100%;border-collapse:collapse;background:#ffffff;">
                ${geographyRows
                  .map(
                    (row, index) => `
                      <tr style="background:${index % 2 === 0 ? "#ffffff" : "#fbf9f6"};">
                        <td style="padding:12px 14px;font-family:'DM Sans',Arial,sans-serif;font-size:15px;font-weight:700;color:#09111f;">${escapeHtml(textValue(row.label, "Market"))}</td>
                        <td style="padding:12px 14px;font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#7a6b60;">${escapeHtml(textValue(row.sublabel, "Inventory source"))}</td>
                        <td style="padding:12px 14px;font-family:'Playfair Display',Georgia,serif;font-size:21px;font-weight:700;color:#72262a;text-align:right;">${escapeHtml((numericValue(row.value) ?? 0).toLocaleString("en-US"))}</td>
                      </tr>
                    `,
                  )
                  .join("")}
              </table>
            </div>`
          : ""
      }
      ${renderSectionCta(ctaLabel, ctaUrl)}
    </div>
  `;
}

function renderIndustryNewsSection(article: NewsletterHtmlArticle): string | null {
  const stories = safeRows(article.metadata?.stories);
  const sourceRows = safeRows(article.metadata?.source_rows);
  const validStories = stories.filter(
    (story) => textValue(story.title) && textValue(story.source),
  );
  const validSourceRows = sourceRows.filter((row) => textValue(row.source));
  const ctaLabel = textValue(article.metadata?.cta_label, "Read More \u2192");
  const ctaUrl = normalizeNavigationUrl(
    textValue(article.metadata?.cta_url, "/insights/news"),
  );
  if (validStories.length === 0) {
    return null;
  }

  return `
    <div style="padding:34px 26px 24px;background:#ffffff;border-bottom:1px solid #e3ddd6;">
      <div style="font-family:'DM Sans',Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#72262a;margin-bottom:10px;border-left:4px solid #1a1a1a;padding-left:12px;">
        ${escapeHtml(textValue(article.metadata?.eyebrow, "Industry News"))}
      </div>
      <div style="font-family:'Playfair Display',Georgia,serif;font-size:28px;font-weight:700;line-height:1.15;color:#09111f;margin-bottom:14px;">
        ${escapeHtml(textValue(article.metadata?.headline, article.title, "What Changed Across Foreclosure and REO This Week"))}
      </div>
      ${renderSectionIntro(article)}
      ${
        validSourceRows.length > 0
          ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px;">
              ${validSourceRows
                .map(
                  (row) => `
                    <span style="display:inline-block;padding:8px 12px;background:#f3e7e8;border:1px solid #e3c8cb;border-radius:999px;font-family:'DM Sans',Arial,sans-serif;font-size:11px;font-weight:700;color:#72262a;">
                      ${escapeHtml(textValue(row.source))}: ${escapeHtml(String(numericValue(row.count) ?? 0))}
                    </span>
                  `,
                )
                .join("")}
            </div>`
          : ""
      }
      ${validStories
        .map(
          (story, index) => `
            <a href="${escapeHtml(ctaUrl)}" target="_top" style="display:block;background:${index === 0 ? "#f7f5f2" : "#ffffff"};border:${index === 0 ? "1px solid #e3ddd6" : "1px solid #ebe5de"};padding:14px 16px;margin-bottom:12px;border-radius:4px;text-decoration:none;">
              <div style="font-family:'DM Sans',Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#72262a;margin-bottom:6px;">
                ${escapeHtml(textValue(story.source))}${textValue(story.published_at) ? ` · ${escapeHtml(textValue(story.published_at))}` : ""} · OPEN
              </div>
              <div style="font-family:'Playfair Display',Georgia,serif;font-size:20px;font-weight:700;line-height:1.3;color:#09111f;margin-bottom:8px;">
                ${escapeHtml(textValue(story.title))}
              </div>
              <div style="font-family:'DM Sans',Arial,sans-serif;font-size:13px;line-height:1.7;color:#5f5348;">
                ${escapeHtml(excerptText(textValue(story.detail, article.teaser), 180))}
              </div>
            </a>
          `,
        )
        .join("")}
      ${renderSectionCta(ctaLabel, ctaUrl)}
    </div>
  `;
}

function renderHiringSection(article: NewsletterHtmlArticle): string | null {
  const employers = safeRows(article.metadata?.employers);
  const focusRows = safeRows(article.metadata?.focus_rows);
  const ctaLabel = textValue(article.metadata?.cta_label, "Open Employers Hub \u2192");
  const ctaUrl = normalizeNavigationUrl(
    textValue(article.metadata?.cta_url, "/insights/listings?tab=employers"),
  );
  if (employers.length === 0) {
    return null;
  }

  return `
    <div style="padding:34px 26px 24px;background:#f7f5f2;border-bottom:1px solid #e3ddd6;">
      <div style="font-family:'DM Sans',Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#72262a;margin-bottom:10px;border-left:4px solid #72262a;padding-left:12px;">
        ${escapeHtml(textValue(article.metadata?.eyebrow, "Bank Hiring Intel"))}
      </div>
      <div style="font-family:'Playfair Display',Georgia,serif;font-size:28px;font-weight:700;line-height:1.15;color:#09111f;margin-bottom:14px;">
        ${escapeHtml(textValue(article.metadata?.headline, article.title, "Who Is Staffing Up Across Default and REO"))}
      </div>
      ${renderSectionIntro(article)}
      <table style="width:100%;border-collapse:separate;border-spacing:10px 0;margin:8px 0 18px;">
        <tr>
          <td style="background:#ffffff;border:1px solid #e3ddd6;border-top:3px solid #1a1a1a;padding:14px 12px;text-align:center;">
            <div style="font-family:'Playfair Display',Georgia,serif;font-size:24px;font-weight:700;color:#09111f;">${escapeHtml((numericValue(article.metadata?.total_jobs) ?? 0).toLocaleString("en-US"))}</div>
            <div style="font-family:'DM Sans',Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#72262a;margin-top:8px;">Open roles tracked</div>
          </td>
          <td style="background:#ffffff;border:1px solid #e3ddd6;border-top:3px solid #72262a;padding:14px 12px;text-align:center;">
            <div style="font-family:'Playfair Display',Georgia,serif;font-size:24px;font-weight:700;color:#09111f;">${escapeHtml((numericValue(article.metadata?.employer_count) ?? employers.length).toLocaleString("en-US"))}</div>
            <div style="font-family:'DM Sans',Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#72262a;margin-top:8px;">Active employers</div>
          </td>
        </tr>
      </table>
      ${
        focusRows.length > 0
          ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px;">
              ${focusRows
                .map(
                  (row) => `
                    <span style="display:inline-block;padding:8px 12px;background:#ffffff;border:1px solid #e3ddd6;border-radius:999px;font-family:'DM Sans',Arial,sans-serif;font-size:11px;font-weight:700;color:#72262a;">
                      ${escapeHtml(textValue(row.focus, "Hiring focus"))}: ${escapeHtml(String(numericValue(row.count) ?? 0))}
                    </span>
                  `,
                )
                .join("")}
            </div>`
          : ""
      }
      ${employers
        .map(
          (employer, index) => `
            <div style="display:flex;justify-content:space-between;gap:14px;background:${index % 2 === 0 ? "#ffffff" : "#fbf9f6"};border:1px solid #ebe5de;padding:14px 16px;margin-bottom:10px;border-radius:4px;">
              <div style="flex:1 1 auto;">
                <div style="font-family:'DM Sans',Arial,sans-serif;font-size:16px;font-weight:700;color:#09111f;">${escapeHtml(textValue(employer.company, "Employer"))}</div>
                <div style="font-family:'DM Sans',Arial,sans-serif;font-size:13px;line-height:1.6;color:#6d5b49;margin-top:4px;">
                  ${escapeHtml(textValue(...safeRows(employer.sample_roles).map((item) => textValue(item)), "Role mix not available"))}
                </div>
                <div style="font-family:'DM Sans',Arial,sans-serif;font-size:12px;line-height:1.6;color:#8a7a6c;margin-top:4px;">
                  ${escapeHtml(textValue(...safeRows(employer.locations).map((item) => textValue(item)), "Location not listed"))}
                </div>
              </div>
              <div style="font-family:'Playfair Display',Georgia,serif;font-size:24px;font-weight:700;color:#72262a;white-space:nowrap;">${escapeHtml(String(numericValue(employer.total_jobs) ?? 0))}</div>
            </div>
          `,
        )
        .join("")}
      ${renderSectionCta(ctaLabel, ctaUrl)}
    </div>
  `;
}

function renderSpotlightSection(article: NewsletterHtmlArticle): string | null {
  const bullets = safeRows(article.metadata?.bullets);
  const ctaLabel = textValue(article.metadata?.cta_label, "Log In and Update Your Profile");
  const ctaUrl = textValue(article.metadata?.cta_url, article.ms_platform_url, "#");

  return `
    <div style="padding:34px 26px 24px;background:#1a1a1a;border-bottom:1px solid #2c2c2c;">
      <div style="font-family:'DM Sans',Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#d6a2a8;margin-bottom:10px;border-left:4px solid #72262a;padding-left:12px;">
        ${escapeHtml(textValue(article.metadata?.eyebrow, "UFS Spotlight"))}
      </div>
      <div style="font-family:'Playfair Display',Georgia,serif;font-size:28px;font-weight:700;line-height:1.15;color:#ffffff;margin-bottom:14px;">
        ${escapeHtml(textValue(article.metadata?.headline, article.title, "Field Coverage Built for Distressed Asset Workflows"))}
      </div>
      <div style="font-family:'DM Sans',Arial,sans-serif;font-size:14px;line-height:1.8;color:rgba(255,255,255,0.78);margin-bottom:16px;">
        ${escapeHtml(article.teaser)}
      </div>
      ${
        bullets.length > 0
          ? `<ul style="margin:0 0 20px;padding-left:18px;font-family:'DM Sans',Arial,sans-serif;font-size:13px;line-height:1.9;color:rgba(255,255,255,0.76);">
              ${bullets
                .map(
                  (bullet) => `
                    <li style="margin:0 0 10px;">${escapeHtml(textValue(bullet, "UFS service support"))}</li>
                  `,
                )
                .join("")}
            </ul>`
          : ""
      }
      <div style="font-family:'DM Sans',Arial,sans-serif;font-size:13px;line-height:1.8;color:rgba(255,255,255,0.68);margin-bottom:18px;">
        ${escapeHtml(excerptText(article.body, 320))}
      </div>
      <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#72262a;color:#ffffff;font-family:'DM Sans',Arial,sans-serif;font-size:13px;font-weight:700;letter-spacing:0.4px;padding:14px 24px;text-decoration:none;border-radius:2px;">
        ${escapeHtml(ctaLabel)}
      </a>
    </div>
  `;
}

function renderSectionBlock(article: NewsletterHtmlArticle, index: number): string {
  if (article.section_type === "market_pulse") {
    const block = renderMarketPulseSection(article);
    if (block) {
      return block;
    }
  }

  if (article.section_type === "top_banks") {
    const block = renderTopBanksSection(article);
    if (block) {
      return block;
    }
  }

  if (article.section_type === "hot_markets") {
    const block = renderHotMarketsSection(article);
    if (block) {
      return block;
    }
  }

  if (article.section_type === "industry_news") {
    const block = renderIndustryNewsSection(article);
    if (block) {
      return block;
    }
  }

  if (article.section_type === "bank_hiring_intel") {
    const block = renderHiringSection(article);
    if (block) {
      return block;
    }
  }

  if (article.section_type === "ufs_spotlight") {
    const block = renderSpotlightSection(article);
    if (block) {
      return block;
    }
  }

  const stats = extractStatSnippets(article, 3);
  const bullets = extractBulletPoints(article, 4);

  return `
    <div style="padding:32px 36px;border-bottom:1px solid #eaeaea;${index % 2 === 1 ? "background:#f7f5f2;" : "background:#ffffff;"}">
      <div style="font-family:'DM Sans',Arial,sans-serif;font-size:10px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#72262a;margin-bottom:8px;">
        Section ${index + 2} · ${escapeHtml(sectionLabel(article.section_type))}
      </div>
      <div style="font-family:'Playfair Display',Georgia,serif;font-size:22px;font-weight:bold;line-height:1.35;color:#1a1a1a;margin-bottom:12px;">
        ${escapeHtml(article.title)}
      </div>
      <div style="font-family:'DM Sans',Arial,sans-serif;font-size:13px;line-height:1.7;color:#555;margin-bottom:16px;">
        ${escapeHtml(article.teaser)}
      </div>
      ${renderStatPills(stats)}
      ${renderBulletList(bullets)}
      <div style="font-family:'DM Sans',Arial,sans-serif;font-size:13px;line-height:1.8;color:#444;margin-top:14px;">
        ${escapeHtml(excerptText(article.body, 520))}
      </div>
    </div>
  `;
}

export function buildNewsletterHtml(
  newsletter: NewsletterHtmlIssue,
  articles: NewsletterHtmlArticle[],
): string {
  const leadArticle = articles[0];
  const secondaryArticles = articles.slice(1);
  const issueWeek = formatIssueWeek(newsletter.issue_date);
  const articleCount = articles.length;
  const audienceCount = new Set(articles.map((article) => article.audience_tag).filter(Boolean)).size;
  const categoryCount = new Set(articles.map((article) => article.section_type)).size;
  const leadStats = leadArticle ? extractStatSnippets(leadArticle, 4) : [];
  const leadBullets = leadArticle ? extractBulletPoints(leadArticle, 4) : [];
  const leadDetailBlock = leadArticle ? renderSectionBlock(leadArticle, -1) : "";

  const sectionBlocks = secondaryArticles
    .map((article, index) => renderSectionBlock(article, index))
    .join("");

  return `
    <div style="margin:0;background:#f0ede8;padding:24px 12px;color:#1a1a1a;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;">
        <div style="background:#1a1a1a;">
          <div style="padding:20px 36px 0 36px;display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;">
            <div>
              <div style="font-family:'DM Sans',Arial,sans-serif;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.45);margin-bottom:4px;">United Field Services</div>
              <div style="font-family:'Playfair Display',Georgia,serif;font-size:34px;font-weight:bold;color:#ffffff;line-height:1;">The Disposition Desk</div>
            </div>
            <div style="text-align:right;font-family:'DM Sans',Arial,sans-serif;">
              <div style="font-size:11px;color:rgba(255,255,255,0.72);text-transform:uppercase;letter-spacing:1.5px;">${escapeHtml(issueWeek)}</div>
              <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:3px;">Issue #${newsletter.issue_number} · REO market intelligence</div>
            </div>
          </div>
          <div style="background:#72262a;height:4px;margin-top:16px;"></div>
          <div style="background:#2c2c2c;padding:10px 36px;font-family:'DM Sans',Arial,sans-serif;font-size:11px;color:rgba(255,255,255,0.55);letter-spacing:1px;text-transform:uppercase;">Foreclosure · REO · Servicer activity · Market watch</div>
        </div>

        <div style="background:#72262a;padding:12px 36px;display:flex;align-items:center;justify-content:center;gap:14px;">
          <div style="font-family:'Playfair Display',Georgia,serif;font-size:42px;font-weight:bold;color:#ffffff;line-height:1;">${articleCount}</div>
          <div style="font-family:'DM Sans',Arial,sans-serif;">
            <div style="font-size:13px;font-weight:bold;color:#ffffff;text-transform:uppercase;letter-spacing:0.5px;">Sections packaged for this issue</div>
            <div style="font-size:11px;color:rgba(255,255,255,0.72);margin-top:2px;">${categoryCount} editorial lanes · ${audienceCount} audience segments</div>
          </div>
        </div>

        <div style="background:#1a1a1a;padding:28px 36px 32px;">
          <div style="display:inline-block;background:#72262a;color:#ffffff;font-family:'DM Sans',Arial,sans-serif;font-size:9px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;padding:4px 10px;margin-bottom:14px;">
            This Week&#39;s Lead Story
          </div>
          <div style="font-family:'Playfair Display',Georgia,serif;font-size:24px;line-height:1.35;font-weight:bold;color:#ffffff;margin-bottom:12px;">
            ${escapeHtml(leadArticle?.title ?? `Issue #${newsletter.issue_number} editorial brief`)}
          </div>
          <div style="font-family:'DM Sans',Arial,sans-serif;font-size:14px;color:#ffffff;line-height:1.8;margin-bottom:14px;">
            ${escapeHtml(leadArticle?.teaser ?? "The lead story summary will appear here after the draft is generated.")}
          </div>
          ${leadStats.length > 0 ? `
            <div style="display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 18px;">
              ${leadStats
                .map(
                  (stat) => `
                    <span style="display:inline-block;padding:8px 12px;background:#2c2c2c;border:1px solid rgba(255,255,255,0.1);border-radius:999px;font-family:'DM Sans',Arial,sans-serif;font-size:11px;font-weight:bold;line-height:1.4;color:#f7f5f2;">
                      ${escapeHtml(stat)}
                    </span>
                  `,
                )
                .join("")}
            </div>
          ` : ""}
          ${leadBullets.length > 0 ? `
            <div style="margin:12px 0 16px;">
              <div style="font-family:'DM Sans',Arial,sans-serif;font-size:10px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#72262a;margin-bottom:10px;">
                Quick brief
              </div>
              <ul style="margin:0;padding-left:18px;font-family:'DM Sans',Arial,sans-serif;font-size:13px;line-height:1.9;color:rgba(255,255,255,0.78);">
                ${leadBullets
                  .map(
                    (point) => `
                      <li style="margin:0 0 10px;">${escapeHtml(point)}</li>
                    `,
                  )
                  .join("")}
              </ul>
            </div>
          ` : ""}
          <div style="font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:rgba(255,255,255,0.72);line-height:1.75;">
            ${escapeHtml(
              leadArticle?.body
                ? excerptText(leadArticle.body, 280)
                : "This issue is assembled from the latest source pulls and editorial review in the Disposition Desk workflow.",
            )}
          </div>
        </div>

        ${leadDetailBlock}

        <div style="padding:32px 36px;border-bottom:1px solid #eaeaea;">
          <div style="font-family:'DM Sans',Arial,sans-serif;font-size:10px;font-weight:bold;letter-spacing:3px;text-transform:uppercase;color:#72262a;margin-bottom:8px;">Editorial Metrics</div>
          <table style="width:100%;border-collapse:separate;border-spacing:12px 0;">
            <tr>
              <td style="background:#f7f5f2;border:1px solid #e8e4df;border-top:3px solid #1a1a1a;padding:14px 12px;text-align:center;">
                <div style="font-family:'Playfair Display',Georgia,serif;font-size:26px;font-weight:bold;color:#1a1a1a;line-height:1;">${articleCount}</div>
                <div style="font-family:'DM Sans',Arial,sans-serif;font-size:10px;color:#666;text-transform:uppercase;letter-spacing:0.5px;margin-top:6px;">Published sections</div>
              </td>
              <td style="background:#f3e7e8;border:1px solid #e3c8cb;border-top:3px solid #72262a;padding:14px 12px;text-align:center;">
                <div style="font-family:'Playfair Display',Georgia,serif;font-size:26px;font-weight:bold;color:#72262a;line-height:1;">${categoryCount}</div>
                <div style="font-family:'DM Sans',Arial,sans-serif;font-size:10px;color:#666;text-transform:uppercase;letter-spacing:0.5px;margin-top:6px;">Editorial lanes</div>
              </td>
              <td style="background:#f7f5f2;border:1px solid #e8e4df;border-top:3px solid #1a1a1a;padding:14px 12px;text-align:center;">
                <div style="font-family:'Playfair Display',Georgia,serif;font-size:26px;font-weight:bold;color:#1a1a1a;line-height:1;">${audienceCount}</div>
                <div style="font-family:'DM Sans',Arial,sans-serif;font-size:10px;color:#666;text-transform:uppercase;letter-spacing:0.5px;margin-top:6px;">Audience tags</div>
              </td>
            </tr>
          </table>
        </div>

        ${sectionBlocks}

        <div style="background:#1a1a1a;padding:32px 36px;text-align:center;">
          <div style="font-family:'DM Sans',Arial,sans-serif;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#72262a;margin-bottom:12px;">UFS Agent Opportunity</div>
          <div style="font-family:'Playfair Display',Georgia,serif;font-size:22px;font-weight:bold;color:#ffffff;margin-bottom:12px;line-height:1.35;">
            The issue is ready to move from editorial review into delivery.
          </div>
          <div style="font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:rgba(255,255,255,0.72);line-height:1.7;max-width:480px;margin:0 auto 20px;">
            This edition was assembled inside the Disposition Desk workflow. Approved issues are published to article pages first, then scheduled to the active Mailchimp audience.
          </div>
          <a href="https://clients.unitedffs.com/register/client" style="display:inline-block;background:#72262a;color:#ffffff;font-family:'DM Sans',Arial,sans-serif;font-size:13px;font-weight:bold;letter-spacing:0.5px;padding:14px 32px;text-decoration:none;text-transform:uppercase;">
            Log In and Update Your Profile
          </a>
        </div>

        <div style="background:#2c2c2c;padding:24px 36px;">
          <div style="font-family:'Playfair Display',Georgia,serif;font-size:16px;color:#ffffff;font-weight:bold;margin-bottom:8px;">United Field Services</div>
          <div style="font-family:'DM Sans',Arial,sans-serif;font-size:10px;color:rgba(255,255,255,0.56);line-height:1.7;margin-bottom:12px;">
            The Disposition Desk is published weekly for registered REO agents and partners. This newsletter is for informational purposes only and should be reviewed before distribution.
          </div>
          <div style="height:1px;background:rgba(255,255,255,0.12);margin:14px 0;"></div>
          <div style="font-family:'DM Sans',Arial,sans-serif;font-size:10px;color:rgba(255,255,255,0.56);">
            <a href="https://unitedffs.com" style="color:#ffffff;text-decoration:none;margin-right:12px;">United Field Services</a>
            <a href="https://clients.unitedffs.com/register/client" style="color:#ffffff;text-decoration:none;margin-right:12px;">Register</a>
            <a href="https://unitedffs.com/help-center-for-clients/" style="color:#ffffff;text-decoration:none;">Help Center</a>
          </div>
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

  // Keep preview links navigating the top-level app instead of inside the iframe.
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
