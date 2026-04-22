import { getSettings } from "@/server/env";
import { generateAiDraft } from "@/server/ai";
import { sendNewsletterPreviewEmail, sendReviewNotification } from "@/server/email";
import { appendWorkflowLog } from "@/server/logs";
import {
  getCampaignStatus,
  getMailchimpBlockReason,
  scheduleCampaign,
} from "@/server/mailchimp";
import { readDatabase, withDatabase, nextId } from "@/server/store";
import { collectAllSources } from "@/server/sources";
import type {
  ApprovalAction,
  ApprovalLogRecord,
  ArticleRecord,
  DatabaseRecord,
  DraftRecord,
  DraftSection,
  DraftStatus,
  NewsletterRecord,
} from "@/server/types";

function notFound(message: string): never {
  const error = new Error(message);
  error.name = "NotFoundError";
  throw error;
}

function badRequest(message: string): never {
  const error = new Error(message);
  error.name = "BadRequestError";
  throw error;
}

function nowIso(): string {
  return new Date().toISOString();
}

function issueNumberForDraft(draft: DraftRecord, db: DatabaseRecord): number {
  const newsletter = db.newsletters.find((item) => item.id === draft.newsletter_id);
  return newsletter?.issue_number ?? draft.newsletter_id;
}

function serializeDraft(draft: DraftRecord, db: DatabaseRecord): Record<string, unknown> {
  return {
    ...draft,
    issue_number: issueNumberForDraft(draft, db),
  };
}

function getLatestDraftForNewsletter(db: DatabaseRecord, newsletterId: number): DraftRecord | undefined {
  return db.drafts
    .filter((draft) => draft.newsletter_id === newsletterId)
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at))[0];
}

function hasProtectedDraftWork(draft: DraftRecord): boolean {
  const aiSections = getSections(draft.ai_draft).length;
  const humanSections = Array.isArray(draft.human_edits?.sections)
    ? draft.human_edits.sections.length
    : 0;

  return (
    aiSections > 0 ||
    humanSections > 0 ||
    draft.status !== "pending" ||
    Boolean(draft.reviewer_email) ||
    Boolean(draft.reviewed_at)
  );
}

function getSections(content: Record<string, unknown>): DraftSection[] {
  const sections = content.sections;
  return Array.isArray(sections) ? (sections as DraftSection[]) : [];
}

function getSourceData(
  rawData: Record<string, { data?: Array<Record<string, unknown>> }>,
  keys: string[],
): Array<Record<string, unknown>> {
  for (const key of keys) {
    const data = rawData[key]?.data ?? [];
    if (data.length > 0) {
      return data;
    }
  }
  return [];
}

function summarizeHiringEmployers(
  jobs: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const employerMap = new Map<
    string,
    {
      company: string;
      total_jobs: number;
      roles: Set<string>;
      job_urls: Set<string>;
      locations: Set<string>;
      sources: Set<string>;
      hiring_focus: Set<string>;
    }
  >();

  for (const job of jobs) {
    const company =
      typeof job.company === "string" && job.company.trim()
        ? job.company.trim()
        : "Unknown employer";
    const key = company.toLowerCase();

    if (!employerMap.has(key)) {
      employerMap.set(key, {
        company,
        total_jobs: 0,
        roles: new Set<string>(),
        job_urls: new Set<string>(),
        locations: new Set<string>(),
        sources: new Set<string>(),
        hiring_focus: new Set<string>(),
      });
    }

    const summary = employerMap.get(key);
    if (!summary) {
      continue;
    }

    summary.total_jobs += 1;

    if (typeof job.title === "string" && job.title.trim()) {
      summary.roles.add(job.title.trim());
    }
    if (typeof job.url === "string" && job.url.trim()) {
      summary.job_urls.add(job.url.trim());
    }
    if (typeof job.location === "string" && job.location.trim()) {
      summary.locations.add(job.location.trim());
    }
    if (typeof job.source_name === "string" && job.source_name.trim()) {
      summary.sources.add(job.source_name.trim());
    }
    if (typeof job.hiring_focus === "string" && job.hiring_focus.trim()) {
      summary.hiring_focus.add(job.hiring_focus.trim());
    }
  }

  return [...employerMap.values()]
    .sort((left, right) => {
      if (right.total_jobs !== left.total_jobs) {
        return right.total_jobs - left.total_jobs;
      }
      return left.company.localeCompare(right.company);
    })
    .slice(0, 10)
    .map((summary) => ({
      company: summary.company,
      total_jobs: summary.total_jobs,
      sample_roles: [...summary.roles].slice(0, 5),
      job_urls: [...summary.job_urls].slice(0, 5),
      locations: [...summary.locations].slice(0, 5),
      hiring_focus: [...summary.hiring_focus].slice(0, 4),
      sources: [...summary.sources],
    }));
}

function aggregateForSections(
  rawData: Record<string, { data?: Array<Record<string, unknown>> }>,
): Record<string, unknown> {
  const collectSampleListings = (records: Array<Record<string, unknown>>) =>
    records.flatMap((item) =>
      Array.isArray(item.sample_listings)
        ? (item.sample_listings as Array<Record<string, unknown>>)
        : [],
    );

  const sections: Record<string, { description: string; data: Array<Record<string, unknown>> }> = {
    market_pulse: {
      description: "Weekly REO inventory, official listing activity, and key market indicators",
      data: [],
    },
    top_banks: {
      description: "Which banks, agencies, and GSEs showed the strongest live REO inventory signals",
      data: [],
    },
    hot_markets: {
      description: "Top markets and institutions surfaced by live official listing channels this week",
      data: [],
    },
    industry_news: {
      description: "Regulatory changes, servicer announcements, market trends",
      data: [],
    },
    bank_hiring_intel: {
      description:
        "Which banks, servicers, and institutions are posting REO, foreclosure, loss mitigation, and default servicing roles.",
      data: [],
    },
    ufs_spotlight: {
      description: "UFS service highlight or client success story",
      data: [],
    },
  };

  const hudInventory = getSourceData(rawData, ["hud_homestore"]);
  if (hudInventory.length > 0) {
    const totalListings = hudInventory.reduce(
      (sum, item) => sum + (typeof item.total_listings === "number" ? item.total_listings : 0),
      0,
    );
    const sampleListings = collectSampleListings(hudInventory).slice(0, 10);

    sections.market_pulse.data.push({
      source: "hud_homestore",
      institution: "HUD",
      state_count: hudInventory.length,
      total_listings: totalListings,
      states: hudInventory,
    });
    sections.top_banks.data.push({
      source: "hud_homestore",
      institution: "HUD",
      total_listings: totalListings,
      state_count: hudInventory.length,
      sample_listings: sampleListings,
    });
    sections.hot_markets.data.push({
      source: "hud_homestore",
      states: hudInventory,
      sample_listings: sampleListings,
    });
  }

  const homeStepsData = getSourceData(rawData, ["homesteps"]);
  if (homeStepsData.length > 0) {
    const totalListings = homeStepsData.reduce(
      (sum, item) => sum + (typeof item.total_listings === "number" ? item.total_listings : 0),
      0,
    );
    const sampleListings = collectSampleListings(homeStepsData).slice(0, 10);

    sections.market_pulse.data.push({
      source: "homesteps",
      institution: "Freddie Mac",
      market_count: homeStepsData.length,
      total_listings: totalListings,
      markets: homeStepsData,
    });
    sections.top_banks.data.push({
      source: "homesteps",
      institution: "Freddie Mac",
      total_listings: totalListings,
      market_count: homeStepsData.length,
      sample_listings: sampleListings,
    });
    sections.hot_markets.data.push({
      source: "homesteps",
      markets: homeStepsData,
    });
  }

  const bankOfAmericaData = getSourceData(rawData, ["bank_of_america_reo"]);
  if (bankOfAmericaData.length > 0) {
    const cityCount = bankOfAmericaData.reduce(
      (sum, item) => sum + (typeof item.city_count === "number" ? item.city_count : 0),
      0,
    );
    const listingSignals = bankOfAmericaData.reduce(
      (sum, item) =>
        sum + (typeof item.listing_signal_count === "number" ? item.listing_signal_count : 0),
      0,
    );
    const sampleListings = collectSampleListings(bankOfAmericaData).slice(0, 10);

    sections.market_pulse.data.push({
      source: "bank_of_america_reo",
      institution: "Bank of America",
      state_count: bankOfAmericaData.length,
      city_count: cityCount,
      listing_signal_count: listingSignals,
      markets: bankOfAmericaData,
    });
    sections.top_banks.data.push({
      source: "bank_of_america_reo",
      institution: "Bank of America",
      state_count: bankOfAmericaData.length,
      city_count: cityCount,
      listing_signal_count: listingSignals,
      sample_listings: sampleListings,
    });
    sections.hot_markets.data.push({
      source: "bank_of_america_reo",
      markets: bankOfAmericaData,
      sample_listings: sampleListings,
    });
  }

  const homePathData = getSourceData(rawData, ["homepath"]);
  if (homePathData.length > 0) {
    sections.market_pulse.data.push({
      source: "homepath",
      institution: "Fannie Mae",
      listing_signal_count: homePathData.length,
      sample_listings: homePathData.slice(0, 8),
    });
    sections.top_banks.data.push({
      source: "homepath",
      institution: "Fannie Mae",
      listing_signal_count: homePathData.length,
      sample_listings: homePathData.slice(0, 8),
    });
  }

  const freeListingSources = [
    { key: "auction_com", institution: "Auction.com" },
    { key: "hubzu", institution: "Hubzu" },
    { key: "xome", institution: "Xome" },
    { key: "attom_data", institution: "ATTOM Data" },
    { key: "ice_mortgage_tech", institution: "ICE Mortgage Tech" },
    { key: "reox_directory", institution: "REOX Directory" },
    { key: "realtor_foreclosure", institution: "Realtor.com" },
    { key: "redfin_foreclosure", institution: "Redfin" },
    { key: "wells_fargo_reo", institution: "Wells Fargo" },
    { key: "chase_reo", institution: "Chase" },
    { key: "us_bank_reo", institution: "US Bank" },
    { key: "mr_cooper_reo", institution: "Mr. Cooper" },
    { key: "phh_mortgage_reo", institution: "PHH Mortgage" },
    { key: "newrez_shellpoint_reo", institution: "NewRez / Shellpoint" },
    { key: "selene_finance_reo", institution: "Selene Finance" },
    { key: "carrington_reo", institution: "Carrington Mortgage" },
  ];

  for (const lane of freeListingSources) {
    const sourceData = getSourceData(rawData, [lane.key]);
    if (sourceData.length === 0) {
      continue;
    }

    const listingSignals = sourceData.reduce(
      (sum, item) =>
        sum + (numericValue(item.listing_signal_count, item.total_listings, item.city_count) ?? 0),
      0,
    );
    const sampleListings = collectSampleListings(sourceData).slice(0, 8);

    sections.market_pulse.data.push({
      source: lane.key,
      institution: lane.institution,
      state_count: sourceData.length,
      listing_signal_count: listingSignals,
      markets: sourceData,
      sample_listings: sampleListings,
    });
    sections.top_banks.data.push({
      source: lane.key,
      institution: lane.institution,
      listing_signal_count: listingSignals,
      state_count: sourceData.length,
      sample_listings: sampleListings,
    });
    sections.hot_markets.data.push({
      source: lane.key,
      markets: sourceData,
      sample_listings: sampleListings,
    });
  }

  const newsData = getSourceData(rawData, ["news_api"]);
  if (newsData.length > 0) {
    sections.industry_news.data.push(...newsData);
    sections.market_pulse.data.push({
      source: "news_api",
      article_count: newsData.length,
      top_headlines: newsData
        .slice(0, 5)
        .map((item) => (typeof item.title === "string" ? item.title : "")),
    });
  }

  const zillowResearchData = getSourceData(rawData, ["zillow_research"]);
  if (zillowResearchData.length > 0) {
    sections.industry_news.data.push(...zillowResearchData);
    sections.market_pulse.data.push({
      source: "zillow_research",
      article_count: zillowResearchData.length,
      top_headlines: zillowResearchData
        .slice(0, 5)
        .map((item) => (typeof item.title === "string" ? item.title : "")),
    });
  }

  const hudData = getSourceData(rawData, ["hud_user"]);
  if (hudData.length > 0) {
    sections.industry_news.data.push(...hudData);
  }

  const fhfaData = getSourceData(rawData, ["fhfa_news"]);
  if (fhfaData.length > 0) {
    sections.industry_news.data.push(...fhfaData);
    sections.market_pulse.data.push({
      source: "fhfa_news",
      article_count: fhfaData.length,
      top_headlines: fhfaData
        .slice(0, 5)
        .map((item) => (typeof item.title === "string" ? item.title : "")),
    });
  }

  const grokData = getSourceData(rawData, ["grok"]);
  if (grokData.length > 0) {
    sections.industry_news.data.push(...grokData);
  }

  const redditData = getSourceData(rawData, ["reddit"]);
  if (redditData.length > 0) {
    sections.industry_news.data.push(...redditData);
  }

  const linkedInJobs = getSourceData(rawData, ["linkedin_jobs"]);
  const indeedJobs = getSourceData(rawData, ["indeed_jobs"]);
  const googleJobs = getSourceData(rawData, ["google_jobs"]);
  const zipRecruiterJobs = getSourceData(rawData, ["ziprecruiter_jobs"]);
  const companyCareerJobs = getSourceData(rawData, ["company_career_jobs"]);
  const usaJobs = getSourceData(rawData, ["usajobs_jobs"]);
  const greenhouseJobs = getSourceData(rawData, ["greenhouse_jobs"]);
  const leverJobs = getSourceData(rawData, ["lever_jobs"]);
  const allHiringJobs = [
    ...linkedInJobs,
    ...indeedJobs,
    ...googleJobs,
    ...zipRecruiterJobs,
    ...companyCareerJobs,
    ...usaJobs,
    ...greenhouseJobs,
    ...leverJobs,
  ];

  if (allHiringJobs.length > 0) {
    sections.bank_hiring_intel.data.push({
      source: "bank_hiring_intel",
      total_jobs: allHiringJobs.length,
      top_employers: summarizeHiringEmployers(allHiringJobs),
      sample_jobs: allHiringJobs.slice(0, 12),
    });
  }

  if (linkedInJobs.length > 0) {
    sections.bank_hiring_intel.data.push({
      source: "linkedin_jobs",
      total_jobs: linkedInJobs.length,
      top_employers: summarizeHiringEmployers(linkedInJobs),
      sample_jobs: linkedInJobs.slice(0, 10),
    });
  }

  if (indeedJobs.length > 0) {
    sections.bank_hiring_intel.data.push({
      source: "indeed_jobs",
      total_jobs: indeedJobs.length,
      top_employers: summarizeHiringEmployers(indeedJobs),
      sample_jobs: indeedJobs.slice(0, 10),
    });
  }

  if (googleJobs.length > 0) {
    sections.bank_hiring_intel.data.push({
      source: "google_jobs",
      total_jobs: googleJobs.length,
      top_employers: summarizeHiringEmployers(googleJobs),
      sample_jobs: googleJobs.slice(0, 10),
    });
  }

  if (zipRecruiterJobs.length > 0) {
    sections.bank_hiring_intel.data.push({
      source: "ziprecruiter_jobs",
      total_jobs: zipRecruiterJobs.length,
      top_employers: summarizeHiringEmployers(zipRecruiterJobs),
      sample_jobs: zipRecruiterJobs.slice(0, 10),
    });
  }

  if (companyCareerJobs.length > 0) {
    sections.bank_hiring_intel.data.push({
      source: "company_career_jobs",
      total_jobs: companyCareerJobs.length,
      top_employers: summarizeHiringEmployers(companyCareerJobs),
      sample_jobs: companyCareerJobs.slice(0, 10),
    });
  }

  if (usaJobs.length > 0) {
    sections.bank_hiring_intel.data.push({
      source: "usajobs_jobs",
      total_jobs: usaJobs.length,
      top_employers: summarizeHiringEmployers(usaJobs),
      sample_jobs: usaJobs.slice(0, 10),
    });
  }

  if (greenhouseJobs.length > 0) {
    sections.bank_hiring_intel.data.push({
      source: "greenhouse_jobs",
      total_jobs: greenhouseJobs.length,
      top_employers: summarizeHiringEmployers(greenhouseJobs),
      sample_jobs: greenhouseJobs.slice(0, 10),
    });
  }

  if (leverJobs.length > 0) {
    sections.bank_hiring_intel.data.push({
      source: "lever_jobs",
      total_jobs: leverJobs.length,
      top_employers: summarizeHiringEmployers(leverJobs),
      sample_jobs: leverJobs.slice(0, 10),
    });
  }

  return sections;
}

type RawSourceSnapshot = Record<string, { data?: Array<Record<string, unknown>> }>;
type RawSectionSnapshot = Record<
  string,
  {
    description?: string;
    data?: Array<Record<string, unknown>>;
  }
>;

function safeRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
}

function safeTextArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
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

function uniqueTextValues(values: string[]): string[] {
  const seen = new Set<string>();
  const results: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    results.push(normalized);
  }

  return results;
}

function percentDelta(current: number, previous: number | null): number | null {
  if (!previous || previous <= 0) {
    return null;
  }

  return Math.round(((current - previous) / previous) * 100);
}

function wowDeltaWithMomentum(
  current: number,
  previous: number | null,
  history: number[],
  rankDelta = 0,
): { value: number | null; status: "changed" | "unchanged" | "insufficient_data" } {
  void history;
  void rankDelta;

  if (current <= 0 || previous === null || previous <= 0) {
    return { value: null, status: "insufficient_data" };
  }

  const directDelta = percentDelta(current, previous);
  if (directDelta === null) {
    return { value: null, status: "insufficient_data" };
  }

  if (directDelta === 0) {
    return { value: 0, status: "unchanged" };
  }

  return { value: directDelta, status: "changed" };
}

function isoDateOnly(value: string): string {
  return value.slice(0, 10);
}

function sourceRowsByInstitution(rawSources: RawSourceSnapshot): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];

  const hudItems = safeRecords(rawSources.hud_homestore?.data);
  if (hudItems.length > 0) {
    const total = hudItems.reduce(
      (sum, item) => sum + (numericValue(item.total_listings) ?? 0),
      0,
    );
    const leadState =
      [...hudItems].sort(
        (left, right) =>
          (numericValue(right.total_listings) ?? 0) - (numericValue(left.total_listings) ?? 0),
      )[0] ?? {};

    rows.push({
      name: "HUD",
      count: total,
      top_state: textValue(leadState.state, "National"),
    });
  }

  const homeStepsItems = safeRecords(rawSources.homesteps?.data);
  if (homeStepsItems.length > 0) {
    const total = homeStepsItems.reduce(
      (sum, item) => sum + (numericValue(item.total_listings) ?? 0),
      0,
    );
    const leadMarket =
      [...homeStepsItems].sort(
        (left, right) =>
          (numericValue(right.total_listings) ?? 0) - (numericValue(left.total_listings) ?? 0),
      )[0] ?? {};

    rows.push({
      name: "Freddie Mac / HomeSteps",
      count: total,
      top_state: textValue(leadMarket.state, "National"),
    });
  }

  const boaItems = safeRecords(rawSources.bank_of_america_reo?.data);
  if (boaItems.length > 0) {
    const total = boaItems.reduce(
      (sum, item) => sum + (numericValue(item.listing_signal_count, item.city_count) ?? 0),
      0,
    );
    const leadState =
      [...boaItems].sort(
        (left, right) =>
          (numericValue(right.listing_signal_count, right.city_count) ?? 0) -
          (numericValue(left.listing_signal_count, left.city_count) ?? 0),
      )[0] ?? {};

    rows.push({
      name: "Bank of America",
      count: total,
      top_state: textValue(leadState.state, "National"),
    });
  }

  const homePathItems = safeRecords(rawSources.homepath?.data);
  if (homePathItems.length > 0) {
    rows.push({
      name: "Fannie Mae / HomePath",
      count: homePathItems.length,
      top_state: textValue(
        ...homePathItems.map((item) => item.state),
        "National",
      ),
    });
  }

  const freeListingInstitutionRows = [
    { key: "auction_com", name: "Auction.com" },
    { key: "hubzu", name: "Hubzu" },
    { key: "xome", name: "Xome" },
    { key: "attom_data", name: "ATTOM Data" },
    { key: "ice_mortgage_tech", name: "ICE Mortgage Tech" },
    { key: "reox_directory", name: "REOX Directory" },
    { key: "realtor_foreclosure", name: "Realtor.com" },
    { key: "redfin_foreclosure", name: "Redfin" },
    { key: "wells_fargo_reo", name: "Wells Fargo" },
    { key: "chase_reo", name: "Chase" },
    { key: "us_bank_reo", name: "US Bank" },
    { key: "mr_cooper_reo", name: "Mr. Cooper" },
    { key: "phh_mortgage_reo", name: "PHH Mortgage" },
    { key: "newrez_shellpoint_reo", name: "NewRez / Shellpoint" },
    { key: "selene_finance_reo", name: "Selene Finance" },
    { key: "carrington_reo", name: "Carrington Mortgage" },
  ];

  for (const lane of freeListingInstitutionRows) {
    const items = safeRecords(rawSources[lane.key]?.data);
    if (items.length === 0) {
      continue;
    }

    const total = items.reduce(
      (sum, item) =>
        sum + (numericValue(item.listing_signal_count, item.total_listings, item.city_count) ?? 0),
      0,
    );
    const leadState =
      [...items].sort(
        (left, right) =>
          (numericValue(right.listing_signal_count, right.total_listings, right.city_count) ?? 0) -
          (numericValue(left.listing_signal_count, left.total_listings, left.city_count) ?? 0),
      )[0] ?? {};

    rows.push({
      name: lane.name,
      count: total,
      top_state: textValue(leadState.state, "National"),
    });
  }

  return rows
    .filter((row) => (numericValue(row.count) ?? 0) > 0)
    .sort((left, right) => (numericValue(right.count) ?? 0) - (numericValue(left.count) ?? 0))
    .slice(0, 6);
}

function sourceRowsByMarket(rawSources: RawSourceSnapshot): Array<Record<string, unknown>> {
  const marketMap = new Map<
    string,
    {
      name: string;
      count: number;
      metro: string;
      state: string;
    }
  >();

  const hudItems = safeRecords(rawSources.hud_homestore?.data);
  for (const stateItem of hudItems) {
    const totalListings = numericValue(stateItem.total_listings) ?? 0;
    const sampleListings = safeRecords(stateItem.sample_listings);
    const weight = sampleListings.length > 0 ? Math.max(1, totalListings / sampleListings.length) : 1;

    for (const listing of sampleListings) {
      const county = textValue(listing.county);
      const state = textValue(listing.state, stateItem.state);
      const city = textValue(listing.city);
      const name = county ? `${county}, ${state}` : textValue(city, state, "Market");
      const metro = city ? `${city} Metro` : county ? `${state} market` : "Active market";
      const existing = marketMap.get(name) ?? { name, count: 0, metro, state };
      existing.count += weight;
      marketMap.set(name, existing);
    }
  }

  const zillowItems = safeRecords(rawSources.zillow_rapidapi?.data);
  for (const property of zillowItems) {
    const county = textValue(property.county);
    const state = textValue(property.state);
    const city = textValue(property.city);
    if (!county && !city && !state) {
      continue;
    }

    const name = county ? `${county}, ${state}` : textValue(city, state, "Tracked market");
    const metro = city ? `${city} Metro` : county ? `${state} market` : "Tracked market";
    const existing = marketMap.get(name) ?? { name, count: 0, metro, state };
    existing.count += 1;
    marketMap.set(name, existing);
  }

  const freeListingMarketKeys = [
    "auction_com",
    "hubzu",
    "xome",
    "attom_data",
    "ice_mortgage_tech",
    "reox_directory",
    "realtor_foreclosure",
    "redfin_foreclosure",
    "wells_fargo_reo",
    "chase_reo",
    "us_bank_reo",
    "mr_cooper_reo",
    "phh_mortgage_reo",
    "newrez_shellpoint_reo",
    "selene_finance_reo",
    "carrington_reo",
  ];

  for (const key of freeListingMarketKeys) {
    const sourceItems = safeRecords(rawSources[key]?.data);
    for (const sourceItem of sourceItems) {
      const sampleListings = safeRecords(sourceItem.sample_listings);
      const listingSignals = Math.max(
        1,
        numericValue(sourceItem.listing_signal_count, sourceItem.total_listings, sourceItem.city_count) ?? 1,
      );
      const weight = sampleListings.length > 0 ? Math.max(1, listingSignals / sampleListings.length) : 1;

      for (const listing of sampleListings) {
        const state = textValue(listing.state, sourceItem.state, "National");
        const city = textValue(listing.city);
        const name = city ? `${city}, ${state}` : textValue(sourceItem.source_name, state, "Market");
        const metro = city
          ? `${city} Metro`
          : `${textValue(sourceItem.source_name, "Listing")} signal`;
        const existing = marketMap.get(name) ?? { name, count: 0, metro, state };
        existing.count += weight;
        marketMap.set(name, existing);
      }
    }
  }

  if (marketMap.size < 5) {
    const fallbackRecords = [
      ...safeRecords(rawSources.homesteps?.data).map((item) => ({
        name: textValue(item.market, item.state, "HomeSteps market"),
        count: numericValue(item.total_listings) ?? 0,
        metro: `${textValue(item.market, item.state, "HomeSteps")} inventory`,
        state: textValue(item.state),
      })),
      ...safeRecords(rawSources.bank_of_america_reo?.data).map((item) => ({
        name: textValue(item.state, "Bank of America"),
        count: numericValue(item.listing_signal_count, item.city_count) ?? 0,
        metro: "Bank of America REO",
        state: textValue(item.state),
      })),
    ];

    for (const fallback of fallbackRecords) {
      if (!fallback.name || fallback.count <= 0 || marketMap.has(fallback.name)) {
        continue;
      }
      marketMap.set(fallback.name, fallback);
    }
  }

  return [...marketMap.values()]
    .sort((left, right) => right.count - left.count)
    .slice(0, 5)
    .map((item) => ({
      name: item.name,
      count: Math.round(item.count),
      metro: item.metro,
      state: item.state,
    }));
}

function buildMarketPulseMetadata(
  rawSources: RawSourceSnapshot,
  rawSections: RawSectionSnapshot,
): Record<string, unknown> {
  const marketPulseItems = safeRecords(rawSections.market_pulse?.data);

  const totalInventory = marketPulseItems.reduce(
    (sum, item) =>
      sum +
      (numericValue(item.total_listings, item.listing_signal_count) ?? 0),
    0,
  );

  const sourceCards = marketPulseItems
    .map((item) => {
      const source = textValue(item.institution, item.source, "Source");
      const value =
        numericValue(item.total_listings, item.listing_signal_count, item.article_count) ?? 0;
      const detail = uniqueTextValues([
        `${numericValue(item.state_count) ?? 0} states`,
        `${numericValue(item.market_count) ?? 0} markets`,
        `${numericValue(item.city_count) ?? 0} cities`,
      ])
        .filter((entry) => !entry.startsWith("0 "))
        .join(" · ");

      return {
        source,
        value,
        detail,
      };
    })
    .filter((item) => item.value > 0)
    .slice(0, 4);

  const geographyRows = [
    ...safeRecords(rawSources.hud_homestore?.data).map((item) => ({
      label: textValue(item.state, "HUD market"),
      value: numericValue(item.total_listings) ?? 0,
      sublabel: "HUD Home Store",
    })),
    ...safeRecords(rawSources.homesteps?.data).map((item) => ({
      label: textValue(item.market, item.state, "HomeSteps market"),
      value: numericValue(item.total_listings) ?? 0,
      sublabel: "HomeSteps",
    })),
    ...safeRecords(rawSources.bank_of_america_reo?.data).map((item) => ({
      label: textValue(item.state, "Bank of America"),
      value: numericValue(item.listing_signal_count, item.city_count) ?? 0,
      sublabel: "Bank of America REO",
    })),
    ...[
      { key: "auction_com", label: "Auction.com" },
      { key: "hubzu", label: "Hubzu" },
      { key: "xome", label: "Xome" },
      { key: "attom_data", label: "ATTOM Data" },
      { key: "ice_mortgage_tech", label: "ICE Mortgage Tech" },
      { key: "reox_directory", label: "REOX Directory" },
      { key: "realtor_foreclosure", label: "Realtor.com Foreclosures" },
      { key: "redfin_foreclosure", label: "Redfin Foreclosures" },
      { key: "wells_fargo_reo", label: "Wells Fargo REO" },
      { key: "chase_reo", label: "Chase REO" },
      { key: "us_bank_reo", label: "US Bank REO" },
      { key: "mr_cooper_reo", label: "Mr. Cooper" },
      { key: "phh_mortgage_reo", label: "PHH Mortgage" },
      { key: "newrez_shellpoint_reo", label: "NewRez / Shellpoint" },
      { key: "selene_finance_reo", label: "Selene Finance" },
      { key: "carrington_reo", label: "Carrington Mortgage" },
    ].flatMap((lane) =>
      safeRecords(rawSources[lane.key]?.data).map((item) => ({
        label: textValue(item.state, lane.label),
        value: numericValue(item.listing_signal_count, item.total_listings, item.city_count) ?? 0,
        sublabel: lane.label,
      })),
    ),
  ]
    .filter((item) => item.value > 0)
    .sort((left, right) => right.value - left.value)
    .slice(0, 5);

  return {
    layout: "market_overview",
    eyebrow: "Market Pulse",
    headline: "Where Distressed Inventory Is Building",
    stat_cards: [
      {
        label: "Tracked inventory",
        value: totalInventory,
        detail: "Official listing and signal count",
      },
      {
        label: "Institutions",
        value: sourceRowsByInstitution(rawSources).length,
        detail: "Banks, GSEs, and agencies active now",
      },
      {
        label: "Counties / markets",
        value: sourceRowsByMarket(rawSources).length,
        detail: "Ranked hot spots this cycle",
      },
      {
        label: "News signals",
        value: safeRecords(rawSections.industry_news?.data).length,
        detail: "Relevant market stories reviewed",
      },
    ],
    source_cards: sourceCards,
    geography_rows: geographyRows,
  };
}

function buildIndustryNewsMetadata(rawSections: RawSectionSnapshot): Record<string, unknown> {
  const items = safeRecords(rawSections.industry_news?.data);
  const seen = new Set<string>();
  const stories = items
    .filter((item) => {
      const title = textValue(item.title);
      const url = textValue(item.url);
      const source = textValue(item.source_name, item.feed);
      if (!title || !url || !source) {
        return false;
      }
      const key = `${title.toLowerCase()}|${url.toLowerCase()}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, 6)
    .map((item) => ({
      title: textValue(item.title),
      source: textValue(item.source_name, item.feed),
      published_at: textValue(item.published_at),
      url: textValue(item.url),
      detail: textValue(item.description, item.content_preview),
    }));

  const sourceCounts = new Map<string, number>();
  for (const item of items) {
    const source = textValue(item.source_name, item.feed);
    if (!source) {
      continue;
    }
    sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
  }

  const source_rows = [...sourceCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([source, count]) => ({ source, count }));

  return {
    layout: "news_digest",
    eyebrow: "Industry News",
    headline: "What Changed Across Foreclosure and REO This Week",
    stories,
    source_rows,
  };
}

function buildHiringMetadata(rawSections: RawSectionSnapshot): Record<string, unknown> {
  const items = safeRecords(rawSections.bank_hiring_intel?.data);
  const summary =
    items.find((item) => textValue(item.source) === "bank_hiring_intel") ??
    items[0] ??
    {};

  const employers = safeRecords(summary.top_employers)
    .slice(0, 6)
    .map((item) => ({
      company: textValue(item.company, "Employer"),
      total_jobs: numericValue(item.total_jobs) ?? 0,
      sample_roles: uniqueTextValues(safeTextArray(item.sample_roles)),
      sample_job_urls: uniqueTextValues(safeTextArray(item.job_urls)),
      locations: uniqueTextValues(safeTextArray(item.locations)),
      hiring_focus: uniqueTextValues(safeTextArray(item.hiring_focus)),
    }));

  const focusCounts = new Map<string, number>();
  for (const employer of employers) {
    for (const focus of safeTextArray(employer.hiring_focus)) {
      if (!focus) {
        continue;
      }
      focusCounts.set(focus, (focusCounts.get(focus) ?? 0) + 1);
    }
  }

  const focus_rows = [...focusCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([focus, count]) => ({ focus, count }));

  return {
    layout: "hiring_dashboard",
    eyebrow: "Bank Hiring Intel",
    headline: "Who Is Staffing Up Across Default and REO",
    total_jobs: numericValue(summary.total_jobs) ?? 0,
    employer_count: employers.length,
    employers,
    focus_rows,
  };
}

function buildSpotlightMetadata(): Record<string, unknown> {
  return {
    layout: "service_spotlight",
    eyebrow: "UFS Spotlight",
    headline: "Field Coverage Built for Distressed Asset Workflows",
    bullets: [
      "Property inspections and occupancy checks that keep assignments moving.",
      "Maintenance and preservation order support for banks, servicers, and asset managers.",
      "Nationwide field execution designed to reduce delays between claim, valuation, and disposition.",
    ],
    cta_label: "Log In and Update Your Profile",
    cta_url: "https://clients.unitedffs.com/register/client",
  };
}

function buildStructuredSectionMetadata(
  rawSources: RawSourceSnapshot,
  rawSections: RawSectionSnapshot,
  previousSources?: RawSourceSnapshot,
  historicalSources: RawSourceSnapshot[] = [],
  insightsUrls?: {
    listings?: string;
    pulse?: string;
    news?: string;
    hiring?: string;
  },
): Record<string, Record<string, unknown>> {
  const defaultInsightsUrl = "https://clients.unitedffs.com/register/client";
  const listingsCtaUrl = insightsUrls?.listings ?? defaultInsightsUrl;
  const pulseCtaUrl = insightsUrls?.pulse ?? listingsCtaUrl;
  const newsCtaUrl = insightsUrls?.news ?? listingsCtaUrl;
  const hiringCtaUrl = insightsUrls?.hiring ?? listingsCtaUrl;
  const currentBankRows = sourceRowsByInstitution(rawSources);
  const previousBankRows = sourceRowsByInstitution(previousSources ?? {});
  const previousBankMap = new Map(
    previousBankRows.map((row) => [textValue(row.name), numericValue(row.count) ?? 0]),
  );
  const previousBankRank = new Map(
    previousBankRows.map((row, index) => [textValue(row.name), index]),
  );
  const bankHistoryMap = new Map<string, number[]>();
  for (const snapshot of historicalSources) {
    for (const row of sourceRowsByInstitution(snapshot)) {
      const name = textValue(row.name);
      if (!name) {
        continue;
      }
      if (!bankHistoryMap.has(name)) {
        bankHistoryMap.set(name, []);
      }
      bankHistoryMap.get(name)?.push(numericValue(row.count) ?? 0);
    }
  }

  const currentMarketRows = sourceRowsByMarket(rawSources);
  const previousMarketRows = sourceRowsByMarket(previousSources ?? {});
  const previousMarketMap = new Map(
    previousMarketRows.map((row) => [textValue(row.name), numericValue(row.count) ?? 0]),
  );
  const previousMarketRank = new Map(
    previousMarketRows.map((row, index) => [textValue(row.name), index]),
  );
  const marketHistoryMap = new Map<string, number[]>();
  for (const snapshot of historicalSources) {
    for (const row of sourceRowsByMarket(snapshot)) {
      const name = textValue(row.name);
      if (!name) {
        continue;
      }
      if (!marketHistoryMap.has(name)) {
        marketHistoryMap.set(name, []);
      }
      marketHistoryMap.get(name)?.push(numericValue(row.count) ?? 0);
    }
  }

  return {
    market_pulse: {
      ...buildMarketPulseMetadata(rawSources, rawSections),
      cta_label: "More Pulse \u2192",
      cta_url: pulseCtaUrl,
    },
    top_banks: {
      layout: "bank_table",
      eyebrow: "Top Banks Listing",
      headline: "Who's Moving This Week",
      cta_label: "Full Bank Rankings \u2192",
      cta_url: listingsCtaUrl,
      rows: currentBankRows.map((row, index) => {
        const name = textValue(row.name);
        const count = numericValue(row.count) ?? 0;
        const rankDelta = (previousBankRank.get(name) ?? index) - index;
        const wow = wowDeltaWithMomentum(
          count,
          previousBankMap.get(name) ?? null,
          bankHistoryMap.get(name) ?? [],
          rankDelta,
        );
        return {
          ...row,
          wow_delta_pct: wow.value,
          wow_delta_status: wow.status,
        };
      }),
    },
    hot_markets: {
      layout: "county_rankings",
      eyebrow: "Hot Markets",
      headline: "Top 5 Counties This Week",
      cta_label: "More Listings \u2192",
      cta_url: listingsCtaUrl,
      rows: currentMarketRows.map((row, index) => {
        const name = textValue(row.name);
        const count = numericValue(row.count) ?? 0;
        const rankDelta = (previousMarketRank.get(name) ?? index) - index;
        const wow = wowDeltaWithMomentum(
          count,
          previousMarketMap.get(name) ?? null,
          marketHistoryMap.get(name) ?? [],
          rankDelta,
        );
        return {
          ...row,
          rank: index + 1,
          wow_delta_pct: wow.value,
          wow_delta_status: wow.status,
        };
      }),
    },
    industry_news: {
      ...buildIndustryNewsMetadata(rawSections),
      cta_label: "Read More \u2192",
      cta_url: newsCtaUrl,
    },
    bank_hiring_intel: {
      ...buildHiringMetadata(rawSections),
      cta_label: "Open Employers Hub \u2192",
      cta_url: hiringCtaUrl,
    },
    ufs_spotlight: buildSpotlightMetadata(),
  };
}

function previousRawSourcesForNewsletter(
  db: DatabaseRecord,
  newsletterId: number,
): RawSourceSnapshot | undefined {
  const currentNewsletter = db.newsletters.find((item) => item.id === newsletterId);
  if (!currentNewsletter) {
    return undefined;
  }

  const currentDate = isoDateOnly(currentNewsletter.issue_date);
  const previousNewsletters = [...db.newsletters]
    .filter((item) => item.issue_number < currentNewsletter.issue_number)
    .sort((left, right) => right.issue_number - left.issue_number);

  const previousDifferentDay = previousNewsletters.filter(
    (item) => isoDateOnly(item.issue_date) < currentDate,
  );

  const candidates =
    previousDifferentDay.length > 0 ? previousDifferentDay : previousNewsletters;

  for (const newsletter of candidates) {
    const draft = getLatestDraftForNewsletter(db, newsletter.id);
    const rawSources = draft?.raw_data?.sources as RawSourceSnapshot | undefined;
    if (rawSources) {
      return rawSources;
    }
  }

  return undefined;
}

function historicalRawSourcesForNewsletter(
  db: DatabaseRecord,
  newsletterId: number,
  limit = 6,
): RawSourceSnapshot[] {
  const currentNewsletter = db.newsletters.find((item) => item.id === newsletterId);
  if (!currentNewsletter) {
    return [];
  }

  const previousNewsletters = [...db.newsletters]
    .filter((item) => item.issue_number < currentNewsletter.issue_number)
    .sort((left, right) => right.issue_number - left.issue_number)
    .slice(0, limit);

  const snapshots: RawSourceSnapshot[] = [];

  for (const newsletter of previousNewsletters) {
    const draft = getLatestDraftForNewsletter(db, newsletter.id);
    const rawSources = draft?.raw_data?.sources as RawSourceSnapshot | undefined;
    if (rawSources) {
      snapshots.push(rawSources);
    }
  }

  return snapshots;
}

function decorateDraftSections(
  sections: DraftSection[],
  rawSources: RawSourceSnapshot,
  rawSections: RawSectionSnapshot,
  previousSources?: RawSourceSnapshot,
  historicalSources: RawSourceSnapshot[] = [],
  insightsUrls?: {
    listings?: string;
    pulse?: string;
    news?: string;
    hiring?: string;
  },
): DraftSection[] {
  const metadataBySection = buildStructuredSectionMetadata(
    rawSources,
    rawSections,
    previousSources,
    historicalSources,
    insightsUrls,
  );

  return sections.map((section) => ({
    ...section,
    metadata:
      metadataBySection[section.section_type] ?? section.metadata ?? undefined,
  }));
}

function publicBaseUrl(): string {
  const settings = getSettings();
  return settings.appPublicUrl.replace(/\/$/, "");
}

export async function runPipeline(force = false): Promise<Record<string, unknown>> {
  await appendWorkflowLog({
    scope: "pipeline",
    step: "pipeline.start",
    status: "info",
    message: force ? "Starting forced pipeline run." : "Starting pipeline run.",
  });

  try {
    const { rawData, sourcesUsed, sourcesWarning, sourcesFailed } = await collectAllSources();
    const sectionData = aggregateForSections(rawData);
    const currentIso = nowIso();
    const today = currentIso.slice(0, 10);

    await appendWorkflowLog({
      scope: "pipeline",
      step: "pipeline.sources_complete",
      status: sourcesFailed.length > 0 || sourcesWarning.length > 0 ? "warning" : "success",
      message: `Source collection finished. ${sourcesUsed.length} live, ${sourcesWarning.length} degraded, ${sourcesFailed.length} failed.`,
      context: {
        sources_used: sourcesUsed,
        sources_warning: sourcesWarning,
        sources_failed: sourcesFailed,
      },
    });

    const result = await withDatabase((db) => {
      const lastNewsletter = [...db.newsletters].sort(
        (left, right) => right.issue_number - left.issue_number,
      )[0];

      if (
        !force &&
        lastNewsletter &&
        lastNewsletter.issue_date.slice(0, 10) === today &&
        lastNewsletter.status === "draft"
      ) {
        const existingDraft = getLatestDraftForNewsletter(db, lastNewsletter.id);
        if (existingDraft) {
          if (hasProtectedDraftWork(existingDraft)) {
            return {
              newsletter_id: lastNewsletter.id,
              issue_number: lastNewsletter.issue_number,
              draft_id: existingDraft.id,
              sources_used: existingDraft.sources_used ?? [],
              sources_warning: existingDraft.sources_warning ?? [],
              sources_failed: existingDraft.sources_failed ?? [],
              reused_existing: true,
              preserved_existing: true,
              message:
                `Issue #${lastNewsletter.issue_number} already has generated or reviewed draft work. ` +
                "Current draft was preserved. Use force=true on the pipeline endpoint if you intentionally want a refresh.",
            };
          }

          existingDraft.raw_data = { sources: rawData, sections: sectionData };
          existingDraft.ai_draft = {};
          existingDraft.human_edits = null;
          existingDraft.status = "pending";
          existingDraft.reviewer_email = null;
          existingDraft.reviewed_at = null;
          existingDraft.sources_used = sourcesUsed;
          existingDraft.sources_warning = sourcesWarning;
          existingDraft.sources_failed = sourcesFailed;
          existingDraft.updated_at = currentIso;

          return {
            newsletter_id: lastNewsletter.id,
            issue_number: lastNewsletter.issue_number,
            draft_id: existingDraft.id,
            sources_used: sourcesUsed,
            sources_warning: sourcesWarning,
            sources_failed: sourcesFailed,
            reused_existing: true,
            message: `Pipeline refreshed existing issue #${lastNewsletter.issue_number}. ${sourcesUsed.length} live, ${sourcesWarning.length} degraded, ${sourcesFailed.length} failed.`,
          };
        }
      }

      const nextIssueNumber = lastNewsletter ? lastNewsletter.issue_number + 1 : 1;
      const newsletter: NewsletterRecord = {
        id: nextId(db.newsletters),
        issue_number: nextIssueNumber,
        issue_date: currentIso,
        status: "draft",
        mailchimp_campaign_id: null,
        created_at: currentIso,
        updated_at: currentIso,
      };
      db.newsletters.push(newsletter);

      const draft: DraftRecord = {
        id: nextId(db.drafts),
        newsletter_id: newsletter.id,
        raw_data: { sources: rawData, sections: sectionData },
        ai_draft: {},
        human_edits: null,
        status: "pending",
        reviewer_email: null,
        reviewed_at: null,
        sources_used: sourcesUsed,
        sources_warning: sourcesWarning,
        sources_failed: sourcesFailed,
        created_at: currentIso,
        updated_at: currentIso,
      };
      db.drafts.push(draft);

      return {
        newsletter_id: newsletter.id,
        issue_number: newsletter.issue_number,
        draft_id: draft.id,
        sources_used: sourcesUsed,
        sources_warning: sourcesWarning,
        sources_failed: sourcesFailed,
        reused_existing: false,
        message: `Pipeline complete. ${sourcesUsed.length} live, ${sourcesWarning.length} degraded, ${sourcesFailed.length} failed.`,
      };
    });

    await appendWorkflowLog({
      scope: "pipeline",
      step: result.preserved_existing
        ? "pipeline.preserved_issue"
        : result.reused_existing
          ? "pipeline.refreshed_issue"
          : "pipeline.created_issue",
      status: result.preserved_existing ? "warning" : "success",
      message: result.message,
      context: {
        newsletter_id: result.newsletter_id,
        issue_number: result.issue_number,
        draft_id: result.draft_id,
      },
    });

    return result;
  } catch (error) {
    await appendWorkflowLog({
      scope: "pipeline",
      step: "pipeline.failed",
      status: "error",
      message: `Pipeline failed: ${error instanceof Error ? error.message : "unknown error"}`,
    });
    throw error;
  }
}

export async function listDrafts(status?: DraftStatus): Promise<Array<Record<string, unknown>>> {
  const db = await readDatabase();
  return db.drafts
    .filter((draft) => (status ? draft.status === status : true))
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
    .map((draft) => serializeDraft(draft, db));
}

export async function getDraft(draftId: number): Promise<Record<string, unknown>> {
  const db = await readDatabase();
  const draft = db.drafts.find((item) => item.id === draftId);
  if (!draft) {
    notFound("Draft not found");
  }

  return serializeDraft(draft, db);
}

export async function updateDraft(
  draftId: number,
  update: {
    human_edits?: { sections: DraftSection[] } | null;
    status?: DraftStatus;
    reviewer_email?: string;
    notes?: string;
  },
): Promise<Record<string, unknown>> {
  const allowedStatuses: DraftStatus[] = [
    "pending",
    "approved",
    "rejected",
    "changes_requested",
  ];

  if (update.status && !allowedStatuses.includes(update.status)) {
    badRequest("Invalid draft status");
  }

  const result = await withDatabase((db) => {
    const draft = db.drafts.find((item) => item.id === draftId);
    if (!draft) {
      notFound("Draft not found");
    }

    if (update.human_edits !== undefined) {
      draft.human_edits = update.human_edits;
    }

    if (update.status) {
      const newsletter = db.newsletters.find((item) => item.id === draft.newsletter_id);
      if (!newsletter) {
        notFound("Newsletter not found for draft");
      }

      draft.status = update.status;
      draft.reviewed_at = nowIso();
      if (update.reviewer_email) {
        draft.reviewer_email = update.reviewer_email;
      }

      if (update.status === "approved") {
        newsletter.status = "approved";
      } else if (!["scheduled", "sent"].includes(newsletter.status)) {
        newsletter.status = "draft";
      }
      newsletter.updated_at = nowIso();

      const actionMap: Record<DraftStatus, ApprovalAction | null> = {
        pending: null,
        approved: "approve",
        rejected: "reject",
        changes_requested: "request_changes",
      };
      const action = actionMap[update.status];
      if (action) {
        const log: ApprovalLogRecord = {
          id: nextId(db.approval_logs),
          draft_id: draft.id,
          action,
          reviewer: update.reviewer_email || "unknown",
          notes: update.notes ?? null,
          timestamp: nowIso(),
        };
        db.approval_logs.push(log);
      }
    }

    draft.updated_at = nowIso();
    return serializeDraft(draft, db);
  });

  await appendWorkflowLog({
    scope: "review",
    step: update.status ? `draft.${update.status}` : "draft.saved",
    status: update.status === "rejected" ? "warning" : "success",
    message: update.status
      ? `Draft ${draftId} marked as ${update.status.replaceAll("_", " ")}.`
      : `Draft ${draftId} edits saved.`,
    context: {
      draft_id: draftId,
      reviewer_email: update.reviewer_email ?? null,
    },
  });

  return result;
}

export async function generateDraftForNewsletter(
  newsletterId: number,
  options?: {
    baseUrl?: string;
  },
): Promise<Record<string, unknown>> {
  await appendWorkflowLog({
    scope: "drafting",
    step: "draft.generate",
    status: "info",
    message: `Generating AI draft for newsletter ${newsletterId}.`,
    context: {
      newsletter_id: newsletterId,
    },
  });

  try {
    const snapshot = await readDatabase();
    const draft = getLatestDraftForNewsletter(snapshot, newsletterId);
    if (!draft) {
      notFound("No draft found for this newsletter. Run pipeline first.");
    }
    if (!draft.raw_data) {
      badRequest("No raw data collected. Run pipeline first.");
    }

    const aiDraft = await generateAiDraft(draft.raw_data);
    const rawSources = (draft.raw_data.sources as RawSourceSnapshot | undefined) ?? {};
    const rawSections =
      (draft.raw_data.sections as RawSectionSnapshot | undefined) ?? {};
    const previousSources = previousRawSourcesForNewsletter(snapshot, newsletterId);
    const historicalSources = historicalRawSourcesForNewsletter(snapshot, newsletterId, 6);
    const baseUrl =
      options?.baseUrl && /^https?:\/\//i.test(options.baseUrl)
        ? options.baseUrl.replace(/\/$/, "")
        : publicBaseUrl();
    const insightsUrls = {
      listings: `${baseUrl}/insights/listings/${draft.id}?tab=listings`,
      pulse: `${baseUrl}/insights/listings/${draft.id}?tab=pulse`,
      news: `${baseUrl}/insights/news/${draft.id}`,
      hiring: `${baseUrl}/insights/listings/${draft.id}?tab=employers`,
    };
    const aiSections = decorateDraftSections(
      getSections(aiDraft),
      rawSources,
      rawSections,
      previousSources,
      historicalSources,
      insightsUrls,
    );
    const decoratedDraft = {
      ...aiDraft,
      sections: aiSections,
    };

    await withDatabase((db) => {
      const stored = db.drafts.find((item) => item.id === draft.id);
      if (!stored) {
        notFound("Draft not found");
      }
      stored.ai_draft = decoratedDraft;
      stored.updated_at = nowIso();
    });

    const sections = aiSections;
    if (sections.length > 0) {
      await sendReviewNotification(draft.id, issueNumberForDraft(draft, snapshot), sections);
    }

    await appendWorkflowLog({
      scope: "drafting",
      step: "draft.generate",
      status: sections.length > 0 ? "success" : "warning",
      message:
        sections.length > 0
          ? `AI draft generated with ${sections.length} sections.`
          : "AI draft generation finished but no sections were produced.",
      context: {
        newsletter_id: newsletterId,
        draft_id: draft.id,
        section_count: sections.length,
      },
    });

    return getDraft(draft.id);
  } catch (error) {
    await appendWorkflowLog({
      scope: "drafting",
      step: "draft.generate",
      status: "error",
      message: `AI draft generation failed: ${error instanceof Error ? error.message : "unknown error"}`,
      context: {
        newsletter_id: newsletterId,
      },
    });
    throw error;
  }
}

export async function publishArticlesForNewsletter(
  newsletterId: number,
): Promise<{ published: number; titles: string[]; article_urls: string[] }> {
  await appendWorkflowLog({
    scope: "publishing",
    step: "articles.publish",
    status: "info",
    message: `Publishing article pages for newsletter ${newsletterId}.`,
    context: {
      newsletter_id: newsletterId,
    },
  });

  try {
    const result = await withDatabase((db) => {
      const draft = getLatestDraftForNewsletter(db, newsletterId);
      if (!draft || draft.status !== "approved") {
        badRequest("No approved draft for this newsletter");
      }

      const content = draft.human_edits ?? (draft.ai_draft as Record<string, unknown>);
      const sections = getSections(content);
      if (sections.length === 0) {
        badRequest("Approved draft has no sections to publish");
      }

      db.articles = db.articles.filter((article) => article.newsletter_id !== newsletterId);

      const publishedAt = nowIso();
      const articles: ArticleRecord[] = sections.map((section) => {
        const id = nextId(db.articles);
        const article: ArticleRecord = {
          id,
          newsletter_id: newsletterId,
          section_type: section.section_type,
          title: section.title,
          teaser: section.teaser,
          body: section.body,
          audience_tag: section.audience_tag ?? "REO",
          publish_date: publishedAt,
          ms_platform_url: `${publicBaseUrl()}/api/articles/public/${id}`,
          created_at: publishedAt,
        };
        db.articles.push(article);
        return article;
      });

      return {
        published: articles.length,
        titles: articles.map((article) => article.title),
        article_urls: articles.map((article) => article.ms_platform_url ?? ""),
      };
    });

    await appendWorkflowLog({
      scope: "publishing",
      step: "articles.publish",
      status: "success",
      message: `Published ${result.published} article pages.`,
      context: {
        newsletter_id: newsletterId,
        article_count: result.published,
      },
    });

    return result;
  } catch (error) {
    await appendWorkflowLog({
      scope: "publishing",
      step: "articles.publish",
      status: "error",
      message: `Article publishing failed: ${error instanceof Error ? error.message : "unknown error"}`,
      context: {
        newsletter_id: newsletterId,
      },
    });
    throw error;
  }
}

export async function listArticles(newsletterId: number): Promise<Array<Record<string, unknown>>> {
  const db = await readDatabase();
  return db.articles
    .filter((article) => article.newsletter_id === newsletterId)
    .map((article) => ({
      id: article.id,
      section_type: article.section_type,
      title: article.title,
      teaser: article.teaser,
      body: article.body,
      audience_tag: article.audience_tag,
      publish_date: article.publish_date,
      article_url: article.ms_platform_url,
    }));
}

export async function getPublicArticleMarkup(articleId: number): Promise<string> {
  const db = await readDatabase();
  const article = db.articles.find((item) => item.id === articleId);
  if (!article) {
    notFound("Article not found");
  }

  const newsletter = db.newsletters.find((item) => item.id === article.newsletter_id);
  const issueNumber = newsletter?.issue_number ?? article.newsletter_id;
  const publishDate = article.publish_date
    ? new Date(article.publish_date).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "Unpublished";

  const bodyHtml = article.body
    .split(/\n\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p style="margin:0 0 22px;">${paragraph}</p>`)
    .join("");

  return `
    <html>
      <head>
        <title>${article.title} | The Disposition Desk</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body style="margin:0;background:#f4efe6;color:#17161d;font-family:Georgia,serif;">
        <div style="max-width:760px;margin:0 auto;padding:48px 24px;">
          <div style="margin-bottom:32px;padding:28px 32px;background:#10222d;color:#f8f3ea;border-radius:24px;">
            <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.72;">The Disposition Desk</div>
            <h1 style="margin:14px 0 10px;font-size:40px;line-height:1.05;">${article.title}</h1>
            <p style="margin:0;font-size:18px;line-height:1.6;color:#d4dde1;">${article.teaser}</p>
          </div>
          <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:28px;font-family:Arial,sans-serif;">
            <span style="padding:8px 12px;border-radius:999px;background:#eadbc8;color:#6a4e2f;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;">Issue #${issueNumber}</span>
            <span style="padding:8px 12px;border-radius:999px;background:#dce6ea;color:#214555;font-size:12px;">Published ${publishDate}</span>
            <span style="padding:8px 12px;border-radius:999px;background:#efe7d8;color:#705c3d;font-size:12px;">Audience ${article.audience_tag}</span>
          </div>
          <article style="background:#fffdf8;border-radius:24px;padding:32px;box-shadow:0 24px 60px rgba(16,34,45,0.08);font-size:18px;line-height:1.85;">
            ${bodyHtml}
          </article>
        </div>
      </body>
    </html>
  `;
}

export async function listNewsletters(): Promise<NewsletterRecord[]> {
  const db = await readDatabase();
  return [...db.newsletters].sort((left, right) => right.issue_date.localeCompare(left.issue_date));
}

export async function scheduleNewsletterSend(
  newsletterId: number,
): Promise<{
  status: string;
  campaign_id: string;
  article_count?: number;
  preview_sent?: boolean;
  message?: string;
}> {
  await appendWorkflowLog({
    scope: "delivery",
    step: "newsletter.schedule",
    status: "info",
    message: `Scheduling newsletter ${newsletterId} for send.`,
    context: {
      newsletter_id: newsletterId,
    },
  });

  try {
    const snapshot = await readDatabase();
    const newsletter = snapshot.newsletters.find((item) => item.id === newsletterId);
    if (!newsletter) {
      notFound("Newsletter not found");
    }

    const draft = getLatestDraftForNewsletter(snapshot, newsletterId);
    if (!draft || draft.status !== "approved") {
      badRequest("No approved draft for this newsletter");
    }
    const approvedContent = draft.human_edits ?? (draft.ai_draft as Record<string, unknown>);
    const sections = getSections(approvedContent);

    if (newsletter.mailchimp_campaign_id && newsletter.status === "scheduled") {
      await appendWorkflowLog({
        scope: "delivery",
        step: "newsletter.schedule",
        status: "warning",
        message: "Newsletter is already scheduled.",
        context: {
          newsletter_id: newsletterId,
          campaign_id: newsletter.mailchimp_campaign_id,
        },
      });

      return {
        status: "already_scheduled",
        campaign_id: newsletter.mailchimp_campaign_id,
      };
    }

    let articles = snapshot.articles.filter((item) => item.newsletter_id === newsletterId);
    if (articles.length === 0) {
      await appendWorkflowLog({
        scope: "delivery",
        step: "newsletter.schedule",
        status: "info",
        message: "No article pages exist yet. Publishing articles before scheduling.",
        context: {
          newsletter_id: newsletterId,
        },
      });
      await publishArticlesForNewsletter(newsletterId);
      articles = (await readDatabase()).articles.filter((item) => item.newsletter_id === newsletterId);
    }

    const mailchimpBlockReason = getMailchimpBlockReason();
    if (mailchimpBlockReason) {
      const previewSent = await sendNewsletterPreviewEmail(newsletter, articles, {
        draftId: draft.id,
        recipientEmail: draft.reviewer_email,
        reason: `${mailchimpBlockReason} A preview copy was sent instead.`,
        sectionsPreview: sections,
      });

      await withDatabase((db) => {
        const stored = db.newsletters.find((item) => item.id === newsletterId);
        if (!stored) {
          notFound("Newsletter not found");
        }
        stored.updated_at = nowIso();
      });

      await appendWorkflowLog({
        scope: "delivery",
        step: "newsletter.schedule",
        status: previewSent ? "warning" : "error",
        message: previewSent
          ? "Mailchimp is unavailable, so a preview email was sent instead."
          : `Mailchimp is unavailable and no preview email could be sent: ${mailchimpBlockReason}`,
        context: {
          newsletter_id: newsletterId,
          article_count: articles.length,
          preview_sent: previewSent,
          reason: mailchimpBlockReason,
        },
      });

      return {
        status: previewSent ? "preview_sent" : "delivery_blocked",
        campaign_id: "",
        article_count: articles.length,
        preview_sent: previewSent,
        message: previewSent
          ? "Mailchimp is not ready, so a preview copy of the latest newsletter was emailed to the reviewer instead."
          : `Mailchimp is not ready: ${mailchimpBlockReason}`,
      };
    }

    const campaignId = await scheduleCampaign(newsletter, articles, sections);

    const result = await withDatabase((db) => {
      const stored = db.newsletters.find((item) => item.id === newsletterId);
      if (!stored) {
        notFound("Newsletter not found");
      }
      stored.mailchimp_campaign_id = campaignId;
      stored.status = "scheduled";
      stored.updated_at = nowIso();

      return {
        status: "scheduled",
        campaign_id: campaignId,
        article_count: articles.length,
        message: "Newsletter scheduled successfully.",
      };
    });

    await appendWorkflowLog({
      scope: "delivery",
      step: "newsletter.schedule",
      status: "success",
      message: "Newsletter scheduled successfully.",
      context: {
        newsletter_id: newsletterId,
        campaign_id: campaignId,
        article_count: articles.length,
      },
    });

    return result;
  } catch (error) {
    await appendWorkflowLog({
      scope: "delivery",
      step: "newsletter.schedule",
      status: "error",
      message: `Newsletter scheduling failed: ${error instanceof Error ? error.message : "unknown error"}`,
      context: {
        newsletter_id: newsletterId,
      },
    });
    throw error;
  }
}

export async function getNewsletterMailchimpStatus(
  newsletterId: number,
): Promise<Record<string, unknown>> {
  const db = await readDatabase();
  const newsletter = db.newsletters.find((item) => item.id === newsletterId);
  if (!newsletter) {
    notFound("Newsletter not found");
  }

  if (!newsletter.mailchimp_campaign_id) {
    return {
      status: newsletter.status,
      campaign_id: null,
    };
  }

  return {
    status: newsletter.status,
    mailchimp_status: await getCampaignStatus(newsletter.mailchimp_campaign_id),
  };
}

export async function getHealthStatus(): Promise<Record<string, unknown>> {
  const db = await readDatabase();
  return {
    status: "ok",
    service: "ufs-newsletter-node",
    drafts: db.drafts.length,
    newsletters: db.newsletters.length,
    articles: db.articles.length,
  };
}

export function mapRouteError(error: unknown): { status: number; detail: string } {
  if (error instanceof Error) {
    if (error.name === "NotFoundError") {
      return { status: 404, detail: error.message };
    }
    if (error.name === "BadRequestError") {
      return { status: 400, detail: error.message };
    }
    return { status: 500, detail: "Internal server error." };
  }

  return { status: 500, detail: "Internal server error." };
}
