"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { DashboardTour } from "@/components/DashboardTour";
import { DraftCard } from "@/components/DraftCard";
import { TopicSourceTable } from "@/components/TopicSourceTable";
import {
  getSystemStatus,
  listDrafts,
  triggerPipeline,
  type Draft,
  type IntegrationStatus,
} from "@/lib/api";
import {
  getDraftSections,
  getIssueWeekLabel,
  getSourceCards,
  getTopicSourceRows,
} from "@/lib/newsletter-intel";

const stepStyles = [
  "border-[#72262a]/18 bg-[#f3e7e8]",
  "border-[rgba(26,26,26,0.1)] bg-[#f7f5f2]",
  "border-[#d7d0ca] bg-[#fbf8f4]",
];

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineResult, setPipelineResult] = useState<string | null>(null);
  const [tourOpen, setTourOpen] = useState(false);

  const latestDraft = drafts[0] ?? null;
  const latestSources = latestDraft ? getSourceCards(latestDraft) : [];
  const latestSections = latestDraft ? getDraftSections(latestDraft) : [];
  const latestTopicRows = latestDraft ? getTopicSourceRows(latestDraft) : [];
  const mailchimp = integrations.find((item) => item.key === "mailchimp");

  async function loadDashboard() {
    try {
      setLoading(true);
      const [draftData, statusData] = await Promise.all([
        listDrafts(),
        getSystemStatus(),
      ]);
      setDrafts(draftData);
      setIntegrations(statusData.integrations);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  async function handleTriggerPipeline(force = false) {
    try {
      setPipelineRunning(true);
      setPipelineResult(null);
      const result = await triggerPipeline(force);
      setPipelineResult(result.message);
      await loadDashboard();
    } catch (err) {
      setPipelineResult(
        err instanceof Error ? err.message : "Pipeline failed",
      );
    } finally {
      setPipelineRunning(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  const issueNumber =
    (latestDraft as Draft & { issue_number?: number } | null)?.issue_number ??
    latestDraft?.newsletter_id;

  return (
    <div className="space-y-8">
      <DashboardTour open={tourOpen} onClose={() => setTourOpen(false)} />

      <section className="rounded-[32px] border border-white/70 bg-white/80 p-6 shadow-[0_28px_80px_rgba(26,26,26,0.10)] backdrop-blur-xl sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.28em] text-[#7a6b60]">
              United Brand Workflow
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-[#1a1a1a] sm:text-4xl">
              Build the newsletter in 3 steps
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[#65584d]">
              Step 1 pulls data. Step 2 lets you write or edit the newsletter.
              Step 3 approves and sends it. This page only shows the information
              needed to do those three things.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/insights/listings"
              className="rounded-full border border-black/10 bg-white/80 px-4 py-2 text-sm font-semibold text-[#1a1a1a] transition hover:bg-white"
            >
              Insights hub
            </Link>
            <button
              onClick={() => setTourOpen(true)}
              className="rounded-full border border-black/10 bg-white/80 px-4 py-2 text-sm font-semibold text-[#1a1a1a] transition hover:bg-white"
            >
              How it works
            </button>
            <button
              onClick={loadDashboard}
              className="rounded-full border border-black/10 bg-white/80 px-4 py-2 text-sm font-semibold text-[#1a1a1a] transition hover:bg-white"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className={`rounded-[28px] border p-5 ${stepStyles[0]}`}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#72262a]">
              Step 1
            </div>
            <h2 className="mt-2 text-xl font-semibold text-[#1a1a1a]">
              Pull data
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#66584d]">
              Create or refresh the current newsletter issue by pulling live data
              from the configured sources.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => handleTriggerPipeline(false)}
                disabled={pipelineRunning}
                className="rounded-full bg-[#1a1a1a] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#2c2c2c] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pipelineRunning ? "Pulling data..." : "Run Step 1"}
              </button>
              <button
                onClick={() => handleTriggerPipeline(true)}
                disabled={pipelineRunning}
                title="Discard existing draft and re-collect all data"
                className="rounded-full border border-[#72262a]/30 bg-white px-4 py-2.5 text-sm font-semibold text-[#72262a] transition hover:bg-[#f9f0f0] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Force refresh
              </button>
            </div>
          </div>

          <div className={`rounded-[28px] border p-5 ${stepStyles[1]}`}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#5f5954]">
              Step 2
            </div>
            <h2 className="mt-2 text-xl font-semibold text-[#1a1a1a]">
              Write or edit the newsletter
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#66584d]">
              Open the latest issue, generate the draft, and edit the sections
              until the newsletter reads the way you want.
            </p>
            {latestDraft ? (
              <Link
                href={`/drafts/${latestDraft.id}`}
                className="mt-4 inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#1a1a1a] transition hover:bg-[#f6f2ed]"
              >
                Open latest issue
              </Link>
            ) : (
              <div className="mt-4 text-sm font-medium text-[#6a5c51]">
                Run Step 1 first.
              </div>
            )}
          </div>

          <div className={`rounded-[28px] border p-5 ${stepStyles[2]}`}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#5f5954]">
              Step 3
            </div>
            <h2 className="mt-2 text-xl font-semibold text-[#1a1a1a]">
              Approve and send
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#66584d]">
              Approval happens inside the issue page. Sending runs after approval.
            </p>
            <div className="mt-4 rounded-2xl border border-black/5 bg-white/80 px-4 py-3 text-sm text-[#5d5348]">
              {mailchimp?.summary ?? "Send status will appear here after the dashboard loads."}
            </div>
          </div>
        </div>
      </section>

      {pipelineResult ? (
        <div className="rounded-3xl border border-[#72262a]/18 bg-[#f3e7e8] px-5 py-4 text-sm text-[#72262a] shadow-sm">
          {pipelineResult}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800 shadow-sm">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-[28px] border border-white/70 bg-white/80 py-16 text-center text-sm text-[#6d5f55] shadow-[0_28px_80px_rgba(26,26,26,0.10)]">
          Loading page...
        </div>
      ) : (
        <>
          <section className="rounded-[32px] border border-white/70 bg-white/80 p-6 shadow-[0_28px_80px_rgba(26,26,26,0.10)] backdrop-blur-xl sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-[#7a6b60]">
                  Newsletter status
                </p>
                <h2 className="mt-3 text-2xl font-semibold text-[#1a1a1a]">
                  Current issue
                </h2>
                <p className="mt-2 text-sm leading-7 text-[#65584d]">
                  {latestDraft
                    ? `${getIssueWeekLabel(latestDraft.created_at)}. This is the issue you should edit next.`
                    : "Run Step 1 to create the first issue."}
                </p>
                {latestDraft ? (
                  <div className="mt-3 text-lg font-semibold text-[#1a1a1a]">
                    Issue #{issueNumber}
                  </div>
                ) : null}
              </div>

              {latestDraft ? (
                <Link
                  href={`/drafts/${latestDraft.id}`}
                  className="inline-flex rounded-full bg-[#1a1a1a] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#2c2c2c]"
                >
                  Open current issue
                </Link>
              ) : null}
            </div>

            {latestDraft ? (
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-3xl border border-black/5 bg-white/70 p-4">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-[#7a6b60]">
                    Status
                  </div>
                  <div className="mt-2 text-lg font-semibold text-[#1a1a1a]">
                    {latestDraft.status.replaceAll("_", " ")}
                  </div>
                </div>
                <div className="rounded-3xl border border-black/5 bg-white/70 p-4">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-[#7a6b60]">
                    Sources
                  </div>
                  <div className="mt-2 text-lg font-semibold text-[#1a1a1a]">
                    {latestSources.length}
                  </div>
                </div>
                <div className="rounded-3xl border border-black/5 bg-white/70 p-4">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-[#7a6b60]">
                    Sections
                  </div>
                  <div className="mt-2 text-lg font-semibold text-[#1a1a1a]">
                    {latestSections.length}
                  </div>
                </div>
              </div>
            ) : null}
          </section>

          <section className="rounded-[32px] border border-white/70 bg-white/80 p-6 shadow-[0_28px_80px_rgba(26,26,26,0.10)] backdrop-blur-xl sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-[#7a6b60]">
                  Data sources
                </p>
                <h2 className="mt-3 text-2xl font-semibold text-[#1a1a1a]">
                  Where the data is coming from
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-[#65584d]">
                  This map shows the newsletter topic first, then the exact live
                  sources feeding that topic and what each source is extracting.
                </p>
              </div>
            </div>

            <TopicSourceTable
              rows={latestTopicRows}
              emptyMessage="No source list yet. Run Step 1 first."
            />

            {latestDraft && latestSources.length > 0 ? (
              <div className="mt-5 rounded-[24px] border border-black/5 bg-[#fbfaf8] px-5 py-4 text-sm text-[#5e5349]">
                <span className="font-semibold text-[#72262a]">
                  Latest source health:
                </span>{" "}
                {latestSources.filter((source) => source.mode === "live").length} live,{" "}
                {latestSources.filter((source) => source.mode === "degraded").length} degraded,{" "}
                {latestSources.filter((source) => source.mode === "offline").length} offline.
              </div>
            ) : null}
          </section>

          <section className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-[#7a6b60]">
                All newsletters
              </p>
              <h2 className="mt-3 text-2xl font-semibold text-[#1a1a1a]">
                Open an issue and work on it
              </h2>
            </div>

            {drafts.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-[#d6c8b7] bg-white/60 py-16 text-center shadow-[0_28px_80px_rgba(26,26,26,0.10)]">
                <p className="text-lg font-semibold text-[#1a1a1a]">No drafts yet.</p>
                <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-[#6d5f55]">
                  Run Step 1 to create the first newsletter issue.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {drafts.map((draft) => (
                  <DraftCard key={draft.id} draft={draft} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
