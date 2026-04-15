"use client";

import { buildPreviewNewsletterHtmlFromSections } from "@/lib/newsletter-html";
import type { DraftSection } from "@/lib/api";

export function EmailPreview({
  sections,
  issueNumber,
  createdAt,
  defaultArticleUrl,
}: {
  sections: DraftSection[];
  issueNumber?: number;
  createdAt?: string;
  defaultArticleUrl?: string;
}) {
  const html = buildPreviewNewsletterHtmlFromSections(
    issueNumber ?? 0,
    createdAt ?? "",
    sections,
    defaultArticleUrl ?? "#",
  );
  const previewHeight = Math.max(2200, sections.length * 430);

  return (
    <div className="overflow-hidden rounded-[32px] border border-[#d8cfc2] bg-white shadow-[0_32px_90px_rgba(26,26,26,0.12)]">
      <div className="border-b border-[#e8ddd0] bg-[#f7f5f2] px-6 py-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#72262a]">
          Full newsletter preview
        </div>
        <p className="mt-2 text-sm leading-6 text-[#6d5b49]">
          This preview now matches the review email and the delivery template.
        </p>
      </div>

      <iframe
        title="Full newsletter preview"
        srcDoc={html}
        className="w-full bg-white"
        style={{ height: `${previewHeight}px` }}
      />
    </div>
  );
}
