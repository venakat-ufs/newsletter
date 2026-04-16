import type { Draft, DraftSection } from "@/lib/api";
import { pretextCompact, pretextWords } from "@/lib/pretext";

type RawSourceRecord = {
  source?: string;
  collected_at?: string;
  data?: Array<Record<string, unknown>>;
  errors?: string[];
  success?: boolean;
  optional?: boolean;
  no_signal_reason?: string;
};

type RawSourcesMap = Record<string, RawSourceRecord>;
type SourceGroup =
  | "official_inventory"
  | "official_research"
  | "editorial"
  | "job_market"
  | "community"
  | "ai_enrichment"
  | "legacy";

const SOURCE_DESCRIPTIONS: Record<string, string> = {
  zillow_research: "Zillow research and housing signals",
  zillow_rapidapi: "Tracked Zillow property pulls via RapidAPI",
  hud_user: "HUD research publications",
  fhfa_news: "FHFA market and policy releases",
  hud_homestore: "Official HUD-owned REO inventory — pulls live state counts, case numbers, bid deadlines",
  homesteps: "Freddie Mac HomeSteps REO inventory — pulls market counts, listing URLs, sample prices",
  bank_of_america_reo: "Official Bank of America bank-owned inventory — pulls active markets and listing signals",
  homepath: "Fannie Mae HomePath — blocked by CloudFront, no server-side access possible",
  linkedin_jobs: "LinkedIn guest job search — REO, foreclosure, loss mitigation, and servicing roles",
  indeed_jobs: "Indeed job search for REO and servicing roles (frequently blocked by anti-bot)",
  usajobs_jobs: "USAJobs government hiring signals for HUD and foreclosure-adjacent roles",
  greenhouse_jobs: "Greenhouse-hosted job board signals for bank and servicing roles",
  lever_jobs: "Lever-hosted job board signals for bank and servicing roles",
  auction_com: "Auction.com — pulls foreclosure and REO listing signal counts via public web indexing",
  hubzu: "Hubzu — pulls foreclosure and auction listing signal counts via public web indexing",
  xome: "Xome — pulls foreclosure and auction listing signal counts via public web indexing",
  williams_auction: "Williams & Williams — verified public REO auction listings, nationwide coverage",
  real_estate_sales_gov: "RealEstateSales.gov (GSA) — verified government-owned property auctions, no login needed",
  bid4assets: "Bid4Assets — county sheriff sales and tax lien auctions across CA, FL, PA, TX and more, fully public",
  foreclosure_listings_usa: "ForeclosureListingsUSA — verified public database, state pages serve full addresses, prices, beds/baths in static HTML, no login",
  foreclosure_listings_com: "ForeclosureListings.com — 1.4M+ listings (foreclosures, pre-foreclosures, short sales, sheriff sales), addresses in static HTML, no login",
  mtg_law_firm_trustee: "MTG Law Firm Trustee Sales — California pre-REO trustee sale schedule with addresses, sale dates, debt amounts, and sold prices in public HTML",
  realtor_foreclosure: "Realtor.com foreclosure listing signal lane",
  grok: "AI-assisted X search enrichment",
  reddit: "Community sentiment and REO discussion from targeted subreddits",
  news_api: "Live editorial headlines from News API",
  foreclosure_com: "Legacy foreclosure scrape lane from older issues",
  zillow: "Legacy Zillow inventory lane from older issues",
};

const SOURCE_LABELS: Record<string, string> = {
  zillow_research: "Zillow Research",
  zillow_rapidapi: "Zillow RapidAPI",
  hud_user: "HUD USER",
  fhfa_news: "FHFA News",
  hud_homestore: "HUD Home Store",
  homesteps: "HomeSteps",
  bank_of_america_reo: "Bank of America REO",
  homepath: "HomePath",
  linkedin_jobs: "LinkedIn Jobs",
  indeed_jobs: "Indeed Jobs",
  usajobs_jobs: "USAJobs",
  greenhouse_jobs: "Greenhouse Jobs",
  lever_jobs: "Lever Jobs",
  auction_com: "Auction.com",
  hubzu: "Hubzu",
  xome: "Xome",
  williams_auction: "Williams & Williams Auctions",
  real_estate_sales_gov: "RealEstateSales.gov (GSA)",
  bid4assets: "Bid4Assets Sheriff & Tax Sales",
  foreclosure_listings_usa: "ForeclosureListingsUSA",
  foreclosure_listings_com: "ForeclosureListings.com",
  mtg_law_firm_trustee: "MTG Law Firm Trustee Sales (CA)",
  realtor_foreclosure: "Realtor Foreclosures",
  grok: "Grok / X",
  reddit: "Reddit",
  news_api: "News API",
  foreclosure_com: "Foreclosure.com",
  zillow: "Zillow",
};

const SECTION_LABELS: Record<string, string> = {
  market_pulse: "Market Pulse",
  top_banks: "Top Institutions",
  hot_markets: "Hot Markets",
  industry_news: "Industry News",
  bank_hiring_intel: "Bank Hiring Intel",
  ufs_spotlight: "UFS Spotlight",
};

const SECTION_ORDER = [
  "market_pulse",
  "top_banks",
  "hot_markets",
  "industry_news",
  "bank_hiring_intel",
  "ufs_spotlight",
] as const;

const SECTION_CONTENT_FALLBACKS: Record<string, string> = {
  market_pulse:
    "Weekly REO volume, live listing movement, foreclosure signals, and market indicators.",
  top_banks:
    "Which institutions surfaced the most REO inventory this week, plus sample markets and counts.",
  hot_markets:
    "Top states, metros, and cities showing the strongest REO activity in the latest pull.",
  industry_news:
    "Regulatory changes, servicing updates, research headlines, and market trend coverage.",
  bank_hiring_intel:
    "Which banks, servicers, and institutions are hiring for REO, foreclosure, loss mitigation, and default servicing work.",
  ufs_spotlight:
    "Internal UFS service positioning, a client success angle, or an operational proof point.",
};

const SECTION_SOURCE_KEYS: Record<string, string[]> = {
  market_pulse: [
    "hud_homestore",
    "homesteps",
    "bank_of_america_reo",
    "zillow_rapidapi",
    "auction_com",
    "hubzu",
    "xome",
    "williams_auction",
    "real_estate_sales_gov",
    "bid4assets",
    "foreclosure_listings_usa",
    "foreclosure_listings_com",
    "mtg_law_firm_trustee",
    "realtor_foreclosure",
    "zillow_research",
    "fhfa_news",
    "news_api",
  ],
  top_banks: [
    "hud_homestore",
    "homesteps",
    "bank_of_america_reo",
    "zillow_rapidapi",
    "auction_com",
    "hubzu",
    "xome",
    "williams_auction",
    "real_estate_sales_gov",
    "bid4assets",
    "foreclosure_listings_usa",
    "foreclosure_listings_com",
    "mtg_law_firm_trustee",
    "realtor_foreclosure",
  ],
  hot_markets: [
    "hud_homestore",
    "homesteps",
    "bank_of_america_reo",
    "zillow_rapidapi",
    "auction_com",
    "hubzu",
    "xome",
    "williams_auction",
    "real_estate_sales_gov",
    "bid4assets",
    "foreclosure_listings_usa",
    "foreclosure_listings_com",
    "mtg_law_firm_trustee",
    "realtor_foreclosure",
  ],
  industry_news: [
    "zillow_research",
    "hud_user",
    "fhfa_news",
    "news_api",
    "reddit",
    "grok",
  ],
  bank_hiring_intel: [
    "linkedin_jobs",
    "indeed_jobs",
    "usajobs_jobs",
    "greenhouse_jobs",
    "lever_jobs",
  ],
  ufs_spotlight: [],
};

const SOURCE_EXTRACTION_DETAILS: Record<string, string> = {
  hud_homestore:
    "Pulls state inventory totals, case numbers, price, status, bid deadlines, and sample HUD listings.",
  homesteps:
    "Pulls Freddie Mac market counts, property totals, listing URLs, city and state, and sample prices.",
  bank_of_america_reo:
    "Pulls bank-owned market coverage, listing signals, active cities, and sample REO addresses.",
  homepath:
    "Permanently blocked — fanniemae.com returns 403 CloudFront on all server-side access. No data collected.",
  zillow_rapidapi:
    "Pulls tracked Zillow property details by zpid through RapidAPI, including address, county, state, price, status, and broker fields.",
  linkedin_jobs:
    "Pulls LinkedIn guest job cards for REO, foreclosure, loss mitigation, and servicing roles, including employer, location, post date, and job URL.",
  indeed_jobs:
    "Attempts live Indeed job pulls for REO and servicing roles. If Indeed blocks the runtime, the lane stays offline and shows the block reason.",
  usajobs_jobs:
    "Pulls USAJobs hiring signals related to REO, foreclosure, and servicing-adjacent housing roles.",
  greenhouse_jobs:
    "Pulls Greenhouse-hosted job board signals for mortgage, default servicing, and foreclosure roles.",
  lever_jobs:
    "Pulls Lever-hosted job board signals for mortgage, default servicing, and foreclosure roles.",
  auction_com:
    "Pulls foreclosure and REO listing signal counts from Auction.com public web indexing, plus sample listing links.",
  hubzu:
    "Pulls foreclosure and auction listing signal counts from Hubzu public web indexing, plus sample listing links.",
  xome:
    "Pulls foreclosure and auction listing signal counts from Xome public web indexing, plus sample listing links.",
  williams_auction:
    "Pulls verified public REO auction listings from Williams & Williams, including property addresses, auction dates, and state coverage.",
  real_estate_sales_gov:
    "Pulls government-owned property auction listings from GSA RealEstateSales.gov — no login required, nationwide coverage.",
  bid4assets:
    "Pulls live county sheriff sales and tax lien auction listings from Bid4Assets, covering CA, FL, PA, TX and 20+ active auction counties.",
  foreclosure_listings_usa:
    "Pulls listing counts, addresses, prices, and property specs from ForeclosureListingsUSA state pages — 99K+ CA listings, fully server-rendered, no login needed.",
  foreclosure_listings_com:
    "Pulls listing counts, addresses, prices, and bed/bath details from ForeclosureListings.com state pages — 1.4M+ database, server-rendered, no login needed.",
  mtg_law_firm_trustee:
    "Pulls CA pre-REO trustee sale data — property addresses, trustee sale numbers, scheduled dates/times, estimated debt, and sold prices from public HTML calendar.",
  realtor_foreclosure:
    "Pulls foreclosure listing signal counts from Realtor.com public web indexing, plus sample listing links.",
  zillow_research:
    "Pulls Zillow research headlines, summaries, categories, publish dates, and housing trend stories.",
  hud_user:
    "Pulls HUD USER publication headlines, summaries, categories, and publication dates.",
  fhfa_news:
    "Pulls FHFA release headlines, summaries, links, and publish dates for policy and market updates.",
  news_api:
    "Pulls current REO and foreclosure headlines, source names, summaries, and publish timestamps.",
  reddit:
    "Pulls REO, foreclosure, bank-owned, and servicing discussions from targeted subreddits and Reddit search.",
  grok:
    "Pulls X-based REO and foreclosure signals, post excerpts, authors, timestamps, and engagement cues.",
};

const SOURCE_GROUPS: Record<string, SourceGroup> = {
  hud_homestore: "official_inventory",
  homesteps: "official_inventory",
  bank_of_america_reo: "official_inventory",
  homepath: "official_inventory",
  zillow_rapidapi: "official_inventory",
  auction_com: "official_inventory",
  hubzu: "official_inventory",
  xome: "official_inventory",
  williams_auction: "official_inventory",
  real_estate_sales_gov: "official_inventory",
  bid4assets: "official_inventory",
  foreclosure_listings_usa: "official_inventory",
  foreclosure_listings_com: "official_inventory",
  mtg_law_firm_trustee: "official_inventory",
  realtor_foreclosure: "official_inventory",
  zillow_research: "official_research",
  hud_user: "official_research",
  fhfa_news: "official_research",
  linkedin_jobs: "job_market",
  indeed_jobs: "job_market",
  usajobs_jobs: "job_market",
  greenhouse_jobs: "job_market",
  lever_jobs: "job_market",
  news_api: "editorial",
  reddit: "community",
  grok: "ai_enrichment",
  foreclosure_com: "legacy",
  zillow: "legacy",
};

const SOURCE_GROUP_LABELS: Record<SourceGroup, string> = {
  official_inventory: "Official Inventory",
  official_research: "Official Research",
  job_market: "Hiring Intel",
  editorial: "Editorial Headlines",
  community: "Community Signals",
  ai_enrichment: "AI Enrichment",
  legacy: "Legacy Sources",
};

const SOURCE_GROUP_ORDER: Record<SourceGroup, number> = {
  official_inventory: 0,
  official_research: 1,
  job_market: 2,
  editorial: 3,
  community: 4,
  ai_enrichment: 5,
  legacy: 6,
};

const SOURCE_MODE_ORDER: Record<SourceCard["mode"], number> = {
  offline: 0,
  degraded: 1,
  live: 2,
};

export interface SourceCard {
  key: string;
  label: string;
  mode: "live" | "offline" | "degraded";
  group: SourceGroup;
  groupLabel: string;
  itemCount: number;
  errorCount: number;
  collectedAt: string | null;
  description: string;
  latestError: string | null;
}

export interface InsightMetric {
  label: string;
  value: string;
  tone: "default" | "accent" | "alert";
  note: string;
}

export interface MarketHighlight {
  name: string;
  context: string;
  detail: string;
  tone: "hot" | "watch";
}

export interface NewsHighlight {
  source: string;
  date: string;
  headline: string;
  summary: string;
  url?: string;
}

export interface WorkflowStep {
  label: string;
  detail: string;
  state: "complete" | "active" | "pending";
}

export interface TopicSourceEntry {
  key: string;
  label: string;
  mode: SourceCard["mode"];
  itemCount: number;
  description: string;
  extractionDetail: string;
  latestError: string | null;
}

export interface TopicSourceRow {
  key: string;
  label: string;
  content: string;
  sources: TopicSourceEntry[];
  sourceSummary: string;
}

function getSources(rawData: Draft["raw_data"]): RawSourcesMap {
  const sources = rawData?.sources;
  if (!sources || typeof sources !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(sources as RawSourcesMap).filter(([key]) => !key.endsWith("_mock")),
  ) as RawSourcesMap;
}

function titleCase(value: string): string {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function safeDraftSection(value: unknown): DraftSection | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const section = value as Record<string, unknown>;
  const sectionType =
    typeof section.section_type === "string" && section.section_type.trim()
      ? section.section_type
      : "unknown_section";

  return {
    section_type: sectionType,
    title: typeof section.title === "string" ? section.title : "",
    teaser: typeof section.teaser === "string" ? section.teaser : "",
    body: typeof section.body === "string" ? section.body : "",
    audience_tag: typeof section.audience_tag === "string" ? section.audience_tag : undefined,
    metadata:
      section.metadata && typeof section.metadata === "object" && !Array.isArray(section.metadata)
        ? (section.metadata as Record<string, unknown>)
        : undefined,
  };
}

function safeDraftSections(value: unknown): DraftSection[] {
  return safeArray(value)
    .map((section) => safeDraftSection(section))
    .filter((section): section is DraftSection => Boolean(section));
}

function getSectionLabel(sectionType: string): string {
  return SECTION_LABELS[sectionType] ?? titleCase(sectionType);
}

function getRawSections(
  rawData: Draft["raw_data"],
): Record<string, { description?: string; data?: Array<Record<string, unknown>> }> {
  const sections = rawData?.sections;
  if (!sections || typeof sections !== "object") {
    return {};
  }

  return sections as Record<
    string,
    { description?: string; data?: Array<Record<string, unknown>> }
  >;
}

function getSourceGroup(key: string): SourceGroup {
  return SOURCE_GROUPS[key] ?? "editorial";
}

function getLatestSourceError(source: RawSourceRecord): string | null {
  const errors = safeArray<string>(source.errors);
  if (errors[0]) {
    return errors[0];
  }
  if (typeof source.no_signal_reason === "string" && source.no_signal_reason.trim()) {
    return source.no_signal_reason.trim();
  }
  return null;
}

function hasOnlyUnstructuredItems(source: RawSourceRecord): boolean {
  const items = safeArray<Record<string, unknown>>(source.data);
  return items.length > 0 && items.every((item) => item.type === "unstructured");
}

function hasNoSignals(source: RawSourceRecord): boolean {
  const items = safeArray<Record<string, unknown>>(source.data);
  return Boolean(source.success) && items.length === 0;
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

function derivedSignalCount(key: string, source: RawSourceRecord): number {
  const items = safeArray<Record<string, unknown>>(source.data);
  if (items.length === 0) {
    return 0;
  }

  if (key === "zillow_rapidapi") {
    return items.length;
  }

  if (
    key === "zillow_research" ||
    key === "hud_user" ||
    key === "fhfa_news" ||
    key === "news_api" ||
    key === "reddit" ||
    key === "grok"
  ) {
    return items.length;
  }

  const summed = items.reduce((sum, item) => {
    return (
      sum +
      (numericValue(
        item.total_listings,
        item.listing_signal_count,
        item.total_jobs,
        item.job_count,
        item.article_count,
        item.count,
        item.city_count,
      ) ?? 0)
    );
  }, 0);

  if (summed > 0) {
    return summed;
  }

  return items.length;
}

export function getIssueWeekLabel(dateValue: string | null | undefined): string {
  const date = dateValue ? new Date(dateValue) : new Date();
  if (Number.isNaN(date.getTime())) {
    return "Current issue";
  }

  const start = new Date(date);
  const day = start.getUTCDay();
  const distanceToMonday = (day + 6) % 7;
  start.setUTCDate(start.getUTCDate() - distanceToMonday);

  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);

  const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" });
  const dayFormatter = new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "UTC" });
  const yearFormatter = new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: "UTC" });

  const startMonth = monthFormatter.format(start);
  const endMonth = monthFormatter.format(end);
  const startDay = dayFormatter.format(start);
  const endDay = dayFormatter.format(end);
  const year = yearFormatter.format(end);

  return startMonth === endMonth
    ? `Week of ${startMonth} ${startDay}-${endDay}, ${year}`
    : `Week of ${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
}

export function getDraftSections(draft: Draft): DraftSection[] {
  const humanSections = safeDraftSections(draft.human_edits?.sections);
  if (humanSections.length > 0) {
    return humanSections;
  }

  return safeDraftSections(draft.ai_draft?.sections);
}

export function getLeadSection(draft: Draft): DraftSection | null {
  return getDraftSections(draft)[0] ?? null;
}

export function getSourceCards(draft: Draft): SourceCard[] {
  return Object.entries(getSources(draft.raw_data))
    .map(([key, source]) => {
    const itemCount = derivedSignalCount(key, source);
    const errorCount = safeArray<string>(source.errors).length;
    const group = getSourceGroup(key);
    const unstructuredOnly = hasOnlyUnstructuredItems(source);
    const noSignals = hasNoSignals(source);
    const latestError =
      getLatestSourceError(source) ?? (unstructuredOnly ? "AI returned unstructured output." : null);
    let mode: SourceCard["mode"] = "offline";

    if (source.success) {
      if (errorCount > 0 || unstructuredOnly || noSignals) {
        mode = "degraded";
      } else {
        mode = "live";
      }
    }

    return {
      key,
      label: SOURCE_LABELS[key] ?? titleCase(key),
      mode,
      group,
      groupLabel: SOURCE_GROUP_LABELS[group],
      itemCount,
      errorCount,
      collectedAt: source.collected_at ?? null,
      description: SOURCE_DESCRIPTIONS[key] ?? "Pipeline source input",
      latestError,
    };
  })
    .sort((left, right) => {
      const groupDifference = SOURCE_GROUP_ORDER[left.group] - SOURCE_GROUP_ORDER[right.group];
      if (groupDifference !== 0) {
        return groupDifference;
      }

      const modeDifference = SOURCE_MODE_ORDER[left.mode] - SOURCE_MODE_ORDER[right.mode];
      if (modeDifference !== 0) {
        return modeDifference;
      }

      return left.label.localeCompare(right.label);
    });
}

export function getTopicSourceRows(draft: Draft): TopicSourceRow[] {
  const sourceCards = getSourceCards(draft);
  const sourceMap = new Map(sourceCards.map((source) => [source.key, source]));
  const rawSections = getRawSections(draft.raw_data);
  const discoveredSectionKeys = new Set<string>([
    ...Object.keys(rawSections),
    ...getDraftSections(draft)
      .map((section) => section.section_type)
      .filter((sectionType): sectionType is string => typeof sectionType === "string" && sectionType.trim().length > 0),
  ]);

  const orderedKeys = [
    ...SECTION_ORDER.filter((key) => discoveredSectionKeys.has(key)),
    ...[...discoveredSectionKeys].filter(
      (key) => !SECTION_ORDER.includes(key as (typeof SECTION_ORDER)[number]),
    ),
  ];

  const sectionKeys = orderedKeys.length > 0 ? orderedKeys : [...SECTION_ORDER];

  return sectionKeys.map((sectionKey) => {
    const sourceKeys = SECTION_SOURCE_KEYS[sectionKey] ?? [];
    const sources = sourceKeys
      .map((key) => sourceMap.get(key))
      .filter((source): source is SourceCard => Boolean(source))
      .map((source) => ({
        key: source.key,
        label: source.label,
        mode: source.mode,
        itemCount: source.itemCount,
        description: source.description,
        extractionDetail:
          SOURCE_EXTRACTION_DETAILS[source.key] ?? "Pipeline source input for this section.",
        latestError: source.latestError,
      }));

    const contentCandidate = rawSections[sectionKey]?.description;
    const content =
      (typeof contentCandidate === "string" && contentCandidate.trim()
        ? contentCandidate
        : null) ??
      SECTION_CONTENT_FALLBACKS[sectionKey] ??
      "Editorial block assembled from the latest source pull.";

    const sourceSummary =
      sources.length > 0
        ? sources.map((source) => source.label).join(", ")
        : "Internal UFS copy, service context, or client proof point.";

    return {
      key: sectionKey,
      label: getSectionLabel(sectionKey),
      content: pretextWords(content, 16),
      sources,
      sourceSummary: pretextCompact(sourceSummary, 120),
    };
  });
}

export function getInsightMetrics(draft: Draft): InsightMetric[] {
  const sourceCards = getSourceCards(draft);
  const sections = getDraftSections(draft);
  const totalSignals = sourceCards.reduce((sum, source) => sum + source.itemCount, 0);
  const liveSources = sourceCards.filter((source) => source.mode === "live").length;
  const flaggedSources = sourceCards.filter((source) => source.mode !== "live").length;

  return [
    {
      label: "Signals Pulled",
      value: String(totalSignals),
      tone: "default",
      note: `${sourceCards.length} source lanes checked`,
    },
    {
      label: "Sections Built",
      value: String(sections.length),
      tone: "accent",
      note: "Drafted blocks ready for review",
    },
    {
      label: "Platforms Live",
      value: String(liveSources),
      tone: "default",
      note: "Live feeds responding normally",
    },
    {
      label: "Needs Attention",
      value: String(flaggedSources),
      tone: flaggedSources > 0 ? "alert" : "default",
      note: flaggedSources > 0 ? "One or more source lanes failed or degraded" : "No source warnings",
    },
  ];
}

export function getMarketHighlights(draft: Draft): MarketHighlight[] {
  const sources = getSources(draft.raw_data);
  const markets: MarketHighlight[] = [];

  const hudItems = safeArray<Record<string, unknown>>(sources.hud_homestore?.data);
  const sortedHudItems = [...hudItems].sort((left, right) => {
    const rightCount = typeof right.total_listings === "number" ? right.total_listings : 0;
    const leftCount = typeof left.total_listings === "number" ? left.total_listings : 0;
    return rightCount - leftCount;
  });

  for (const stateItem of sortedHudItems) {
    const state = typeof stateItem.state === "string" ? stateItem.state : "HUD market";
    const totalListings =
      typeof stateItem.total_listings === "number" ? stateItem.total_listings : null;
    const sampleListings = safeArray<Record<string, unknown>>(stateItem.sample_listings);
    const leadListing = sampleListings[0];
    const leadTitle =
      typeof leadListing?.title === "string" ? leadListing.title : null;

    markets.push({
      name: state,
      context: "HUD Home Store inventory",
      detail: totalListings
        ? `${totalListings} live HUD listings in the latest pull${leadTitle ? `, led by ${leadTitle}` : ""}.`
        : leadTitle
          ? `HUD inventory surfaced ${leadTitle} in the latest pull.`
          : "Live HUD inventory was detected in the latest pull.",
      tone: markets.length < 2 ? "hot" : "watch",
    });

    if (markets.length >= 4) {
      return markets;
    }
  }

  const homeStepsItems = safeArray<Record<string, unknown>>(sources.homesteps?.data);
  for (const marketItem of homeStepsItems) {
    const market = typeof marketItem.market === "string" ? marketItem.market : "Market";
    const state = typeof marketItem.state === "string" ? marketItem.state : "US";
    const totalListings =
      typeof marketItem.total_listings === "number" ? marketItem.total_listings : null;
    const sampleListings = safeArray<Record<string, unknown>>(marketItem.sample_listings);

    for (const listing of sampleListings) {
      const city = typeof listing.city === "string" ? listing.city : market;
      const title = typeof listing.title === "string" ? listing.title : `${market} listing`;
      const price = typeof listing.price === "string" ? listing.price : null;

      markets.push({
        name: city,
        context: `${state} HomeSteps inventory`,
        detail: `${totalListings ? `${totalListings} Freddie Mac listings` : "Freddie Mac inventory"} in the latest pull${price ? `, including ${title} at ${price}` : `, including ${title}`}.`,
        tone: markets.length < 2 ? "hot" : "watch",
      });

      if (markets.length >= 4) {
        return markets;
      }
    }
  }

  const bankOfAmericaItems = safeArray<Record<string, unknown>>(sources.bank_of_america_reo?.data);
  for (const marketItem of bankOfAmericaItems) {
    const state = typeof marketItem.state === "string" ? marketItem.state : "Bank of America";
    const cityCount = typeof marketItem.city_count === "number" ? marketItem.city_count : null;
    const listingSignals =
      typeof marketItem.listing_signal_count === "number" ? marketItem.listing_signal_count : null;
    const sampleListings = safeArray<Record<string, unknown>>(marketItem.sample_listings);
    const leadListing = sampleListings[0];
    const leadTitle =
      typeof leadListing?.title === "string" ? leadListing.title : null;

    markets.push({
      name: state,
      context: "Bank of America REO",
      detail: listingSignals
        ? `${listingSignals} bank-owned listing signals across ${cityCount ?? 0} active markets${leadTitle ? `, including ${leadTitle}` : ""}.`
        : cityCount
          ? `${cityCount} active Bank of America REO markets were detected${leadTitle ? `, including ${leadTitle}` : ""}.`
          : "Official Bank of America REO activity was detected.",
      tone: markets.length < 2 ? "hot" : "watch",
    });

    if (markets.length >= 4) {
      return markets;
    }
  }

  return markets;
}

export function getNewsHighlights(draft: Draft): NewsHighlight[] {
  const sources = getSources(draft.raw_data);
  const items: NewsHighlight[] = [];
  const seen = new Set<string>();
  const allowedNewsSources = new Set([
    "news_api",
    "zillow_research",
    "hud_user",
    "fhfa_news",
    "reddit",
    "grok",
  ]);

  for (const [key, source] of Object.entries(sources)) {
    if (!allowedNewsSources.has(key)) {
      continue;
    }

    for (const item of safeArray<Record<string, unknown>>(source.data)) {
      if (item.type === "unstructured") {
        continue;
      }

      const title =
        typeof item.title === "string"
          ? item.title
          : typeof item.raw_summary === "string"
            ? item.raw_summary.slice(0, 90)
            : "";

      if (!title) {
        continue;
      }

      const urlCandidates = [
        item.url,
        item.link,
        item.article_url,
        item.source_url,
        item.permalink,
      ];
      const normalizedUrl =
        urlCandidates
          .map((candidate) => (typeof candidate === "string" ? candidate.trim() : ""))
          .find((candidate) => {
            if (!candidate) {
              return false;
            }
            if (candidate.startsWith("https://") || candidate.startsWith("http://")) {
              return true;
            }
            if (candidate.startsWith("//")) {
              return true;
            }
            return key === "reddit" && candidate.startsWith("/");
          }) ?? "";
      const storyUrl = normalizedUrl.startsWith("//")
        ? `https:${normalizedUrl}`
        : key === "reddit" && normalizedUrl.startsWith("/")
          ? `https://www.reddit.com${normalizedUrl}`
          : normalizedUrl;

      const dedupeKey =
        storyUrl ||
        `${key}:${title}`;
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);

      const summaryCandidates = [
        item.description,
        item.content_preview,
        item.text,
        item.raw_summary,
        item.teaser,
      ];
      const summaryValue = summaryCandidates.find((value) => typeof value === "string") as
        | string
        | undefined;
      const sourceLabel =
        typeof item.source_name === "string"
          ? item.source_name
          : typeof item.subreddit === "string"
            ? `r/${item.subreddit}`
            : titleCase(key);
      const dateValue =
        typeof item.published_at === "string"
          ? item.published_at
          : typeof item.created_utc === "number"
            ? new Date(item.created_utc * 1000).toISOString()
            : source.collected_at ?? "";

      items.push({
        source: sourceLabel,
        date: dateValue,
        headline: title,
        summary: (summaryValue ?? "").slice(0, 220),
        ...(storyUrl ? { url: storyUrl } : {}),
      });
    }
  }

  return items
    .sort((left, right) => {
      const rightDate = Date.parse(right.date || "");
      const leftDate = Date.parse(left.date || "");

      if (Number.isNaN(rightDate) && Number.isNaN(leftDate)) {
        return 0;
      }
      if (Number.isNaN(rightDate)) {
        return -1;
      }
      if (Number.isNaN(leftDate)) {
        return 1;
      }

      return rightDate - leftDate;
    })
    .slice(0, 5);
}

export function getWorkflowSteps(draft: Draft): WorkflowStep[] {
  const sourceCards = getSourceCards(draft);
  const sections = getDraftSections(draft);
  const hasHumanEdits = safeArray<DraftSection>(draft.human_edits?.sections).length > 0;

  return [
    {
      label: "Signal Intake",
      detail: `${sourceCards.length} platforms checked for this issue`,
      state: sourceCards.length > 0 ? "complete" : "pending",
    },
    {
      label: "Draft Assembly",
      detail: sections.length > 0 ? `${sections.length} sections generated` : "Waiting for AI composition",
      state: sections.length > 0 ? "complete" : "active",
    },
    {
      label: "Editorial Review",
      detail: hasHumanEdits ? "Human edits are already layered in" : "Awaiting editor pass",
      state: hasHumanEdits ? "complete" : draft.status === "pending" ? "active" : "pending",
    },
    {
      label: "Send Gate",
      detail:
        draft.status === "approved"
          ? "Approved issues publish article pages and queue delivery"
          : "Approve and send from the draft workspace",
      state: draft.status === "approved" ? "complete" : "pending",
    },
  ];
}

export function getSectionBlueprint(draft: Draft): Array<{
  type: string;
  label: string;
  teaser: string;
}> {
  return getDraftSections(draft).map((section) => ({
    type: section.section_type,
    label: getSectionLabel(section.section_type),
    teaser: section.teaser,
  }));
}
