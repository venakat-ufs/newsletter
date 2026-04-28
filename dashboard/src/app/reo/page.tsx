"use client";

import { useEffect, useState, useCallback, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SourceSnapshot {
  source: string;
  collected_at: string;
  data: Record<string, unknown>[];
  errors: string[];
  success: boolean;
}

interface CollectResult {
  sources: Record<string, SourceSnapshot>;
  sources_used: string[];
  sources_warning: string[];
  sources_failed: string[];
}

interface ListingSignal {
  url?: string;
  address?: string;
  city?: string;
  state?: string;
  price?: string | number;
  source?: string;
  [key: string]: unknown;
}

// ─── REO source keys we care about on this page ───────────────────────────────

const REO_SOURCE_KEYS = [
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
  "vrm_va_reo",
  "equator_reo",
  "propertyonion",
  "bank_of_america_reo",
  "hud_homestore",
  "homesteps",
];

const REO_SOURCE_LABELS: Record<string, string> = {
  auction_com: "Auction.com",
  hubzu: "Hubzu",
  xome: "Xome",
  williams_auction: "Williams & Williams",
  real_estate_sales_gov: "RealEstateSales.gov",
  bid4assets: "Bid4Assets",
  foreclosure_listings_usa: "ForeclosureListingsUSA",
  foreclosure_listings_com: "ForeclosureListings.com",
  mtg_law_firm_trustee: "MTG Law Firm (CA Trustee)",
  realtor_foreclosure: "Realtor.com Foreclosures",
  vrm_va_reo: "VRM Properties (VA REO)",
  equator_reo: "Equator REO",
  propertyonion: "PropertyOnion (FL)",
  usda_reo: "USDA Rural Dev REO",
  gsa_auctions_re: "GSA Auctions RE",
  realtybid_reo: "RealtyBid REO",
  cws_treasury_re: "CWS Treasury Seized",
  fdic_reo: "FDIC Real Estate",
  realforeclose_fl: "RealForeclose (FL Sheriff)",
  ilfls_sheriff: "ILFLS Illinois Sheriff",
  bank_of_america_reo: "Bank of America REO",
  hud_homestore: "HUD Homestore",
  homesteps: "HomeSteps (Freddie Mac)",
};

const REO_SOURCE_DOMAINS: Record<string, string> = {
  auction_com: "auction.com",
  hubzu: "hubzu.com",
  xome: "xome.com",
  williams_auction: "williamsauction.com",
  real_estate_sales_gov: "realestatesales.gov",
  bid4assets: "bid4assets.com",
  foreclosure_listings_usa: "foreclosurelistingsusa.com",
  foreclosure_listings_com: "foreclosurelistings.com",
  mtg_law_firm_trustee: "salesinformation.mtglawfirm.com",
  realtor_foreclosure: "realtor.com",
  vrm_va_reo: "vrmproperties.com",
  equator_reo: "equator.com",
  propertyonion: "propertyonion.com",
  usda_reo: "resales.usda.gov",
  gsa_auctions_re: "gsaauctions.gov",
  realtybid_reo: "realtybid.com",
  cws_treasury_re: "cwsmarketing.com",
  fdic_reo: "fdicrealestatelistings.com",
  realforeclose_fl: "realforeclose.com",
  ilfls_sheriff: "ilfls.com",
  bank_of_america_reo: "bankofamerica.com",
  hud_homestore: "hudhomestore.gov",
  homesteps: "homesteps.com",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusDot(snap: SourceSnapshot | undefined): string {
  if (!snap) return "bg-slate-300";
  if (snap.success && snap.errors.length === 0) return "bg-emerald-500";
  if (snap.success) return "bg-amber-400";
  return "bg-rose-500";
}

function statusLabel(snap: SourceSnapshot | undefined): string {
  if (!snap) return "No Data";
  if (snap.success && snap.errors.length === 0) return "Live";
  if (snap.success) return "Warnings";
  return "Failed";
}

function statusColor(snap: SourceSnapshot | undefined): string {
  if (!snap) return "text-[#9CA3AF]";
  if (snap.success && snap.errors.length === 0) return "text-emerald-700";
  if (snap.success) return "text-amber-600";
  return "text-rose-600";
}

function extractLocations(data: Record<string, unknown>[]): string[] {
  const locations = new Set<string>();
  for (const item of data.slice(0, 20)) {
    const state = item.state as string | undefined;
    const city = item.city as string | undefined;
    if (state) locations.add(state);
    else if (city) locations.add(city);
    const url = item.url as string | undefined;
    if (url) {
      const stateMatch = url.match(/\/([A-Z]{2})\//);
      if (stateMatch) locations.add(stateMatch[1]);
    }
  }
  return Array.from(locations).slice(0, 4);
}

function extractStateCoverage(
  snapshots: Array<{ key: string; snap: SourceSnapshot | undefined }>,
): Record<string, number> {
  const stateCounts: Record<string, number> = {};
  for (const { snap } of snapshots) {
    if (!snap?.data?.length) continue;
    for (const item of snap.data) {
      const state = item.state as string | undefined;
      if (state && /^[A-Z]{2}$/.test(state)) {
        stateCounts[state] = (stateCounts[state] || 0) + 1;
      }
      const url = item.url as string | undefined;
      if (url) {
        const stateMatch = url.match(/\/(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\//i);
        if (stateMatch) {
          const s = stateMatch[1].toUpperCase();
          stateCounts[s] = (stateCounts[s] || 0) + 1;
        }
      }
    }
  }
  return stateCounts;
}

function topStateByActivity(stateCounts: Record<string, number>): string {
  const entries = Object.entries(stateCounts);
  if (!entries.length) return "—";
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white px-4 py-3 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">{label}</p>
      <p className="mt-1 text-2xl font-bold text-[#111827] leading-none">{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-[#9CA3AF]">{sub}</p>}
    </div>
  );
}

function SourceCard({
  sourceKey,
  snap,
}: {
  sourceKey: string;
  snap: SourceSnapshot | undefined;
}) {
  const label = REO_SOURCE_LABELS[sourceKey] || sourceKey;
  const domain = REO_SOURCE_DOMAINS[sourceKey];
  const signalCount = snap?.data?.length || 0;
  const locations = snap ? extractLocations(snap.data) : [];

  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-3 shadow-sm flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`h-2 w-2 rounded-full shrink-0 ${statusDot(snap)}`} />
          <p className="text-xs font-semibold text-[#111827] leading-tight truncate">{label}</p>
        </div>
        <span className={`text-[10px] font-semibold shrink-0 ${statusColor(snap)}`}>
          {statusLabel(snap)}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">Signals</span>
        <span className="text-sm font-bold text-[#111827]">
          {snap ? signalCount.toLocaleString() : "—"}
        </span>
      </div>

      {locations.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {locations.map((loc) => (
            <span
              key={loc}
              className="rounded-full bg-[#EFF6FF] px-1.5 py-0.5 text-[9px] font-semibold text-[#2563EB]"
            >
              {loc}
            </span>
          ))}
        </div>
      )}

      {domain && (
        <a
          href={`https://${domain}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-auto text-[10px] text-[#2563EB] font-medium hover:underline"
        >
          ↗ {domain}
        </a>
      )}
    </div>
  );
}

function ListingsTable({
  snapshots,
}: {
  snapshots: Array<{ key: string; snap: SourceSnapshot | undefined }>;
}) {
  const rows: Array<ListingSignal & { _source: string }> = [];
  for (const { key, snap } of snapshots) {
    if (!snap?.data?.length) continue;
    for (const item of snap.data.slice(0, 5)) {
      rows.push({ ...(item as ListingSignal), _source: REO_SOURCE_LABELS[key] || key });
      if (rows.length >= 50) break;
    }
    if (rows.length >= 50) break;
  }

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-dashed border-[#D1D5DB] bg-[#F9FAFB] py-8 text-center text-sm text-[#6B7280]">
        No listing signals collected yet — run a collection to populate data.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[#E5E7EB]">
      <table className="min-w-full border-separate border-spacing-0 text-xs">
        <thead>
          <tr className="bg-[#F9FAFB] text-left text-[10px] uppercase tracking-wider text-[#6B7280]">
            <th className="px-3 py-2">Address</th>
            <th className="px-3 py-2">State</th>
            <th className="px-3 py-2">Source</th>
            <th className="px-3 py-2">URL</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const address =
              (row.address as string) ||
              (row.city as string) ||
              "—";
            const state = (row.state as string) || "—";
            const url = row.url as string | undefined;
            return (
              <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-[#F9FAFB]"}>
                <td className="px-3 py-1.5 font-medium text-[#111827] max-w-[200px] truncate">
                  {address}
                </td>
                <td className="px-3 py-1.5 text-[#374151]">{state}</td>
                <td className="px-3 py-1.5 text-[#374151]">{row._source}</td>
                <td className="px-3 py-1.5">
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-[#2563EB] hover:underline font-medium"
                    >
                      ↗ View
                    </a>
                  ) : (
                    <span className="text-[#9CA3AF]">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StateCoverageSection({
  stateCounts,
}: {
  stateCounts: Record<string, number>;
}) {
  const entries = Object.entries(stateCounts).sort((a, b) => b[1] - a[1]);

  if (!entries.length) {
    return (
      <div className="rounded-xl border border-dashed border-[#D1D5DB] bg-[#F9FAFB] py-8 text-center text-sm text-[#6B7280]">
        No state coverage data yet — run a collection first.
      </div>
    );
  }

  const maxCount = Math.max(...entries.map(([, c]) => c), 1);

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
      {entries.map(([state, count]) => {
        const pct = Math.max(8, Math.round((count / maxCount) * 100));
        return (
          <div
            key={state}
            className="rounded-lg border border-[#E5E7EB] bg-white p-2.5 shadow-sm"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-bold text-[#111827]">{state}</span>
              <span className="text-[10px] font-semibold text-[#2563EB]">{count}</span>
            </div>
            <div className="h-1 rounded-full bg-[#E5E7EB] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#2563EB]"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReoPage() {
  const [data, setData] = useState<CollectResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasAutoCollected = useRef(false);

  const runCollect = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sources/collect", { method: "POST" });
      if (!res.ok)
        throw new Error(`Data collection failed (HTTP ${res.status}). Check server logs.`);
      const json = (await res.json()) as CollectResult;
      setData(json);
      setLastRun(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Collection failed");
    } finally {
      setLoading(false);
    }
  }, [loading]);

  useEffect(() => {
    if (hasAutoCollected.current) return;
    hasAutoCollected.current = true;
    void runCollect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const src = (key: string): SourceSnapshot | undefined =>
    data?.sources[key] as SourceSnapshot | undefined;

  const reoSnapshots = REO_SOURCE_KEYS.map((key) => ({
    key,
    snap: src(key),
  }));

  const totalSources = REO_SOURCE_KEYS.length;
  const sourcesWithData = reoSnapshots.filter((s) => s.snap && s.snap.success).length;
  const totalSignals = reoSnapshots.reduce(
    (acc, { snap }) => acc + (snap?.data?.length || 0),
    0,
  );
  const stateCounts = extractStateCoverage(reoSnapshots);
  const topState = topStateByActivity(stateCounts);

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <section className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">
              REO Agent Intelligence
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-[#111827]">
              REO Agent Intelligence Hub
            </h1>
            <p className="mt-1 text-sm text-[#6B7280]">
              Comprehensive REO & foreclosure listing sources — {totalSources} sources
              monitored live for active inventory signals
            </p>
            {data && (
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="font-semibold text-emerald-700">
                    {data.sources_used.length} live
                  </span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  <span className="font-semibold text-amber-700">
                    {data.sources_warning.length} warnings
                  </span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                  <span className="font-semibold text-rose-700">
                    {data.sources_failed.length} failed
                  </span>
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {lastRun && (
              <span className="text-[11px] text-[#9CA3AF]">Updated: {lastRun}</span>
            )}
            <button
              onClick={runCollect}
              disabled={loading}
              className="rounded-lg bg-[#2563EB] px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1D4ED8] disabled:opacity-60"
            >
              {loading ? "Collecting…" : "Refresh REO Sources"}
            </button>
          </div>
        </div>
        {error && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
      </section>

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Total Sources Active"
          value={totalSources.toString()}
          sub="REO & foreclosure sources monitored"
        />
        <StatCard
          label="Total Listing Signals"
          value={totalSignals.toLocaleString()}
          sub="Signals collected across all sources"
        />
        <StatCard
          label="Sources with Live Data"
          value={data ? `${sourcesWithData} / ${totalSources}` : "—"}
          sub="Sources returning successful results"
        />
        <StatCard
          label="Top State by Activity"
          value={topState}
          sub={
            topState !== "—"
              ? `${stateCounts[topState] ?? 0} signals detected`
              : "Run collection to populate"
          }
        />
      </div>

      {loading && !data && (
        <div className="rounded-xl border border-dashed border-[#D1D5DB] bg-white py-16 text-center text-sm text-[#6B7280]">
          Collecting from {totalSources} REO sources…
        </div>
      )}

      {/* ── Live REO Sources Grid ── */}
      <section className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">
              Source Monitor
            </p>
            <h2 className="mt-0.5 text-lg font-semibold text-[#111827]">Live REO Sources</h2>
            <p className="mt-0.5 text-[11px] text-[#9CA3AF]">
              Bank-owned, VA, USDA, GSA, sheriff sales & auction portals
            </p>
          </div>
          <span className="rounded-full bg-[#EFF6FF] px-2.5 py-0.5 text-[11px] font-semibold text-[#2563EB]">
            {totalSources} sources
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {reoSnapshots.map(({ key, snap }) => (
            <SourceCard key={key} sourceKey={key} snap={snap} />
          ))}
        </div>
      </section>

      {/* ── Sample Listings Table ── */}
      <section className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
        <div className="flex items-end justify-between mb-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">
              Listing Intelligence
            </p>
            <h2 className="mt-0.5 text-lg font-semibold text-[#111827]">Sample Listings</h2>
            <p className="mt-0.5 text-[11px] text-[#9CA3AF]">
              Recent listing signals — up to 50 most recent across all REO sources
            </p>
          </div>
          {totalSignals > 0 && (
            <span className="rounded-full bg-[#EFF6FF] px-2.5 py-0.5 text-[11px] font-semibold text-[#2563EB]">
              {totalSignals.toLocaleString()} total
            </span>
          )}
        </div>
        <ListingsTable snapshots={reoSnapshots} />
      </section>

      {/* ── State Coverage Map ── */}
      <section className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
        <div className="flex items-end justify-between mb-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">
              Geographic Coverage
            </p>
            <h2 className="mt-0.5 text-lg font-semibold text-[#111827]">
              Source Coverage Map
            </h2>
            <p className="mt-0.5 text-[11px] text-[#9CA3AF]">
              States with active listing signals detected — bar shows relative signal volume
            </p>
          </div>
          {Object.keys(stateCounts).length > 0 && (
            <span className="rounded-full bg-[#EFF6FF] px-2.5 py-0.5 text-[11px] font-semibold text-[#2563EB]">
              {Object.keys(stateCounts).length} states
            </span>
          )}
        </div>
        <StateCoverageSection stateCounts={stateCounts} />
      </section>
    </div>
  );
}
