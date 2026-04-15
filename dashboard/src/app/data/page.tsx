"use client";

import { useEffect, useState, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(val: unknown, suffix = ""): string {
  if (val === null || val === undefined || val === "") return "—";
  if (typeof val === "number") return val.toLocaleString() + suffix;
  const n = parseFloat(String(val).replace(/,/g, ""));
  if (!isNaN(n)) return n.toLocaleString(undefined, { maximumFractionDigits: 2 }) + suffix;
  return String(val);
}

function pct(val: unknown): string {
  if (val === null || val === undefined || val === "") return "—";
  const n = parseFloat(String(val).replace(/,/g, ""));
  if (isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function deltaColor(val: unknown, _invertGood = false): string {
  const n = parseFloat(String(val ?? "").replace(/,/g, ""));
  if (isNaN(n) || n === 0) return "text-[#7a7165]";
  const positive = n > 0;
  const good = _invertGood ? !positive : positive;
  return good ? "text-emerald-700" : "text-rose-600";
}

function statusDot(success: boolean, errors: string[]): string {
  if (success && errors.length === 0) return "bg-emerald-500";
  if (success) return "bg-amber-400";
  return "bg-rose-500";
}

function statusLabel(success: boolean, errors: string[]): string {
  if (success && errors.length === 0) return "Live";
  if (success) return "Warnings";
  return "Failed";
}

// ─── Mini bar chart (pure CSS, no lib) ───────────────────────────────────────

function BarChart({ values, labels, color = "#72262a" }: {
  values: number[]; labels: string[]; color?: string;
}) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-0.5 h-16">
      {values.map((v, i) => (
        <div key={i} className="flex flex-col items-center gap-0.5 flex-1 min-w-0">
          <div
            className="w-full rounded-t-sm transition-all"
            style={{ height: `${Math.max(2, Math.round((v / max) * 48))}px`, backgroundColor: color }}
          />
          <span className="text-[7px] text-[#9a8f84] truncate w-full text-center leading-none">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Card components ──────────────────────────────────────────────────────────

function StatCard({ label, value, sub, href }: {
  label: string; value: string; sub?: string; href?: string;
}) {
  const inner = (
    <div className={`rounded-xl border border-black/8 bg-white px-4 py-3 shadow-sm h-full ${href ? "hover:shadow-md hover:border-[#72262a]/20 transition cursor-pointer" : ""}`}>
      <p className="text-[10px] uppercase tracking-[0.15em] text-[#7a6b60]">{label}</p>
      <p className="mt-1 text-2xl font-bold text-[#1a1a1a] leading-none">{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-[#7a7165]">{sub}</p>}
      {href && <p className="mt-1 text-[9px] text-[#72262a] font-medium">↗ View source</p>}
    </div>
  );
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer">{inner}</a>
  ) : inner;
}

function SectionHeader({ label, title, count, sub }: {
  label: string; title: string; count?: number; sub?: string;
}) {
  return (
    <div className="flex items-end justify-between">
      <div>
        <p className="text-[10px] uppercase tracking-[0.18em] text-[#7a6b60]">{label}</p>
        <h2 className="mt-0.5 text-lg font-semibold text-[#1a1a1a]">{title}</h2>
        {sub && <p className="mt-0.5 text-[11px] text-[#7a7165]">{sub}</p>}
      </div>
      {count !== undefined && (
        <span className="rounded-full bg-[#f3e7e8] px-2.5 py-0.5 text-[11px] font-semibold text-[#72262a]">
          {count} items
        </span>
      )}
    </div>
  );
}

function SourceBadge({ snap, name }: { snap: SourceSnapshot | undefined; name: string }) {
  if (!snap) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-black/8 bg-[#fbfaf8] px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-slate-300 flex-shrink-0" />
        <span className="text-xs text-[#1a1a1a] font-medium truncate">{name}</span>
        <span className="ml-auto text-[10px] text-[#9a8f84] shrink-0">—</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-lg border border-black/8 bg-[#fbfaf8] px-3 py-2">
      <span className={`h-2 w-2 rounded-full flex-shrink-0 ${statusDot(snap.success, snap.errors)}`} />
      <span className="text-xs text-[#1a1a1a] font-medium truncate">{name}</span>
      <span className={`ml-auto text-[10px] shrink-0 ${snap.success ? "text-emerald-700" : "text-rose-600"}`}>
        {statusLabel(snap.success, snap.errors)}
      </span>
    </div>
  );
}

// ─── FRED Panel ───────────────────────────────────────────────────────────────

function FredPanel({ snap }: { snap: SourceSnapshot | undefined }) {
  if (!snap?.data?.length) return null;
  const series = snap.data as Array<{
    label: string; latest_value: string; latest_date: string;
    unit: string; recent_observations: Array<{ date: string; value: string }>;
  }>;
  return (
    <section className="rounded-2xl border border-black/8 bg-white/95 p-4 shadow-sm">
      <SectionHeader
        label="Federal Reserve — FRED API"
        title="Mortgage Market Indicators"
        count={series.length}
        sub="Delinquency rates, mortgage rates, housing starts — St. Louis Fed"
      />
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {series.map((s) => {
          const val = s.latest_value ? parseFloat(s.latest_value) : null;
          const display = val !== null
            ? `${val.toFixed(2)}${s.unit === "percent" ? "%" : ""}`
            : "—";
          const obs = (s.recent_observations || []).slice(-8);
          const nums = obs.map((o) => parseFloat(o.value)).filter((n) => !isNaN(n));
          const obsLabels = obs.map((o) => o.date.slice(5));
          return (
            <div key={s.label} className="rounded-xl border border-black/8 bg-white p-3 shadow-sm">
              <p className="text-[9px] uppercase tracking-[0.12em] text-[#7a6b60] leading-tight">
                {s.label.split("—")[0].trim().replace(/^Delinquency Rate - /, "").slice(0, 40)}
              </p>
              <p className="mt-1 text-xl font-bold text-[#1a1a1a]">{display}</p>
              <p className="text-[10px] text-[#9a8f84]">{s.latest_date}</p>
              {nums.length > 2 && (
                <div className="mt-2">
                  <BarChart values={nums} labels={obsLabels} color="#72262a" />
                </div>
              )}
              <a
                href="https://fred.stlouisfed.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 block text-[9px] text-[#72262a] font-medium hover:underline"
              >
                ↗ FRED Source
              </a>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── Redfin State Panel ───────────────────────────────────────────────────────

function RedfinStatePanel({ snap }: { snap: SourceSnapshot | undefined }) {
  if (!snap?.data?.length) return null;
  const pulse = snap.data.find((d) => (d as Record<string, unknown>).content_type === "market_pulse") as
    | { states: Array<Record<string, string>>; period: string } | undefined;
  if (!pulse?.states?.length) return null;

  const top12 = pulse.states
    .filter((s) => s.inventory && s.median_sale_price)
    .sort((a, b) => parseFloat(b.inventory || "0") - parseFloat(a.inventory || "0"))
    .slice(0, 12);

  const prices = top12.map((s) => parseFloat(s.median_sale_price || "0") / 1000);
  const stateLabels = top12.map((s) => s.state_code || (s.state || "").slice(0, 3));

  return (
    <section className="rounded-2xl border border-black/8 bg-white/95 p-4 shadow-sm">
      <SectionHeader
        label={`Redfin Public S3 · ${pulse.period}`}
        title="State Market Snapshot"
        count={pulse.states.length}
        sub="Median price, inventory, days on market — free public data"
      />
      <div className="mt-3 mb-4">
        <p className="text-[10px] text-[#7a7165] mb-1.5">Median Sale Price ($K) — Top 12 States by Inventory</p>
        <BarChart values={prices} labels={stateLabels} color="#3b6e8c" />
      </div>
      <div className="overflow-x-auto rounded-xl border border-black/8">
        <table className="min-w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr className="bg-[#f4f0ea] text-left text-[10px] uppercase tracking-[0.1em] text-[#7a6b60]">
              <th className="px-3 py-2">State</th>
              <th className="px-3 py-2">Median Price</th>
              <th className="px-3 py-2">YoY</th>
              <th className="px-3 py-2">Inventory</th>
              <th className="px-3 py-2">Inv YoY</th>
              <th className="px-3 py-2">Mo. Supply</th>
              <th className="px-3 py-2">DOM</th>
              <th className="px-3 py-2">Source</th>
            </tr>
          </thead>
          <tbody>
            {top12.map((s, i) => (
              <tr key={s.state || i} className={i % 2 === 0 ? "bg-white" : "bg-[#faf8f6]"}>
                <td className="px-3 py-1.5 font-semibold text-[#1a1a1a]">{s.state || s.state_code}</td>
                <td className="px-3 py-1.5">{fmt(s.median_sale_price)}</td>
                <td className={`px-3 py-1.5 font-semibold ${deltaColor(s.median_sale_price_yoy)}`}>{pct(s.median_sale_price_yoy)}</td>
                <td className="px-3 py-1.5">{fmt(s.inventory)}</td>
                <td className={`px-3 py-1.5 font-semibold ${deltaColor(s.inventory_yoy)}`}>{pct(s.inventory_yoy)}</td>
                <td className="px-3 py-1.5">{fmt(s.months_of_supply)}</td>
                <td className="px-3 py-1.5">{fmt(s.median_dom)} days</td>
                <td className="px-3 py-1.5">
                  <a href="https://redfin-public-data.s3.us-west-2.amazonaws.com/redfin_market_tracker/state_market_tracker.tsv000.gz"
                    target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-[#72262a] hover:underline font-medium">↗ S3</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── Redfin Hot Markets ───────────────────────────────────────────────────────

function RedfinHotMarketsPanel({ snap }: { snap: SourceSnapshot | undefined }) {
  if (!snap?.data?.length) return null;
  const hm = snap.data.find((d) => (d as Record<string, unknown>).content_type === "hot_markets") as
    | { top_counties: Array<Record<string, string>>; period: string } | undefined;
  if (!hm?.top_counties?.length) return null;

  const top15 = hm.top_counties.slice(0, 15);
  const scores = top15.map((c) => parseFloat(c.distress_score || "0"));
  const countyLabels = top15.map((c) => (c.region || "").replace(" County", "").slice(0, 8));

  return (
    <section className="rounded-2xl border border-black/8 bg-white/95 p-4 shadow-sm">
      <SectionHeader
        label={`Redfin · ${hm.period}`}
        title="Top Distressed Counties"
        count={hm.top_counties.length}
        sub="High inventory + price drops + extended days on market = distress signal"
      />
      <div className="mt-3 mb-4">
        <p className="text-[10px] text-[#7a7165] mb-1.5">Distress Score — Top 15 Counties</p>
        <BarChart values={scores} labels={countyLabels} color="#a83232" />
      </div>
      <div className="overflow-x-auto rounded-xl border border-black/8">
        <table className="min-w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr className="bg-[#f4f0ea] text-left text-[10px] uppercase tracking-[0.1em] text-[#7a6b60]">
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">County</th>
              <th className="px-3 py-2">State</th>
              <th className="px-3 py-2">Score</th>
              <th className="px-3 py-2">Inv YoY</th>
              <th className="px-3 py-2">Price Drops</th>
              <th className="px-3 py-2">DOM</th>
              <th className="px-3 py-2">Mo. Supply</th>
              <th className="px-3 py-2">Source</th>
            </tr>
          </thead>
          <tbody>
            {top15.map((c, i) => (
              <tr key={c.region || i} className={i % 2 === 0 ? "bg-white" : "bg-[#faf8f6]"}>
                <td className="px-3 py-1.5 font-bold text-[#72262a]">#{i + 1}</td>
                <td className="px-3 py-1.5 font-semibold text-[#1a1a1a]">{c.region}</td>
                <td className="px-3 py-1.5 text-[#5a5048]">{c.state_code}</td>
                <td className="px-3 py-1.5">
                  <span className="rounded-full bg-[#f3e7e8] px-2 py-0.5 text-[10px] font-bold text-[#72262a]">
                    {c.distress_score}
                  </span>
                </td>
                <td className={`px-3 py-1.5 font-semibold ${deltaColor(c.inventory_yoy)}`}>{pct(c.inventory_yoy)}</td>
                <td className={`px-3 py-1.5 font-semibold ${deltaColor(c.price_drops_yoy)}`}>{pct(c.price_drops)}</td>
                <td className="px-3 py-1.5">{fmt(c.median_dom)} days</td>
                <td className="px-3 py-1.5">{fmt(c.months_of_supply)}</td>
                <td className="px-3 py-1.5">
                  <a href="https://redfin-public-data.s3.us-west-2.amazonaws.com/redfin_market_tracker/county_market_tracker.tsv000.gz"
                    target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-[#72262a] hover:underline font-medium">↗ S3</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── Fed Large Banks Panel ────────────────────────────────────────────────────

function FedLargeBanksPanel({ snap }: { snap: SourceSnapshot | undefined }) {
  if (!snap?.data?.length) return null;
  const block = snap.data.find((d) => (d as Record<string, unknown>).content_type === "large_bank_ranking") as
    | { banks: Array<Record<string, unknown>>; count: number; report_date: string; total_industry_assets_display: string; source_url: string; reference_url: string; ffiec_nic_url: string } | undefined;
  if (!block?.banks?.length) return null;

  const top10 = block.banks.slice(0, 10);
  const assets = top10.map((b) => Number(b.total_assets_thousands || 0) / 1_000_000);
  const bankLabels = top10.map((b) => String(b.bank_name || "").replace(/,.*/, "").replace(/\s+Bank.*/, "").slice(0, 10));

  return (
    <section className="rounded-2xl border border-black/8 bg-white/95 p-4 shadow-sm">
      <SectionHeader
        label={`FDIC BankFind · ${block.report_date} · Fed Reserve LCR`}
        title="Top 25 U.S. Commercial Banks"
        count={block.count}
        sub={`Combined assets of top 25: ${block.total_industry_assets_display || "—"} — institutions holding REO portfolios`}
      />
      <div className="mt-3 mb-4">
        <p className="text-[10px] text-[#7a7165] mb-1.5">Total Assets ($T) — Top 10 Banks</p>
        <BarChart values={assets} labels={bankLabels} color="#1e4d6e" />
      </div>
      <div className="overflow-x-auto rounded-xl border border-black/8">
        <table className="min-w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr className="bg-[#f4f0ea] text-left text-[10px] uppercase tracking-[0.1em] text-[#7a6b60]">
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Bank</th>
              <th className="px-3 py-2">State</th>
              <th className="px-3 py-2">Total Assets</th>
              <th className="px-3 py-2">Deposits</th>
              <th className="px-3 py-2">Net Income</th>
              <th className="px-3 py-2">As of</th>
              <th className="px-3 py-2">Source</th>
            </tr>
          </thead>
          <tbody>
            {block.banks.slice(0, 25).map((b, i) => (
              <tr key={`${String(b.bank_name)}-${i}`} className={i % 2 === 0 ? "bg-white" : "bg-[#faf8f6]"}>
                <td className="px-3 py-1.5 font-bold text-[#1e4d6e]">{String(b.rank)}</td>
                <td className="px-3 py-1.5 font-semibold text-[#1a1a1a] max-w-[180px] truncate">{String(b.bank_name)}</td>
                <td className="px-3 py-1.5 text-[#5a5048]">{String(b.state)}</td>
                <td className="px-3 py-1.5 font-semibold text-[#1e4d6e]">{String(b.total_assets_display || "—")}</td>
                <td className="px-3 py-1.5">{String(b.total_deposits_display || "—")}</td>
                <td className={`px-3 py-1.5 font-semibold ${Number(b.net_income_thousands || 0) >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                  {String(b.net_income_display || "—")}
                </td>
                <td className="px-3 py-1.5 text-[#9a8f84]">{String(b.report_date)}</td>
                <td className="px-3 py-1.5">
                  <a href={String(b.source_url || "https://banks.data.fdic.gov/")}
                    target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-[#72262a] hover:underline font-medium">↗ FDIC</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex gap-4 flex-wrap">
        <a href={block.reference_url} target="_blank" rel="noopener noreferrer"
          className="text-[11px] text-[#5a5048] hover:text-[#72262a] hover:underline">Fed Reserve LCR Release →</a>
        <a href={block.ffiec_nic_url} target="_blank" rel="noopener noreferrer"
          className="text-[11px] text-[#5a5048] hover:text-[#72262a] hover:underline">FFIEC NIC Holding Companies →</a>
      </div>
    </section>
  );
}

// ─── FDIC Failures Panel ──────────────────────────────────────────────────────

function FdicPanel({ snap }: { snap: SourceSnapshot | undefined }) {
  if (!snap?.data?.length) return null;
  const failBlock = snap.data.find((d) => (d as Record<string, unknown>).content_type === "bank_failures") as
    | { failures: Array<Record<string, unknown>>; count: number } | undefined;
  if (!failBlock?.failures?.length) return null;

  const recent = failBlock.failures.slice(0, 10);
  const assets = recent.map((f) => Number(f.total_assets_thousands || 0) / 1000);
  const bankNames = recent.map((f) => String(f.bank_name || "").split(" ")[0].slice(0, 8));

  return (
    <section className="rounded-2xl border border-black/8 bg-white/95 p-4 shadow-sm">
      <SectionHeader
        label="FDIC BankFind API"
        title="Recent Bank Failures"
        count={failBlock.count}
        sub="Failed banks' assets enter FDIC receivership — REO sold through acquiring institutions"
      />
      <div className="mt-3 mb-4">
        <p className="text-[10px] text-[#7a7165] mb-1.5">Total Assets ($M) — Most Recent Failures</p>
        <BarChart values={assets} labels={bankNames} color="#b45309" />
      </div>
      <div className="overflow-x-auto rounded-xl border border-black/8">
        <table className="min-w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr className="bg-[#f4f0ea] text-left text-[10px] uppercase tracking-[0.1em] text-[#7a6b60]">
              <th className="px-3 py-2">Bank</th>
              <th className="px-3 py-2">Location</th>
              <th className="px-3 py-2">Fail Date</th>
              <th className="px-3 py-2">Assets</th>
              <th className="px-3 py-2">Acquiring</th>
              <th className="px-3 py-2">Resolution</th>
              <th className="px-3 py-2">Source</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((f, i) => (
              <tr key={`${String(f.bank_name)}-${i}`} className={i % 2 === 0 ? "bg-white" : "bg-[#faf8f6]"}>
                <td className="px-3 py-1.5 font-semibold text-[#1a1a1a]">{String(f.bank_name)}</td>
                <td className="px-3 py-1.5 text-[#5a5048]">{String(f.city_state || "")}</td>
                <td className="px-3 py-1.5">{String(f.fail_date)}</td>
                <td className="px-3 py-1.5 font-semibold">
                  {f.total_assets_thousands ? `$${(Number(f.total_assets_thousands) / 1000).toFixed(1)}M` : "—"}
                </td>
                <td className="px-3 py-1.5 text-[#5a5048] max-w-[120px] truncate">{String(f.acquiring_institution || "FDIC Receiver")}</td>
                <td className="px-3 py-1.5">
                  <span className="rounded-full bg-[#fff3cd] px-2 py-0.5 text-[10px] font-semibold text-[#856404]">
                    {String(f.resolution_type || "FAILURE")}
                  </span>
                </td>
                <td className="px-3 py-1.5">
                  <a href={String(f.portal_url || "https://www.fdic.gov/bank/individual/failed/banklist.html")}
                    target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-[#72262a] hover:underline font-medium">↗ FDIC</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── Auction Portals Panel ────────────────────────────────────────────────────

function AuctionPortalsPanel({ snap }: { snap: SourceSnapshot | undefined }) {
  if (!snap?.data?.length) return null;
  const block = snap.data.find((d) => (d as Record<string, unknown>).content_type === "auction_portals") as
    | { portals: Array<Record<string, unknown>>; accessible_count: number; total_portals: number; total_known_listings: number | null } | undefined;
  if (!block?.portals?.length) return null;

  return (
    <section className="rounded-2xl border border-black/8 bg-white/95 p-4 shadow-sm">
      <SectionHeader
        label="REO & Foreclosure Auction Portals"
        title="Marketplace Monitor"
        count={block.total_portals}
        sub={`${block.accessible_count}/${block.total_portals} portals online${block.total_known_listings ? ` · ${block.total_known_listings.toLocaleString()} listings detected` : ""}`}
      />
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {block.portals.map((p, i) => {
          const ok = p.accessible as boolean;
          return (
            <a key={i} href={String(p.search_url || p.portal_url || "#")}
              target="_blank" rel="noopener noreferrer"
              className="group rounded-xl border border-black/8 bg-white p-3 shadow-sm hover:shadow-md hover:border-[#72262a]/25 transition block">
              <div className="flex items-center justify-between mb-1.5">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                  ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-500" : "bg-rose-400"}`} />
                  {ok ? "Online" : "Blocked"}
                </span>
                <span className="text-[9px] text-[#9a8f84] uppercase tracking-wide">{String(p.category || "")}</span>
              </div>
              <p className="text-sm font-bold text-[#1a1a1a] group-hover:text-[#72262a] transition leading-tight">{String(p.portal_name)}</p>
              <p className="mt-1 text-[10px] text-[#7a7165] leading-snug line-clamp-2">{String(p.description || "")}</p>
              <div className="mt-2 flex items-center justify-between">
                {p.listing_count ? (
                  <span className="text-[11px] font-bold text-[#1a1a1a]">{Number(p.listing_count).toLocaleString()} listings</span>
                ) : (
                  <span className="text-[10px] text-[#9a8f84] truncate">{String(p.note || "").slice(0, 30)}</span>
                )}
                <span className="text-[10px] text-[#72262a] font-medium group-hover:underline shrink-0 ml-1">Browse →</span>
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}

// ─── GSA Government Auctions Panel ───────────────────────────────────────────

function GsaAuctionsPanel({ snap }: { snap: SourceSnapshot | undefined }) {
  if (!snap?.data?.length) return null;
  const block = snap.data.find((d) => (d as Record<string, unknown>).content_type === "government_auctions") as
    | { portals: Array<Record<string, unknown>>; accessible_count: number } | undefined;
  if (!block?.portals?.length) return null;

  return (
    <section className="rounded-2xl border border-black/8 bg-white/95 p-4 shadow-sm">
      <SectionHeader
        label="Federal Government Disposition"
        title="Government Property Auctions"
        count={block.portals.length}
        sub="GSA surplus · USMS forfeitures · Treasury — seized and surplus real property"
      />
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {block.portals.map((p, i) => {
          const ok = p.accessible as boolean;
          return (
            <a key={i} href={String(p.portal_url || "#")}
              target="_blank" rel="noopener noreferrer"
              className="group rounded-xl border border-black/8 bg-white p-3 shadow-sm hover:shadow-md hover:border-[#1e4d6e]/25 transition block">
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`h-2 w-2 rounded-full shrink-0 ${ok ? "bg-emerald-500" : "bg-slate-300"}`} />
                <span className="text-[9px] font-bold uppercase tracking-wider text-[#7a6b60]">
                  {ok ? "Accessible" : "Unavailable"}
                </span>
              </div>
              <p className="text-sm font-bold text-[#1a1a1a] group-hover:text-[#1e4d6e] transition leading-tight">{String(p.agency)}</p>
              <p className="mt-1 text-[10px] text-[#7a7165] leading-snug">{String(p.description || "")}</p>
              {p.listing_count && (
                <p className="mt-1.5 text-[11px] font-bold text-[#1a1a1a]">{Number(p.listing_count).toLocaleString()} auctions</p>
              )}
              <p className="mt-1.5 text-[10px] text-[#1e4d6e] font-medium group-hover:underline">View auctions →</p>
            </a>
          );
        })}
      </div>
    </section>
  );
}

// ─── HomeSteps Panel ──────────────────────────────────────────────────────────

function HomeStepsPanel({ snap }: { snap: SourceSnapshot | undefined }) {
  if (!snap?.data?.length) return null;
  const signal = snap.data[0] as Record<string, unknown>;
  return (
    <section className="rounded-2xl border border-black/8 bg-white/95 p-4 shadow-sm">
      <SectionHeader label="Freddie Mac — HomeSteps" title="HomeSteps REO Portal" />
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Portal" value="HomeSteps" sub="Freddie Mac official REO" href="https://www.homesteps.com/homes/search" />
        <StatCard label="HTTP Status" value={String(signal.http_status || "—")} sub={String(signal.availability_note || "—")} />
        {signal.listing_count !== undefined && (
          <StatCard label="Listing Count" value={fmt(signal.listing_count)} sub="Extracted from page" href="https://www.homesteps.com/homes/search" />
        )}
        <StatCard label="Program" value="First Look" sub="20-day owner-occupant exclusivity" />
      </div>
      <div className="mt-3 flex gap-3 flex-wrap">
        <a href="https://www.homesteps.com/homes/search" target="_blank" rel="noopener noreferrer"
          className="rounded-full border border-[#72262a]/30 bg-[#f3e7e8] px-4 py-1.5 text-xs font-semibold text-[#72262a] transition hover:bg-[#ead8d9]">
          Browse HomeSteps →
        </a>
        <a href="https://www.freddiemac.com/research/indices" target="_blank" rel="noopener noreferrer"
          className="rounded-full border border-black/10 bg-white px-4 py-1.5 text-xs font-medium text-[#5a5048] transition hover:bg-[#f4f0ea]">
          Freddie Mac Research →
        </a>
      </div>
    </section>
  );
}

// ─── News Panel ───────────────────────────────────────────────────────────────

function NewsPanel({ snap, sourceName, sourceUrl }: {
  snap: SourceSnapshot | undefined; sourceName: string; sourceUrl?: string;
}) {
  if (!snap?.data?.length) return null;
  const articles = snap.data.slice(0, 6) as Array<{
    title: string; url: string; description: string; published_at: string;
  }>;
  return (
    <div className="rounded-xl border border-black/8 bg-white p-3 shadow-sm flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#7a6b60]">{sourceName}</p>
        {sourceUrl && (
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer"
            className="text-[9px] text-[#72262a] hover:underline font-medium">↗ Source</a>
        )}
      </div>
      <p className="text-[11px] text-[#6a5f54] mb-2">{snap.data.length} articles</p>
      <div className="space-y-2">
        {articles.map((a, i) => (
          <div key={i} className="border-t border-black/6 pt-2 first:border-0 first:pt-0">
            <a href={a.url} target="_blank" rel="noopener noreferrer"
              className="text-xs font-semibold text-[#1a1a1a] hover:text-[#72262a] hover:underline leading-tight block">
              {a.title}
            </a>
            {a.description && (
              <p className="mt-0.5 text-[10px] text-[#7a7165] leading-snug line-clamp-2">{a.description}</p>
            )}
            <div className="mt-0.5 flex items-center gap-2">
              <p className="text-[10px] text-[#9a8f84]">{a.published_at}</p>
              {a.url && (
                <a href={a.url} target="_blank" rel="noopener noreferrer"
                  className="text-[9px] text-[#72262a] hover:underline">↗ Read</a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const SOURCE_NAMES: Record<string, string> = {
  grok: "Grok / X",
  reddit: "Reddit",
  news_api: "News API",
  foreclosure_com: "Foreclosure.com",
  zillow_research: "Zillow RSS",
  zillow_listing: "Zillow Listings",
  housingwire: "HousingWire",
  mortgagepoint: "MortgagePoint",
  redfin_market: "Redfin S3",
  fred: "FRED API",
  fdic: "FDIC BankFind",
  homesteps: "HomeSteps",
  auction_portals: "Auction Portals",
  gsa_auctions: "GSA Auctions",
  fed_large_banks: "Fed Large Banks",
};

export default function DataPage() {
  const [data, setData] = useState<CollectResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runCollect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/sources/collect`, { method: "POST" });
      if (!res.ok) throw new Error(`API error ${res.status} — is FastAPI running on ${API_URL}?`);
      const json = (await res.json()) as CollectResult;
      setData(json);
      setLastRun(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Collection failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void runCollect(); }, [runCollect]);

  const src = (key: string): SourceSnapshot | undefined =>
    data?.sources[key] as SourceSnapshot | undefined;

  const newsArticleCount =
    (src("housingwire")?.data.length || 0) +
    (src("mortgagepoint")?.data.length || 0) +
    (src("zillow_research")?.data.length || 0) +
    (src("news_api")?.data.length || 0) +
    (src("reddit")?.data.length || 0) +
    (src("grok")?.data.length || 0);

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <section className="rounded-2xl border border-white/70 bg-white/88 p-5 shadow-[0_16px_50px_rgba(26,26,26,0.10)] backdrop-blur-xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#7a6b60]">Live Intelligence</p>
            <h1 className="mt-1 text-2xl font-semibold text-[#1a1a1a]">Market Data Center</h1>
            <p className="mt-1 text-sm text-[#6a5f54]">
              REO market intelligence — {Object.keys(SOURCE_NAMES).length} sources aggregated live
            </p>
            {data && (
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="font-semibold text-emerald-700">{data.sources_used.length} live</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  <span className="font-semibold text-amber-700">{data.sources_warning.length} warnings</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                  <span className="font-semibold text-rose-700">{data.sources_failed.length} failed</span>
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {lastRun && <span className="text-[11px] text-[#7a7165]">Updated: {lastRun}</span>}
            <button
              onClick={runCollect}
              disabled={loading}
              className="rounded-full bg-[#72262a] px-5 py-2 text-sm font-semibold text-white shadow transition hover:bg-[#5a1e21] disabled:opacity-60"
            >
              {loading ? "Collecting…" : "Refresh All Sources"}
            </button>
          </div>
        </div>
        {error && (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}
      </section>

      {/* ── Source Status Grid ── */}
      <section className="rounded-2xl border border-black/8 bg-white/95 p-4 shadow-sm">
        <SectionHeader label="Pipeline Health" title="Source Status" count={Object.keys(SOURCE_NAMES).length} />
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {Object.entries(SOURCE_NAMES).map(([key, name]) => (
            <SourceBadge key={key} snap={src(key)} name={name} />
          ))}
        </div>
      </section>

      {loading && !data && (
        <div className="rounded-2xl border border-dashed border-[#d8ccb9] bg-[#fbfaf8] py-16 text-center text-sm text-[#7a7165]">
          Collecting from {Object.keys(SOURCE_NAMES).length} sources…
        </div>
      )}

      {data && (
        <>
          <FredPanel snap={src("fred")} />
          <RedfinStatePanel snap={src("redfin_market")} />
          <RedfinHotMarketsPanel snap={src("redfin_market")} />
          <FedLargeBanksPanel snap={src("fed_large_banks")} />
          <FdicPanel snap={src("fdic")} />
          <AuctionPortalsPanel snap={src("auction_portals")} />
          <GsaAuctionsPanel snap={src("gsa_auctions")} />
          <HomeStepsPanel snap={src("homesteps")} />

          <section className="rounded-2xl border border-black/8 bg-white/95 p-4 shadow-sm">
            <SectionHeader
              label="Industry Intelligence"
              title="News & Market Feeds"
              count={newsArticleCount}
              sub="RSS + API feeds — HousingWire, MortgagePoint, Zillow, News API, Reddit"
            />
            <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              <NewsPanel snap={src("housingwire")} sourceName="HousingWire" sourceUrl="https://www.housingwire.com/feed/" />
              <NewsPanel snap={src("mortgagepoint")} sourceName="The MortgagePoint" sourceUrl="https://themortgagepoint.com/feed/" />
              <NewsPanel snap={src("zillow_research")} sourceName="Zillow Research" sourceUrl="https://www.zillow.com/research/feed/" />
              <NewsPanel snap={src("news_api")} sourceName="News API" sourceUrl="https://newsapi.org/" />
              <NewsPanel snap={src("reddit")} sourceName="Reddit r/realestate" sourceUrl="https://www.reddit.com/r/realestate/" />
              <NewsPanel snap={src("grok")} sourceName="Grok / X" sourceUrl="https://x.com/" />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
