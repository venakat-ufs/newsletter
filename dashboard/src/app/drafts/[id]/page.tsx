"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { ApprovalActions } from "@/components/ApprovalActions";
import { EmailPreview } from "@/components/EmailPreview";
import { SectionEditor } from "@/components/SectionEditor";
import { TopicSourceTable } from "@/components/TopicSourceTable";
import {
  generateDraft,
  getDraft,
  getSystemStatus,
  publishArticles,
  scheduleNewsletter,
  updateDraft,
  type Draft,
  type DraftSection,
  type IntegrationStatus,
} from "@/lib/api";
import {
  getDraftSections,
  getIssueWeekLabel,
  getSourceCards,
  getTopicSourceRows,
} from "@/lib/newsletter-intel";
import { pretextCompact } from "@/lib/pretext";

type ViewMode = "edit" | "preview";
type SourceModeFilter = "all" | "live" | "degraded" | "offline";
type SourceDisplayLimit = "8" | "12" | "20" | "40" | "all";

function prettySectionLabel(sectionType: unknown) {
  const value = typeof sectionType === "string" ? sectionType : "";
  if (!value.trim()) {
    return "Unknown Section";
  }

  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function DraftEditorPage() {
  const routeParams = useParams<{ id: string }>();
  const id = routeParams?.id ?? "";
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [editedSections, setEditedSections] = useState<DraftSection[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("edit");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sourceSearch, setSourceSearch] = useState("");
  const [sourceModeFilter, setSourceModeFilter] = useState<SourceModeFilter>("all");
  const [sourceGroupFilter, setSourceGroupFilter] = useState("all");
  const [sourceDisplayLimit, setSourceDisplayLimit] = useState<SourceDisplayLimit>("8");

  const loadDraft = useCallback(async () => {
    if (!id) {
      setError("Invalid draft id");
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const [draftData, statusData] = await Promise.all([
        getDraft(Number(id)),
        getSystemStatus(),
      ]);
      setDraft(draftData);
      setIntegrations(statusData.integrations);

      const sections = Array.isArray(draftData.human_edits?.sections)
        ? draftData.human_edits.sections
        : Array.isArray(draftData.ai_draft?.sections)
          ? draftData.ai_draft.sections
          : [];
      setEditedSections(sections.map((section) => ({ ...section })));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load issue");
    } finally {
      setLoading(false);
    }
  }, [id]);

  function handleSectionChange(index: number, updated: DraftSection) {
    setEditedSections((prev) => {
      const next = [...prev];
      next[index] = updated;
      return next;
    });
  }

  async function handleSave() {
    if (!draft) return;

    try {
      setSaving(true);
      await updateDraft(draft.id, {
        human_edits: { sections: editedSections },
      });
      setMessage("Draft saved.");
      await loadDraft();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateAI() {
    if (!draft) return;

    try {
      setSaving(true);
      setMessage("Generating the newsletter draft...");
      await generateDraft(draft.newsletter_id);
      setMessage("Draft generated. You can edit it now.");
      await loadDraft();
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI generation failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleApproval(
    action: "approved" | "rejected" | "changes_requested",
    email: string,
    notes: string,
  ) {
    if (!draft) return;

    try {
      setSaving(true);
      await updateDraft(draft.id, {
        human_edits: { sections: editedSections },
        status: action,
        reviewer_email: email,
        notes,
      });

      if (action === "approved") {
        setMessage("Approved. Publishing sections and preparing the newsletter...");
        try {
          await publishArticles(draft.newsletter_id);
          const delivery = await scheduleNewsletter(draft.newsletter_id);
          setMessage(
            delivery.message ??
              (delivery.status === "scheduled"
                ? "Approved, published, and scheduled."
                : "Approved and published."),
          );
        } catch (err) {
          setMessage(
            `Approved. Send step could not finish: ${err instanceof Error ? err.message : "unknown error"}`,
          );
        }
      } else if (action === "changes_requested") {
        setMessage("Changes requested.");
      } else {
        setMessage("Draft rejected.");
      }

      await loadDraft();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    loadDraft();
  }, [loadDraft]);

  const sourceCards = useMemo(() => (draft ? getSourceCards(draft) : []), [draft]);
  const topicRows = useMemo(() => (draft ? getTopicSourceRows(draft) : []), [draft]);
  const draftSections = useMemo(() => (draft ? getDraftSections(draft) : []), [draft]);
  const rawSectionTypes = useMemo(
    () => Object.keys((draft?.raw_data?.sections as Record<string, unknown> | undefined) ?? {}),
    [draft],
  );
  const sourceGroups = useMemo(
    () =>
      [...new Set(sourceCards.map((source) => source.groupLabel).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [sourceCards],
  );
  const filteredSourceCards = useMemo(() => {
    const query = sourceSearch.trim().toLowerCase();
    return sourceCards.filter((source) => {
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
  }, [sourceCards, sourceSearch, sourceModeFilter, sourceGroupFilter]);
  const visibleSourceCards = useMemo(() => {
    if (sourceDisplayLimit === "all") {
      return filteredSourceCards;
    }

    return filteredSourceCards.slice(0, Number(sourceDisplayLimit));
  }, [filteredSourceCards, sourceDisplayLimit]);
  const hiddenSourceCount = filteredSourceCards.length - visibleSourceCards.length;

  if (loading) {
    return (
      <div className="rounded-[28px] border border-white/70 bg-white/80 py-16 text-center text-sm text-[#6d5f55] shadow-[0_28px_80px_rgba(26,26,26,0.10)]">
        Loading issue...
      </div>
    );
  }

  if (error && !draft) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800 shadow-sm">
        {error}
      </div>
    );
  }

  if (!draft) {
    return null;
  }

  const issueNumber =
    (draft as Draft & { issue_number?: number }).issue_number ?? draft.newsletter_id;
  const statusLabel =
    typeof draft.status === "string" ? draft.status.replaceAll("_", " ") : "pending";
  const isReadOnly = draft.status === "approved" || draft.status === "rejected";
  const hasSections = editedSections.length > 0;
  const mailchimp = integrations.find((item) => item.key === "mailchimp");
  const activeSectionTypes = (
    draftSections.length > 0
      ? draftSections.map((section) => section.section_type)
      : rawSectionTypes
  ).filter((sectionType): sectionType is string => typeof sectionType === "string" && sectionType.trim().length > 0);

  return (
    <div className="space-y-8">
      <section className="rounded-[32px] border border-white/70 bg-white/80 p-6 shadow-[0_28px_80px_rgba(26,26,26,0.10)] backdrop-blur-xl sm:p-8">
        <button
          onClick={() => router.push("/")}
          className="inline-flex rounded-full border border-black/10 bg-white/80 px-4 py-2 text-sm font-semibold text-[#1a1a1a] transition hover:bg-white"
        >
          Back to home
        </button>

        <div className="mt-5">
          <p className="text-xs uppercase tracking-[0.28em] text-[#7a6b60]">
            Newsletter editor
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-[#1a1a1a] sm:text-4xl">
            Issue #{issueNumber}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[#65584d]">
            This page only does four things: show the data pulled for this issue,
            let you write or edit the newsletter, approve it, and send it.
          </p>
        </div>

        <div className="mt-6 grid gap-3 xl:grid-cols-4">
          <div className="rounded-3xl border border-[#72262a]/18 bg-[#f3e7e8] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#72262a]">
              Step 1
            </div>
            <div className="mt-2 text-lg font-semibold text-[#1a1a1a]">
              Data pulled
            </div>
            <p className="mt-2 text-sm leading-6 text-[#65584d]">
              {sourceCards.length} sources were checked for this issue.
            </p>
          </div>
          <div className="rounded-3xl border border-[rgba(26,26,26,0.1)] bg-[#f7f5f2] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5f5954]">
              Step 2
            </div>
            <div className="mt-2 text-lg font-semibold text-[#1a1a1a]">
              Write or edit
            </div>
            <p className="mt-2 text-sm leading-6 text-[#65584d]">
              {hasSections
                ? `${editedSections.length} sections ready to edit.`
                : "Generate the draft, then edit the sections below."}
            </p>
          </div>
          <div className="rounded-3xl border border-[#d7d0ca] bg-[#fbf8f4] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5f5954]">
              Step 3
            </div>
            <div className="mt-2 text-lg font-semibold text-[#1a1a1a]">
              Approve
            </div>
            <p className="mt-2 text-sm leading-6 text-[#65584d]">
              Current status: {statusLabel}.
            </p>
          </div>
          <div className="rounded-3xl border border-[#dcd7c6] bg-[#faf8f2] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7d715e]">
              Step 4
            </div>
            <div className="mt-2 text-lg font-semibold text-[#1a1a1a]">
              Send
            </div>
            <p className="mt-2 text-sm leading-6 text-[#65584d]">
              {mailchimp?.summary ?? "Send status is loading."}
            </p>
          </div>
        </div>
      </section>

      {message ? (
        <div className="rounded-3xl border border-[#72262a]/18 bg-[#f3e7e8] px-5 py-4 text-sm text-[#72262a] shadow-sm">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800 shadow-sm">
          {error}
        </div>
      ) : null}

      <section className="rounded-[32px] border border-white/70 bg-white/80 p-6 shadow-[0_28px_80px_rgba(26,26,26,0.10)] backdrop-blur-xl sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-[#7a6b60]">
              Source list
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-[#1a1a1a]">
              Where this issue pulled data from
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-[#65584d]">
              Each newsletter topic below shows the exact live sources feeding
              it and the data those sources extract.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => router.push(`/insights/listings/${draft.id}?tab=sources`)}
                className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-[#1a1a1a] transition hover:bg-[#f8f4ef]"
              >
                Open full source evidence
              </button>
              <button
                type="button"
                onClick={() => router.push(`/insights/listings/${draft.id}?tab=listings`)}
                className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-[#1a1a1a] transition hover:bg-[#f8f4ef]"
              >
                Open listings intelligence
              </button>
            </div>
            <TopicSourceTable
              rows={topicRows}
              emptyMessage="No source list yet. Run Step 1 from the home page first."
            />
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-[#7a6b60]">
              Source health
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-[#1a1a1a]">
              Latest checks for this issue
            </h2>
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
                  onChange={(event) => setSourceModeFilter(event.target.value as SourceModeFilter)}
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
            <div className="mt-3 text-xs uppercase tracking-[0.16em] text-[#7a6b60]">
              Showing {visibleSourceCards.length} of {filteredSourceCards.length} matching ({sourceCards.length} total)
            </div>
            <div className="mt-5 space-y-3">
              {filteredSourceCards.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-[#d6c8b7] bg-white/70 px-4 py-6 text-sm text-[#65584d]">
                  No sources match this filter.
                </div>
              ) : null}
              {visibleSourceCards.map((source) => (
                <div
                  key={source.key}
                  className="rounded-[18px] border border-black/5 bg-[#fbfaf8] px-3.5 py-3"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[#1a1a1a]">
                        {source.label}
                      </div>
                      <div className="mt-1 text-xs leading-5 text-[#65584d]">
                        {pretextCompact(source.description, 110)}
                      </div>
                      {source.latestError ? (
                        <div className="mt-1 text-xs text-rose-700">
                          {source.latestError}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2 text-xs font-semibold">
                      <span
                        className={`rounded-full px-3 py-1 uppercase tracking-[0.16em] ${
                          source.mode === "live"
                            ? "bg-emerald-100 text-emerald-800"
                            : source.mode === "degraded"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {source.mode}
                      </span>
                      <span className="rounded-full bg-[#e8e4df] px-3 py-1 text-[#5f5954]">
                        {source.itemCount} items
                      </span>
                    </div>
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
              <div className="rounded-[20px] border border-black/5 bg-[#fbfaf8] px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7a6b60]">
                  Active sections
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {activeSectionTypes.map((sectionType) => (
                    <span
                      key={sectionType}
                      className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#5d5248]"
                    >
                      {prettySectionLabel(sectionType)}
                    </span>
                  ))}
                  {activeSectionTypes.length === 0 ? (
                    <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#5d5248]">
                      No sections yet
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 text-xs text-[#65584d]">
                  Issue week: {getIssueWeekLabel(draft.created_at)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[32px] border border-white/70 bg-white/80 p-6 shadow-[0_28px_80px_rgba(26,26,26,0.10)] backdrop-blur-xl sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-[#7a6b60]">
              Step 2
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-[#1a1a1a]">
              Write or edit the newsletter
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-[#65584d]">
              Generate the draft if needed. Then edit the sections or switch to
              preview to see the email layout.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {!hasSections ? (
              <button
                onClick={handleGenerateAI}
                disabled={saving}
                className="rounded-full bg-[#1a1a1a] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#2c2c2c] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Generating..." : "Generate draft"}
              </button>
            ) : null}

            <button
              onClick={() => setViewMode(viewMode === "edit" ? "preview" : "edit")}
              className="rounded-full border border-black/10 bg-white/80 px-5 py-2.5 text-sm font-semibold text-[#1a1a1a] transition hover:bg-white"
            >
              {viewMode === "edit" ? "Open full newsletter preview" : "Back to edit"}
            </button>

            {!isReadOnly && hasSections ? (
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-full bg-[#72262a] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5a1e1f] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save changes"}
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-6">
          {viewMode === "preview" ? (
            <EmailPreview
              sections={editedSections}
              issueNumber={issueNumber}
              createdAt={draft.created_at}
              defaultArticleUrl={`/insights/listings/${draft.id}?tab=listings`}
            />
          ) : hasSections ? (
            <div className="space-y-6">
              {editedSections.map((section, index) => (
                <SectionEditor
                  key={`${section.section_type}-${index}`}
                  section={draft.ai_draft?.sections?.[index] || section}
                  edited={section}
                  onChange={(updated) => handleSectionChange(index, updated)}
                  readOnly={isReadOnly}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[24px] border border-dashed border-[#d6c8b7] bg-white/70 px-5 py-10 text-center text-sm text-[#65584d]">
              No draft text yet. Click <span className="font-semibold">Generate draft</span>.
            </div>
          )}
        </div>
      </section>

      {!isReadOnly && hasSections ? (
        <section className="space-y-4">
          <div className="rounded-[32px] border border-white/70 bg-white/80 p-6 shadow-[0_28px_80px_rgba(26,26,26,0.10)] backdrop-blur-xl sm:p-8">
            <p className="text-xs uppercase tracking-[0.28em] text-[#7a6b60]">
              Step 3 and Step 4
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-[#1a1a1a]">
              Approve, then send
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-[#65584d]">
              When you approve, the app publishes the article pages first and
              then runs the send step.
            </p>
          </div>

          <ApprovalActions
            onApprove={(email, notes) => handleApproval("approved", email, notes)}
            onReject={(email, notes) => handleApproval("rejected", email, notes)}
            onRequestChanges={(email, notes) =>
              handleApproval("changes_requested", email, notes)
            }
            disabled={saving}
          />
        </section>
      ) : null}
    </div>
  );
}
