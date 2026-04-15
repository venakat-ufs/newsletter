"use client";

import { useState } from "react";
import type { DraftSection } from "@/lib/api";

const sectionIcons: Record<string, string> = {
  market_pulse: "📊",
  top_banks: "🏦",
  hot_markets: "📍",
  industry_news: "📰",
  bank_hiring_intel: "👔",
  ufs_spotlight: "💼",
};

const sectionLabels: Record<string, string> = {
  market_pulse: "Market Pulse",
  top_banks: "Top Institutions Listing",
  hot_markets: "Hot Markets",
  industry_news: "Industry News",
  bank_hiring_intel: "Bank Hiring Intel",
  ufs_spotlight: "UFS Spotlight",
};

interface SectionEditorProps {
  section: DraftSection;
  edited: DraftSection;
  onChange: (updated: DraftSection) => void;
  readOnly?: boolean;
}

export function SectionEditor({
  section,
  edited,
  onChange,
  readOnly = false,
}: SectionEditorProps) {
  const [showOriginal, setShowOriginal] = useState(false);
  const icon = sectionIcons[section.section_type] || "📋";
  const label = sectionLabels[section.section_type] || section.section_type;

  return (
    <div className="overflow-hidden rounded-[28px] border border-white/70 bg-white/80 shadow-[0_28px_80px_rgba(26,26,26,0.10)] backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-black/5 bg-white/50 px-6 py-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-[#7b6d60]">
            Section
          </p>
          <h3 className="mt-1 text-lg font-semibold text-[#1a1a1a]">
            {icon} {label}
          </h3>
        </div>
        <button
          onClick={() => setShowOriginal(!showOriginal)}
          className="rounded-full border border-black/10 bg-white/90 px-3 py-2 text-xs font-semibold text-[#1a1a1a] transition hover:bg-white"
        >
          {showOriginal ? "Hide AI Original" : "Show AI Original"}
        </button>
      </div>

      <div className={showOriginal ? "grid gap-0 lg:grid-cols-2" : ""}>
        {showOriginal && (
          <div className="border-b border-black/5 bg-[#f7f5f2] p-6 lg:border-b-0 lg:border-r">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-[#7b6d60]">
              AI Original
            </p>
            <h4 className="mb-2 font-semibold text-[#1a1a1a]">{section.title}</h4>
            <p className="mb-3 text-sm italic text-[#6f6257]">
              {section.teaser}
            </p>
            <div className="whitespace-pre-wrap text-sm leading-7 text-[#5d534a]">
              {section.body}
            </div>
          </div>
        )}

        <div className="p-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-[#7b6d60]">
            {readOnly ? "Final Version" : "Editable Version"}
          </p>

          <label className="mb-1 block text-xs font-medium text-[#6b5d51]">
            Title
          </label>
          <input
            type="text"
            value={edited.title}
            onChange={(e) => onChange({ ...edited, title: e.target.value })}
            disabled={readOnly}
            className="mb-4 w-full rounded-2xl border border-black/10 bg-white/85 px-4 py-3 text-sm outline-none transition placeholder:text-[#a09285] focus:border-[#72262a] focus:ring-4 focus:ring-[rgba(114,38,42,0.12)] disabled:bg-white/70"
          />

          <label className="mb-1 block text-xs font-medium text-[#6b5d51]">
            Teaser (email preview)
          </label>
          <textarea
            value={edited.teaser}
            onChange={(e) => onChange({ ...edited, teaser: e.target.value })}
            disabled={readOnly}
            rows={3}
            className="mb-4 w-full rounded-2xl border border-black/10 bg-white/85 px-4 py-3 text-sm outline-none transition placeholder:text-[#a09285] focus:border-[#72262a] focus:ring-4 focus:ring-[rgba(114,38,42,0.12)] disabled:bg-white/70"
          />

          <label className="mb-1 block text-xs font-medium text-[#6b5d51]">
            Full Article Body
          </label>
          <textarea
            value={edited.body}
            onChange={(e) => onChange({ ...edited, body: e.target.value })}
            disabled={readOnly}
            rows={8}
            className="w-full rounded-2xl border border-black/10 bg-white/85 px-4 py-3 text-sm leading-7 outline-none transition placeholder:text-[#a09285] focus:border-[#72262a] focus:ring-4 focus:ring-[rgba(114,38,42,0.12)] disabled:bg-white/70"
          />
        </div>
      </div>
    </div>
  );
}
