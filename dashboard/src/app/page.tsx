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
  "border-[#BFDBFE] bg-[#EFF6FF]",
  "border-[#E5E7EB] bg-[#F9FAFB]",
  "border-[#E5E7EB] bg-[#F9FAFB]",
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
    <div className="space-y-6">
      <DashboardTour open={tourOpen} onClose={() => setTourOpen(false)} />

      <section className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
              United Brand Workflow
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-[#111827] sm:text-3xl">
              Build the newsletter in 3 steps
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6B7280]">
              Step 1 pulls data. Step 2 lets you write or edit the newsletter.
              Step 3 approves and sends it.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/insights/listings"
              className="rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-medium text-[#374151] transition hover:bg-[#F9FAFB]"
            >
              Insights hub
            </Link>
            <button
              onClick={() => setTourOpen(true)}
              className="rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-medium text-[#374151] transition hover:bg-[#F9FAFB]"
            >
              How it works
            </button>
            <button
              onClick={loadDashboard}
              className="rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-medium text-[#374151] transition hover:bg-[#F9FAFB]"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className={`rounded-xl border p-5 ${stepStyles[0]}`}>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#2563EB]">
              Step 1
            </div>
            <h2 className="mt-2 text-lg font-semibold text-[#111827]">
              Pull data
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#6B7280]">
              Create or refresh the current newsletter issue by pulling live data
              from the configured sources.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => handleTriggerPipeline(false)}
                disabled={pipelineRunning}
                className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pipelineRunning ? "Pulling data..." : "Run Step 1"}
              </button>
              <button
                onClick={() => handleTriggerPipeline(true)}
                disabled={pipelineRunning}
                title="Discard existing draft and re-collect all data"
                className="rounded-lg border border-[#BFDBFE] bg-white px-4 py-2 text-sm font-semibold text-[#2563EB] transition hover:bg-[#EFF6FF] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Force refresh
              </button>
            </div>
          </div>

          <div className={`rounded-xl border p-5 ${stepStyles[1]}`}>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
              Step 2
            </div>
            <h2 className="mt-2 text-lg font-semibold text-[#111827]">
              Write or edit the newsletter
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#6B7280]">
              Open the latest issue, generate the draft, and edit the sections
              until the newsletter reads the way you want.
            </p>
            {latestDraft ? (
              <Link
                href={`/drafts/${latestDraft.id}`}
                className="mt-4 inline-flex rounded-lg bg-white px-4 py-2 text-sm font-semibold text-[#111827] transition hover:bg-[#F9FAFB] border border-[#E5E7EB]"
              >
                Open latest issue
              </Link>
            ) : (
              <div className="mt-4 text-sm font-medium text-[#6B7280]">
                Run Step 1 first.
              </div>
            )}
          </div>

          <div className={`rounded-xl border p-5 ${stepStyles[2]}`}>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
              Step 3
            </div>
            <h2 className="mt-2 text-lg font-semibold text-[#111827]">
              Approve and send
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#6B7280]">
              Approval happens inside the issue page. Sending runs after approval.
            </p>
            <div className="mt-4 rounded-lg border border-[#E5E7EB] bg-white px-4 py-3 text-sm text-[#6B7280]">
              {mailchimp?.summary ?? "Send status will appear here after the dashboard loads."}
            </div>
          </div>
        </div>
      </section>

      {pipelineResult ? (
        <div className="rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-5 py-4 text-sm text-[#1D4ED8] shadow-sm">
          {pipelineResult}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 shadow-sm">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-[#E5E7EB] bg-white py-16 text-center text-sm text-[#6B7280] shadow-sm">
          Loading page...
        </div>
      ) : (
        <>
          <section className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
                  Newsletter status
                </p>
                <h2 className="mt-2 text-xl font-semibold text-[#111827]">
                  Current issue
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#6B7280]">
                  {latestDraft
                    ? `${getIssueWeekLabel(latestDraft.created_at)}. This is the issue you should edit next.`
                    : "Run Step 1 to create the first issue."}
                </p>
                {latestDraft ? (
                  <div className="mt-3 text-lg font-semibold text-[#111827]">
                    Issue #{issueNumber}
                  </div>
                ) : null}
              </div>

              {latestDraft ? (
                <Link
                  href={`/drafts/${latestDraft.id}`}
                  className="inline-flex rounded-lg bg-[#2563EB] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1D4ED8]"
                >
                  Open current issue
                </Link>
              ) : null}
            </div>

            {latestDraft ? (
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
                    Status
                  </div>
                  <div className="mt-2 text-lg font-semibold text-[#111827]">
                    {latestDraft.status.replaceAll("_", " ")}
                  </div>
                </div>
                <div className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
                    Sources
                  </div>
                  <div className="mt-2 text-lg font-semibold text-[#111827]">
                    {latestSources.length}
                  </div>
                </div>
                <div className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
                    Sections
                  </div>
                  <div className="mt-2 text-lg font-semibold text-[#111827]">
                    {latestSections.length}
                  </div>
                </div>
              </div>
            ) : null}
          </section>

          <section className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
                  Data sources
                </p>
                <h2 className="mt-2 text-xl font-semibold text-[#111827]">
                  Where the data is coming from
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6B7280]">
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
              <div className="mt-5 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-5 py-4 text-sm text-[#374151]">
                <span className="font-semibold text-[#2563EB]">
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
              <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
                All newsletters
              </p>
              <h2 className="mt-2 text-xl font-semibold text-[#111827]">
                Open an issue and work on it
              </h2>
            </div>

            {drafts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#D1D5DB] bg-white py-16 text-center shadow-sm">
                <p className="text-lg font-semibold text-[#111827]">No drafts yet.</p>
                <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#6B7280]">
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
