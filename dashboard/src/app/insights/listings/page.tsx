"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { listDrafts, type Draft } from "@/lib/api";
import { getIssueWeekLabel } from "@/lib/newsletter-intel";

export default function ListingsInsightsHubPage() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const data = await listDrafts();
        if (!cancelled) {
          setDrafts(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load issues");
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
  }, []);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-white/70 bg-white/88 p-4 shadow-[0_16px_50px_rgba(26,26,26,0.10)] backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-[#7a6b60]">Insights hub</p>
            <h1 className="mt-1 text-xl font-semibold text-[#1a1a1a]">Market Pulse + Listings Analytics</h1>
            <p className="mt-1 text-xs text-[#6a5f54]">
              Standalone analytics page separated from the newsletter editing flow.
            </p>
          </div>
          <Link
            href="/"
            className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-[#1a1a1a] transition hover:bg-[#f8f4ef]"
          >
            Back to dashboard
          </Link>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <section className="rounded-2xl border border-black/8 bg-white/92 p-3 shadow-sm">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7a6b60]">Select issue</div>
        <h2 className="mt-1 text-lg font-semibold text-[#1a1a1a]">Open analytics for any newsletter issue</h2>

        {loading ? (
          <div className="mt-3 rounded-lg border border-dashed border-[#d8ccb9] bg-[#fbfaf8] px-3 py-3 text-xs text-[#6c5f53]">
            Loading available issues...
          </div>
        ) : null}

        {!loading && drafts.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-[#d8ccb9] bg-[#fbfaf8] px-3 py-3 text-xs text-[#6c5f53]">
            No issues found. Run pipeline first.
          </div>
        ) : null}

        {!loading && drafts.length > 0 ? (
          <div className="mt-3 overflow-auto rounded-lg border border-black/8">
            <table className="min-w-full border-separate border-spacing-0 text-xs">
              <thead>
                <tr className="bg-[#f4f0ea] text-left uppercase tracking-[0.1em] text-[#7a6b60]">
                  <th className="px-2.5 py-2">Issue</th>
                  <th className="px-2.5 py-2">Week</th>
                  <th className="px-2.5 py-2">Status</th>
                  <th className="px-2.5 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((draft, index) => (
                  <tr key={draft.id} className={index % 2 === 0 ? "bg-white" : "bg-[#fcfaf7]"}>
                    <td className="px-2.5 py-2 font-semibold text-[#1f1f1f]">
                      #{draft.issue_number ?? draft.newsletter_id}
                    </td>
                    <td className="px-2.5 py-2 text-[#2e2a26]">{getIssueWeekLabel(draft.created_at)}</td>
                    <td className="px-2.5 py-2 text-[#6d6157]">{draft.status.replaceAll("_", " ")}</td>
                    <td className="px-2.5 py-2">
                      <Link
                        href={`/insights/listings/${draft.id}`}
                        className="rounded-full border border-black/10 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#1a1a1a] transition hover:bg-[#f8f4ef]"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
