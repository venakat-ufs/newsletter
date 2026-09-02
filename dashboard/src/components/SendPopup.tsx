"use client";

import { useEffect, useState } from "react";

import {
  getSendOptions,
  sendNewsletterToGroups,
  type SendOptions,
  type SendResult,
} from "@/lib/api";

interface SendPopupProps {
  newsletterId: number;
  onClose: () => void;
  onSent: (result: SendResult) => void;
}

export function SendPopup({ newsletterId, onClose, onSent }: SendPopupProps) {
  const [options, setOptions] = useState<SendOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<Array<"registered" | "prospect">>([]);
  const [senderEmail, setSenderEmail] = useState("");

  useEffect(() => {
    let cancelled = false;
    getSendOptions(newsletterId)
      .then((data) => {
        if (cancelled) return;
        setOptions(data);
        const selectable = data.groups
          .filter((group) => data.priorSendStatus[group.key].status !== "sent")
          .map((group) => group.key);
        setSelectedGroups(selectable);
        if (data.senders.length > 0) {
          setSenderEmail(data.senders[0].email);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load send options");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [newsletterId]);

  function toggleGroup(key: "registered" | "prospect") {
    setSelectedGroups((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key],
    );
  }

  async function handleSend() {
    if (selectedGroups.length === 0 || !senderEmail) return;
    try {
      setSending(true);
      setError(null);
      const result = await sendNewsletterToGroups(newsletterId, selectedGroups, senderEmail);
      onSent(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-[#1a1a2e]">Send newsletter</h2>

        {loading ? (
          <p className="mt-4 text-sm text-[#65584d]">Loading send options…</p>
        ) : error ? (
          <p className="mt-4 text-sm text-rose-700">{error}</p>
        ) : options ? (
          <div className="mt-4 space-y-5">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[#7a6b60]">Provider</p>
              <div className="mt-2 flex gap-2">
                <span className="rounded-full bg-[#72262a] px-4 py-2 text-sm font-medium text-white">
                  Mailzzy
                </span>
                <span
                  title="Coming soon"
                  className="cursor-not-allowed rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-400"
                >
                  Mailchimp
                </span>
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[#7a6b60]">Audience group(s)</p>
              <div className="mt-2 space-y-2">
                {options.groups.map((group) => {
                  const priorStatus = options.priorSendStatus[group.key].status;
                  const alreadySent = priorStatus === "sent";
                  return (
                    <label
                      key={group.key}
                      className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm ${
                        alreadySent ? "border-green-200 bg-green-50 text-green-800" : "border-black/10"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={alreadySent || selectedGroups.includes(group.key)}
                          disabled={alreadySent}
                          onChange={() => toggleGroup(group.key)}
                        />
                        {group.label} ({group.memberCount} contacts)
                      </span>
                      {alreadySent ? <span>✓ Sent</span> : priorStatus === "failed" ? <span className="text-rose-700">Retry</span> : null}
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[#7a6b60]">Sender</p>
              <select
                value={senderEmail}
                onChange={(event) => setSenderEmail(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-black/10 px-4 py-2 text-sm"
              >
                {options.senders.map((sender) => (
                  <option key={sender.email} value={sender.email}>
                    {sender.displayName} ({sender.email})
                  </option>
                ))}
              </select>
              {options.senders.find((sender) => sender.email === senderEmail)?.domainVerified === false ? (
                <p className="mt-1 text-xs text-amber-700">
                  This domain isn&apos;t verified yet — deliverability may be affected.
                </p>
              ) : null}
            </div>

            {error ? <p className="text-sm text-rose-700">{error}</p> : null}

            <div className="flex justify-end gap-3">
              <button
                onClick={onClose}
                disabled={sending}
                className="rounded-2xl px-4 py-2 text-sm font-medium text-[#65584d]"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending || selectedGroups.length === 0 || !senderEmail}
                className="rounded-2xl bg-[#72262a] px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
