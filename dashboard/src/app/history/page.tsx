"use client";

import { useEffect, useState } from "react";
import { listNewsletters, type Newsletter } from "@/lib/api";

const statusColors: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  scheduled: "bg-blue-100 text-blue-700",
  sent: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
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
    <div className="space-y-6">
      <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
          Archive
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-[#111827] sm:text-3xl">
          Newsletter History
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6B7280]">
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
            <div key={key} className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
                {label}
              </div>
              <div className="mt-2 text-2xl font-semibold text-[#111827]">
                {statusCounts[key] || 0}
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 shadow-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-[#E5E7EB] bg-white py-16 text-center text-sm text-[#6B7280] shadow-sm">
          Loading history...
        </div>
      ) : newsletters.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#D1D5DB] bg-white py-16 text-center shadow-sm">
          <p className="text-lg font-semibold text-[#111827]">
            No newsletters yet.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#E5E7EB]">
              <thead className="bg-[#F9FAFB]">
                <tr>
                  <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
                    Issue
                  </th>
                  <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
                    Date
                  </th>
                  <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
                    Status
                  </th>
                  <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
                    Campaign ID
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {newsletters.map((nl) => (
                  <tr key={nl.id} className="transition hover:bg-[#F9FAFB]">
                    <td className="px-6 py-4 text-sm font-semibold text-[#111827]">
                      #{nl.issue_number}
                    </td>
                    <td className="px-6 py-4 text-sm text-[#6B7280]">
                      {new Date(nl.issue_date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                          statusColors[nl.status] || "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {nl.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-mono text-[#6B7280]">
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
