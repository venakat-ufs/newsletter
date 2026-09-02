# Post-Approve Send Popup — Design

**Goal:** Replace the current auto-send-on-approve newsletter flow with an explicit human-driven step: after a draft is approved, a popup lets the reviewer choose a provider, which audience group(s) to send to, and which sender to send from — with a per-group resend path if a send partially fails.

**Status:** Design approved by user 2026-09-02. Not yet implemented.

---

## Background

Today, `scheduleNewsletterSend()` (`dashboard/src/server/workflow.ts`) fires automatically the moment a draft is approved: no provider choice, no group choice, no sender choice. It always sends to whatever `MAILZZY_GROUP_ID` / `MAILZZY_GROUP_ID_PROSPECT` are configured in `.env`, with a hardcoded fallback sender.

This design makes that step explicit and interactive, and fixes a gap the current auto-send has no answer for: **if sending to one audience succeeds and the other fails, there's currently no way to retry just the failed one** without risking a duplicate send to the group that already succeeded (the exact class of bug fixed in the 2026-08-27 code review batch — see `PROGRESS.md`).

## Requirements (confirmed with user during brainstorming)

1. Popup appears after a draft is approved, before any send happens — replaces auto-send.
2. Step 1: choose provider. **Only Mailzzy is functional for v1** — Mailchimp is shown in the UI but disabled/"coming soon", not wired to anything.
3. Step 2: choose audience group(s). Exactly **two fixed semantic slots** — "Registered" and "Not Registered" — not a dynamic browser of all Mailzzy groups. At least one must be selected; both is allowed.
   - Registered group's campaign CTA links → the app's own login/sign-in page.
   - Not-Registered group's campaign CTA links → `dashboard/public/register/index.html`.
4. Step 3: choose sender. Populated **live** from Mailzzy's `senders.list`-equivalent MCP tool, not hardcoded.
5. Submitting creates and sends the campaign(s) via Mailzzy for the selected group(s)/sender.
6. **Resend must be per-group.** If one group's send fails, retry must only re-attempt that group — never re-send to a group that already succeeded.

## Confirmed live account state (2026-09-02)

- **Registered** group → Mailzzy group ID `1085` (stored name `registered`, currently empty — no contacts imported yet).
- **Not Registered** group → Mailzzy group ID `1086` (stored name `not registered`, currently empty).
- **Sender**: exactly one configured — `venakat@unitedffs.com`. Its `domainVerified` flag is `false`. This is a Mailzzy-account-level issue (needs fixing in their dashboard) independent of this feature; the sender-picker UI should surface this so nobody is surprised by deliverability problems.
- Full Mailzzy API/MCP reference: `docs/mailzzy-api-reference.md`. Confirmed live: the real MCP tool naming convention is `mcp_crm_<domain>_<verb>` (e.g. `mcp_crm_groups_create`, `mcp_crm_groups_count`) — matching what's already coded in `mailchimp.ts` — not the `domain.verb` style the public docs site describes. Any new MCP tool call this feature needs (group counts, sender list, campaign send) should be verified against a live `tools/list` call before being coded against, rather than trusted from the docs site alone.

## Architecture decision: per-group send-status tracking

**Chosen: two explicit field-pairs on the `Newsletter` record**, not a JSON blob — matches this codebase's existing convention of explicit typed columns (see `workflow_logs`, `pipeline_jobs`, etc. in `prisma/schema.prisma`), and there are exactly two groups by design (not an open-ended list), so a generic structure would be unused flexibility.

Rejected alternative: a single JSON `send_state` column keyed by group. More flexible for a hypothetical third audience, but nothing in the current requirements calls for a third group, and this codebase has no precedent for JSON-blob state fields — YAGNI.

## Data model changes

`dashboard/prisma/schema.prisma`, `Newsletter` model — add:

```prisma
registeredSendStatus String? @map("registered_send_status")   // null | "pending" | "sent" | "failed"
registeredCampaignId String? @map("registered_campaign_id")
prospectSendStatus   String? @map("prospect_send_status")     // null | "pending" | "sent" | "failed"
prospectCampaignId   String? @map("prospect_campaign_id")
senderEmail          String? @map("sender_email")             // sender chosen in the popup for this newsletter's send
```

The existing `mailchimpCampaignId` field is left in place (read by `history/page.tsx` and the `types.ts`/`api.ts` consumers today) but stops being written to by the new send path — it becomes a legacy/display-only field for newsletters sent before this change. `NewsletterStatus`'s `"sending"` value (added in the 2026-08-27 fix batch) continues to gate the whole-newsletter duplicate-send lock; the new per-group fields add finer-grained tracking *inside* that lock, they don't replace it.

A corresponding `db-prepare.mjs` migration (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`, matching the existing idempotent pattern) is needed — this is a live-shared Supabase instance per `DEPLOYMENT.md`, so no `prisma migrate deploy`/`db push`.

## API surface

### `GET /api/newsletter/send-options/[newsletterId]`

Returns what the popup needs to render:
```json
{
  "groups": [
    { "key": "registered", "label": "Registered", "mailzzyGroupId": "1085", "memberCount": 0 },
    { "key": "prospect", "label": "Not Registered", "mailzzyGroupId": "1086", "memberCount": 0 }
  ],
  "senders": [
    { "email": "venakat@unitedffs.com", "displayName": "venakat D", "domainVerified": false }
  ],
  "priorSendStatus": {
    "registered": { "status": null, "campaignId": null },
    "prospect": { "status": null, "campaignId": null }
  }
}
```
(`key`/`priorSendStatus` use `"registered"`/`"prospect"` throughout — matching the existing `applyCtaVariant(sections, "prospect", ...)` naming already in `workflow.ts` and the `registeredSendStatus`/`prospectSendStatus` DB fields below. The **display label** for `"prospect"` is "Not Registered" — the internal key and the UI-facing label are intentionally different.)
`memberCount` comes from a live Mailzzy group-count call; `senders` from a live sender-list call. `priorSendStatus` lets the popup show "already sent" for a group and pre-exclude it from the checkbox selection (though still visible/greyed, so the user understands why it's not selectable).

### `POST /api/newsletter/send/[newsletterId]`

Body:
```json
{ "groups": ["registered", "prospect"], "senderEmail": "venakat@unitedffs.com" }
```
- Rejects (400) if `groups` is empty, or if every requested group already has `status === "sent"` (nothing to do).
- Reuses the existing `claimNewsletterForSending` / `releaseNewsletterClaim` whole-newsletter lock from the 2026-08-27 fix, so two concurrent calls to this endpoint still can't race each other.
- For each requested group not already `"sent"`: mark that group `"pending"`, call `scheduleCampaign()` with that group's Mailzzy ID and the chosen sender, then mark `"sent"` + store `campaignId` on success or `"failed"` on error — independently per group, so one failing doesn't affect the other's already-recorded outcome.
- **This same endpoint is the resend path** — calling it again with `groups: ["prospect"]` after a partial failure only touches that group; a group already `"sent"` is silently skipped even if included in the request (defense in depth beyond the UI hiding it).

This replaces the current no-argument `scheduleNewsletterSend()` as the thing the frontend calls; `scheduleNewsletterSend`'s internals get restructured into this per-group form rather than living alongside it as a second code path.

## UI flow

1. **Approve** button (`dashboard/src/app/drafts/[id]/page.tsx`) changes: still runs draft approval + `publishArticlesForNewsletter`, but the code that currently chains straight into `scheduleNewsletter(...)` right after is removed. Approval alone no longer sends anything.
2. Once a newsletter is `"approved"` (or has a partially-failed send), a **"Send"** button appears/replaces the old auto-send trigger. Clicking it opens the popup, which calls `GET /api/newsletter/send-options/[id]` to populate itself.
3. Popup, single scrollable form (not a multi-page wizard, to keep this simple — YAGNI on wizard navigation state for a 3-field form):
   - Provider: two radio-style options, Mailzzy selected/enabled, Mailchimp visible but disabled with a "coming soon" tooltip.
   - Groups: two checkboxes with live member counts; a group already `"sent"` is shown checked-and-disabled with a "✓ Sent" badge instead of a checkbox.
   - Sender: a dropdown of live senders; if `domainVerified: false`, show a small warning line under the dropdown ("This domain isn't verified yet — deliverability may be affected").
   - Submit button: label reads "Send" normally, or "Resend to [group]" when only failed/unsent groups remain selectable.
4. On submit, `POST /api/newsletter/send/[id]`. On response, show per-group result (sent ✓ / failed ✗ with the error message) inline — no page reload required, matches how other actions on this page already behave (`setMessage`/`setError` pattern already in `drafts/[id]/page.tsx`).
5. If any group failed, the popup (or a small always-visible status strip on the draft page) offers "Retry [group name]" — same submit path, pre-scoped to the failed group(s) only.

## Error handling

- Each group's `scheduleCampaign()` call is wrapped independently — a thrown error updates only that group's status/`appendWorkflowLog` entry and does not affect the other group's already-recorded result or throw out of the whole request (the endpoint responds 200 with a per-group success/failure breakdown, not a single pass/fail for the request).
- The existing whole-newsletter `claimNewsletterForSending` lock still applies around the entire `POST` call, preventing two concurrent send/resend requests for the same newsletter from racing each other — this is additive to, not a replacement for, that fix.
- If Mailzzy's config is incomplete (`getMailchimpBlockReason()` non-null, same check as today), the endpoint still supports the existing preview-email-to-reviewer fallback for whichever group(s) were requested, rather than silently doing nothing.

## Testing

New Playwright spec(s) under `dashboard/tests/`, following the same pattern established in the 2026-08-27 fixes (`withDatabase`/`nextId` direct calls against the separate dev Supabase project, `PW_DISABLE_WEBSERVER=1`, no real Mailzzy network calls):
1. Selecting only "registered" only touches `registeredSendStatus`/`registeredCampaignId`; `prospectSendStatus` stays untouched (`null`).
2. Simulating a failure on one group (via a stubbed/mocked `scheduleCampaign`) leaves the other group's already-`"sent"` status and `campaignId` untouched.
3. Calling the endpoint again with a group already `"sent"` does not re-invoke `scheduleCampaign` for that group (assert on a call-count spy, not a real network call).
4. The whole-newsletter lock (`claimNewsletterForSending`) still rejects a second concurrent call to the endpoint, reusing the existing test pattern from `newsletter-send-lock.spec.ts`.

None of these tests call the real Mailzzy API or touch the production database — same safety constraints as the prior fix batch.

## Out of scope for this iteration

- Mailchimp as a real, functional second provider (UI placeholder only).
- A dynamic group browser beyond the two fixed slots.
- Bulk contact import into the two Mailzzy groups (separate, manual step the user will handle before real sends).
- Domain verification for the sender (Mailzzy-account-side fix, not application code).
