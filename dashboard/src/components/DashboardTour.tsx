"use client";

import { useState } from "react";

interface TourStep {
  eyebrow: string;
  title: string;
  summary: string;
  points: string[];
}

interface DashboardTourProps {
  open: boolean;
  onClose: (options?: { dontShowAgain?: boolean }) => void;
}

const TOUR_STEPS: TourStep[] = [
  {
    eyebrow: "Welcome",
    title: "This dashboard runs the whole newsletter workflow",
    summary:
      "Everything starts on the Drafts screen. You pull source data, generate newsletter sections, review the draft, and schedule the final send from one place.",
    points: [
      "Top summary cards tell you how many issues are waiting, reviewed, or already drafted.",
      "The latest issue appears below with live source and workflow status.",
      "Use the tour again anytime from the top navigation.",
    ],
  },
  {
    eyebrow: "Step 1",
    title: "Run the data pipeline first",
    summary:
      "Use the Run data pipeline button to pull fresh source signals into a new or existing issue for the current week.",
    points: [
      "This collects Zillow research, HUD Home Store, HomeSteps, Bank of America REO, FHFA, News API, Reddit, and Grok signals.",
      "When the pipeline finishes, a result message appears near the top of the page.",
      "If a source is blocked or degraded, that will show up in the activity feed and source cards.",
    ],
  },
  {
    eyebrow: "Step 2",
    title: "Read the operations console",
    summary:
      "The step-by-step control panel explains what to do next and what is currently blocking send.",
    points: [
      "The checklist moves from integrations, to source pull, to AI drafting, to review, to delivery.",
      "Integration readiness shows missing credentials or unstable feeds in plain language.",
      "The workflow log is your troubleshooting feed when something fails.",
    ],
  },
  {
    eyebrow: "Step 3",
    title: "Open the draft workspace to generate and edit content",
    summary:
      "Each draft card opens a workspace where you generate AI copy, edit sections, preview the newsletter, and leave reviewer notes.",
    points: [
      "Generate AI Draft builds the first version from collected source data.",
      "Edit Mode is for section-by-section changes.",
      "Email Preview shows what the newsletter will look like before send.",
    ],
  },
  {
    eyebrow: "Step 4",
    title: "Approve, publish, and send",
    summary:
      "Approving a draft does more than change status. It triggers the delivery flow.",
    points: [
      "The app saves your final edits and reviewer note.",
      "It publishes article pages for each section.",
      "Then it schedules the Mailchimp campaign if Mailchimp is fully configured.",
    ],
  },
  {
    eyebrow: "Step 5",
    title: "Use History and logs to verify the issue",
    summary:
      "After approval, the History screen shows issue state and campaign id, while the activity feed shows the exact steps the app ran.",
    points: [
      "Use History to confirm whether an issue is draft, approved, scheduled, sent, or failed.",
      "Use the workflow log to inspect source collection, drafting, SMTP, and Mailchimp events.",
      "If something is unclear, reopen this tour from the nav and follow the steps in order.",
    ],
  },
];

export function DashboardTour({ open, onClose }: DashboardTourProps) {
  const [currentStep, setCurrentStep] = useState(0);

  if (!open) {
    return null;
  }

  const step = TOUR_STEPS[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === TOUR_STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(26,26,26,0.72)] px-4 py-6 backdrop-blur-sm">
      <div className="grid w-full max-w-6xl gap-6 rounded-[36px] border border-white/15 bg-[#fbf6ee] p-6 shadow-[0_36px_100px_rgba(26,26,26,0.3)] md:grid-cols-[0.88fr_1.12fr] md:p-8">
        <div className="rounded-[30px] bg-[linear-gradient(145deg,#1a1a1a_0%,#2c2c2c_60%,#72262a_100%)] p-6 text-white shadow-[0_30px_80px_rgba(26,26,26,0.26)]">
          <p className="text-[11px] uppercase tracking-[0.3em] text-white/65">
            Guided tour
          </p>
          <h2 className="mt-3 text-3xl font-semibold leading-tight">
            How the Disposition Desk works
          </h2>
          <p className="mt-4 text-sm leading-7 text-white/78">
            Use this as the quick-start map for the whole workflow. The idea is
            simple: pull signals, build the issue, review it, then send it.
          </p>

          <div className="mt-6 space-y-3">
            {TOUR_STEPS.map((item, index) => (
              <button
                key={item.title}
                type="button"
                onClick={() => setCurrentStep(index)}
                className={`w-full rounded-[22px] border px-4 py-4 text-left transition ${
                  index === currentStep
                    ? "border-[#72262a] bg-white/14 text-white"
                    : "border-white/10 bg-white/6 text-white/78 hover:bg-white/10"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/14 text-sm font-semibold">
                    {index + 1}
                  </span>
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.2em] text-white/55">
                      {item.eyebrow}
                    </div>
                    <div className="mt-1 text-sm font-semibold">{item.title}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[30px] border border-black/6 bg-white/86 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-[#7a6b60]">
                {step.eyebrow}
              </p>
              <h3 className="mt-2 text-3xl font-semibold leading-tight text-[#1a1a1a]">
                {step.title}
              </h3>
            </div>
            <div className="rounded-full bg-[#f3e7e8] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#72262a]">
              {currentStep + 1} / {TOUR_STEPS.length}
            </div>
          </div>

          <p className="mt-5 max-w-3xl text-base leading-8 text-[#5f5247]">
            {step.summary}
          </p>

          <div className="mt-6 grid gap-3">
            {step.points.map((point) => (
              <div
                key={point}
                className="rounded-[24px] border border-black/5 bg-[#fbfaf8] px-4 py-4 text-sm leading-7 text-[#62564c]"
              >
                {point}
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-col gap-3 border-t border-black/6 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => onClose()}
                className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-[#1a1a1a] transition hover:bg-[#f8f4ee]"
              >
                Skip for now
              </button>
              <button
                type="button"
                onClick={() => onClose({ dontShowAgain: true })}
                className="rounded-full border border-[#72262a]/18 bg-[#f3e7e8] px-4 py-2 text-sm font-semibold text-[#72262a] transition hover:bg-[#efe0e1]"
              >
                Don&apos;t show automatically
              </button>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setCurrentStep((value) => Math.max(0, value - 1))}
                disabled={isFirst}
                className="rounded-full border border-black/10 bg-white px-5 py-2.5 text-sm font-semibold text-[#1a1a1a] transition hover:bg-[#f8f4ee] disabled:cursor-not-allowed disabled:opacity-45"
              >
                Previous
              </button>
              {isLast ? (
                <button
                  type="button"
                  onClick={() => onClose()}
                  className="rounded-full bg-[#1a1a1a] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#2c2c2c]"
                >
                  Finish tour
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setCurrentStep((value) => Math.min(TOUR_STEPS.length - 1, value + 1))}
                  className="rounded-full bg-[#1a1a1a] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#2c2c2c]"
                >
                  Next step
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
