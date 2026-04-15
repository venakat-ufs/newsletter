"use client";

import { useMemo, useState } from "react";

import type { TopicSourceRow } from "@/lib/newsletter-intel";
import { pretextCompact } from "@/lib/pretext";

const modeStyles = {
  live: "bg-emerald-100 text-emerald-800",
  degraded: "bg-amber-100 text-amber-800",
  offline: "bg-rose-100 text-rose-800",
} as const;

function modeLabel(mode: TopicSourceRow["sources"][number]["mode"]) {
  if (mode === "live") {
    return "Live";
  }
  if (mode === "degraded") {
    return "Degraded";
  }
  return "Offline";
}

export function TopicSourceTable({
  rows,
  emptyMessage,
}: {
  rows: TopicSourceRow[];
  emptyMessage: string;
}) {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [modeFilter, setModeFilter] = useState<"all" | "live" | "degraded" | "offline">("all");

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return rows
      .map((row) => {
        const visibleSources =
          modeFilter === "all"
            ? row.sources
            : row.sources.filter((source) => source.mode === modeFilter);
        return { ...row, visibleSources };
      })
      .filter((row) => {
        if (row.visibleSources.length === 0) {
          return false;
        }

        if (!normalizedQuery) {
          return true;
        }

        const sourceText = row.visibleSources
          .map((source) => `${source.label} ${source.extractionDetail}`)
          .join(" ");
        const haystack = `${row.label} ${row.content} ${sourceText}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      });
  }, [rows, query, modeFilter]);

  if (rows.length === 0) {
    return (
      <div className="mt-6 rounded-3xl border border-dashed border-[#d6c8b7] bg-white/70 px-5 py-5 text-sm text-[#65584d]">
        {emptyMessage}
      </div>
    );
  }

  if (filteredRows.length === 0) {
    return (
      <div className="mt-6 space-y-3">
        <div className="grid gap-2 rounded-2xl border border-black/5 bg-white/80 p-3 sm:grid-cols-[1fr_220px]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search topic, source, or extraction..."
            className="h-9 rounded-lg border border-black/10 bg-white px-3 text-xs text-[#1a1a1a] outline-none focus:border-[#72262a]/55"
          />
          <select
            value={modeFilter}
            onChange={(event) =>
              setModeFilter(event.target.value as "all" | "live" | "degraded" | "offline")
            }
            className="h-9 rounded-lg border border-black/10 bg-white px-3 text-xs text-[#1a1a1a] outline-none focus:border-[#72262a]/55"
          >
            <option value="all">All lane modes</option>
            <option value="live">Live only</option>
            <option value="degraded">Degraded only</option>
            <option value="offline">Offline only</option>
          </select>
        </div>
        <div className="rounded-2xl border border-dashed border-[#d6c8b7] bg-white/70 px-5 py-5 text-sm text-[#65584d]">
          No source lanes match current filters.
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      <div className="grid gap-2 rounded-2xl border border-black/5 bg-white/80 p-3 sm:grid-cols-[1fr_220px]">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search topic, source, or extraction..."
          className="h-9 rounded-lg border border-black/10 bg-white px-3 text-xs text-[#1a1a1a] outline-none focus:border-[#72262a]/55"
        />
        <select
          value={modeFilter}
          onChange={(event) =>
            setModeFilter(event.target.value as "all" | "live" | "degraded" | "offline")
          }
          className="h-9 rounded-lg border border-black/10 bg-white px-3 text-xs text-[#1a1a1a] outline-none focus:border-[#72262a]/55"
        >
          <option value="all">All lane modes</option>
          <option value="live">Live only</option>
          <option value="degraded">Degraded only</option>
          <option value="offline">Offline only</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-[24px] border border-black/5 bg-white/80">
        <div className="hidden grid-cols-[0.95fr_1.1fr_1.9fr] gap-3 bg-[#f7f5f2] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7b6b5f] md:grid">
          <div>Topic</div>
          <div>Section focus</div>
          <div>Source lanes</div>
        </div>

        <div className="space-y-0">
          {filteredRows.map((row, rowIndex) => (
          <div
            key={row.key}
            className={`${rowIndex === 0 ? "" : "border-t border-black/5"} bg-white`}
          >
            <div className="grid gap-3 px-4 py-3 md:grid-cols-[0.95fr_1.1fr_1.9fr]">
              <div>
                <div className="text-sm font-semibold text-[#1a1a1a]">{row.label}</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-[#7b6b5f]">
                  {row.visibleSources.length} visible lanes
                </div>
              </div>

              <div>
                <div className="text-xs leading-5 text-[#5e5349]">{pretextCompact(row.content, 130)}</div>
              </div>

              <div>
                {row.visibleSources.length > 0 ? (
                  <div className="space-y-2">
                    {(expandedRows[row.key] ? row.visibleSources : row.visibleSources.slice(0, 2)).map((source) => (
                      <div
                        key={source.key}
                        className="rounded-xl border border-black/5 bg-[#fbfaf8] px-3 py-2"
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[13px] font-semibold text-[#1a1a1a]">
                            {source.label}
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${modeStyles[source.mode]}`}
                          >
                            {modeLabel(source.mode)}
                          </span>
                          <span className="rounded-full bg-[#e8e4df] px-2.5 py-0.5 text-[10px] font-semibold text-[#5f5954]">
                            {source.itemCount} items
                          </span>
                        </div>
                        <div className="mt-1.5 text-xs leading-5 text-[#5e5349]">
                          {pretextCompact(source.extractionDetail, 90)}
                        </div>
                        {source.latestError ? (
                          <div className="mt-1.5 text-[11px] text-rose-700">{source.latestError}</div>
                        ) : null}
                      </div>
                    ))}
                    {row.visibleSources.length > 2 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedRows((previous) => ({
                            ...previous,
                            [row.key]: !previous[row.key],
                          }))
                        }
                        className="rounded-lg border border-[#d8ccb9] bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6c5f53] transition hover:bg-[#f8f4ef]"
                      >
                        {expandedRows[row.key]
                          ? "Show less"
                          : `Show ${row.visibleSources.length - 2} more`}
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-[#d9ccb9] bg-[#fbfaf8] px-3 py-3 text-xs leading-5 text-[#5e5349]">
                    {row.sourceSummary}
                  </div>
                )}
              </div>
            </div>
          </div>
          ))}
        </div>
      </div>
    </div>
  );
}
