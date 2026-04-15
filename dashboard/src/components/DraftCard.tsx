"use client";

import Link from "next/link";

import type { Draft } from "@/lib/api";
import { getDraftSections, getIssueWeekLabel } from "@/lib/newsletter-intel";

const statusColors: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
  changes_requested: "bg-orange-100 text-orange-800",
};

export function DraftCard({ draft }: { draft: Draft }) {
  const issueNumber =
    (draft as Draft & { issue_number?: number }).issue_number ?? draft.newsletter_id;
  const sections = getDraftSections(draft);
  const statusClass = statusColors[draft.status] || "bg-slate-100 text-slate-800";
  const sourceCount =
    (draft.sources_used?.length ?? 0) +
    (draft.sources_warning?.length ?? 0) +
    (draft.sources_failed?.length ?? 0);

  return (
    <Link href={`/drafts/${draft.id}`} className="block">
      <div className="rounded-[28px] border border-white/70 bg-white/80 p-5 shadow-[0_28px_80px_rgba(26,26,26,0.10)] backdrop-blur-xl transition hover:-translate-y-0.5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-[#7a6b60]">
              Issue #{issueNumber}
            </p>
            <h3 className="mt-2 text-xl font-semibold text-[#1a1a1a]">
              {getIssueWeekLabel(draft.created_at)}
            </h3>
            <p className="mt-2 text-sm text-[#65584d]">
              Last updated {new Date(draft.updated_at).toLocaleString()}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${statusClass}`}
            >
              {draft.status.replaceAll("_", " ")}
            </span>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#1a1a1a]">
              {sourceCount} sources
            </span>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#1a1a1a]">
              {sections.length} sections
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
