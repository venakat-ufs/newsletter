"use client";

import { useState } from "react";

interface ApprovalActionsProps {
  onApprove: (email: string, notes: string) => void;
  onReject: (email: string, notes: string) => void;
  onRequestChanges: (email: string, notes: string) => void;
  disabled?: boolean;
}

export function ApprovalActions({
  onApprove,
  onReject,
  onRequestChanges,
  disabled = false,
}: ApprovalActionsProps) {
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <div className="rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-[0_28px_80px_rgba(26,26,26,0.10)] backdrop-blur-xl">
      <div className="mb-5">
        <p className="text-xs uppercase tracking-[0.24em] text-[#6d5e52]">
          Review step
        </p>
        <h3 className="mt-2 text-xl font-semibold text-[#1a1a1a]">
          Choose what happens next
        </h3>
        <div className="mt-3 space-y-2 text-sm text-[#685c52]">
          <div className="font-medium text-[#1a1a1a]">What this step does</div>
          <ul className="list-disc space-y-2 pl-5">
            <li>Add the reviewer email.</li>
            <li>Leave a short internal note if needed.</li>
            <li><span className="font-semibold">Approve</span> publishes the issue and starts delivery.</li>
            <li>If Mailchimp is on hold, <span className="font-semibold">Approve</span> sends a preview copy to the reviewer instead of a live send.</li>
            <li><span className="font-semibold">Ask for changes</span> keeps the issue in review.</li>
            <li><span className="font-semibold">Reject</span> stops this issue.</li>
          </ul>
        </div>
      </div>

      <div className="space-y-3 mb-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-[#5f5954]">
            Reviewer Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="reviewer@unitedffs.com"
            className="w-full rounded-2xl border border-black/10 bg-white/80 px-4 py-3 text-sm outline-none transition placeholder:text-[#98897d] focus:border-[#72262a] focus:ring-4 focus:ring-[rgba(114,38,42,0.12)]"
            disabled={disabled}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-[#5f5954]">
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any comments about the draft..."
            rows={3}
            className="w-full rounded-2xl border border-black/10 bg-white/80 px-4 py-3 text-sm outline-none transition placeholder:text-[#98897d] focus:border-[#72262a] focus:ring-4 focus:ring-[rgba(114,38,42,0.12)]"
            disabled={disabled}
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <button
          onClick={() => onApprove(email, notes)}
          disabled={disabled || !email}
          className="rounded-2xl bg-[#72262a] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#5a1e1f] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Approve
        </button>
        <button
          onClick={() => onRequestChanges(email, notes)}
          disabled={disabled || !email}
          className="rounded-2xl border border-[#d8cfc7] bg-[#f7f5f2] px-4 py-3 text-sm font-semibold text-[#1a1a1a] transition hover:bg-[#efeae4] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Ask for changes
        </button>
        <button
          onClick={() => onReject(email, notes)}
          disabled={disabled || !email}
          className="rounded-2xl bg-[#2c2c2c] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#1a1a1a] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
