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
    <div className="space-y-6">
      <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Insights Hub</p>
            <h1 className="mt-2 text-2xl font-semibold text-[#111827] sm:text-3xl">
              Market Pulse + Listings Analytics
            </h1>
            <p className="mt-2 text-sm leading-6 text-[#6B7280]">
              Standalone analytics separated from the newsletter editing flow.
            </p>
          </div>
          <Link
            href="/"
            className="rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-medium text-[#374151] transition hover:bg-[#F9FAFB]"
          >
            Back to dashboard
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 shadow-sm">
          {error}
        </div>
      ) : null}

      <div className="rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
        <div className="border-b border-[#E5E7EB] px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Select issue</p>
          <h2 className="mt-1 text-lg font-semibold text-[#111827]">
            Open analytics for any newsletter issue
          </h2>
        </div>

        {loading ? (
          <div className="px-6 py-10 text-center text-sm text-[#6B7280]">
            Loading available issues...
          </div>
        ) : null}

        {!loading && drafts.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-[#6B7280]">
            No issues found. Run the pipeline first.
          </div>
        ) : null}

        {!loading && drafts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#E5E7EB]">
              <thead className="bg-[#F9FAFB]">
                <tr>
                  <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Issue</th>
                  <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Week</th>
                  <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Status</th>
                  <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {drafts.map((draft) => (
                  <tr key={draft.id} className="transition hover:bg-[#F9FAFB]">
                    <td className="px-6 py-4 text-sm font-semibold text-[#111827]">
                      #{draft.issue_number ?? draft.newsletter_id}
                    </td>
                    <td className="px-6 py-4 text-sm text-[#6B7280]">
                      {getIssueWeekLabel(draft.created_at)}
                    </td>
                    <td className="px-6 py-4 text-sm text-[#6B7280]">
                      {draft.status.replaceAll("_", " ")}
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        href={`/insights/listings/${draft.id}`}
                        className="rounded-lg bg-[#2563EB] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#1D4ED8]"
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
      </div>
    </div>
  );
}
