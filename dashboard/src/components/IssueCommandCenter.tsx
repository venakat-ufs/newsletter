"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import type { Draft } from "@/lib/api";
import {
  getIssueWeekLabel,
  getLeadSection,
  getInsightMetrics,
  getMarketHighlights,
  getNewsHighlights,
  getSectionBlueprint,
  getSourceCards,
  getWorkflowSteps,
} from "@/lib/newsletter-intel";
import { pretextCompact } from "@/lib/pretext";

const modeClasses: Record<string, string> = {
  live: "bg-emerald-100 text-emerald-800",
  degraded: "bg-orange-100 text-orange-800",
  offline: "bg-rose-100 text-rose-800",
};

const stepClasses: Record<string, string> = {
  complete: "border-emerald-200 bg-emerald-50 text-emerald-800",
  active: "border-[#d6c4a4] bg-[#fff6e7] text-[#8a6023]",
  pending: "border-black/8 bg-white/70 text-[#695c50]",
};

const groupDescriptions: Record<string, string> = {
  "Official Inventory": "Direct listing inventory — HUD, Freddie Mac, Bank of America REO, auction platforms, and county sheriff/tax sales",
  "Official Research": "Primary market and policy releases from official organizations",
  "Hiring Intel": "Job postings across LinkedIn, USAJobs, Greenhouse, and Lever for REO, foreclosure, and default servicing roles",
  "Editorial Headlines": "Published newsroom articles filtered for industry relevance",
  "Community Signals": "Public community discussion and sentiment from Reddit subreddits",
  "AI Enrichment": "AI-assisted X search signals that should support, not lead, decisions",
  "Legacy Sources": "Archived source lanes kept only for older stored issues",
};
type SourceFilterMode = "all" | "live" | "degraded" | "offline";
type SourceDisplayLimit = "8" | "12" | "20" | "40" | "all";

export function IssueCommandCenter({ draft }: { draft: Draft }) {
  const issueNumber = draft.issue_number ?? draft.newsletter_id;
  const weekLabel = getIssueWeekLabel(draft.created_at);
  const leadSection = getLeadSection(draft);
  const metrics = getInsightMetrics(draft);
  const sources = getSourceCards(draft);
  const [sourceSearch, setSourceSearch] = useState("");
  const [sourceModeFilter, setSourceModeFilter] = useState<SourceFilterMode>("all");
  const [sourceGroupFilter, setSourceGroupFilter] = useState("all");
  const [sourceDisplayLimit, setSourceDisplayLimit] = useState<SourceDisplayLimit>("8");
  const workflow = getWorkflowSteps(draft);
  const sectionBlueprint = getSectionBlueprint(draft);
  const hotMarkets = getMarketHighlights(draft);
  const newsHighlights = getNewsHighlights(draft);
  const sourceGroups = useMemo(
    () => [...new Set(sources.map((source) => source.groupLabel))].sort((a, b) => a.localeCompare(b)),
    [sources],
  );
  const filteredSources = useMemo(() => {
    const query = sourceSearch.trim().toLowerCase();
    return sources.filter((source) => {
      if (sourceModeFilter !== "all" && source.mode !== sourceModeFilter) {
        return false;
      }
      if (sourceGroupFilter !== "all" && source.groupLabel !== sourceGroupFilter) {
        return false;
      }
      if (!query) {
        return true;
      }

      return (
        source.label.toLowerCase().includes(query) ||
        source.description.toLowerCase().includes(query) ||
        source.groupLabel.toLowerCase().includes(query)
      );
    });
  }, [sources, sourceSearch, sourceModeFilter, sourceGroupFilter]);
  const visibleSources = useMemo(() => {
    if (sourceDisplayLimit === "all") {
      return filteredSources;
    }

    return filteredSources.slice(0, Number(sourceDisplayLimit));
  }, [filteredSources, sourceDisplayLimit]);
  const hiddenSourceCount = filteredSources.length - visibleSources.length;
  const groupedSources = visibleSources.reduce<Record<string, typeof visibleSources>>((groups, source) => {
    if (!groups[source.groupLabel]) {
      groups[source.groupLabel] = [];
    }
    groups[source.groupLabel].push(source);
    return groups;
  }, {});

  return (
    <section className="mb-8 rounded-[36px] border border-white/70 bg-white/80 p-6 shadow-[0_28px_80px_rgba(26,26,26,0.10)] backdrop-blur-xl sm:p-8">
      <div className="grid gap-6 xl:grid-cols-[1.18fr_0.82fr]">
        <div className="overflow-hidden rounded-[30px] bg-[#1a1a1a] text-white shadow-[0_32px_80px_rgba(26,26,26,0.22)]">
          <div className="flex flex-col gap-5 border-b border-white/10 px-6 py-6 sm:px-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.32em] text-white/45">
                  Issue assembly board
                </p>
                <h2 className="mt-3 text-3xl font-semibold leading-tight text-white">
                  The Disposition Desk
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-white/72">
                  Track which platforms are feeding this issue, how the story arc
                  is being built, and what the admin will send once the issue is
                  approved.
                </p>
              </div>
              <div className="rounded-[24px] border border-white/14 bg-white/8 px-4 py-3 text-right backdrop-blur">
                <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">
                  Current issue
                </div>
                <div className="mt-2 text-2xl font-semibold">#{issueNumber}</div>
                <div className="mt-1 text-xs text-white/58">{weekLabel}</div>
              </div>
            </div>

            <div className="h-1 w-full rounded-full bg-[#72262a]" />

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {metrics.map((metric) => (
                <div
                  key={metric.label}
                  className={`rounded-[24px] border px-4 py-4 ${
                    metric.tone === "accent"
                      ? "border-[#72262a]/18 bg-[#f3e7e8] text-[#72262a]"
                      : metric.tone === "alert"
                        ? "border-[#7a2d2d] bg-[#392127] text-[#ffd7d7]"
                        : "border-white/10 bg-white/6 text-white"
                  }`}
                >
                  <div className="text-[11px] uppercase tracking-[0.2em] opacity-70">
                    {metric.label}
                  </div>
                  <div className="mt-2 text-3xl font-semibold leading-none">
                    {metric.value}
                  </div>
                  <div className="mt-2 text-xs leading-5 opacity-75">{metric.note}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[#72262a] px-6 py-4 sm:px-8">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white">
                Lead story path
              </div>
              <div className="text-xs text-white/76">
                Admin action: review the draft, then approve and send.
              </div>
            </div>
          </div>

          <div className="px-6 py-6 sm:px-8">
            <div className="rounded-[28px] bg-[#2c2c2c] px-5 py-5 ring-1 ring-white/10">
              <div className="inline-flex rounded-full bg-[#72262a] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white">
                This issue&apos;s lead
              </div>
              <h3 className="mt-4 text-2xl font-semibold leading-tight text-white">
                {leadSection?.title ?? "Run the pipeline and generate sections to shape the lead story."}
              </h3>
              <p className="mt-3 text-sm leading-7 text-white/72">
                {leadSection?.body.slice(0, 320) ??
                  "The command center will surface the newsletter opener here once the issue has enough source data and a generated draft."}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[30px] border border-black/6 bg-white/76 p-6">
            <p className="text-[11px] uppercase tracking-[0.24em] text-[#7a6b60]">
              Send workflow
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-[#1a1a1a]">
              How this issue gets built
            </h3>
            <div className="mt-5 space-y-3">
              {workflow.map((step, index) => (
                <div
                  key={step.label}
                  className={`rounded-[24px] border px-4 py-4 ${stepClasses[step.state]}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/80 text-sm font-semibold text-[#1a1a1a]">
                      {index + 1}
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{step.label}</div>
                      <div className="mt-1 text-xs leading-5 opacity-80">{step.detail}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Link
              href={`/drafts/${draft.id}`}
              className="mt-5 inline-flex rounded-full bg-[#1a1a1a] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#2c2c2c]"
            >
              Open issue workspace
            </Link>
          </div>

          <div className="rounded-[30px] border border-black/6 bg-[#fdf7ef] p-6">
            <p className="text-[11px] uppercase tracking-[0.24em] text-[#7a6b60]">
              Issue blueprint
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-[#1a1a1a]">
              Newsletter composition
            </h3>
            <div className="mt-5 space-y-3">
              {sectionBlueprint.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-[#d7c8b6] bg-white/70 px-4 py-5 text-sm text-[#6f6257]">
                  No composed sections yet. Generate the draft to map the issue.
                </div>
              ) : (
                sectionBlueprint.map((section, index) => (
                  <div
                    key={`${section.type}-${index}`}
                    className="rounded-[24px] border border-black/5 bg-white/82 px-4 py-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-[#1a1a1a]">
                        {section.label}
                      </div>
                      <div className="rounded-full bg-[#e8e4df] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[#5f5954]">
                        Slot {index + 1}
                      </div>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[#62564c]">
                      {section.teaser.slice(0, 150)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <div className="rounded-[30px] border border-black/6 bg-white/76 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-[#7a6b60]">
                Platform network
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-[#1a1a1a]">
                Where the issue is pulling from
              </h3>
            </div>
            <div className="rounded-full bg-[#f3e7e8] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#72262a]">
              {visibleSources.length}/{filteredSources.length} matching
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input
              value={sourceSearch}
              onChange={(event) => setSourceSearch(event.target.value)}
              placeholder="Search sources..."
              className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm text-[#1a1a1a] outline-none focus:border-[#72262a]/50"
            />
            <div className="grid grid-cols-3 gap-2">
              <select
                value={sourceModeFilter}
                onChange={(event) => setSourceModeFilter(event.target.value as SourceFilterMode)}
                className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm text-[#1a1a1a] outline-none focus:border-[#72262a]/50"
              >
                <option value="all">All status</option>
                <option value="live">Live</option>
                <option value="degraded">Degraded</option>
                <option value="offline">Offline</option>
              </select>
              <select
                value={sourceGroupFilter}
                onChange={(event) => setSourceGroupFilter(event.target.value)}
                className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm text-[#1a1a1a] outline-none focus:border-[#72262a]/50"
              >
                <option value="all">All groups</option>
                {sourceGroups.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>
              <select
                value={sourceDisplayLimit}
                onChange={(event) => setSourceDisplayLimit(event.target.value as SourceDisplayLimit)}
                className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm text-[#1a1a1a] outline-none focus:border-[#72262a]/50"
              >
                <option value="8">Show 8</option>
                <option value="12">Show 12</option>
                <option value="20">Show 20</option>
                <option value="40">Show 40</option>
                <option value="all">Show all</option>
              </select>
            </div>
          </div>

          <div className="mt-5 space-y-5">
            {filteredSources.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-[#d7c8b6] bg-white/70 px-4 py-6 text-sm text-[#6f6257]">
                No sources match this filter.
              </div>
            ) : null}
            {Object.entries(groupedSources).map(([groupLabel, groupSources]) => (
              <div key={groupLabel}>
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8a7d70]">
                      {groupLabel}
                    </div>
                    <div className="mt-1 text-xs leading-5 text-[#76695d]">
                      {groupDescriptions[groupLabel] ?? "Source group"}
                    </div>
                  </div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a7d70]">
                    {groupSources.length} lanes
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {groupSources.map((source) => (
                    <div
                      key={source.key}
                      className="rounded-[18px] border border-black/5 bg-[#fbfaf8] p-3.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-[#1a1a1a]">
                            {source.label}
                          </div>
                          <div className="mt-1 text-[11px] leading-4 text-[#76695d]">
                            {pretextCompact(source.description, 160)}
                          </div>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                            modeClasses[source.mode]
                          }`}
                        >
                          {source.mode}
                        </span>
                      </div>

                      <div className="mt-4 flex items-end justify-between gap-3">
                        <div>
                          <div className="text-[11px] uppercase tracking-[0.18em] text-[#8a7d70]">
                            Signals
                          </div>
                          <div className="mt-1 text-2xl font-semibold text-[#1a1a1a]">
                            {source.itemCount}
                          </div>
                        </div>
                        <div className="text-right text-xs text-[#75685c]">
                          <div>{source.errorCount} alerts</div>
                          <div className="mt-1">
                            {source.collectedAt
                              ? new Date(source.collectedAt).toLocaleString()
                              : "No pull timestamp"}
                          </div>
                        </div>
                      </div>

                      <div
                        className={`mt-4 rounded-[18px] px-3 py-3 text-xs leading-5 ${
                          source.mode === "offline"
                            ? "border border-rose-200 bg-rose-50 text-rose-900"
                            : source.latestError
                              ? "border border-amber-200 bg-amber-50 text-amber-900"
                              : "border border-emerald-100 bg-emerald-50 text-emerald-900"
                        }`}
                      >
                        {source.mode === "offline" && source.latestError
                          ? `Offline — ${source.latestError}`
                          : source.mode === "degraded" && source.latestError
                            ? `Degraded — ${source.latestError}`
                            : source.latestError
                              ? `Note: ${source.latestError}`
                              : "Latest pull completed without source-level errors."}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {hiddenSourceCount > 0 ? (
              <button
                type="button"
                onClick={() => setSourceDisplayLimit("all")}
                className="w-full rounded-[18px] border border-[#d6c8b7] bg-white px-4 py-3 text-sm font-semibold text-[#5d5248] transition hover:bg-[#f8f4ef]"
              >
                Show remaining {hiddenSourceCount} sources
              </button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-1">
          <div className="rounded-[30px] border border-black/6 bg-white/76 p-6">
            <p className="text-[11px] uppercase tracking-[0.24em] text-[#7a6b60]">
              Market watch
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-[#1a1a1a]">
              Hot markets rising into the issue
            </h3>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {hotMarkets.length === 0 ? (
                <div className="sm:col-span-2 rounded-[24px] border border-dashed border-[#d7c8b6] bg-[#fff9f0] px-4 py-5 text-sm text-[#6f6257]">
                  Market highlights will appear here when the source pull returns county or state activity.
                </div>
              ) : (
                hotMarkets.map((market) => (
                  <div
                    key={`${market.name}-${market.context}`}
                    className="relative overflow-hidden rounded-[24px] border border-[#e1d6c6] bg-[#fffdf9] px-4 py-4"
                  >
                    <div
                      className={`absolute inset-y-0 left-0 w-1 ${
                        market.tone === "hot" ? "bg-[#72262a]" : "bg-[#2c2c2c]"
                      }`}
                    />
                    <div className="pl-3">
                      <div className="text-sm font-semibold text-[#1a1a1a]">
                        {market.name}
                      </div>
                      <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-[#8a7d70]">
                        {market.context}
                      </div>
                      <p className="mt-3 text-sm leading-6 text-[#66594e]">
                        {market.detail}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-[30px] border border-black/6 bg-white/76 p-6">
            <p className="text-[11px] uppercase tracking-[0.24em] text-[#7a6b60]">
              News queue
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-[#1a1a1a]">
              Stories influencing the issue
            </h3>
            <div className="mt-5 space-y-4">
              {newsHighlights.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-[#d7c8b6] bg-[#fff9f0] px-4 py-5 text-sm text-[#6f6257]">
                  No news highlights are available yet. The editorial feed will populate after the next source pull.
                </div>
              ) : (
                newsHighlights.map((item, index) => (
                  <div
                    key={`${item.source}-${index}`}
                    className="border-b border-black/6 pb-4 last:border-b-0 last:pb-0"
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#72262a]">
                      {item.source}
                      <span className="ml-2 text-[#998b7e] normal-case tracking-normal">
                        {item.date ? new Date(item.date).toLocaleDateString() : "Recent"}
                      </span>
                    </div>
                    <div className="mt-2 text-sm font-semibold leading-6 text-[#1a1a1a]">
                      {item.headline}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[#62564c]">
                      {item.summary}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
