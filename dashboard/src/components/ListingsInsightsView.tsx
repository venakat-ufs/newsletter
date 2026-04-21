"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { getDraft, type Draft } from "@/lib/api";
import { getDraftSections, getNewsHighlights, getSourceCards } from "@/lib/newsletter-intel";
import { pretextCompact, pretextCount } from "@/lib/pretext";

type ChartRow = {
  name: string;
  value: number;
  delta?: number | null;
  deltaStatus?: string;
  context?: string;
};

type SourceLinkRow = {
  source: string;
  label: string;
  url: string;
  type: "primary" | "search" | "sample";
};

type SortMode = "value_desc" | "delta_desc" | "name_asc";
type ViewTab = "overview" | "listings" | "pulse" | "news" | "employers" | "sources";

const TABS: Array<{ key: ViewTab; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "listings", label: "Listings" },
  { key: "pulse", label: "Pulse" },
  { key: "news", label: "News" },
  { key: "employers", label: "Employers" },
  { key: "sources", label: "Sources" },
];

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value.replaceAll(",", ""));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function asText(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function parseTab(value: string | null): ViewTab | null {
  if (!value) {
    return null;
  }
  return TABS.some((tab) => tab.key === value) ? (value as ViewTab) : null;
}

function toDateLabel(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return "--";
  }
  return new Date(parsed).toISOString().slice(0, 10);
}

function toHostname(value: string): string {
  try {
    const parsed = new URL(value);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function sortRows(rows: ChartRow[], mode: SortMode): ChartRow[] {
  const sorted = [...rows];

  if (mode === "name_asc") {
    sorted.sort((left, right) => left.name.localeCompare(right.name));
    return sorted;
  }

  if (mode === "delta_desc") {
    sorted.sort((left, right) => (right.delta ?? -999) - (left.delta ?? -999));
    return sorted;
  }

  sorted.sort((left, right) => right.value - left.value);
  return sorted;
}

function filterRows(
  rows: ChartRow[],
  query: string,
  minValue: number,
  topN: number,
  sortMode: SortMode,
): ChartRow[] {
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (row.value < minValue) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    const haystack = `${row.name} ${row.context ?? ""}`.toLowerCase();
    return haystack.includes(normalizedQuery);
  });

  return sortRows(filtered, sortMode).slice(0, topN);
}

function DeltaTag({
  value,
  status,
}: {
  value?: number | null;
  status?: string;
}) {
  if (status === "insufficient_data") {
    return <span className="text-[10px] font-semibold text-[#9CA3AF]">Insufficient data</span>;
  }

  if (status === "unchanged") {
    return <span className="text-[10px] font-semibold text-[#6b7280]">No change</span>;
  }

  if (value === null || value === undefined || Number.isNaN(value)) {
    return <span className="text-[10px] font-semibold text-[#9CA3AF]">Insufficient data</span>;
  }

  const tone = value > 0 ? "text-emerald-700" : value < 0 ? "text-rose-700" : "text-[#9CA3AF]";
  const arrow = value > 0 ? "↑" : value < 0 ? "↓" : "→";
  const sign = value > 0 ? "+" : "";

  if (value === 0) {
    return <span className="text-[10px] font-semibold text-[#6b7280]">No change</span>;
  }

  return <span className={`text-[10px] font-semibold ${tone}`}>{`${arrow} ${sign}${value}%`}</span>;
}

function HorizontalBars({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle: string;
  rows: ChartRow[];
}) {
  const maxValue = rows.reduce((max, row) => Math.max(max, row.value), 0) || 1;

  return (
    <section className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">
        {subtitle}
      </div>
      <h2 className="mt-1.5 text-base font-semibold text-[#111827]">{title}</h2>
      <div className="mt-3 max-h-[260px] space-y-2.5 overflow-y-auto pr-1">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#D1D5DB] bg-[#F9FAFB] px-3 py-2 text-xs text-[#6B7280]">
            No rows match current filters.
          </div>
        ) : null}
        {rows.map((row, index) => (
          <div key={`${row.name}-${index}`}>
            <div className="mb-1 flex items-center justify-between gap-1.5">
              <div className="truncate text-sm font-medium text-[#111827]">{row.name}</div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-[#374151]">{pretextCount(row.value)}</span>
                <DeltaTag value={row.delta} status={row.deltaStatus} />
              </div>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#E5E7EB]">
              <div
                className="h-full rounded-full bg-[#2563EB]"
                style={{ width: `${Math.max(6, Math.round((row.value / maxValue) * 100))}%` }}
              />
            </div>
            {row.context ? (
              <div className="mt-0.5 text-[10px] text-[#9CA3AF]">
                {pretextCompact(row.context, 72)}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function MiniCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">{label}</div>
      <div className="mt-1 text-xl font-semibold text-[#111827]">{value}</div>
      <div className="text-xs text-[#9CA3AF]">{detail}</div>
    </div>
  );
}

export function ListingsInsightsView({
  draftId,
  backHref,
  backLabel,
  defaultTab = "overview",
  newsOnly = false,
}: {
  draftId: number;
  backHref: string;
  backLabel: string;
  defaultTab?: ViewTab;
  newsOnly?: boolean;
}) {
  const searchParams = useSearchParams();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [minValue, setMinValue] = useState(0);
  const [topN, setTopN] = useState(6);
  const [sortMode, setSortMode] = useState<SortMode>("value_desc");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [tab, setTab] = useState<ViewTab>(newsOnly ? "news" : defaultTab);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        const data = await getDraft(draftId);
        if (!cancelled) {
          setDraft(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load draft insights");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [draftId]);

  useEffect(() => {
    if (newsOnly) {
      setTab("news");
      return;
    }
    const next = parseTab(searchParams.get("tab"));
    if (next) {
      setTab(next);
    }
  }, [newsOnly, searchParams]);

  const sectionMap = useMemo(() => {
    if (!draft) {
      return new Map<string, Record<string, unknown>>();
    }

    return new Map(
      getDraftSections(draft)
        .filter((section) => isRecord(section.metadata))
        .map((section) => [section.section_type, section.metadata as Record<string, unknown>]),
    );
  }, [draft]);

  const sourceCards = useMemo(() => (draft ? getSourceCards(draft) : []), [draft]);
  const sourceLabelByKey = useMemo(
    () => new Map(sourceCards.map((source) => [source.key, source.label])),
    [sourceCards],
  );

  const topBanksRows = useMemo<ChartRow[]>(() => {
    const rows = safeRecords(sectionMap.get("top_banks")?.rows);

    if (rows.length > 0) {
      return rows.map((row) => ({
        name: asText(row.name, "Institution"),
        value: asNumber(row.count),
        delta:
          row.wow_delta_pct === null || row.wow_delta_pct === undefined
            ? null
            : asNumber(row.wow_delta_pct),
        deltaStatus: asText(row.wow_delta_status),
        context: asText(row.top_state, "National"),
      }));
    }

    return sourceCards
      .filter((source) => source.groupLabel === "Official Inventory")
      .map((source) => ({
        name: source.label,
        value: source.itemCount,
        delta: null,
        context: source.description,
      }));
  }, [sectionMap, sourceCards]);

  const hotMarketRows = useMemo<ChartRow[]>(() => {
    const rows = safeRecords(sectionMap.get("hot_markets")?.rows);

    return rows.map((row) => ({
      name: asText(row.name, "Market"),
      value: asNumber(row.count),
      delta:
        row.wow_delta_pct === null || row.wow_delta_pct === undefined
          ? null
          : asNumber(row.wow_delta_pct),
      deltaStatus: asText(row.wow_delta_status),
      context: asText(row.metro, "Active market"),
    }));
  }, [sectionMap]);

  const inventorySourceRows = useMemo<ChartRow[]>(() => {
    const sourceRows = safeRecords(sectionMap.get("market_pulse")?.source_cards);
    if (sourceRows.length > 0) {
      return sourceRows.map((source) => ({
        name: asText(source.source, "Source"),
        value: asNumber(source.value),
        context: asText(source.detail, "Live"),
      }));
    }

    return sourceCards
      .filter((source) => source.groupLabel === "Official Inventory")
      .map((source) => ({
        name: source.label,
        value: source.itemCount,
        context: source.mode,
      }));
  }, [sectionMap, sourceCards]);

  const marketPulseStats = useMemo(() => safeRecords(sectionMap.get("market_pulse")?.stat_cards), [sectionMap]);
  const marketPulseSources = useMemo(() => safeRecords(sectionMap.get("market_pulse")?.source_cards), [sectionMap]);
  const marketPulseGeos = useMemo(() => safeRecords(sectionMap.get("market_pulse")?.geography_rows), [sectionMap]);

  const hiringEmployers = useMemo(() => safeRecords(sectionMap.get("bank_hiring_intel")?.employers), [sectionMap]);

  const newsRows = useMemo(() => (draft ? getNewsHighlights(draft) : []), [draft]);

  const sourceLinkRows = useMemo<SourceLinkRow[]>(() => {
    if (!draft) {
      return [];
    }

    const rows: SourceLinkRow[] = [];
    const seen = new Set<string>();
    const sources = draft.raw_data.sources ?? {};

    for (const [sourceKey, sourceSnapshot] of Object.entries(sources)) {
      const sourceLabel = sourceLabelByKey.get(sourceKey) ?? sourceKey;
      const dataRows = safeRecords((sourceSnapshot as { data?: unknown })?.data);

      for (const item of dataRows) {
        const directUrl = asText(item.url);
        if (directUrl && !seen.has(directUrl)) {
          rows.push({
            source: sourceLabel,
            label: asText(item.title) || asText(item.name) || "Primary signal link",
            url: directUrl,
            type: "primary",
          });
          seen.add(directUrl);
        }

        const searchUrl = asText(item.search_url) || asText(item.market_url);
        if (searchUrl && !seen.has(searchUrl)) {
          rows.push({
            source: sourceLabel,
            label: "Source search / market page",
            url: searchUrl,
            type: "search",
          });
          seen.add(searchUrl);
        }

        for (const listing of safeRecords(item.sample_listings)) {
          const listingUrl = asText(listing.url);
          if (!listingUrl || seen.has(listingUrl)) {
            continue;
          }

          rows.push({
            source: sourceLabel,
            label: asText(listing.title) || asText(listing.address) || "Sample listing",
            url: listingUrl,
            type: "sample",
          });
          seen.add(listingUrl);
        }
      }
    }

    return rows
      .sort((left, right) =>
        left.source === right.source
          ? left.label.localeCompare(right.label)
          : left.source.localeCompare(right.source),
      )
      .slice(0, 800);
  }, [draft, sourceLabelByKey]);

  const filteredTopBanks = useMemo(
    () => filterRows(topBanksRows, query, minValue, topN, sortMode),
    [topBanksRows, query, minValue, topN, sortMode],
  );
  const filteredHotMarkets = useMemo(
    () => filterRows(hotMarketRows, query, minValue, topN, sortMode),
    [hotMarketRows, query, minValue, topN, sortMode],
  );
  const filteredInventory = useMemo(
    () => filterRows(inventorySourceRows, query, minValue, topN, sortMode),
    [inventorySourceRows, query, minValue, topN, sortMode],
  );

  const bankLeaderboard = useMemo(
    () => sortRows(topBanksRows, "value_desc").slice(0, Math.max(topN, 8)),
    [topBanksRows, topN],
  );
  const marketLeaderboard = useMemo(
    () => sortRows(hotMarketRows, "value_desc").slice(0, Math.max(topN, 8)),
    [hotMarketRows, topN],
  );
  const marketGainers = useMemo(
    () =>
      [...hotMarketRows]
        .filter((row) => (row.delta ?? 0) > 0)
        .sort((left, right) => (right.delta ?? 0) - (left.delta ?? 0))
        .slice(0, 3),
    [hotMarketRows],
  );
  const marketDecliners = useMemo(
    () =>
      [...hotMarketRows]
        .filter((row) => (row.delta ?? 0) < 0)
        .sort((left, right) => (left.delta ?? 0) - (right.delta ?? 0))
        .slice(0, 3),
    [hotMarketRows],
  );

  const filteredSourceLinks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return sourceLinkRows.filter((row) => {
      if (sourceFilter !== "all" && row.source !== sourceFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return `${row.source} ${row.label} ${row.url}`.toLowerCase().includes(normalizedQuery);
    });
  }, [sourceFilter, sourceLinkRows, query]);

  const sourceFilterOptions = useMemo(
    () => [...new Set(sourceLinkRows.map((row) => row.source))].sort((a, b) => a.localeCompare(b)),
    [sourceLinkRows],
  );

  if (loading) {
    return (
      <div className="rounded-xl border border-[#E5E7EB] bg-white px-5 py-12 text-center text-sm text-[#6B7280] shadow-sm">
        Loading issue intelligence...
      </div>
    );
  }

  if (error || !draft) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 shadow-sm">
        {error ?? "Draft not found"}
      </div>
    );
  }

  const issueNumber = draft.issue_number ?? draft.newsletter_id;
  const totalInventorySignals = inventorySourceRows.reduce((sum, row) => sum + row.value, 0);
  const totalBankSignals = topBanksRows.reduce((sum, row) => sum + row.value, 0);
  const insightBase = `/insights/listings/${draft.id}`;
  const pageTitle = newsOnly
    ? `Issue #${issueNumber} News Hub`
    : `Issue #${issueNumber} Data View`;
  const pageSubtitle = newsOnly
    ? "Full-page industry news coverage for this issue."
    : "Single source of truth for this issue. Newsletter sections and deep pages read from this data.";

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Issue Intelligence Center</p>
            <h1 className="mt-2 text-2xl font-semibold text-[#111827]">{pageTitle}</h1>
            <p className="mt-1 text-sm text-[#6B7280]">{pageSubtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/drafts/${draft.id}`}
              className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1D4ED8]"
            >
              Open editor
            </Link>
            <Link
              href={backHref}
              className="rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-medium text-[#374151] transition hover:bg-[#F9FAFB]"
            >
              {backLabel}
            </Link>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <MiniCard label="Inventory signals" value={pretextCount(totalInventorySignals)} detail="Tracked listing intensity" />
          <MiniCard label="Top bank volume" value={pretextCount(totalBankSignals)} detail="Institution-level activity" />
          <MiniCard label="Stories" value={pretextCount(newsRows.length)} detail="Industry stories in this issue" />
          <MiniCard label="Source links" value={pretextCount(sourceLinkRows.length)} detail="Raw URLs + sample listings" />
        </div>

        {!newsOnly ? (
          <div className="mt-5 flex flex-wrap gap-1.5">
            {TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  tab === item.key
                    ? "bg-[#2563EB] text-white"
                    : "border border-[#E5E7EB] bg-white text-[#374151] hover:bg-[#F9FAFB]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}

        <div className={`mt-4 grid gap-2 ${newsOnly ? "md:grid-cols-1" : "md:grid-cols-4"}`}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search markets, banks, stories, links..."
            className="h-9 rounded-lg border border-[#D1D5DB] bg-white px-3 text-xs text-[#111827] outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-[#DBEAFE]"
          />
          {!newsOnly ? (
            <>
              <select
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as SortMode)}
                className="h-9 rounded-lg border border-[#D1D5DB] bg-white px-3 text-xs text-[#111827] outline-none transition focus:border-[#2563EB]"
              >
                <option value="value_desc">Sort: Highest count</option>
                <option value="delta_desc">Sort: Highest delta</option>
                <option value="name_asc">Sort: Name A-Z</option>
              </select>
              <select
                value={String(topN)}
                onChange={(event) => setTopN(Number(event.target.value))}
                className="h-9 rounded-lg border border-[#D1D5DB] bg-white px-3 text-xs text-[#111827] outline-none transition focus:border-[#2563EB]"
              >
                <option value="5">Top 5</option>
                <option value="8">Top 8</option>
                <option value="12">Top 12</option>
                <option value="20">Top 20</option>
              </select>
              <input
                type="number"
                value={minValue}
                min={0}
                onChange={(event) => setMinValue(Math.max(0, Number(event.target.value) || 0))}
                placeholder="Min value"
                className="h-9 rounded-lg border border-[#D1D5DB] bg-white px-3 text-xs text-[#111827] outline-none transition focus:border-[#2563EB]"
              />
            </>
          ) : null}
        </div>
      </section>

      {tab === "overview" ? (
        <section className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Market pulse</div>
              <h2 className="mt-1 text-base font-semibold text-[#111827]">Inventory build and geographies</h2>
              <div className="mt-2 text-xs text-[#6B7280]">
                {marketPulseStats.length > 0
                  ? `${marketPulseStats.length} metrics · ${marketPulseGeos.length} active geographies`
                  : "No market pulse metadata in this issue yet."}
              </div>
              <Link
                href={`${insightBase}?tab=pulse`}
                className="mt-3 inline-flex rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-semibold text-[#374151] hover:bg-[#F9FAFB]"
              >
                More Pulse →
              </Link>
            </div>
            <div className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Top banks + hot markets</div>
              <h2 className="mt-1 text-base font-semibold text-[#111827]">Servicer movement and county ranking</h2>
              <div className="mt-2 text-xs text-[#6B7280]">
                {`${topBanksRows.length} institutions · ${hotMarketRows.length} ranked markets`}
              </div>
              <Link
                href={`${insightBase}?tab=listings`}
                className="mt-3 inline-flex rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-semibold text-[#374151] hover:bg-[#F9FAFB]"
              >
                More Listings →
              </Link>
            </div>
            <div className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Industry + hiring intel</div>
              <h2 className="mt-1 text-base font-semibold text-[#111827]">Headlines and employer signals</h2>
              <div className="mt-2 text-xs text-[#6B7280]">
                {`${newsRows.length} stories · ${hiringEmployers.length} employers`}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={`/insights/news/${draft.id}`}
                  className="inline-flex rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-semibold text-[#374151] hover:bg-[#F9FAFB]"
                >
                  News Page →
                </Link>
                <Link
                  href={`${insightBase}?tab=employers`}
                  className="inline-flex rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-semibold text-[#374151] hover:bg-[#F9FAFB]"
                >
                  Employers →
                </Link>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {tab === "listings" ? (
        <>
          <div className="grid gap-3 xl:grid-cols-3">
            <HorizontalBars subtitle="Top Banks Listing" title="Servicer / Bank movement" rows={filteredTopBanks} />
            <HorizontalBars subtitle="Hot Markets" title="County-level activity" rows={filteredHotMarkets} />
            <HorizontalBars subtitle="Source Network" title="Inventory source intensity" rows={filteredInventory} />
          </div>

          <section className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Readable representation</div>
            <h2 className="mt-1 text-lg font-semibold text-[#111827]">Market Pulse + Listings tables</h2>

            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div className="overflow-auto rounded-lg border border-[#E5E7EB]">
                <table className="min-w-full border-separate border-spacing-0 text-xs">
                  <thead>
                    <tr className="bg-[#F9FAFB] text-left uppercase tracking-wider text-[#6B7280]">
                      <th className="px-2.5 py-2">#</th>
                      <th className="px-2.5 py-2">Servicer / Bank</th>
                      <th className="px-2.5 py-2">Listings</th>
                      <th className="px-2.5 py-2">State</th>
                      <th className="px-2.5 py-2">WoW</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bankLeaderboard.map((row, index) => (
                      <tr key={`bank-${row.name}-${index}`} className={index % 2 === 0 ? "bg-white" : "bg-[#F9FAFB]"}>
                        <td className="px-2.5 py-2 font-semibold text-[#6B7280]">{index + 1}</td>
                        <td className="px-2.5 py-2 font-semibold text-[#111827]">{row.name}</td>
                        <td className="px-2.5 py-2 text-[#374151]">{pretextCount(row.value)}</td>
                        <td className="px-2.5 py-2 text-[#6B7280]">{row.context ?? "National"}</td>
                        <td className="px-2.5 py-2"><DeltaTag value={row.delta} status={row.deltaStatus} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="overflow-auto rounded-lg border border-[#E5E7EB]">
                <table className="min-w-full border-separate border-spacing-0 text-xs">
                  <thead>
                    <tr className="bg-[#F9FAFB] text-left uppercase tracking-wider text-[#6B7280]">
                      <th className="px-2.5 py-2">#</th>
                      <th className="px-2.5 py-2">Market</th>
                      <th className="px-2.5 py-2">Metro</th>
                      <th className="px-2.5 py-2">Active</th>
                      <th className="px-2.5 py-2">WoW</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marketLeaderboard.map((row, index) => (
                      <tr key={`market-${row.name}-${index}`} className={index % 2 === 0 ? "bg-white" : "bg-[#F9FAFB]"}>
                        <td className="px-2.5 py-2 font-semibold text-[#6B7280]">{index + 1}</td>
                        <td className="px-2.5 py-2 font-semibold text-[#111827]">{row.name}</td>
                        <td className="px-2.5 py-2 text-[#6B7280]">{row.context ?? "Market"}</td>
                        <td className="px-2.5 py-2 text-[#374151]">{pretextCount(row.value)}</td>
                        <td className="px-2.5 py-2"><DeltaTag value={row.delta} status={row.deltaStatus} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2.5">
                <div className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Top gainers</div>
                <div className="mt-1.5 space-y-1 text-xs">
                  {marketGainers.length === 0 ? <div className="text-[#6B7280]">No positive movers in this issue.</div> : null}
                  {marketGainers.map((row) => (
                    <div key={`gain-${row.name}`} className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[#111827]">{row.name}</span>
                      <DeltaTag value={row.delta} status={row.deltaStatus} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2.5">
                <div className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Top decliners</div>
                <div className="mt-1.5 space-y-1 text-xs">
                  {marketDecliners.length === 0 ? <div className="text-[#6B7280]">No negative movers in this issue.</div> : null}
                  {marketDecliners.map((row) => (
                    <div key={`loss-${row.name}`} className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[#111827]">{row.name}</span>
                      <DeltaTag value={row.delta} status={row.deltaStatus} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </>
      ) : null}

      {tab === "pulse" ? (
        <section className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Market pulse details</div>
          <h2 className="mt-1 text-lg font-semibold text-[#111827]">Inventory, source mix, and geographies</h2>

          <div className="mt-3 grid gap-2 md:grid-cols-4">
            {marketPulseStats.length === 0 ? (
              <div className="md:col-span-4 rounded-lg border border-dashed border-[#D1D5DB] bg-[#F9FAFB] px-3 py-3 text-xs text-[#6B7280]">
                No market pulse metrics were generated for this issue.
              </div>
            ) : (
              marketPulseStats.map((card, index) => (
                <MiniCard
                  key={`stat-${index}`}
                  label={asText(card.label, "Metric")}
                  value={pretextCount(asNumber(card.value))}
                  detail={asText(card.detail, "")}
                />
              ))
            )}
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div className="overflow-auto rounded-lg border border-[#E5E7EB]">
              <table className="min-w-full border-separate border-spacing-0 text-xs">
                <thead>
                  <tr className="bg-[#F9FAFB] text-left uppercase tracking-wider text-[#6B7280]">
                    <th className="px-2.5 py-2">Source</th>
                    <th className="px-2.5 py-2">Active</th>
                    <th className="px-2.5 py-2">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {marketPulseSources.length === 0 ? (
                    <tr>
                      <td className="px-2.5 py-2.5 text-[#6B7280]" colSpan={3}>
                        No source cards available.
                      </td>
                    </tr>
                  ) : null}
                  {marketPulseSources.map((row, index) => (
                    <tr key={`src-${index}`} className={index % 2 === 0 ? "bg-white" : "bg-[#F9FAFB]"}>
                      <td className="px-2.5 py-2 font-semibold text-[#111827]">{asText(row.source, "Source")}</td>
                      <td className="px-2.5 py-2 text-[#374151]">{pretextCount(asNumber(row.value))}</td>
                      <td className="px-2.5 py-2 text-[#6B7280]">{asText(row.detail, "-")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="overflow-auto rounded-lg border border-[#E5E7EB]">
              <table className="min-w-full border-separate border-spacing-0 text-xs">
                <thead>
                  <tr className="bg-[#F9FAFB] text-left uppercase tracking-wider text-[#6B7280]">
                    <th className="px-2.5 py-2">Geography</th>
                    <th className="px-2.5 py-2">Source</th>
                    <th className="px-2.5 py-2">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {marketPulseGeos.length === 0 ? (
                    <tr>
                      <td className="px-2.5 py-2.5 text-[#6B7280]" colSpan={3}>
                        No geography rows available.
                      </td>
                    </tr>
                  ) : null}
                  {marketPulseGeos.map((row, index) => (
                    <tr key={`geo-${index}`} className={index % 2 === 0 ? "bg-white" : "bg-[#F9FAFB]"}>
                      <td className="px-2.5 py-2 font-semibold text-[#111827]">{asText(row.label, "Market")}</td>
                      <td className="px-2.5 py-2 text-[#6B7280]">{asText(row.sublabel, "-")}</td>
                      <td className="px-2.5 py-2 text-[#374151]">{pretextCount(asNumber(row.value))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {tab === "news" ? (
        <>
          <section className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Industry news</div>
            <h2 className="mt-1 text-lg font-semibold text-[#111827]">Full story list</h2>
            <div className="mt-3 max-h-[360px] space-y-2 overflow-auto rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-2">
              {newsRows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[#D1D5DB] bg-[#F9FAFB] px-3 py-3 text-xs text-[#6B7280]">
                  No stories available for this issue yet.
                </div>
              ) : null}
              {newsRows.map((story, index) => {
                const storyDate = story.date ? toDateLabel(story.date) : "--";
                const storyDomain = story.url ? toHostname(story.url) : "";
                const fullNewsPageUrl = `/insights/news/${draft.id}?story=${index + 1}`;
                const card = (
                  <div
                    className={`rounded-lg border px-3 py-2 ${
                      story.url
                        ? "border-[#E5E7EB] bg-white transition hover:border-[#BFDBFE] hover:bg-[#EFF6FF]"
                        : "border-[#E5E7EB] bg-white"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="rounded-full bg-[#F3F4F6] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">
                        {story.source}
                      </span>
                      <div className="flex items-center gap-1.5 text-[10px] text-[#6B7280]">
                        {storyDomain ? <span>{storyDomain}</span> : null}
                        <span>{storyDate}</span>
                        <span className="font-semibold uppercase tracking-wider text-[#2563EB]">
                          {newsOnly ? "Open" : "News Page"}
                        </span>
                      </div>
                    </div>
                    <div className="mt-1 text-sm font-semibold text-[#111827]">
                      {pretextCompact(story.headline, 140)}
                    </div>
                    <div className="mt-1 text-[11px] leading-5 text-[#6B7280]">
                      {pretextCompact(story.summary || story.headline, 180)}
                    </div>
                  </div>
                );

                if (newsOnly) {
                  return story.url ? (
                    <a
                      key={`${story.source}-${story.headline}-${index}`}
                      href={story.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      {card}
                    </a>
                  ) : (
                    <div key={`${story.source}-${story.headline}-${index}`}>{card}</div>
                  );
                }

                return (
                  <Link key={`${story.source}-${story.headline}-${index}`} href={fullNewsPageUrl} className="block">
                    {card}
                  </Link>
                );
              })}
            </div>
          </section>
        </>
      ) : null}

      {tab === "employers" ? (
        <section className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Bank hiring intel</div>
          <h2 className="mt-1 text-lg font-semibold text-[#111827]">Employers and role signals</h2>
          <div className="mt-3 max-h-[360px] overflow-auto rounded-lg border border-[#E5E7EB]">
            <table className="min-w-full border-separate border-spacing-0 text-xs">
              <thead>
                <tr className="bg-[#F9FAFB] text-left uppercase tracking-wider text-[#6B7280]">
                  <th className="px-2.5 py-2">Employer</th>
                  <th className="px-2.5 py-2">Jobs</th>
                  <th className="px-2.5 py-2">Focus</th>
                  <th className="px-2.5 py-2">Sample roles / links</th>
                </tr>
              </thead>
              <tbody>
                {hiringEmployers.length === 0 ? (
                  <tr>
                    <td className="px-2.5 py-2.5 text-[#6B7280]" colSpan={4}>
                      No hiring metadata available yet.
                    </td>
                  </tr>
                ) : null}
                {hiringEmployers.map((row, index) => {
                  const sampleRoles = Array.isArray(row.sample_roles)
                    ? row.sample_roles.map((item) => asText(item)).filter(Boolean)
                    : [];
                  const sampleJobUrls = Array.isArray(row.sample_job_urls)
                    ? row.sample_job_urls.map((item) => asText(item)).filter(Boolean)
                    : [];
                  const focusRows = Array.isArray(row.hiring_focus)
                    ? row.hiring_focus.map((item) => asText(item)).filter(Boolean)
                    : [];
                  const firstJobUrl = sampleJobUrls[0];
                  const linkedRoles = sampleJobUrls.map((url, roleIndex) => ({
                    url,
                    label: sampleRoles[roleIndex] ?? `Job listing ${roleIndex + 1}`,
                  }));
                  return (
                    <tr key={`emp-${index}`} className={index % 2 === 0 ? "bg-white" : "bg-[#F9FAFB]"}>
                      <td className="px-2.5 py-2 font-semibold text-[#111827]">
                        {firstJobUrl ? (
                          <div className="space-y-0.5">
                            <a
                              href={firstJobUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#111827] hover:text-[#2563EB] hover:underline"
                            >
                              {asText(row.company, "Employer")}
                            </a>
                            <a
                              href={firstJobUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex text-[10px] font-semibold uppercase tracking-wider text-[#2563EB] hover:underline"
                            >
                              Open hiring page
                            </a>
                          </div>
                        ) : (
                          asText(row.company, "Employer")
                        )}
                      </td>
                      <td className="px-2.5 py-2 text-[#374151]">{pretextCount(asNumber(row.total_jobs))}</td>
                      <td className="px-2.5 py-2 text-[#6B7280]">
                        {focusRows.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {focusRows.map((focus, focusIndex) => (
                              <span
                                key={`focus-${index}-${focusIndex}`}
                                className="rounded-full bg-[#F3F4F6] px-2 py-0.5 text-[10px] text-[#6B7280]"
                              >
                                {pretextCompact(focus, 26)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-2.5 py-2 text-[#6B7280]">
                        {linkedRoles.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {linkedRoles.map((role, roleIndex) => (
                              <a
                                key={`role-${index}-${roleIndex}`}
                                href={role.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-1 text-[11px] font-semibold text-[#2563EB] transition hover:bg-[#DBEAFE]"
                              >
                                {pretextCompact(role.label, 42)}
                              </a>
                            ))}
                          </div>
                        ) : (
                          pretextCompact(sampleRoles[0] ?? "-", 68)
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "sources" ? (
        <section className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Source links explorer</div>
              <h2 className="mt-1 text-lg font-semibold text-[#111827]">Raw source URLs and listing links</h2>
            </div>
            <select
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value)}
              className="h-8 rounded-lg border border-[#D1D5DB] bg-white px-2.5 text-xs text-[#111827] outline-none transition focus:border-[#2563EB]"
            >
              <option value="all">All sources</option>
              {sourceFilterOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3 max-h-[380px] overflow-auto rounded-lg border border-[#E5E7EB]">
            <table className="min-w-full border-separate border-spacing-0 text-xs">
              <thead>
                <tr className="bg-[#F9FAFB] text-left uppercase tracking-wider text-[#6B7280]">
                  <th className="px-2.5 py-2">Source</th>
                  <th className="px-2.5 py-2">Label</th>
                  <th className="px-2.5 py-2">Type</th>
                  <th className="px-2.5 py-2">URL</th>
                </tr>
              </thead>
              <tbody>
                {filteredSourceLinks.length === 0 ? (
                  <tr>
                    <td className="px-2.5 py-2.5 text-[#6B7280]" colSpan={4}>
                      No source links match current filters.
                    </td>
                  </tr>
                ) : null}
                {filteredSourceLinks.slice(0, 250).map((row, index) => (
                  <tr key={`${row.source}-${row.url}-${index}`} className={index % 2 === 0 ? "bg-white" : "bg-[#F9FAFB]"}>
                    <td className="px-2.5 py-2 font-semibold text-[#111827]">{row.source}</td>
                    <td className="px-2.5 py-2">
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block -mx-1 rounded-md px-1 py-1 transition hover:bg-[#F9FAFB]"
                      >
                        <div className="font-semibold text-[#374151]">{pretextCompact(row.label, 64)}</div>
                        <div className="mt-0.5 text-[10px] text-[#6B7280]">{pretextCompact(row.url, 80)}</div>
                      </a>
                    </td>
                    <td className="px-2.5 py-2 text-[#6B7280]">
                      <span className="rounded-full bg-[#F3F4F6] px-2 py-0.5 text-[10px] uppercase tracking-wider">
                        {row.type}
                      </span>
                    </td>
                    <td className="px-2.5 py-2">
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-1 text-[11px] font-semibold text-[#2563EB] transition hover:bg-[#DBEAFE]"
                      >
                        Open source
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
