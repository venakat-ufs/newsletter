"use client";

import { useEffect, useState } from "react";
import { listNewsletters, type Newsletter } from "@/lib/api";

const statusColors: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  scheduled: "bg-blue-100 text-blue-800",
  sent: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-800",
};

export default function HistoryPage() {
  const [newsletters, setNewsletters] = useState<Newsletter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const statusCounts = newsletters.reduce<Record<string, number>>((acc, nl) => {
    acc[nl.status] = (acc[nl.status] || 0) + 1;
    return acc;
  }, {});

  useEffect(() => {
    async function load() {
      try {
        const data = await listNewsletters();
        setNewsletters(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load newsletters"
        );
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div>
      <div className="mb-8 rounded-[32px] border border-white/70 bg-white/80 p-6 shadow-[0_28px_80px_rgba(26,26,26,0.10)] backdrop-blur-xl sm:p-8">
        <p className="text-xs uppercase tracking-[0.28em] text-[#7a6b60]">
          Archive
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-[#1a1a1a] sm:text-4xl">
          Newsletter History
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-[#65584d]">
          A record of scheduled and published issues, with their Mailchimp
          campaign state.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {Object.entries({
            draft: "Draft",
            approved: "Approved",
            scheduled: "Scheduled",
            sent: "Sent",
            failed: "Failed",
          }).map(([key, label]) => (
            <div key={key} className="rounded-3xl border border-black/5 bg-white/70 p-4">
              <div className="text-[11px] uppercase tracking-[0.2em] text-[#7a6b60]">
                {label}
              </div>
              <div className="mt-2 text-2xl font-semibold text-[#1a1a1a]">
                {statusCounts[key] || 0}
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800 shadow-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-[28px] border border-white/70 bg-white/80 py-16 text-center text-sm text-[#6d5f55] shadow-[0_28px_80px_rgba(26,26,26,0.10)]">
          Loading history...
        </div>
      ) : newsletters.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-[#d6c8b7] bg-white/60 py-16 text-center shadow-[0_28px_80px_rgba(26,26,26,0.10)]">
          <p className="text-lg font-semibold text-[#1a1a1a]">
          No newsletters yet.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[28px] border border-white/70 bg-white/80 shadow-[0_28px_80px_rgba(26,26,26,0.10)] backdrop-blur-xl">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-black/5">
              <thead className="bg-[#f7f5f2]">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.2em] text-[#7a6b60]">
                  Issue
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.2em] text-[#7a6b60]">
                  Date
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.2em] text-[#7a6b60]">
                  Status
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.2em] text-[#7a6b60]">
                  Campaign ID
                </th>
              </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {newsletters.map((nl) => (
                  <tr key={nl.id} className="transition hover:bg-white/50">
                    <td className="px-6 py-4 text-sm font-semibold text-[#1a1a1a]">
                      #{nl.issue_number}
                    </td>
                    <td className="px-6 py-4 text-sm text-[#685c52]">
                      {new Date(nl.issue_date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${
                          statusColors[nl.status] || "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {nl.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-mono text-[#685c52]">
                      {nl.mailchimp_campaign_id || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
