import { getSettings, type Settings } from "@/server/env";
import { appendWorkflowLog } from "@/server/logs";
import type { SourceResult } from "@/server/types";

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const NEWS_QUERIES = [
  "REO foreclosure real estate",
  "bank owned properties",
  "mortgage default foreclosure",
  "HUD REO disposition",
];
const REDDIT_SEARCH_QUERIES = [
  "REO foreclosure real estate",
  "\"bank owned\" real estate",
  "\"HUD home\" foreclosure",
  "\"distressed property\" real estate",
];
const INDUSTRY_SIGNAL_KEYWORDS = [
  "reo",
  "foreclosure",
  "foreclosed",
  "bank owned",
  "bank-owned",
  "distressed property",
  "hud home",
  "hud",
  "homepath",
  "homesteps",
  "fannie mae",
  "freddie mac",
  "disposition",
];
const ZILLOW_RSS_FEEDS = [
  {
    label: "Housing Market / Rental Research",
    url: "https://zillow.mediaroom.com/press-releases?category=816&pagetemplate=rss",
  },
  {
    label: "Industry Announcements",
    url: "https://zillow.mediaroom.com/press-releases?category=820&pagetemplate=rss",
  },
  {
    label: "Zillow Home Loans News",
    url: "https://zillow.mediaroom.com/press-releases?category=821&pagetemplate=rss",
  },
];
const GROK_QUERIES = [
  "REO foreclosure real estate",
  "bank owned properties market",
  "foreclosure activity 2026",
  "REO listing agent",
];
const SUBREDDITS = ["realestate", "RealEstateInvesting", "foreclosure"];
const REDDIT_KEYWORDS = [
  "reo",
  "foreclosure",
  "bank owned",
  "bank-owned",
  "asset manager",
  "default servicing",
];
const HUD_AUTOCOMPLETE_PREFIXES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const HOMESTEPS_AUTOCOMPLETE_PREFIXES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const HOMESTEPS_AUTOCOMPLETE_URL =
  "https://www.homesteps.com/search_api_autocomplete/property_listing?display=property_listing_page&&filter=search";
const BANK_HIRING_LINKEDIN_SEARCHES = [
  {
    label: "REO roles",
    keywords: "REO",
  },
  {
    label: "Default servicing roles",
    keywords: "default servicing",
  },
  {
    label: "Loss mitigation roles",
    keywords: "loss mitigation",
  },
  {
    label: "Foreclosure roles",
    keywords: "foreclosure",
  },
];
const BANK_HIRING_INDEED_SEARCHES = BANK_HIRING_LINKEDIN_SEARCHES.map((search) => ({
  ...search,
}));
const BANK_HIRING_GOOGLE_SEARCHES = BANK_HIRING_LINKEDIN_SEARCHES.map((search) => ({
  ...search,
}));
const BANK_HIRING_ZIPRECRUITER_SEARCHES = BANK_HIRING_LINKEDIN_SEARCHES.map((search) => ({
  ...search,
}));
const BANK_HIRING_USAJOBS_SEARCHES = BANK_HIRING_LINKEDIN_SEARCHES.map((search) => ({
  ...search,
}));
const BANK_HIRING_GREENHOUSE_SEARCHES = BANK_HIRING_LINKEDIN_SEARCHES.map((search) => ({
  ...search,
}));
const BANK_HIRING_LEVER_SEARCHES = BANK_HIRING_LINKEDIN_SEARCHES.map((search) => ({
  ...search,
}));
const BANK_HIRING_USAJOBS_DIRECT_KEYWORDS = [
  "foreclosure",
  "asset manager",
  "mortgage servicing",
  "hud",
];
const BANK_HIRING_COMPANY_SEARCH_TERMS = [
  "REO",
  "default servicing",
  "foreclosure",
  "loss mitigation",
  "asset manager",
];
const BANK_HIRING_COMPANY_CAREER_SITES = [
  { company: "Wells Fargo", domain: "wellsfargojobs.com" },
  { company: "Bank of America", domain: "careers.bankofamerica.com" },
  { company: "JPMorgan Chase", domain: "careers.jpmorgan.com" },
  { company: "US Bank", domain: "careers.usbank.com" },
];
const FREE_LISTING_SIGNAL_SOURCES = [
  { key: "auction_com", label: "Auction.com", domain: "auction.com" },
  { key: "hubzu", label: "Hubzu", domain: "hubzu.com" },
  { key: "xome", label: "Xome", domain: "xome.com" },
  { key: "attom_data", label: "ATTOM Data", domain: "attomdata.com" },
  { key: "ice_mortgage_tech", label: "ICE Mortgage Tech", domain: "mortgagetech.ice.com" },
  { key: "reox_directory", label: "REOX Directory", domain: "thereox.com" },
  { key: "realtor_foreclosure", label: "Realtor.com Foreclosures", domain: "realtor.com" },
  { key: "redfin_foreclosure", label: "Redfin Foreclosures", domain: "redfin.com" },
  { key: "wells_fargo_reo", label: "Wells Fargo REO", domain: "wellsfargo.com" },
  { key: "chase_reo", label: "Chase REO", domain: "chase.com" },
  { key: "us_bank_reo", label: "US Bank REO", domain: "usbank.com" },
  { key: "mr_cooper_reo", label: "Mr. Cooper", domain: "mrcooper.com" },
  { key: "phh_mortgage_reo", label: "PHH Mortgage", domain: "phhmortgage.com" },
  { key: "newrez_shellpoint_reo", label: "NewRez / Shellpoint", domain: "newrez.com" },
  { key: "selene_finance_reo", label: "Selene Finance", domain: "selenefinance.com" },
  { key: "carrington_reo", label: "Carrington Mortgage", domain: "carringtonmortgage.com" },
  { key: "foreclosure_listings_usa", label: "Foreclosure Listings USA", domain: "foreclosurelistingsusa.com" },
];
const FREE_LISTING_SIGNAL_SOURCE_KEYS = new Set(
  FREE_LISTING_SIGNAL_SOURCES.map((source) => source.key),
);
const OPTIONAL_NO_SIGNAL_REASON_BY_SOURCE: Record<string, string> = {
  zillow_rapidapi:
    "Tracked Zillow IDs returned no live listing payload in this run window.",
  homepath:
    "HomePath is optional and currently on hold unless enabled with a valid session.",
  indeed_jobs:
    "Indeed returned no matching jobs or blocked automated access during this run.",
  google_jobs:
    "No matching Google-indexed REO/default-servicing job cards were found this run.",
  ziprecruiter_jobs:
    "No matching ZipRecruiter REO/default-servicing job cards were found this run.",
  company_career_jobs:
    "No matching REO/default-servicing roles were found on tracked company career sites.",
  attom_data:
    "No live ATTOM pages matched foreclosure/listing signal keywords in this run.",
  ice_mortgage_tech:
    "No live ICE Mortgage Technology pages matched foreclosure/listing signal keywords in this run.",
  reox_directory:
    "No live REOX directory pages matched REO signal keywords in this run.",
  usajobs_jobs:
    "No matching USAJobs housing/default-servicing roles were found in this run.",
  greenhouse_jobs:
    "No matching mortgage/default-servicing roles were found on tracked Greenhouse boards.",
  lever_jobs:
    "No matching mortgage/default-servicing roles were found on tracked Lever boards.",
};
const LISTING_SIGNAL_KEYWORDS = [
  "foreclosure",
  "foreclosed",
  "reo",
  "bank owned",
  "bank-owned",
  "auction",
  "distressed",
  "hud home",
  "real estate owned",
  "default servicing",
];
const BROAD_LISTING_SIGNAL_KEYWORDS = [
  "mortgage",
  "servicing",
  "home loan",
  "real estate",
  "loan",
  "bank",
  "property",
];
const BROAD_LISTING_SOURCE_KEYS = new Set([
  "attom_data",
  "ice_mortgage_tech",
  "reox_directory",
  "redfin_foreclosure",
  "wells_fargo_reo",
  "chase_reo",
  "us_bank_reo",
  "mr_cooper_reo",
  "phh_mortgage_reo",
  "newrez_shellpoint_reo",
  "selene_finance_reo",
  "carrington_reo",
]);
const FREE_LISTING_SEED_PATHS: Record<string, string[]> = {
  auction_com: ["/residential/", "/search"],
  hubzu: ["/", "/properties/"],
  xome: ["/", "/auctions/"],
  attom_data: ["/", "/solutions/property-data/", "/news/"],
  ice_mortgage_tech: ["/", "/resources/", "/products/"],
  reox_directory: ["/member-directory", "/"],
  realtor_foreclosure: ["/foreclosure", "/realestateandhomes-search"],
  redfin_foreclosure: ["/foreclosures", "/news/"],
  wells_fargo_reo: ["/mortgage/", "/mortgage/real-estate-owned/"],
  chase_reo: ["/personal/mortgage", "/personal/mortgage/real-estate"],
  us_bank_reo: ["/home-loans/mortgage", "/home-loans/mortgage/real-estate-owned.html"],
  mr_cooper_reo: ["/", "/homeowners/"],
  phh_mortgage_reo: ["/", "/loan-servicing/"],
  newrez_shellpoint_reo: ["/", "/shellpoint/"],
  selene_finance_reo: ["/", "/real-estate/"],
  carrington_reo: ["/", "/buy-a-home/"],
  foreclosure_listings_usa: ["/", "/listings/", "/foreclosures/"],
};
const BANK_HIRING_STRONG_KEYWORDS = [
  "reo",
  "default",
  "foreclosure",
  "loss mitigation",
  "pre-foreclosure",
  "mortgage servicing",
  "special assets",
  "distressed asset",
  "property preservation",
  "real estate owned",
  "default claims",
  "loan servicing",
  "mortgage assistance",
];
const BANK_HIRING_INSTITUTION_KEYWORDS = [
  "bank",
  "mortgage",
  "loan",
  "lending",
  "servicing",
  "credit union",
  "financial",
  "capital",
  "home lending",
  "fannie",
  "freddie",
  "hud",
  "fha",
  "va",
  "usda",
];
const BANK_HIRING_BROAD_SIGNAL_KEYWORDS = [
  "mortgage",
  "real estate",
  "housing",
  "property",
  "loan",
  "finance",
  "servicing",
  "asset",
  "foreclosure",
  "reo",
  "default",
  "hud",
];
const GREENHOUSE_BOARD_TOKENS = [
  { token: "opendoor", company: "Opendoor" },
  { token: "blend", company: "Blend" },
];
const LEVER_BOARD_TOKENS = [
  { token: "wealthfront", company: "Wealthfront" },
];
const US_STATE_CODES = new Set([
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "DC",
]);

function createResult(partial: Partial<SourceResult> & Pick<SourceResult, "source">): SourceResult {
  return {
    collected_at: new Date().toISOString(),
    data: [],
    errors: [],
    success: true,
    ...partial,
  };
}

async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit,
  timeoutMs = 15000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function sourceLogMessage(source: string): string {
  return source
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function inferNoSignalReason(sourceKey: string, optional?: boolean): string {
  if (OPTIONAL_NO_SIGNAL_REASON_BY_SOURCE[sourceKey]) {
    return OPTIONAL_NO_SIGNAL_REASON_BY_SOURCE[sourceKey];
  }

  if (FREE_LISTING_SIGNAL_SOURCE_KEYS.has(sourceKey)) {
    return "No indexable listing URLs matched REO/foreclosure signals in this run (site indexing or anti-bot controls can cause this).";
  }

  if (sourceKey.endsWith("_jobs")) {
    return "No matching hiring signals were found for this collection window.";
  }

  if (sourceKey === "grok" || sourceKey === "reddit" || sourceKey === "news_api") {
    return "No matching recent posts/headlines were found in this collection window.";
  }

  return optional
    ? "Optional source returned no signals in this run."
    : "Source returned no signals in this run.";
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function firstNumber(...values: unknown[]): number | null {
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

function extractResponseText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  const output = Array.isArray(payload.output) ? payload.output : [];
  const parts: string[] = [];

  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const directText = (item as { text?: unknown }).text;
    if (typeof directText === "string" && directText.trim()) {
      parts.push(directText);
    }

    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const part of content) {
      if (!part || typeof part !== "object") {
        continue;
      }

      const textValue = (part as { text?: unknown }).text;
      if (typeof textValue === "string" && textValue.trim()) {
        parts.push(textValue);
        continue;
      }

      const nestedText = (part as { text?: { value?: unknown } }).text?.value;
      if (typeof nestedText === "string" && nestedText.trim()) {
        parts.push(nestedText);
      }
    }
  }

  return parts.join("\n").trim();
}

async function runLoggedSourceCollection(
  sourceKey: string,
  runner: () => Promise<SourceResult>,
  options?: {
    optional?: boolean;
  },
): Promise<SourceResult> {
  const startedAt = Date.now();
  await appendWorkflowLog({
    scope: "sources",
    step: sourceKey,
    status: "info",
    message: `Starting ${sourceLogMessage(sourceKey)} collection.`,
    context: { source: sourceKey },
  });

  try {
    const result = await runner();
    const durationMs = Date.now() - startedAt;
    const hasWarnings = result.errors.length > 0;
    const optionalFailure = Boolean(options?.optional && !result.success);

    await appendWorkflowLog({
      scope: "sources",
      step: sourceKey,
      status: result.success ? (hasWarnings ? "warning" : "success") : optionalFailure ? "warning" : "error",
      message: result.success
        ? `${sourceLogMessage(result.source)} collected ${result.data.length} items.`
        : optionalFailure
          ? `${sourceLogMessage(result.source)} is unavailable, but the pipeline can continue without it.`
          : `${sourceLogMessage(result.source)} returned no usable data.`,
      context: {
        source: result.source,
        requested_source: sourceKey,
        item_count: result.data.length,
        error_count: result.errors.length,
        optional: Boolean(result.optional),
        no_signal_reason: result.no_signal_reason ?? null,
        errors: result.errors.slice(0, 5),
        duration_ms: durationMs,
      },
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";

    await appendWorkflowLog({
      scope: "sources",
      step: sourceKey,
      status: "error",
      message: `${sourceLogMessage(sourceKey)} crashed during collection.`,
      context: {
        source: sourceKey,
        error: message,
        duration_ms: Date.now() - startedAt,
      },
    });

    return createResult({
      source: sourceKey,
      data: [],
      errors: [message],
      success: false,
    });
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;

      if (index >= items.length) {
        return;
      }

      results[index] = await mapper(items[index], index);
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), items.length || 1);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function decodeXmlEntities(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&#x27;", "'");
}

function stripTags(value: string): string {
  return decodeXmlEntities(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cookieHeaderFromResponse(response: Response): string {
  const cookieSource = response.headers as Headers & {
    getSetCookie?: () => string[];
  };

  if (typeof cookieSource.getSetCookie === "function") {
    return cookieSource
      .getSetCookie()
      .map((cookie) => cookie.split(";", 1)[0])
      .join("; ");
  }

  const header = response.headers.get("set-cookie");
  if (!header) {
    return "";
  }

  return header
    .split(/,(?=[^;,]+=)/)
    .map((cookie) => cookie.split(";", 1)[0].trim())
    .filter(Boolean)
    .join("; ");
}

function mergeCookieHeaders(...cookieHeaders: string[]): string {
  const cookies = new Map<string, string>();

  for (const header of cookieHeaders) {
    for (const cookie of header.split(";")) {
      const trimmed = cookie.trim();
      if (!trimmed) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();
      if (key) {
        cookies.set(key, value);
      }
    }
  }

  return [...cookies.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
}

function parseHiddenInputValue(html: string, inputId: string): string | null {
  const match = html.match(
    new RegExp(`<input[^>]+id="${inputId}"[^>]+value="([\\s\\S]*?)"[^>]*\\/?>`, "i"),
  );

  return match?.[1] ? decodeXmlEntities(match[1]) : null;
}

function slugifyPathSegment(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("&", " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function readXmlTag(block: string, tagName: string): string {
  const match = block.match(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, "i"));
  return match?.[1] ? stripTags(match[1]) : "";
}

function parseRssItems(xml: string): Array<Record<string, unknown>> {
  const items: Array<Record<string, unknown>> = [];

  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const block = match[1];
    const title = readXmlTag(block, "title");
    const link = readXmlTag(block, "link");
    const description = readXmlTag(block, "description");
    const category = readXmlTag(block, "category");
    const publishedAt = readXmlTag(block, "pubDate");

    if (!title || !link) {
      continue;
    }

    items.push({
      title,
      url: link,
      description,
      category,
      published_at: publishedAt,
    });
  }

  return items;
}

function normalizeLinkedInJobUrl(url: string): string {
  try {
    const parsed = new URL(decodeXmlEntities(url));
    parsed.search = "";
    return parsed.toString();
  } catch {
    return decodeXmlEntities(url).split("?", 1)[0] ?? decodeXmlEntities(url);
  }
}

function matchesBankHiringSignal(title: string, company: string, query: string): boolean {
  const normalizedTitle = title.toLowerCase();
  const combined = `${title} ${company}`.toLowerCase();

  if (BANK_HIRING_STRONG_KEYWORDS.some((keyword) => combined.includes(keyword))) {
    return true;
  }

  const titleHasBroadSignal =
    /\basset manager\b/.test(normalizedTitle) ||
    /\bdisposition\b/.test(normalizedTitle) ||
    /\bservicing\b/.test(normalizedTitle);

  if (!titleHasBroadSignal) {
    return false;
  }

  return (
    BANK_HIRING_INSTITUTION_KEYWORDS.some((keyword) => combined.includes(keyword)) &&
    BANK_HIRING_STRONG_KEYWORDS.some((keyword) => query.toLowerCase().includes(keyword))
  );
}

function matchesBroadHiringSignal(...values: string[]): boolean {
  const combined = values.join(" ").toLowerCase();
  return BANK_HIRING_BROAD_SIGNAL_KEYWORDS.some((keyword) => combined.includes(keyword));
}

function classifyBankHiringFocus(title: string, query: string): string {
  const combined = `${title} ${query}`.toLowerCase();

  if (combined.includes("loss mitigation")) {
    return "Loss mitigation";
  }
  if (combined.includes("foreclosure") || combined.includes("pre-foreclosure")) {
    return "Foreclosure";
  }
  if (combined.includes("default")) {
    return "Default servicing";
  }
  if (combined.includes("servicing")) {
    return "Mortgage servicing";
  }
  if (combined.includes("reo") || combined.includes("real estate owned")) {
    return "REO";
  }
  if (combined.includes("property preservation")) {
    return "Property preservation";
  }

  return "Hiring signal";
}

function parseGreenhouseBoardJobs(
  html: string,
): Array<{
  title: string;
  location: string;
  url: string;
}> {
  const jobs: Array<{
    title: string;
    location: string;
    url: string;
  }> = [];

  for (const match of html.matchAll(
    /<tr class="job-post">[\s\S]*?<a href="([^"]+)"[^>]*>[\s\S]*?<p class="[^"]*body--medium[^"]*">([\s\S]*?)<\/p>[\s\S]*?<p class="[^"]*body__secondary[^"]*">([\s\S]*?)<\/p>[\s\S]*?<\/a>[\s\S]*?<\/tr>/gi,
  )) {
    const rawUrl = normalizeWhitespace(decodeXmlEntities(match[1] ?? ""));
    const title = normalizeWhitespace(stripTags(match[2] ?? ""));
    const location = normalizeWhitespace(stripTags(match[3] ?? ""));

    const url = rawUrl.startsWith("http")
      ? rawUrl
      : `https://boards.greenhouse.io${rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`}`;

    if (!title || !url) {
      continue;
    }

    jobs.push({
      title,
      location,
      url,
    });
  }

  if (jobs.length > 0) {
    return jobs;
  }

  // Fallback: extract from embedded JSON payload if table rows are not present.
  const payloadMatch = html.match(/window\.__remixContext\s*=\s*(\{[\s\S]*?\});<\/script>/i);
  if (!payloadMatch) {
    return jobs;
  }

  try {
    const payload = JSON.parse(payloadMatch[1]) as {
      state?: {
        loaderData?: {
          "routes/embed.job_board"?: {
            posts?: {
              data?: Array<{
                title?: string;
                location?: string;
                absolute_url?: string;
              }>;
            };
          };
        };
      };
    };

    for (const post of payload.state?.loaderData?.["routes/embed.job_board"]?.posts?.data ?? []) {
      const title = normalizeWhitespace(firstString(post.title));
      const location = normalizeWhitespace(firstString(post.location));
      const url = normalizeWhitespace(firstString(post.absolute_url));
      if (!title || !url) {
        continue;
      }

      jobs.push({ title, location, url });
    }
  } catch {
    return jobs;
  }

  return jobs;
}

function parseLeverBoardJobs(
  html: string,
): Array<{
  title: string;
  location: string;
  url: string;
}> {
  const jobs: Array<{
    title: string;
    location: string;
    url: string;
  }> = [];

  for (const match of html.matchAll(
    /<div class="posting"[\s\S]*?<a class="posting-title" href="([^"]+)">[\s\S]*?<h5[^>]*>([\s\S]*?)<\/h5>[\s\S]*?<span[^>]+class="[^"]*sort-by-location[^"]*"[^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/a>[\s\S]*?<\/div>/gi,
  )) {
    const url = normalizeWhitespace(decodeXmlEntities(match[1] ?? ""));
    const title = normalizeWhitespace(stripTags(match[2] ?? ""));
    const location = normalizeWhitespace(stripTags(match[3] ?? ""));

    if (!title || !url) {
      continue;
    }

    jobs.push({ title, location, url });
  }

  return jobs;
}

function parseLinkedInGuestJobs(
  html: string,
  query: { label: string; keywords: string },
): Array<Record<string, unknown>> {
  const jobs: Array<Record<string, unknown>> = [];

  for (const match of html.matchAll(/<li>\s*([\s\S]*?)<\/li>/gi)) {
    const block = match[1];
    if (!block.includes("job-search-card")) {
      continue;
    }

    const rawUrl =
      block.match(/class="base-card__full-link[^"]*"[^>]+href="([^"]+)"/i)?.[1] ?? "";
    const titleBlock =
      block.match(/class="base-search-card__title"[^>]*>\s*([\s\S]*?)\s*<\/h3>/i)?.[1] ?? "";
    const companyBlock =
      block.match(/class="base-search-card__subtitle"[^>]*>([\s\S]*?)<\/h4>/i)?.[1] ?? "";
    const locationBlock =
      block.match(/class="job-search-card__location"[^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? "";
    const dateValue =
      block.match(/<time[^>]+datetime="([^"]+)"/i)?.[1] ??
      block.match(/<time[^>]*>([\s\S]*?)<\/time>/i)?.[1] ??
      "";

    const url = rawUrl ? normalizeLinkedInJobUrl(rawUrl) : "";
    const title = normalizeWhitespace(stripTags(titleBlock));
    const company = normalizeWhitespace(stripTags(companyBlock));
    const location = normalizeWhitespace(stripTags(locationBlock));
    const postedDate = normalizeWhitespace(stripTags(dateValue));

    if (!url || !title || !company) {
      continue;
    }

    if (!matchesBankHiringSignal(title, company, query.keywords)) {
      continue;
    }

    jobs.push({
      source_name: "LinkedIn Jobs",
      query: query.keywords,
      query_label: query.label,
      hiring_focus: classifyBankHiringFocus(title, query.keywords),
      title,
      company,
      location,
      posted_date: postedDate,
      url,
    });
  }

  return jobs;
}

function parseIndeedJobs(html: string, query: { label: string; keywords: string }): Array<Record<string, unknown>> {
  const jobs: Array<Record<string, unknown>> = [];

  for (const match of html.matchAll(
    /<a[^>]+data-jk="([^"]+)"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:data-testid="company-name"|class="[^"]*companyName[^"]*")[^>]*>([\s\S]*?)<\/span>/gi,
  )) {
    const title = normalizeWhitespace(stripTags(match[3]));
    const company = normalizeWhitespace(stripTags(match[4]));
    const rawHref = decodeXmlEntities(match[2]);
    const url = rawHref.startsWith("http") ? rawHref : `https://www.indeed.com${rawHref}`;

    if (!title || !company || !url) {
      continue;
    }

    if (!matchesBankHiringSignal(title, company, query.keywords)) {
      continue;
    }

    jobs.push({
      source_name: "Indeed Jobs",
      query: query.keywords,
      query_label: query.label,
      hiring_focus: classifyBankHiringFocus(title, query.keywords),
      title,
      company,
      location: "",
      posted_date: "",
      url,
    });
  }

  return jobs;
}

type SearchResultItem = {
  title: string;
  url: string;
  snippet: string;
};

type HiringSearchQuery = {
  label: string;
  keywords: string;
};

function decodeDuckDuckGoUrl(rawUrl: string): string {
  try {
    const decoded = decodeXmlEntities(rawUrl);
    const parsed = new URL(decoded, "https://duckduckgo.com");
    const uddg = parsed.searchParams.get("uddg");
    if (uddg) {
      return decodeURIComponent(uddg);
    }
    return parsed.toString();
  } catch {
    return decodeXmlEntities(rawUrl);
  }
}

function parseDuckDuckGoResults(html: string): SearchResultItem[] {
  const items: SearchResultItem[] = [];
  const seenUrls = new Set<string>();

  for (const match of html.matchAll(
    /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    const url = decodeDuckDuckGoUrl(match[1]);
    const title = normalizeWhitespace(stripTags(match[2]));
    if (!url || !title || seenUrls.has(url)) {
      continue;
    }

    const trailingHtml = html.slice(match.index ?? 0, (match.index ?? 0) + 1200);
    const snippetMatch = trailingHtml.match(
      /<(?:a|div)[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div)>/i,
    );

    items.push({
      title,
      url,
      snippet: snippetMatch ? normalizeWhitespace(stripTags(snippetMatch[1])) : "",
    });
    seenUrls.add(url);
  }

  return items;
}

async function searchDuckDuckGo(query: string, timeoutMs = 7000): Promise<SearchResultItem[]> {
  const url = new URL("https://duckduckgo.com/html/");
  url.searchParams.set("q", query);
  url.searchParams.set("kl", "us-en");

  const response = await fetchWithTimeout(
    url,
    {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": BROWSER_USER_AGENT,
      },
      cache: "no-store",
    },
    timeoutMs,
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();
  return parseDuckDuckGoResults(html);
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function matchesDomain(url: string, domain: string): boolean {
  const host = hostFromUrl(url);
  const normalizedDomain = domain.replace(/^www\./, "");
  if (!host || !normalizedDomain) {
    return false;
  }
  return host === normalizedDomain || host.endsWith(`.${normalizedDomain}`);
}

function listingKeywordsForSource(sourceKey: string): string[] {
  if (BROAD_LISTING_SOURCE_KEYS.has(sourceKey)) {
    return [...LISTING_SIGNAL_KEYWORDS, ...BROAD_LISTING_SIGNAL_KEYWORDS];
  }
  return LISTING_SIGNAL_KEYWORDS;
}

function hasSourceSignalKeyword(sourceKey: string, ...values: Array<string | undefined>): boolean {
  const haystack = values
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .toLowerCase();

  if (!haystack) {
    return false;
  }

  return listingKeywordsForSource(sourceKey).some((keyword) => haystack.includes(keyword));
}

type ListingLocationEvidence = {
  city: string;
  state: string;
  label: string;
  evidence: string;
};

function extractLocationFromText(text: string): ListingLocationEvidence | null {
  const cityStateMatch = text.match(
    /\b([A-Za-z][A-Za-z'.-]+(?:\s+[A-Za-z][A-Za-z'.-]+){0,3}),\s*([A-Z]{2})\b/,
  );
  if (!cityStateMatch) {
    return null;
  }

  const state = cityStateMatch[2].toUpperCase();
  if (!US_STATE_CODES.has(state)) {
    return null;
  }

  const city = normalizeWhitespace(cityStateMatch[1]);
  return {
    city,
    state,
    label: `${city}, ${state}`,
    evidence: "Parsed from listing text",
  };
}

function extractLocationFromUrl(url: string): ListingLocationEvidence | null {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean);

    for (const segment of segments) {
      const candidate = segment.toUpperCase();
      if (candidate.length === 2 && US_STATE_CODES.has(candidate)) {
        return {
          city: "",
          state: candidate,
          label: candidate,
          evidence: "Derived from URL path",
        };
      }
    }
  } catch {
    return null;
  }

  return null;
}

function extractListingLocationEvidence(item: SearchResultItem): ListingLocationEvidence {
  const fromText = extractLocationFromText(`${item.title} ${item.snippet}`);
  if (fromText) {
    return fromText;
  }

  const fromUrl = extractLocationFromUrl(item.url);
  if (fromUrl) {
    return fromUrl;
  }

  return {
    city: "",
    state: "National",
    label: "National",
    evidence: "No city/state in accessible listing metadata",
  };
}

function buildListingSeedUrls(sourceKey: string, domain: string): string[] {
  const seedPaths = FREE_LISTING_SEED_PATHS[sourceKey] ?? ["/"];
  const baseHosts = uniqueStrings([`https://${domain}`, `https://www.${domain}`]);
  const urls: string[] = [];

  for (const host of baseHosts) {
    for (const path of seedPaths) {
      try {
        urls.push(new URL(path, host).toString());
      } catch {
        continue;
      }
    }
  }

  return uniqueStrings(urls);
}

function resolveHref(rawHref: string, baseUrl: string): string {
  if (!rawHref) {
    return "";
  }

  const decoded = decodeXmlEntities(rawHref).trim();
  if (
    !decoded ||
    decoded.startsWith("#") ||
    decoded.startsWith("javascript:") ||
    decoded.startsWith("mailto:")
  ) {
    return "";
  }

  try {
    return new URL(decoded, baseUrl).toString();
  } catch {
    return "";
  }
}

function extractPageTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1] ? normalizeWhitespace(stripTags(match[1])) : "";
}

function parseListingAnchorsFromHtml(
  html: string,
  baseUrl: string,
  domain: string,
  sourceKey: string,
): SearchResultItem[] {
  const items: SearchResultItem[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = resolveHref(match[1] ?? "", baseUrl);
    if (!url || seen.has(url) || !matchesDomain(url, domain)) {
      continue;
    }

    const title = normalizeWhitespace(stripTags(match[2] ?? ""));
    const trailingHtml = html.slice(match.index ?? 0, (match.index ?? 0) + 500);
    const snippet = normalizeWhitespace(stripTags(trailingHtml)).slice(0, 220);

    if (!hasSourceSignalKeyword(sourceKey, title, url, snippet)) {
      continue;
    }

    items.push({
      title: title || url,
      url,
      snippet,
    });
    seen.add(url);

    if (items.length >= 12) {
      break;
    }
  }

  return items;
}

async function collectListingSignalsFromSeedPages(
  sourceKey: string,
  sourceLabel: string,
  domain: string,
): Promise<SearchResultItem[]> {
  const urls = buildListingSeedUrls(sourceKey, domain);
  const items: SearchResultItem[] = [];
  const seen = new Set<string>();

  for (const url of urls) {
    try {
      const response = await fetchWithTimeout(
        url,
        {
          headers: {
            Accept: "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9",
            "User-Agent": BROWSER_USER_AGENT,
          },
          cache: "no-store",
        },
        5000,
      );

      if (!response.ok) {
        continue;
      }

      const html = await response.text();
      const anchors = parseListingAnchorsFromHtml(html, url, domain, sourceKey);
      for (const anchor of anchors) {
        if (seen.has(anchor.url)) {
          continue;
        }
        seen.add(anchor.url);
        items.push(anchor);
      }

      if (anchors.length === 0) {
        const title = extractPageTitle(html) || sourceLabel;
        const pageSnippet = normalizeWhitespace(stripTags(html.slice(0, 12000))).slice(0, 220);
        if (hasSourceSignalKeyword(sourceKey, title, pageSnippet, url) && !seen.has(url)) {
          seen.add(url);
          items.push({
            title,
            url,
            snippet: pageSnippet || `${sourceLabel} listing page`,
          });
        }
      }

      if (items.length >= 10) {
        break;
      }
    } catch {
      continue;
    }
  }

  return items;
}

async function collectListingSignalsFromMirrorPages(
  sourceKey: string,
  sourceLabel: string,
  domain: string,
): Promise<SearchResultItem[]> {
  const urls = buildListingSeedUrls(sourceKey, domain);
  const items: SearchResultItem[] = [];
  const seen = new Set<string>();

  for (const url of urls) {
    let mirrorUrl = "";
    try {
      const parsed = new URL(url);
      mirrorUrl = `https://r.jina.ai/http://${parsed.host}${parsed.pathname}${parsed.search}`;
    } catch {
      continue;
    }

    try {
      const response = await fetchWithTimeout(
        mirrorUrl,
        {
          headers: {
            Accept: "text/plain,text/html",
            "User-Agent": BROWSER_USER_AGENT,
          },
          cache: "no-store",
        },
        5000,
      );

      if (!response.ok) {
        continue;
      }

      const body = normalizeWhitespace(await response.text()).slice(0, 3000);
      const title = sourceLabel;

      if (!hasSourceSignalKeyword(sourceKey, title, body, url) || seen.has(url)) {
        continue;
      }

      seen.add(url);
      items.push({
        title,
        url,
        snippet: body.slice(0, 220),
      });

      if (items.length >= 6) {
        break;
      }
    } catch {
      continue;
    }
  }

  return items;
}

function inferCompanyName(title: string, url: string): string {
  const separators = [" - ", " | ", " @ "];
  for (const separator of separators) {
    const parts = title.split(separator).map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return parts[parts.length - 1];
    }
  }

  const host = hostFromUrl(url);
  if (!host) {
    return "Unknown employer";
  }

  return host
    .split(".")
    .filter(Boolean)
    .slice(0, 2)
    .join(" ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

async function collectWebSearchJobSignals(
  sourceKey: string,
  sourceLabel: string,
  queries: HiringSearchQuery[],
  buildSearchQuery: (query: HiringSearchQuery) => string,
): Promise<SourceResult> {
  const jobs: Array<Record<string, unknown>> = [];
  const seenUrls = new Set<string>();
  const errors: string[] = [];
  const activeQueries = queries.slice(0, 3);
  let successfulQueries = 0;

  for (const query of activeQueries) {
    let searchResults: SearchResultItem[] = [];
    try {
      searchResults = await searchDuckDuckGo(buildSearchQuery(query));
      successfulQueries += 1;
    } catch (error) {
      errors.push(
        `${sourceLabel} query '${query.keywords}' failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
      continue;
    }

    for (const result of searchResults) {
      if (seenUrls.has(result.url)) {
        continue;
      }

      const company = inferCompanyName(result.title, result.url);
      if (
        !matchesBankHiringSignal(result.title, `${company} ${result.snippet}`, query.keywords) &&
        !matchesBroadHiringSignal(result.title, company, result.snippet)
      ) {
        continue;
      }

      seenUrls.add(result.url);
      jobs.push({
        source_name: sourceLabel,
        query: query.keywords,
        query_label: query.label,
        hiring_focus: classifyBankHiringFocus(result.title, query.keywords),
        title: result.title,
        company,
        location: "United States",
        posted_date: "",
        url: result.url,
        snippet: result.snippet,
      });
    }
  }

  const allQueriesFailed = successfulQueries === 0 && errors.length > 0;
  const noSignalReason =
    OPTIONAL_NO_SIGNAL_REASON_BY_SOURCE[sourceKey] ??
    "No matching hiring signals survived title/company filters in this run window.";

  return createResult({
    source: sourceKey,
    data: jobs,
    errors: jobs.length > 0 ? [] : allQueriesFailed ? errors : [],
    success: jobs.length > 0 || !allQueriesFailed,
    no_signal_reason: jobs.length === 0 ? noSignalReason : undefined,
  });
}

function toSlugTitle(slug: string): string {
  return slug
    .split("/")
    .filter(Boolean)
    .pop()
    ?.split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") ?? slug;
}

function matchesIndustrySignalText(...values: Array<string | undefined>): boolean {
  const combined = values
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .toLowerCase();

  return INDUSTRY_SIGNAL_KEYWORDS.some((keyword) => combined.includes(keyword));
}

function extractJsonArrayCandidate(value: string): string {
  const trimmed = value.trim();
  const withoutFences = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const arrayMatch = withoutFences.match(/\[[\s\S]*\]/);

  return arrayMatch?.[0] ?? withoutFences;
}

function normalizeGrokPost(post: Record<string, unknown>, query: string): Record<string, unknown> | null {
  const author = typeof post.author === "string" ? post.author.trim() : "";
  const content = typeof post.content === "string" ? post.content.trim() : "";
  const url = typeof post.url === "string" ? post.url.trim() : "";

  if (!author || !content || !url) {
    return null;
  }

  return {
    author,
    content,
    url,
    query,
    engagement: typeof post.engagement === "string" ? post.engagement : "",
    posted_date: typeof post.posted_date === "string" ? post.posted_date : "",
    takeaway: typeof post.takeaway === "string" ? post.takeaway : "",
  };
}

function parseHomeStepsListings(html: string): Array<Record<string, unknown>> {
  const listings: Array<Record<string, unknown>> = [];

  for (const match of html.matchAll(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi,
  )) {
    const rawJson = match[1].trim();
    if (!rawJson.includes("RealEstateListing")) {
      continue;
    }

    try {
      const parsed = JSON.parse(rawJson) as {
        name?: string;
        url?: string;
        "@type"?: string | string[];
        "@location"?: {
          address?: {
            addressLocality?: string;
            addressRegion?: string;
            postalCode?: string;
            streetAddress?: string;
          };
        };
        offers?: {
          price?: string;
        };
        additionalProperty?: Array<{ name?: string; value?: string }>;
      };

      const types = Array.isArray(parsed["@type"]) ? parsed["@type"] : [parsed["@type"]];
      if (!types.includes("RealEstateListing")) {
        continue;
      }

      listings.push({
        title: parsed.name ?? "",
        url: parsed.url ?? "",
        city: parsed["@location"]?.address?.addressLocality ?? "",
        state: parsed["@location"]?.address?.addressRegion ?? "",
        postal_code: parsed["@location"]?.address?.postalCode ?? "",
        street_address: parsed["@location"]?.address?.streetAddress ?? "",
        price: parsed.offers?.price ?? "",
        status:
          parsed.additionalProperty?.find((item) => item.name === "Status")?.value ?? "",
      });
    } catch {
      continue;
    }
  }

  return listings;
}

async function discoverHomeStepsMarkets(): Promise<string[]> {
  const markets = new Set<string>();

  await Promise.all(
    HOMESTEPS_AUTOCOMPLETE_PREFIXES.map(async (prefix) => {
      try {
        const url = new URL(HOMESTEPS_AUTOCOMPLETE_URL);
        url.searchParams.set("q", prefix);

        const response = await fetchWithTimeout(
          url,
          {
            headers: {
              Accept: "application/json,text/plain,*/*",
              Referer: "https://www.homesteps.com/listing/search",
              "User-Agent": BROWSER_USER_AGENT,
              "X-Requested-With": "XMLHttpRequest",
            },
            cache: "no-store",
          },
          12000,
        );

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as Array<{
          label?: string;
          url?: string;
          value?: string;
        }>;

        for (const item of payload) {
          if (
            typeof item.value === "string" &&
            item.value.trim() &&
            item.url === "" &&
            typeof item.label === "string" &&
            item.label.includes("autocomplete-suggestion-label")
          ) {
            markets.add(item.value.trim());
          }
        }
      } catch {
        return;
      }
    }),
  );

  return [...markets].sort((left, right) => left.localeCompare(right));
}

async function loadHomeStepsMarket(market?: string): Promise<Record<string, unknown> | null> {
  const url = market
    ? `https://www.homesteps.com/listing/search?search=${encodeURIComponent(market)}`
    : "https://www.homesteps.com/listing/search";
  const response = await fetchWithTimeout(
    url,
    {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": BROWSER_USER_AGENT,
      },
      cache: "no-store",
    },
    12000,
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();
  const listings = parseHomeStepsListings(html);
  const countMatch = html.match(/\b([\d,]+)\s+properties\b/i);
  if (listings.length === 0 && !countMatch?.[1]) {
    return null;
  }

  const states = uniqueStrings(
    listings
      .map((item) => (typeof item.state === "string" ? item.state : ""))
      .filter(Boolean),
  );

  return {
    state: states[0] ?? market ?? "National",
    market: market ?? "National",
    url,
    total_listings: countMatch?.[1] ? Number.parseInt(countMatch[1].replaceAll(",", ""), 10) : null,
    states,
    sample_listings: listings.slice(0, 8),
  };
}

async function collectNewsApi(settings: Settings): Promise<SourceResult> {
  if (!settings.newsApiKey) {
    return createResult({
      source: "news_api",
      data: [],
      errors: ["NEWS_API_KEY not configured"],
      success: false,
    });
  }

  const weekAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const seenUrls = new Set<string>();
  const articles: Array<Record<string, unknown>> = [];
  const errors: string[] = [];

  for (const query of NEWS_QUERIES) {
    try {
      const url = new URL("https://newsapi.org/v2/everything");
      url.searchParams.set("q", query);
      url.searchParams.set("from", weekAgo);
      url.searchParams.set("sortBy", "relevancy");
      url.searchParams.set("language", "en");
      url.searchParams.set("pageSize", "25");
      url.searchParams.set("searchIn", "title,description");
      url.searchParams.set("apiKey", settings.newsApiKey);

      const response = await fetchWithTimeout(url, { cache: "no-store" }, 12000);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = (await response.json()) as {
        articles?: Array<{
          title?: string;
          description?: string;
          url?: string;
          content?: string;
          publishedAt?: string;
          source?: { name?: string };
        }>;
      };

      for (const article of payload.articles ?? []) {
        const articleUrl = article.url ?? "";
        if (!articleUrl || seenUrls.has(articleUrl)) {
          continue;
        }

        if (
          !matchesIndustrySignalText(
            article.title,
            article.description,
            article.content,
            article.source?.name,
          )
        ) {
          continue;
        }

        seenUrls.add(articleUrl);

        articles.push({
          query,
          title: article.title ?? "",
          description: article.description ?? "",
          source_name: article.source?.name ?? "",
          url: articleUrl,
          published_at: article.publishedAt ?? "",
          content_preview: (article.content ?? "").slice(0, 500),
        });
      }
    } catch (error) {
      errors.push(
        `News API query '${query}' failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  if (articles.length > 0) {
    return createResult({ source: "news_api", data: articles, errors });
  }

  return createResult({
    source: "news_api",
    data: [],
    errors: errors.length > 0 ? errors : ["News API returned no articles"],
    success: false,
  });
}

async function collectZillowResearch(): Promise<SourceResult> {
  const articles: Array<Record<string, unknown>> = [];
  const errors: string[] = [];
  const seenLinks = new Set<string>();

  for (const feed of ZILLOW_RSS_FEEDS) {
    try {
      const response = await fetchWithTimeout(
        feed.url,
        {
          headers: {
            Accept: "application/rss+xml,application/xml,text/xml",
            "User-Agent": BROWSER_USER_AGENT,
          },
          cache: "no-store",
        },
        12000,
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const xml = await response.text();
      for (const item of parseRssItems(xml)) {
        const url = typeof item.url === "string" ? item.url : "";
        if (!url || seenLinks.has(url)) {
          continue;
        }
        seenLinks.add(url);
        articles.push({
          ...item,
          source_name: "Zillow",
          feed: feed.label,
        });
      }
    } catch (error) {
      errors.push(
        `Zillow RSS '${feed.label}' failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  return createResult({
    source: "zillow_research",
    data: articles.slice(0, 24),
    errors,
    success: articles.length > 0,
  });
}

async function collectZillowRapidApi(settings: Settings): Promise<SourceResult> {
  if (!settings.zillowRapidApiKey) {
    return createResult({
      source: "zillow_rapidapi",
      data: [],
      errors: ["ZILLOW_RAPIDAPI_KEY is missing."],
      success: false,
    });
  }

  if (settings.zillowRapidApiZpids.length === 0) {
    return createResult({
      source: "zillow_rapidapi",
      data: [],
      errors: ["ZILLOW_RAPIDAPI_ZPIDS is empty."],
      success: false,
    });
  }

  const errors: string[] = [];
  const properties: Array<Record<string, unknown>> = [];

  for (const zpid of settings.zillowRapidApiZpids) {
    try {
      const url = new URL(`https://${settings.zillowRapidApiHost}/property`);
      url.searchParams.set("zpid", zpid);

      const response = await fetchWithTimeout(
        url,
        {
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "x-rapidapi-host": settings.zillowRapidApiHost,
            "x-rapidapi-key": settings.zillowRapidApiKey,
          },
          cache: "no-store",
        },
        15000,
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = (await response.json()) as Record<string, unknown>;
      const address = (payload.address ?? {}) as Record<string, unknown>;
      const attributionInfo = (payload.attributionInfo ?? {}) as Record<string, unknown>;
      const rawUrl = firstString(payload.url);

      properties.push({
        zpid,
        source_name: "Zillow RapidAPI",
        title: firstString(address.streetAddress, payload.streetAddress, `Zillow property ${zpid}`),
        address: firstString(address.streetAddress, payload.streetAddress),
        city: firstString(payload.city, address.city),
        state: firstString(payload.state, address.state),
        zipcode: firstString(payload.zipcode, address.zipcode),
        county: firstString(payload.county),
        price: firstNumber(payload.price),
        bedrooms: firstNumber(payload.bedrooms),
        bathrooms: firstNumber(payload.bathrooms),
        living_area: firstNumber(payload.livingArea, payload.livingAreaValue),
        status: firstString(payload.homeStatus, attributionInfo.trueStatus),
        property_type: firstString(payload.homeType, payload.propertyTypeDimension),
        broker_name: firstString(payload.brokerageName, attributionInfo.brokerName),
        agent_name: firstString(attributionInfo.agentName),
        mls_id: firstString(payload.mlsid, attributionInfo.mlsId),
        listing_provider: firstString(payload.listingProvider),
        url: rawUrl
          ? rawUrl.startsWith("http")
            ? rawUrl
            : `https://www.zillow.com${rawUrl}`
          : `https://www.zillow.com/homedetails/${zpid}_zpid/`,
      });
    } catch (error) {
      errors.push(
        `Zillow RapidAPI zpid '${zpid}' failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  return createResult({
    source: "zillow_rapidapi",
    data: properties,
    errors,
    success: properties.length > 0,
  });
}

async function collectHudUser(): Promise<SourceResult> {
  try {
    const response = await fetchWithTimeout(
      "https://www.huduser.gov/rss/pub.xml",
      {
        headers: {
          Accept: "application/rss+xml,application/xml,text/xml",
          "User-Agent": BROWSER_USER_AGENT,
        },
        cache: "no-store",
      },
      12000,
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const xml = await response.text();
    const items = parseRssItems(xml).map((item) => ({
      ...item,
      source_name: "HUD USER",
    }));

    return createResult({
      source: "hud_user",
      data: items.slice(0, 16),
      success: items.length > 0,
    });
  } catch (error) {
    return createResult({
      source: "hud_user",
      data: [],
      errors: [`HUD USER RSS failed: ${error instanceof Error ? error.message : "unknown error"}`],
      success: false,
    });
  }
}

async function collectFhfaNews(): Promise<SourceResult> {
  try {
    const response = await fetchWithTimeout(
      "https://www.fhfa.gov/news/news-release",
      {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": BROWSER_USER_AGENT,
        },
        cache: "no-store",
      },
      12000,
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const items: Array<Record<string, unknown>> = [];

    for (const match of html.matchAll(
      /<time[^>]*>([\s\S]*?)<\/time>[\s\S]*?<a href="(\/news\/news-release\/[^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<div class="news-list__item-content">([\s\S]*?)<\/div>/gi,
    )) {
      items.push({
        title: stripTags(match[3]) || toSlugTitle(match[2]),
        url: `https://www.fhfa.gov${match[2]}`,
        description: stripTags(match[4]).slice(0, 320),
        published_at: stripTags(match[1]),
        source_name: "FHFA",
      });

      if (items.length >= 12) {
        break;
      }
    }

    return createResult({
      source: "fhfa_news",
      data: items,
      success: items.length > 0,
      errors: items.length > 0 ? [] : ["FHFA news page returned no parsable items."],
    });
  } catch (error) {
    return createResult({
      source: "fhfa_news",
      data: [],
      errors: [`FHFA news pull failed: ${error instanceof Error ? error.message : "unknown error"}`],
      success: false,
    });
  }
}

async function collectHomeSteps(settings: Settings): Promise<SourceResult> {
  const results: Array<Record<string, unknown>> = [];
  const errors: string[] = [];
  const markets = await discoverHomeStepsMarkets();

  if (markets.length === 0) {
    try {
      const fallbackRecord = await loadHomeStepsMarket();
      if (fallbackRecord) {
        return createResult({
          source: "homesteps",
          data: [fallbackRecord],
          errors: [],
          success: true,
        });
      }
    } catch (error) {
      errors.push(
        `HomeSteps fallback search failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }

    return createResult({
      source: "homesteps",
      data: [],
      errors:
        errors.length > 0
          ? errors
          : ["HomeSteps market discovery returned no markets or listings."],
      success: false,
    });
  }

  const collectedMarkets = await mapWithConcurrency(
    markets,
    settings.homestepsConcurrency,
    async (market) => {
      try {
        return {
          market,
          record: await loadHomeStepsMarket(market),
          error: null,
        };
      } catch (error) {
        return {
          market,
          record: null,
          error: `HomeSteps search '${market}' failed: ${error instanceof Error ? error.message : "unknown error"}`,
        };
      }
    },
  );

  for (const collected of collectedMarkets) {
    if (collected.error) {
      errors.push(collected.error);
      continue;
    }

    if (collected.record) {
      results.push(collected.record);
    }
  }

  if (results.length === 0) {
    try {
      const fallbackRecord = await loadHomeStepsMarket();
      if (fallbackRecord) {
        results.push(fallbackRecord);
      }
    } catch (error) {
      errors.push(
        `HomeSteps fallback search failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  return createResult({
    source: "homesteps",
    data: results,
    errors,
    success: results.length > 0,
  });
}

async function fetchBankOfAmericaCoverageMap(): Promise<{
  token: string;
  cookies: string;
  stateCities: Record<string, string[]>;
}> {
  const landingPage = await fetchWithTimeout(
    "https://foreclosures.bankofamerica.com/search",
    {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": BROWSER_USER_AGENT,
      },
      cache: "no-store",
    },
    15000,
  );

  if (!landingPage.ok) {
    throw new Error(`HTTP ${landingPage.status}`);
  }

  const landingHtml = await landingPage.text();
  const tokenMatch = landingHtml.match(
    /name="__RequestVerificationToken" type="hidden" value="([^"]+)"/i,
  );
  const token = tokenMatch?.[1] ?? "";
  if (!token) {
    throw new Error("Bank of America search page did not expose an anti-forgery token.");
  }

  const cookies = cookieHeaderFromResponse(landingPage);
  const coverageResponse = await fetchWithTimeout(
    "https://foreclosures.bankofamerica.com/client/statecities",
    {
      method: "POST",
      headers: {
        Accept: "application/json,text/plain,*/*",
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookies,
        Origin: "https://foreclosures.bankofamerica.com",
        Referer: "https://foreclosures.bankofamerica.com/search",
        "User-Agent": BROWSER_USER_AGENT,
      },
      body: new URLSearchParams({
        __RequestVerificationToken: token,
      }).toString(),
      cache: "no-store",
    },
    15000,
  );

  if (!coverageResponse.ok) {
    throw new Error(`HTTP ${coverageResponse.status}`);
  }

  const stateCities = (await coverageResponse.json()) as Record<string, string[]>;
  return {
    token,
    cookies: mergeCookieHeaders(cookies, cookieHeaderFromResponse(coverageResponse)),
    stateCities,
  };
}

async function collectBankOfAmericaReo(): Promise<SourceResult> {
  const errors: string[] = [];

  try {
    const { token, stateCities, cookies: initialCookies } = await fetchBankOfAmericaCoverageMap();
    let sessionCookies = initialCookies;

    const records: Array<Record<string, unknown>> = [];
    const availableStates = Object.entries(stateCities)
      .filter(([, cities]) => Array.isArray(cities) && cities.length > 0)
      .sort(([left], [right]) => left.localeCompare(right));

    for (const [state, cities] of availableStates) {
      const stateSlug = slugifyPathSegment(state);
      const sampleListings: Array<Record<string, unknown>> = [];
      let listingSignalCount = 0;

      for (const city of cities) {
        const marketUrl = `https://foreclosures.bankofamerica.com/${stateSlug}/${slugifyPathSegment(city)}`;

        try {
          const response = await fetchWithTimeout(
            "https://foreclosures.bankofamerica.com/client/addresses",
            {
              method: "POST",
              headers: {
                Accept: "application/json,text/plain,*/*",
                "Content-Type": "application/x-www-form-urlencoded",
                Cookie: sessionCookies,
                Origin: "https://foreclosures.bankofamerica.com",
                Referer: marketUrl,
                "User-Agent": BROWSER_USER_AGENT,
              },
              body: new URLSearchParams({
                __RequestVerificationToken: token,
                prefix: city,
              }).toString(),
              cache: "no-store",
            },
            15000,
          );

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          sessionCookies = mergeCookieHeaders(
            sessionCookies,
            cookieHeaderFromResponse(response),
          );

          const suggestions = (await response.json()) as Array<{
            id?: string;
            name?: string;
          }>;

          const propertySignals = suggestions.filter(
            (item) => typeof item.name === "string" && /\d/.test(item.name),
          );
          listingSignalCount += propertySignals.length;

          for (const signal of propertySignals.slice(0, 3)) {
            sampleListings.push({
              title: signal.name ?? `${city}, ${state}`,
              address: signal.name ?? "",
              city,
              state,
              url: marketUrl,
              market_slug: signal.id ?? `${slugifyPathSegment(city)}|${stateSlug}`,
            });
          }
        } catch (error) {
          errors.push(
            `Bank of America market '${city}, ${state}' failed: ${error instanceof Error ? error.message : "unknown error"}`,
          );
        }
      }

      records.push({
        state,
        source_name: "Bank of America",
        search_url: `https://foreclosures.bankofamerica.com/${stateSlug}`,
        city_count: cities.length,
        cities,
        listing_signal_count: listingSignalCount,
        sample_listings: sampleListings.slice(0, 8),
      });
    }

    return createResult({
      source: "bank_of_america_reo",
      data: records,
      errors,
      success: records.length > 0,
    });
  } catch (error) {
    return createResult({
      source: "bank_of_america_reo",
      data: [],
      errors: [
        `Bank of America REO collection failed: ${error instanceof Error ? error.message : "unknown error"}`,
      ],
      success: false,
    });
  }
}

async function fetchHudSearchSession(): Promise<{
  token: string;
  cookies: string;
}> {
  const response = await fetchWithTimeout(
    "https://www.hudhomestore.gov/searchresult",
    {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": BROWSER_USER_AGENT,
      },
      cache: "no-store",
    },
    15000,
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();
  const tokenMatch = html.match(
    /id="request-verification-token" name="request-verification-token" value="([^"]+)"/i,
  );
  const token = tokenMatch?.[1] ?? "";

  if (!token) {
    throw new Error("HUD Home Store search page did not expose an anti-forgery token.");
  }

  return {
    token,
    cookies: cookieHeaderFromResponse(response),
  };
}

async function discoverHudStateAbbreviations(
  token: string,
  cookies: string,
): Promise<string[]> {
  const stateCodes = new Set<string>();

  await Promise.all(
    HUD_AUTOCOMPLETE_PREFIXES.map(async (prefix) => {
      try {
        const response = await fetchWithTimeout(
          "https://www.hudhomestore.gov/searchresult?handler=GetAutoResponse",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Cookie: cookies,
              Origin: "https://www.hudhomestore.gov",
              Referer: "https://www.hudhomestore.gov/searchresult",
              RequestVerificationToken: token,
              "User-Agent": BROWSER_USER_AGENT,
            },
            body: new URLSearchParams({
              data: prefix,
              propertyState: "",
            }).toString(),
            cache: "no-store",
          },
          15000,
        );

        if (!response.ok) {
          return;
        }

        const payload = await response.text();
        for (const tokenValue of payload.split(";")) {
          const trimmed = tokenValue.trim();
          if (/^[A-Z]{2}$/.test(trimmed)) {
            stateCodes.add(trimmed);
          }
        }
      } catch {
        return;
      }
    }),
  );

  return [...stateCodes].sort();
}

async function collectHudHomeStore(): Promise<SourceResult> {
  const errors: string[] = [];

  try {
    const { token, cookies } = await fetchHudSearchSession();
    const stateCodes = await discoverHudStateAbbreviations(token, cookies);
    const records: Array<Record<string, unknown>> = [];

    for (const stateCode of stateCodes) {
      try {
        const searchUrl = `https://www.hudhomestore.gov/searchresult?citystate=${encodeURIComponent(stateCode)}`;
        const response = await fetchWithTimeout(
          searchUrl,
          {
            headers: {
              Accept: "text/html,application/xhtml+xml",
              Cookie: cookies,
              "User-Agent": BROWSER_USER_AGENT,
            },
            cache: "no-store",
          },
          15000,
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();
        const rawListings = parseHiddenInputValue(html, "available_prop");
        if (!rawListings || rawListings === "null") {
          continue;
        }

        const listings = JSON.parse(rawListings) as Array<{
          propertyAddress?: string;
          propertyCaseNumber?: string;
          propertyCity?: string;
          propertyCityStateZip?: string;
          propertyCounty?: string;
          propertyState?: string;
          propertyStatus?: string;
          propertyStatusDesc?: string;
          bidOpenDate?: string;
          listPrice?: string;
          listingPeriod?: string;
        }>;

        if (!Array.isArray(listings) || listings.length === 0) {
          continue;
        }

        const sampleListings = listings.slice(0, 8).map((item) => ({
          title: item.propertyAddress ?? item.propertyCityStateZip ?? "HUD listing",
          url: item.propertyCaseNumber
            ? `https://www.hudhomestore.gov/propertydetails?caseNumber=${encodeURIComponent(item.propertyCaseNumber)}`
            : searchUrl,
          case_number: item.propertyCaseNumber ?? "",
          city: item.propertyCity ?? "",
          state: item.propertyState ?? stateCode,
          county: item.propertyCounty ?? "",
          price: item.listPrice ?? "",
          status: item.propertyStatusDesc || item.propertyStatus || "",
          bid_open_date: item.bidOpenDate ?? "",
          listing_period: item.listingPeriod ?? "",
        }));

        records.push({
          state: listings[0]?.propertyState ?? stateCode,
          source_name: "HUD Home Store",
          search_url: searchUrl,
          total_listings: listings.length,
          cities: uniqueStrings(
            listings
              .map((item) => (typeof item.propertyCity === "string" ? item.propertyCity : ""))
              .filter(Boolean),
          ),
          sample_listings: sampleListings,
        });
      } catch (error) {
        errors.push(
          `HUD Home Store state '${stateCode}' failed: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }
    }

    return createResult({
      source: "hud_homestore",
      data: records,
      errors,
      success: records.length > 0,
    });
  } catch (error) {
    return createResult({
      source: "hud_homestore",
      data: [],
      errors: [
        `HUD Home Store collection failed: ${error instanceof Error ? error.message : "unknown error"}`,
      ],
      success: false,
    });
  }
}

async function collectHomePath(settings: Settings): Promise<SourceResult> {
  if (!settings.homepathEnabled) {
    return createResult({
      source: "homepath",
      data: [],
      errors: [
        "HomePath collection is on hold. Set HOMEPATH_ENABLED=true and provide HOMEPATH_COOKIE if you have an allowed session.",
      ],
      success: false,
    });
  }

  try {
    const response = await fetchWithTimeout(
      "https://homepath.fanniemae.com/property-finder",
      {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          Cookie: settings.homepathCookie,
          "User-Agent": BROWSER_USER_AGENT,
        },
        cache: "no-store",
      },
      15000,
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const links = uniqueStrings(
      [...html.matchAll(/href="([^"]*property[^"]*)"/gi)]
        .map((match) => match[1])
        .filter(Boolean)
        .map((href) =>
          href.startsWith("http") ? href : `https://homepath.fanniemae.com${href}`,
        ),
    );

    const data = links.slice(0, 8).map((url) => ({
      title: url.split("/").filter(Boolean).pop()?.replaceAll("-", " ") ?? "HomePath listing",
      url,
      source_name: "HomePath",
    }));

    return createResult({
      source: "homepath",
      data,
      errors: data.length > 0 ? [] : ["HomePath page loaded but no parsable property links were found."],
      success: data.length > 0,
    });
  } catch (error) {
    return createResult({
      source: "homepath",
      data: [],
      errors: [
        `HomePath collection failed: ${error instanceof Error ? error.message : "unknown error"}. ` +
          "The HomePath site is currently blocking this runtime. Enable the lane only if you have an allowed session.",
      ],
      success: false,
    });
  }
}

async function collectLinkedInJobs(): Promise<SourceResult> {
  const jobs: Array<Record<string, unknown>> = [];
  const errors: string[] = [];
  const seenUrls = new Set<string>();

  for (const query of BANK_HIRING_LINKEDIN_SEARCHES) {
    for (const start of [0, 25]) {
      try {
        const url = new URL(
          "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search",
        );
        url.searchParams.set("keywords", query.keywords);
        url.searchParams.set("location", "United States");
        url.searchParams.set("f_TPR", "r2592000");
        url.searchParams.set("start", String(start));

        const response = await fetchWithTimeout(
          url,
          {
            headers: {
              Accept: "text/html,application/xhtml+xml",
              "User-Agent": BROWSER_USER_AGENT,
            },
            cache: "no-store",
          },
          15000,
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();
        const parsedJobs = parseLinkedInGuestJobs(html, query);

        for (const job of parsedJobs) {
          const jobUrl = typeof job.url === "string" ? job.url : "";
          if (!jobUrl || seenUrls.has(jobUrl)) {
            continue;
          }

          seenUrls.add(jobUrl);
          jobs.push(job);
        }

        if (parsedJobs.length === 0) {
          break;
        }
      } catch (error) {
        errors.push(
          `LinkedIn job search '${query.keywords}' failed: ${error instanceof Error ? error.message : "unknown error"}`,
        );
        break;
      }
    }
  }

  return createResult({
    source: "linkedin_jobs",
    data: jobs,
    errors,
    success: jobs.length > 0,
  });
}

async function collectIndeedJobs(): Promise<SourceResult> {
  const settings = getSettings();
  if (!settings.indeedJobsEnabled) {
    return createResult({
      source: "indeed_jobs",
      data: [],
      errors: [
        "Indeed job collection is on hold. Set INDEED_JOBS_ENABLED=true only when you have a stable access path.",
      ],
      success: false,
    });
  }

  const jobs: Array<Record<string, unknown>> = [];
  const errors: string[] = [];
  const seenUrls = new Set<string>();

  for (const query of BANK_HIRING_INDEED_SEARCHES) {
    try {
      const url = new URL("https://www.indeed.com/jobs");
      url.searchParams.set("q", query.keywords);
      url.searchParams.set("l", "United States");
      url.searchParams.set("fromage", "30");

      const response = await fetchWithTimeout(
        url,
        {
          headers: {
            Accept: "text/html,application/xhtml+xml",
            "User-Agent": BROWSER_USER_AGENT,
          },
          cache: "no-store",
        },
        15000,
      );

      const html = await response.text();
      const lowerHtml = html.toLowerCase();

      if (!response.ok || lowerHtml.includes("security check")) {
        throw new Error(
          `HTTP ${response.status}${lowerHtml.includes("security check") ? " security check" : ""}`,
        );
      }

      const parsedJobs = parseIndeedJobs(html, query);
      for (const job of parsedJobs) {
        const jobUrl = typeof job.url === "string" ? job.url : "";
        if (!jobUrl || seenUrls.has(jobUrl)) {
          continue;
        }

        seenUrls.add(jobUrl);
        jobs.push(job);
      }
    } catch (error) {
      errors.push(
        `Indeed job search '${query.keywords}' failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  return createResult({
    source: "indeed_jobs",
    data: jobs,
    errors,
    success: jobs.length > 0,
  });
}

async function collectGoogleJobsSignals(): Promise<SourceResult> {
  return collectWebSearchJobSignals(
    "google_jobs",
    "Google Jobs",
    BANK_HIRING_GOOGLE_SEARCHES,
    (query) =>
      `"${query.keywords}" jobs "United States" ("reo" OR "foreclosure" OR "default servicing" OR "loss mitigation")`,
  );
}

async function collectZipRecruiterJobs(): Promise<SourceResult> {
  return collectWebSearchJobSignals(
    "ziprecruiter_jobs",
    "ZipRecruiter",
    BANK_HIRING_ZIPRECRUITER_SEARCHES,
    (query) =>
      `site:ziprecruiter.com/jobs "${query.keywords}" ("reo" OR "foreclosure" OR "default servicing" OR "loss mitigation")`,
  );
}

async function collectCompanyCareerJobs(): Promise<SourceResult> {
  const jobs: Array<Record<string, unknown>> = [];
  const seenUrls = new Set<string>();
  const errors: string[] = [];
  let successfulSearches = 0;

  for (const company of BANK_HIRING_COMPANY_CAREER_SITES) {
    if (jobs.length >= 20) {
      break;
    }

    try {
      const searchResults = await searchDuckDuckGo(
        `site:${company.domain} jobs ("${BANK_HIRING_COMPANY_SEARCH_TERMS.join("\" OR \"")}")`,
      );
      successfulSearches += 1;

      for (const result of searchResults) {
        if (seenUrls.has(result.url)) {
          continue;
        }

        if (
          !matchesBankHiringSignal(result.title, `${company.company} ${result.snippet}`, "REO") &&
          !matchesBroadHiringSignal(result.title, company.company, result.snippet)
        ) {
          continue;
        }

        seenUrls.add(result.url);
        jobs.push({
          source_name: "Company Career Pages",
          query: company.domain,
          query_label: company.company,
          hiring_focus: classifyBankHiringFocus(result.title, result.snippet),
          title: result.title,
          company: company.company,
          location: "United States",
          posted_date: "",
          url: result.url,
          snippet: result.snippet,
        });
      }
    } catch (error) {
      errors.push(
        `${company.company} career search failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
      continue;
    }
  }

  const allSearchesFailed = successfulSearches === 0 && errors.length > 0;

  return createResult({
    source: "company_career_jobs",
    data: jobs,
    errors: jobs.length > 0 ? [] : allSearchesFailed ? errors : [],
    success: jobs.length > 0 || !allSearchesFailed,
    no_signal_reason:
      jobs.length === 0 ? OPTIONAL_NO_SIGNAL_REASON_BY_SOURCE.company_career_jobs : undefined,
  });
}

async function collectUsaJobsSignals(): Promise<SourceResult> {
  const jobs: Array<Record<string, unknown>> = [];
  const seenUrls = new Set<string>();

  for (const keyword of BANK_HIRING_USAJOBS_DIRECT_KEYWORDS) {
    if (jobs.length >= 25) {
      break;
    }

    try {
      const response = await fetchWithTimeout(
        "https://www.usajobs.gov/Search/ExecuteSearch",
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json; charset=utf-8",
            "User-Agent": BROWSER_USER_AGENT,
            Referer: "https://www.usajobs.gov/Search/Results",
          },
          body: JSON.stringify({
            Keyword: keyword,
            Page: "1",
          }),
          cache: "no-store",
        },
        8000,
      );

      if (!response.ok) {
        continue;
      }

      const payload = (await response.json()) as {
        Jobs?: Array<{
          Title?: unknown;
          Agency?: unknown;
          Department?: unknown;
          PositionURI?: unknown;
          LocationName?: unknown;
          DateDisplay?: unknown;
        }>;
      };

      for (const rawJob of payload.Jobs ?? []) {
        const title = firstString(rawJob.Title);
        const company = firstString(rawJob.Agency, rawJob.Department, "USAJobs");
        const url = firstString(rawJob.PositionURI);
        const location = firstString(rawJob.LocationName, "United States");
        const postedDate = firstString(rawJob.DateDisplay);

        if (!title || !url || seenUrls.has(url)) {
          continue;
        }

        if (!matchesBankHiringSignal(title, company, keyword) && !matchesBroadHiringSignal(title, company)) {
          continue;
        }

        seenUrls.add(url);
        jobs.push({
          source_name: "USAJobs",
          query: keyword,
          query_label: "Government hiring",
          hiring_focus: classifyBankHiringFocus(title, keyword),
          title,
          company,
          location,
          posted_date: postedDate,
          url,
          snippet: `${company} - ${location}`,
        });
      }
    } catch {
      continue;
    }
  }

  if (jobs.length > 0) {
    return createResult({
      source: "usajobs_jobs",
      data: jobs,
      errors: [],
      success: true,
    });
  }

  return collectWebSearchJobSignals(
    "usajobs_jobs",
    "USAJobs",
    BANK_HIRING_USAJOBS_SEARCHES,
    (query) =>
      `site:usajobs.gov "${query.keywords}" ("mortgage" OR "housing" OR "hud" OR "foreclosure")`,
  );
}

async function collectGreenhouseJobsSignals(): Promise<SourceResult> {
  const jobs: Array<Record<string, unknown>> = [];
  const seenUrls = new Set<string>();

  for (const board of GREENHOUSE_BOARD_TOKENS) {
    if (jobs.length >= 25) {
      break;
    }

    try {
      const response = await fetchWithTimeout(
        `https://boards.greenhouse.io/embed/job_board?for=${encodeURIComponent(board.token)}`,
        {
          headers: {
            Accept: "text/html,application/xhtml+xml",
            "User-Agent": BROWSER_USER_AGENT,
          },
          cache: "no-store",
        },
        8000,
      );

      if (!response.ok) {
        continue;
      }

      const html = await response.text();
      const parsedJobs = parseGreenhouseBoardJobs(html);
      for (const parsedJob of parsedJobs) {
        if (!parsedJob.url || seenUrls.has(parsedJob.url)) {
          continue;
        }

        if (
          !matchesBankHiringSignal(parsedJob.title, board.company, "REO") &&
          !matchesBroadHiringSignal(parsedJob.title, board.company, parsedJob.location)
        ) {
          continue;
        }

        seenUrls.add(parsedJob.url);
        jobs.push({
          source_name: "Greenhouse Boards",
          query: board.token,
          query_label: board.company,
          hiring_focus: classifyBankHiringFocus(parsedJob.title, "mortgage servicing"),
          title: parsedJob.title,
          company: board.company,
          location: parsedJob.location || "United States",
          posted_date: "",
          url: parsedJob.url,
          snippet: `${board.company} - ${parsedJob.location}`,
        });
      }
    } catch {
      continue;
    }
  }

  if (jobs.length > 0) {
    return createResult({
      source: "greenhouse_jobs",
      data: jobs,
      errors: [],
      success: true,
    });
  }

  return collectWebSearchJobSignals(
    "greenhouse_jobs",
    "Greenhouse Boards",
    BANK_HIRING_GREENHOUSE_SEARCHES,
    (query) =>
      `site:boards.greenhouse.io ("${query.keywords}" OR "default servicing" OR "loss mitigation" OR "foreclosure") ("mortgage" OR "bank" OR "servicing")`,
  );
}

async function collectLeverJobsSignals(): Promise<SourceResult> {
  const jobs: Array<Record<string, unknown>> = [];
  const seenUrls = new Set<string>();

  for (const board of LEVER_BOARD_TOKENS) {
    if (jobs.length >= 25) {
      break;
    }

    try {
      const response = await fetchWithTimeout(
        `https://jobs.lever.co/${encodeURIComponent(board.token)}`,
        {
          headers: {
            Accept: "text/html,application/xhtml+xml",
            "User-Agent": BROWSER_USER_AGENT,
          },
          cache: "no-store",
        },
        8000,
      );

      if (!response.ok) {
        continue;
      }

      const html = await response.text();
      const parsedJobs = parseLeverBoardJobs(html);
      for (const parsedJob of parsedJobs) {
        if (!parsedJob.url || seenUrls.has(parsedJob.url)) {
          continue;
        }

        if (
          !matchesBankHiringSignal(parsedJob.title, board.company, "REO") &&
          !matchesBroadHiringSignal(parsedJob.title, board.company, parsedJob.location)
        ) {
          continue;
        }

        seenUrls.add(parsedJob.url);
        jobs.push({
          source_name: "Lever Boards",
          query: board.token,
          query_label: board.company,
          hiring_focus: classifyBankHiringFocus(parsedJob.title, "mortgage servicing"),
          title: parsedJob.title,
          company: board.company,
          location: parsedJob.location || "United States",
          posted_date: "",
          url: parsedJob.url,
          snippet: `${board.company} - ${parsedJob.location}`,
        });
      }
    } catch {
      continue;
    }
  }

  if (jobs.length > 0) {
    return createResult({
      source: "lever_jobs",
      data: jobs,
      errors: [],
      success: true,
    });
  }

  return collectWebSearchJobSignals(
    "lever_jobs",
    "Lever Boards",
    BANK_HIRING_LEVER_SEARCHES,
    (query) =>
      `site:jobs.lever.co ("${query.keywords}" OR "default servicing" OR "loss mitigation" OR "foreclosure") ("mortgage" OR "bank" OR "servicing")`,
  );
}

async function collectListingSignalsByDomain(
  sourceKey: string,
  sourceLabel: string,
  domain: string,
): Promise<SourceResult> {
  try {
    const query = `site:${domain} ("foreclosure" OR "REO" OR "bank owned" OR "auction")`;
    let searchResults: SearchResultItem[] = [];
    let searchFailureReason = "";

    try {
      searchResults = await searchDuckDuckGo(query, 6000);
    } catch (error) {
      searchFailureReason = error instanceof Error ? error.message : "search request failed";
      searchResults = [];
    }

    let listingSignals = searchResults.filter(
      (result) =>
        matchesDomain(result.url, domain) &&
        hasSourceSignalKeyword(sourceKey, result.title, result.snippet, result.url),
    );

    if (listingSignals.length === 0) {
      listingSignals = await collectListingSignalsFromSeedPages(sourceKey, sourceLabel, domain);
    }

    if (listingSignals.length === 0) {
      listingSignals = await collectListingSignalsFromMirrorPages(sourceKey, sourceLabel, domain);
    }

    const locationCounts = new Map<string, number>();
    const sampleListings = listingSignals.slice(0, 8).map((item) => {
      const location = extractListingLocationEvidence(item);
      locationCounts.set(location.label, (locationCounts.get(location.label) ?? 0) + 1);
      return {
        title: item.title,
        url: item.url,
        address: item.snippet,
        city: location.city,
        state: location.state,
        location_evidence: location.evidence,
      };
    });
    const topLocations = [...locationCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([location, count]) => ({ location, count }));

    const rows = listingSignals.length > 0
      ? [
          {
            state: "National",
            source_name: sourceLabel,
            search_url: `https://duckduckgo.com/?q=${encodeURIComponent(
              `site:${domain} foreclosure REO bank owned auction`,
            )}`,
            listing_signal_count: listingSignals.length,
            city_count: topLocations.length,
            top_locations: topLocations,
            location_evidence_summary:
              topLocations.length > 0
                ? `Top locations from listing evidence: ${topLocations
                  .map((entry) => `${entry.location} (${entry.count})`)
                  .join(", ")}`
                : "No city/state evidence found in accessible listing snippets.",
            sample_listings: sampleListings,
          },
        ]
      : [];

    const noSignalReason = searchFailureReason
      ? `Search unavailable (${searchFailureReason}) and no listing evidence was discoverable from seed pages.`
      : `No indexable listing signals were found for ${domain}. The site may have anti-bot controls or no currently indexable REO pages.`;
    const hasHardFailure = Boolean(searchFailureReason);

    return createResult({
      source: sourceKey,
      data: rows,
      errors: rows.length > 0 ? [] : hasHardFailure ? [noSignalReason] : [],
      success: rows.length > 0 || !hasHardFailure,
      no_signal_reason: rows.length === 0 ? noSignalReason : undefined,
    });
  } catch (error) {
    return createResult({
      source: sourceKey,
      data: [],
      errors: [
        `Listing signal collection for ${sourceLabel} failed: ${error instanceof Error ? error.message : "unknown error"}`,
      ],
      success: false,
      no_signal_reason:
        `Listing signal collection for ${sourceLabel} returned no usable rows in this run.`,
    });
  }
}

async function collectGrok(settings: Settings): Promise<SourceResult> {
  if (!settings.grokApiKey) {
    return createResult({
      source: "grok",
      data: [],
      errors: ["GROK_API_KEY not configured"],
      success: false,
    });
  }

  const allPosts: Array<Record<string, unknown>> = [];
  const errors: string[] = [];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  for (const query of GROK_QUERIES) {
    try {
      const response = await fetchWithTimeout(
        "https://api.x.ai/v1/responses",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${settings.grokApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "grok-4.20-beta-latest-non-reasoning",
            temperature: 0.2,
            max_output_tokens: 1400,
            input: [
              {
                role: "system",
                content:
                  "You are a research assistant for an REO newsletter. Use X search if available. Find the most relevant recent X posts about the requested topic from the past 7 days. Return only a JSON array. Each item must contain: author, content, engagement, posted_date, url, takeaway.",
              },
              {
                role: "user",
                content: `Topic: ${query}\nDate window: ${weekAgo} to ${today}\nReturn at most 6 posts. If you cannot find enough recent posts, return an empty JSON array.`,
              },
            ],
            tools: [{ type: "x_search" }],
          }),
        },
        25000,
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const payload = (await response.json()) as Record<string, unknown>;
      const content = extractResponseText(payload) || "[]";
      const normalizedContent = extractJsonArrayCandidate(content);

      try {
        const parsed = JSON.parse(normalizedContent) as Array<Record<string, unknown>>;
        if (Array.isArray(parsed)) {
          let accepted = 0;

          for (const post of parsed) {
            const normalized = normalizeGrokPost(post, query);
            if (!normalized) {
              continue;
            }

            allPosts.push(normalized);
            accepted += 1;
          }

          if (accepted === 0) {
            errors.push(`Grok query '${query}' returned no structured posts.`);
          }
        }
      } catch {
        errors.push(`Grok query '${query}' returned unstructured output.`);
      }
    } catch (error) {
      errors.push(
        `Grok query '${query}' failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  return createResult({
    source: "grok",
    data: allPosts,
    errors: allPosts.length > 0 ? [] : errors,
    success: allPosts.length > 0,
  });
}

function matchesRedditKeywords(title: string, text: string): boolean {
  const combined = `${title} ${text}`.toLowerCase();
  return REDDIT_KEYWORDS.some((keyword) => combined.includes(keyword));
}

/** Obtain a Reddit application-only OAuth2 bearer token. */
async function getRedditBearerToken(clientId: string, clientSecret: string, userAgent: string): Promise<string> {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetchWithTimeout("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "User-Agent": userAgent,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  }, 10000);

  if (!response.ok) {
    throw new Error(`Reddit OAuth token request failed: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as { access_token?: string; error?: string };
  if (payload.error || !payload.access_token) {
    throw new Error(`Reddit OAuth error: ${payload.error ?? "no access_token returned"}`);
  }
  return payload.access_token;
}

type RedditPost = {
  title?: string;
  selftext?: string;
  score?: number;
  num_comments?: number;
  author?: string;
  permalink?: string;
  created_utc?: number;
  subreddit?: string;
};

async function collectReddit(settings: Settings): Promise<SourceResult> {
  if (!settings.redditClientId || !settings.redditClientSecret) {
    return createResult({
      source: "reddit",
      data: [],
      errors: ["REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET are required. Register a script app at https://www.reddit.com/prefs/apps"],
      success: false,
    });
  }

  const userAgent = settings.redditUserAgent || "ufs-newsletter/1.0 (by /u/ufs_newsletter)";
  let bearerToken: string;

  try {
    bearerToken = await getRedditBearerToken(settings.redditClientId, settings.redditClientSecret, userAgent);
  } catch (error) {
    return createResult({
      source: "reddit",
      data: [],
      errors: [`Reddit OAuth failed: ${error instanceof Error ? error.message : "unknown error"}`],
      success: false,
    });
  }

  const oauthHeaders = {
    Authorization: `Bearer ${bearerToken}`,
    "User-Agent": userAgent,
    Accept: "application/json",
  };

  const errors: string[] = [];
  const posts: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();

  function processRedditChildren(children: Array<{ data?: RedditPost }>, mode: string) {
    for (const child of children) {
      const post = child.data ?? {};
      const title = post.title ?? "";
      const text = post.selftext ?? "";
      const permalink = post.permalink ?? "";
      const articleUrl = permalink ? `https://reddit.com${permalink}` : "";
      if (!articleUrl || seen.has(articleUrl) || !matchesRedditKeywords(title, text)) continue;
      seen.add(articleUrl);
      posts.push({
        subreddit: post.subreddit ?? "unknown",
        title,
        text: text.slice(0, 1000),
        score: post.score ?? 0,
        num_comments: post.num_comments ?? 0,
        author: post.author ?? "[deleted]",
        url: articleUrl,
        created_utc: post.created_utc ?? 0,
        retrieval_mode: mode,
      });
    }
  }

  // Fetch top posts from each subreddit via OAuth API
  for (const subreddit of SUBREDDITS) {
    try {
      const url = new URL(`https://oauth.reddit.com/r/${subreddit}/top`);
      url.searchParams.set("t", "week");
      url.searchParams.set("limit", "25");
      url.searchParams.set("raw_json", "1");

      const response = await fetchWithTimeout(url, { headers: oauthHeaders, cache: "no-store" }, 12000);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const payload = (await response.json()) as { data?: { children?: Array<{ data?: RedditPost }> } };
      processRedditChildren(payload.data?.children ?? [], "oauth_subreddit");
    } catch (error) {
      errors.push(`r/${subreddit}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  // If subreddits returned nothing, try OAuth search
  if (posts.length === 0) {
    for (const query of REDDIT_SEARCH_QUERIES) {
      try {
        const url = new URL("https://oauth.reddit.com/search");
        url.searchParams.set("q", query);
        url.searchParams.set("sort", "top");
        url.searchParams.set("t", "week");
        url.searchParams.set("limit", "25");
        url.searchParams.set("raw_json", "1");

        const response = await fetchWithTimeout(url, { headers: oauthHeaders, cache: "no-store" }, 12000);
        if (!response.ok) continue;

        const payload = (await response.json()) as { data?: { children?: Array<{ data?: RedditPost }> } };
        processRedditChildren(payload.data?.children ?? [], "oauth_search");
      } catch {
        continue;
      }
    }
  }

  return createResult({
    source: "reddit",
    data: posts,
    errors: posts.length > 0 ? [] : errors,
    success: posts.length > 0,
  });
}

export async function collectAllSources(): Promise<{
  rawData: Record<string, SourceResult>;
  sourcesUsed: string[];
  sourcesWarning: string[];
  sourcesFailed: string[];
}> {
  const settings = getSettings();
  const sourceDefinitions: Array<{
    key: string;
    optional?: boolean;
    runner: () => Promise<SourceResult>;
  }> = [
    { key: "zillow_research", runner: () => collectZillowResearch() },
    { key: "zillow_rapidapi", optional: true, runner: () => collectZillowRapidApi(settings) },
    { key: "hud_user", runner: () => collectHudUser() },
    { key: "fhfa_news", runner: () => collectFhfaNews() },
    { key: "hud_homestore", runner: () => collectHudHomeStore() },
    { key: "bank_of_america_reo", runner: () => collectBankOfAmericaReo() },
    { key: "homesteps", runner: () => collectHomeSteps(settings) },
    { key: "linkedin_jobs", runner: () => collectLinkedInJobs() },
    { key: "grok", runner: () => collectGrok(settings) },
    { key: "reddit", optional: true, runner: () => collectReddit(settings) },
    { key: "news_api", runner: () => collectNewsApi(settings) },
  ];

  if (settings.homepathEnabled) {
    sourceDefinitions.splice(
      5,
      0,
      { key: "homepath", optional: true, runner: () => collectHomePath(settings) },
    );
  }

  if (settings.freeJobsSourcesEnabled) {
    const grokIndex = sourceDefinitions.findIndex((definition) => definition.key === "grok");
    sourceDefinitions.splice(
      grokIndex >= 0 ? grokIndex : sourceDefinitions.length,
      0,
      { key: "google_jobs", optional: true, runner: () => collectGoogleJobsSignals() },
      { key: "ziprecruiter_jobs", optional: true, runner: () => collectZipRecruiterJobs() },
      { key: "company_career_jobs", optional: true, runner: () => collectCompanyCareerJobs() },
      { key: "usajobs_jobs", optional: true, runner: () => collectUsaJobsSignals() },
      { key: "greenhouse_jobs", optional: true, runner: () => collectGreenhouseJobsSignals() },
      { key: "lever_jobs", optional: true, runner: () => collectLeverJobsSignals() },
    );
  }

  if (settings.indeedJobsEnabled) {
    const linkedInIndex = sourceDefinitions.findIndex((definition) => definition.key === "linkedin_jobs");
    sourceDefinitions.splice(
      linkedInIndex >= 0 ? linkedInIndex + 1 : sourceDefinitions.length,
      0,
      { key: "indeed_jobs", optional: true, runner: () => collectIndeedJobs() },
    );
  }

  if (settings.freeListingSignalsEnabled) {
    const listingDefinitions = FREE_LISTING_SIGNAL_SOURCES.map((item) => ({
      key: item.key,
      optional: true,
      runner: () => collectListingSignalsByDomain(item.key, item.label, item.domain),
    }));

    const linkedInIndex = sourceDefinitions.findIndex((definition) => definition.key === "linkedin_jobs");
    sourceDefinitions.splice(
      linkedInIndex >= 0 ? linkedInIndex : sourceDefinitions.length,
      0,
      ...listingDefinitions,
    );
  }

  const sources = await Promise.all(
    sourceDefinitions.map((definition) =>
      runLoggedSourceCollection(definition.key, definition.runner, {
        optional: definition.optional,
      }),
    ),
  );

  const rawData: Record<string, SourceResult> = {};
  const sourcesUsed: string[] = [];
  const sourcesWarning: string[] = [];
  const sourcesFailed: string[] = [];

  for (const [index, result] of sources.entries()) {
    const definition = sourceDefinitions[index];
    const optional = Boolean(definition.optional);
    const isNoSignalResult = result.success && result.data.length === 0;
    const annotatedResult: SourceResult = {
      ...result,
      optional,
      no_signal_reason:
        isNoSignalResult
          ? result.no_signal_reason ?? inferNoSignalReason(result.source, optional)
          : result.no_signal_reason,
    };

    rawData[annotatedResult.source] = annotatedResult;

    if (annotatedResult.success && annotatedResult.errors.length === 0 && annotatedResult.data.length > 0) {
      sourcesUsed.push(annotatedResult.source);
    } else if (annotatedResult.success || optional) {
      sourcesWarning.push(annotatedResult.source);
    } else {
      sourcesFailed.push(annotatedResult.source);
    }
  }

  return { rawData, sourcesUsed, sourcesWarning, sourcesFailed };
}
