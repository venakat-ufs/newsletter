"use client";

import Link from "next/link";

import type { Draft, IntegrationStatus, WorkflowLogEntry } from "@/lib/api";

const stepToneClasses: Record<string, string> = {
  complete: "border-emerald-200 bg-emerald-50 text-emerald-800",
  active: "border-[#d6c4a4] bg-[#fff6e7] text-[#8a6023]",
  pending: "border-black/8 bg-white/80 text-[#695c50]",
  blocked: "border-rose-200 bg-rose-50 text-rose-800",
};

const stateClasses: Record<string, string> = {
  ready: "bg-emerald-100 text-emerald-800",
  warning: "bg-amber-100 text-amber-800",
  blocked: "bg-rose-100 text-rose-800",
};

const logClasses: Record<string, string> = {
  info: "bg-slate-100 text-slate-700",
  success: "bg-emerald-100 text-emerald-800",
  warning: "bg-amber-100 text-amber-800",
  error: "bg-rose-100 text-rose-800",
};

interface OperationsConsoleProps {
  draft: Draft | null;
  integrations: IntegrationStatus[];
  logs: WorkflowLogEntry[];
  pipelineRunning: boolean;
  onRunPipeline: () => void;
}

interface ChecklistStep {
  label: string;
  detail: string;
  state: "complete" | "active" | "pending" | "blocked";
  href?: string;
}

function buildChecklist(draft: Draft | null, integrations: IntegrationStatus[]): ChecklistStep[] {
  const blocking = integrations.filter((item) => item.state === "blocked");
  const openAi = integrations.find((item) => item.key === "openai");
  const mailchimp = integrations.find((item) => item.key === "mailchimp");
  const draftSections =
    draft?.human_edits?.sections?.length ??
    draft?.ai_draft?.sections?.length ??
    0;
  const hasDraft = Boolean(draft);
  const hasAiDraft = draftSections > 0;
  const reviewComplete =
    draft?.status === "approved" ||
    draft?.status === "rejected" ||
    draft?.status === "changes_requested";

  return [
    {
      label: "Check integrations",
      detail:
        blocking.length === 0
          ? "Core integrations are configured. Keep an eye on the activity feed for live failures."
          : `${blocking.length} integration blockers still need attention before send.`,
      state: blocking.length === 0 ? "complete" : "active",
    },
    {
      label: "Run the source pipeline",
      detail: hasDraft
        ? `Issue #${draft?.issue_number ?? draft?.newsletter_id} already has source data collected.`
        : "Pull official listing, research, news, community, and social signals into a new issue.",
      state: hasDraft ? "complete" : "active",
    },
    {
      label: "Generate AI sections",
      detail: hasAiDraft
        ? `${draftSections} newsletter sections are ready for review.`
        : openAi?.state === "blocked"
          ? "OpenAI is not configured, so AI drafting is blocked."
          : "Generate the first AI draft once the source pipeline finishes.",
      state: hasAiDraft ? "complete" : !hasDraft ? "pending" : openAi?.state === "blocked" ? "blocked" : "active",
      href: hasDraft ? `/drafts/${draft?.id}` : undefined,
    },
    {
      label: "Review and edit the issue",
      detail: reviewComplete
        ? `The draft is marked ${draft?.status.replaceAll("_", " ")}.`
        : hasAiDraft
          ? "Open the workspace, edit sections, and leave reviewer notes."
          : "Wait for source collection and AI drafting before review.",
      state: reviewComplete ? "complete" : hasAiDraft ? "active" : "pending",
      href: hasDraft ? `/drafts/${draft?.id}` : undefined,
    },
    {
      label: "Approve and send",
      detail:
        mailchimp?.state === "blocked"
          ? "Mailchimp is incomplete. Add the missing audience settings before send."
          : reviewComplete && draft?.status === "approved"
            ? "The issue is approved. Publishing and Mailchimp scheduling can run now."
            : "Approval triggers article publishing first, then Mailchimp scheduling.",
      state:
        mailchimp?.state === "blocked"
          ? "blocked"
          : draft?.status === "approved"
            ? "active"
            : "pending",
      href: hasDraft ? `/drafts/${draft?.id}` : undefined,
    },
  ];
}

export function OperationsConsole({
  draft,
  integrations,
  logs,
  pipelineRunning,
  onRunPipeline,
}: OperationsConsoleProps) {
  const checklist = buildChecklist(draft, integrations);
  const readyCount = integrations.filter((item) => item.state === "ready").length;
  const blockingCount = integrations.filter((item) => item.state === "blocked").length;
  const warningCount = integrations.filter((item) => item.state === "warning").length;

  return (
    <section className="mb-8 rounded-[36px] border border-white/70 bg-white/80 p-6 shadow-[0_28px_80px_rgba(26,26,26,0.10)] backdrop-blur-xl sm:p-8">
      <div className="grid gap-6 xl:grid-cols-[0.98fr_1.02fr]">
        <div className="rounded-[30px] border border-black/6 bg-[#fffaf2] p-6">
          <p className="text-[11px] uppercase tracking-[0.24em] text-[#7a6b60]">
            Step-by-step control panel
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-[#1a1a1a]">
            What to do next
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-[#66594f]">
            Follow the workflow in order. Each step updates as the issue moves from
            source collection into review and delivery.
          </p>

          <div className="mt-5 space-y-3">
            {checklist.map((step, index) => (
              <div
                key={step.label}
                className={`rounded-[24px] border px-4 py-4 ${stepToneClasses[step.state]}`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/80 text-sm font-semibold text-[#1a1a1a]">
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{step.label}</div>
                    <div className="mt-1 text-xs leading-5 opacity-85">{step.detail}</div>
                    {step.href ? (
                      <Link
                        href={step.href}
                        className="mt-3 inline-flex text-xs font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]"
                      >
                        Open workspace
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={onRunPipeline}
            disabled={pipelineRunning}
            className="mt-5 rounded-full bg-[#1a1a1a] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#2c2c2c] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pipelineRunning ? "Running pipeline..." : "Run pipeline now"}
          </button>
        </div>

        <div className="space-y-6">
          <div className="rounded-[30px] border border-black/6 bg-white/80 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-[#7a6b60]">
                  Integration readiness
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-[#1a1a1a]">
                  What is blocking send
                </h3>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.18em]">
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-800">
                  {readyCount} ready
                </span>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">
                  {warningCount} warnings
                </span>
                <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-800">
                  {blockingCount} blocked
                </span>
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              {integrations.map((integration) => (
                <div
                  key={integration.key}
                  className="rounded-[24px] border border-black/5 bg-[#fbfaf8] px-4 py-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-[#1a1a1a]">
                        {integration.label}
                      </div>
                      <div className="mt-1 text-xs leading-5 text-[#75685c]">
                        {integration.summary}
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${stateClasses[integration.state]}`}
                    >
                      {integration.state}
                    </span>
                  </div>
                  <div className="mt-3 text-xs font-medium text-[#5f5349]">
                    Next action: {integration.action}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[30px] border border-black/6 bg-white/80 p-6">
            <p className="text-[11px] uppercase tracking-[0.24em] text-[#7a6b60]">
              Recent activity
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-[#1a1a1a]">
              Workflow log
            </h3>
            <div className="mt-5 space-y-3">
              {logs.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-[#d7c8b6] bg-[#fffefb] px-4 py-5 text-sm text-[#6f6257]">
                  No workflow activity yet. Run the pipeline to create the first issue and populate the activity feed.
                </div>
              ) : (
                logs.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-[24px] border border-black/5 bg-[#fbfaf8] px-4 py-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-[#1a1a1a]">
                          {entry.message}
                        </div>
                        <div className="mt-1 text-xs leading-5 text-[#75685c]">
                          {entry.scope} · {entry.step} · {new Date(entry.timestamp).toLocaleString()}
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${logClasses[entry.status]}`}
                      >
                        {entry.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
