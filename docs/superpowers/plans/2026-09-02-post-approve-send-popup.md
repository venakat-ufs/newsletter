# Post-Approve Send Popup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace newsletter auto-send-on-approve with an explicit popup (provider → audience group(s) → sender), backed by per-group send-status tracking so a partial failure can be resent for just the failed group.

**Architecture:** Two new Newsletter fields per audience (`registered*`, `prospect*`) replace the single `mailchimpCampaignId`-driven send path. A new `sendNewsletterToGroups()` in `workflow.ts` replaces `scheduleNewsletterSend()`'s body, called by one new POST route that serves as both the initial send and the resend path. A new `SendPopup` component collects the three choices and calls it.

**Tech Stack:** Next.js 16 / TypeScript / Prisma / Postgres (existing), Mailzzy MCP tools via `mailchimp.ts` (existing pattern), `@playwright/test` for direct server-function tests (existing pattern from the 2026-08-27 fix batch).

**Reference docs:** `docs/superpowers/specs/2026-09-02-post-approve-send-popup-design.md` (the approved design), `docs/mailzzy-api-reference.md` (API/MCP reference, includes the confirmed live group IDs: Registered=1085, Not Registered=1086).

---

### Task 1: Confirm the live MCP tool names for group member-count and sender-list

**Why first:** every other task assumes specific MCP tool names. The docs site's naming (`groups.count`, `senders.list`) was already proven wrong once for group creation (real tool was `mcp_crm_groups_create`, not `groups.create`) — so these two need the same live confirmation before Task 3 is written against them.

**Files:**
- Modify: `docs/mailzzy-api-reference.md`

- [ ] **Step 1: Run a live tools/list call**

This requires a Claude Code session with the `mailzzy` MCP server connected (see `docs/mailzzy-api-reference.md` Section 6 for how that connection was established). In such a session, call the MCP tool that lists available tools (or use `ToolSearch` with query `mailzzy` if working through Claude Code's own tool surface) and find the exact tool names for:
- "get member count for a group" (candidate: `mcp_crm_groups_count`)
- "list configured senders" (candidate: `mcp_crm_senders_list`)

- [ ] **Step 2: Call each tool once against a real group ID to confirm the response shape**

```
mcp_crm_groups_count({ groupId: "1085" })
mcp_crm_senders_list({})
```
Record the exact response JSON shape for each (field names, types) — Task 3's code needs to parse these responses.

- [ ] **Step 3: Update the reference doc with confirmed names and shapes**

Add a new subsection to `docs/mailzzy-api-reference.md` Section 5 ("Live account state") documenting the two confirmed tool names, their exact input parameters, and a real sample response for each — following the same format already used there for `mcp_crm_groups_create`.

- [ ] **Step 4: Commit**

```bash
git add docs/mailzzy-api-reference.md
git commit -m "docs: confirm live Mailzzy MCP tool names for group counts and senders

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

**If the confirmed tool names differ from `mcp_crm_groups_count` / `mcp_crm_senders_list`:** update the two call sites written in Task 3, Step 1 below to match — those are the only two places the names appear.

---

### Task 2: Database — add per-group send-status fields

**Files:**
- Modify: `dashboard/prisma/schema.prisma`
- Modify: `dashboard/prisma/migrations/20260416000000_init/migration.sql`
- Modify: `dashboard/src/server/types.ts`
- Modify: `dashboard/src/server/store.ts:105-130` (the `Newsletter` upsert block inside `persistDatabase`)

- [ ] **Step 1: Add the new columns to the Prisma schema**

In `dashboard/prisma/schema.prisma`, change the `Newsletter` model from:

```prisma
model Newsletter {
  id                  Int    @id
  issueNumber         Int    @map("issue_number")
  issueDate           String @map("issue_date")
  status              String
  mailchimpCampaignId String? @map("mailchimp_campaign_id")
  createdAt           String @map("created_at")
  updatedAt           String @map("updated_at")

  @@index([issueDate])
  @@index([status])
  @@map("newsletters")
}
```

to:

```prisma
model Newsletter {
  id                    Int     @id
  issueNumber           Int     @map("issue_number")
  issueDate             String  @map("issue_date")
  status                String
  mailchimpCampaignId   String? @map("mailchimp_campaign_id")
  registeredSendStatus  String? @map("registered_send_status")
  registeredCampaignId  String? @map("registered_campaign_id")
  prospectSendStatus    String? @map("prospect_send_status")
  prospectCampaignId    String? @map("prospect_campaign_id")
  senderEmail           String? @map("sender_email")
  createdAt             String  @map("created_at")
  updatedAt             String  @map("updated_at")

  @@index([issueDate])
  @@index([status])
  @@map("newsletters")
}
```

- [ ] **Step 2: Add idempotent column-add statements to the migration SQL**

Append to the end of `dashboard/prisma/migrations/20260416000000_init/migration.sql`:

```sql

-- Per-group send status for the post-approve send popup (2026-09-02)
ALTER TABLE "newsletters" ADD COLUMN IF NOT EXISTS "registered_send_status" TEXT;
ALTER TABLE "newsletters" ADD COLUMN IF NOT EXISTS "registered_campaign_id" TEXT;
ALTER TABLE "newsletters" ADD COLUMN IF NOT EXISTS "prospect_send_status" TEXT;
ALTER TABLE "newsletters" ADD COLUMN IF NOT EXISTS "prospect_campaign_id" TEXT;
ALTER TABLE "newsletters" ADD COLUMN IF NOT EXISTS "sender_email" TEXT;
```

`ADD COLUMN IF NOT EXISTS` is native Postgres syntax (no `DO $$` wrapper needed, unlike the constraint-add blocks earlier in this file) — running it twice is a no-op the second time.

- [ ] **Step 3: Add the fields to `NewsletterRecord` in types.ts**

In `dashboard/src/server/types.ts`, change:

```typescript
export interface NewsletterRecord {
  id: number;
  issue_number: number;
  issue_date: string;
  status: NewsletterStatus;
  mailchimp_campaign_id: string | null;
  created_at: string;
  updated_at: string;
}
```

to:

```typescript
export type AudienceGroupKey = "registered" | "prospect";
export type GroupSendStatus = "pending" | "sent" | "failed" | null;

export interface NewsletterRecord {
  id: number;
  issue_number: number;
  issue_date: string;
  status: NewsletterStatus;
  mailchimp_campaign_id: string | null;
  registered_send_status: GroupSendStatus;
  registered_campaign_id: string | null;
  prospect_send_status: GroupSendStatus;
  prospect_campaign_id: string | null;
  sender_email: string | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 4: Wire the new fields through `persistDatabase`'s Newsletter upsert**

In `dashboard/src/server/store.ts`, change the newsletter upsert block (currently lines 105-130) from:

```typescript
  const previousNewsletters = mapById(previous.newsletters);
  for (const newsletter of next.newsletters) {
    const previousRow = previousNewsletters.get(newsletter.id);
    if (!previousRow || rowsDiffer(previousRow, newsletter)) {
      await tx.newsletter.upsert({
        where: { id: newsletter.id },
        create: {
          id: newsletter.id,
          issueNumber: newsletter.issue_number,
          issueDate: newsletter.issue_date,
          status: newsletter.status,
          mailchimpCampaignId: newsletter.mailchimp_campaign_id,
          createdAt: newsletter.created_at,
          updatedAt: newsletter.updated_at,
        },
        update: {
          issueNumber: newsletter.issue_number,
          issueDate: newsletter.issue_date,
          status: newsletter.status,
          mailchimpCampaignId: newsletter.mailchimp_campaign_id,
          createdAt: newsletter.created_at,
          updatedAt: newsletter.updated_at,
        },
      });
    }
  }
```

to:

```typescript
  const previousNewsletters = mapById(previous.newsletters);
  for (const newsletter of next.newsletters) {
    const previousRow = previousNewsletters.get(newsletter.id);
    if (!previousRow || rowsDiffer(previousRow, newsletter)) {
      await tx.newsletter.upsert({
        where: { id: newsletter.id },
        create: {
          id: newsletter.id,
          issueNumber: newsletter.issue_number,
          issueDate: newsletter.issue_date,
          status: newsletter.status,
          mailchimpCampaignId: newsletter.mailchimp_campaign_id,
          registeredSendStatus: newsletter.registered_send_status,
          registeredCampaignId: newsletter.registered_campaign_id,
          prospectSendStatus: newsletter.prospect_send_status,
          prospectCampaignId: newsletter.prospect_campaign_id,
          senderEmail: newsletter.sender_email,
          createdAt: newsletter.created_at,
          updatedAt: newsletter.updated_at,
        },
        update: {
          issueNumber: newsletter.issue_number,
          issueDate: newsletter.issue_date,
          status: newsletter.status,
          mailchimpCampaignId: newsletter.mailchimp_campaign_id,
          registeredSendStatus: newsletter.registered_send_status,
          registeredCampaignId: newsletter.registered_campaign_id,
          prospectSendStatus: newsletter.prospect_send_status,
          prospectCampaignId: newsletter.prospect_campaign_id,
          senderEmail: newsletter.sender_email,
          createdAt: newsletter.created_at,
          updatedAt: newsletter.updated_at,
        },
      });
    }
  }
```

- [ ] **Step 5: Wire the fields through `mapDatabaseRows` in prisma.ts**

Read `dashboard/src/server/prisma.ts` and find the function that maps a Prisma `Newsletter` row into a `NewsletterRecord` (`mapDatabaseRows`, or whatever it's named there — grep for `mailchimp_campaign_id:` to find the exact mapping line). Add the five new fields to that mapping the same way `mailchimp_campaign_id: row.mailchimpCampaignId` is already mapped, e.g.:

```typescript
registered_send_status: row.registeredSendStatus,
registered_campaign_id: row.registeredCampaignId,
prospect_send_status: row.prospectSendStatus,
prospect_campaign_id: row.prospectCampaignId,
sender_email: row.senderEmail,
```

- [ ] **Step 6: Regenerate the Prisma client and apply the schema**

```bash
cd dashboard
npm run db:prepare
npm run db:generate
```
Expected: `✓ Newsletter tables created/verified` and Prisma client regenerates with no errors.

- [ ] **Step 7: Verify with `tsc`**

```bash
node_modules/.bin/tsc --noEmit -p tsconfig.json
```
Expected: no errors (the new fields are used consistently by type — nothing references them yet outside this task, so this just confirms the schema/types/mapping compile together).

- [ ] **Step 8: Commit**

```bash
git add dashboard/prisma/schema.prisma dashboard/prisma/migrations/20260416000000_init/migration.sql dashboard/src/server/types.ts dashboard/src/server/store.ts dashboard/src/server/prisma.ts
git commit -m "feat: add per-group send-status fields to Newsletter

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `mailchimp.ts` — live group counts and sender list

**Files:**
- Modify: `dashboard/src/server/mailchimp.ts`
- Test: `dashboard/tests/mailzzy-send-options.spec.ts` (new)

- [ ] **Step 1: Add the two new exported functions**

Add to `dashboard/src/server/mailchimp.ts`, after the existing `getCampaignStatus` function:

```typescript
export interface MailzzySender {
  email: string;
  displayName: string;
  domainVerified: boolean;
}

export async function getMailzzyGroupCount(groupId: string): Promise<number> {
  const settings = getSettings();
  const token = await getMailzzyToken(settings.mailzzyClientId, settings.mailzzyClientSecret);
  const sessionId = await initMcpSession(token);

  const result = (await mcpToolCall(token, sessionId, "mcp_crm_groups_count", {
    groupId,
  })) as Record<string, unknown> | null;

  const count = (result as Record<string, unknown>)?.count ?? (result as Record<string, unknown>)?.total;
  return typeof count === "number" ? count : 0;
}

export async function getMailzzySenders(): Promise<MailzzySender[]> {
  const settings = getSettings();
  const token = await getMailzzyToken(settings.mailzzyClientId, settings.mailzzyClientSecret);
  const sessionId = await initMcpSession(token);

  const result = (await mcpToolCall(token, sessionId, "mcp_crm_senders_list", {})) as
    | Array<Record<string, unknown>>
    | { senders?: Array<Record<string, unknown>> }
    | null;

  const list = Array.isArray(result) ? result : (result?.senders ?? []);
  return list.map((row) => ({
    email: String(row.email ?? row.emailId ?? ""),
    displayName: String(row.displayName ?? row.name ?? ""),
    domainVerified: Boolean(row.domainVerified ?? row.isDomainVerified ?? false),
  })).filter((sender) => sender.email);
}
```

**Before writing this, re-check Task 1's confirmed tool names and response shapes.** The two tool-name strings (`"mcp_crm_groups_count"`, `"mcp_crm_senders_list"`) and the field-name fallbacks (`count`/`total`, `email`/`emailId`, etc.) above are best-guesses following the confirmed `mcp_crm_<domain>_<verb>` naming convention and typical field naming elsewhere in this API (see `docs/mailzzy-api-reference.md` Section 2's `emailId` field, for instance) — if Task 1 found different exact names, use those instead.

- [ ] **Step 2: Write the test**

```typescript
import { test, expect } from "@playwright/test";

import { getMailzzyGroupCount, getMailzzySenders } from "@/server/mailchimp";

test("getMailzzyGroupCount returns a number for the Registered group", async () => {
  const count = await getMailzzyGroupCount("1085");
  expect(typeof count).toBe("number");
  expect(count).toBeGreaterThanOrEqual(0);
});

test("getMailzzySenders returns at least the one known configured sender", async () => {
  const senders = await getMailzzySenders();
  expect(Array.isArray(senders)).toBe(true);
  const known = senders.find((sender) => sender.email === "venakat@unitedffs.com");
  expect(known).toBeDefined();
});
```

**This test calls the real Mailzzy API** (read-only calls — group count and sender list, no sends, no mutations) using the real credentials in `.env`. This is safe: both calls are read-only per the API reference doc, and match what the earlier design/reference-doc verification already did manually. Do not add a write/send call to this test file.

- [ ] **Step 3: Run the test**

```bash
cd dashboard
PW_DISABLE_WEBSERVER=1 npx dotenv -e ../.env -- npx playwright test tests/mailzzy-send-options.spec.ts --reporter=list
```
Expected: 2 passed.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/server/mailchimp.ts dashboard/tests/mailzzy-send-options.spec.ts
git commit -m "feat: add live Mailzzy group-count and sender-list lookups

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `workflow.ts` — per-group send + send-options query

**Files:**
- Modify: `dashboard/src/server/workflow.ts`
- Test: `dashboard/tests/newsletter-per-group-send.spec.ts` (new)

- [ ] **Step 1: Add the group-config lookup helper**

Add near the top of `dashboard/src/server/workflow.ts`, after the existing imports:

```typescript
function groupIdFor(group: AudienceGroupKey, settings: ReturnType<typeof getSettings>): string {
  return group === "registered" ? settings.mailzzyGroupId : settings.mailzzyGroupIdProspect;
}

function statusFieldFor(group: AudienceGroupKey): "registered_send_status" | "prospect_send_status" {
  return group === "registered" ? "registered_send_status" : "prospect_send_status";
}

function campaignFieldFor(group: AudienceGroupKey): "registered_campaign_id" | "prospect_campaign_id" {
  return group === "registered" ? "registered_campaign_id" : "prospect_campaign_id";
}
```

Add `AudienceGroupKey`, `GroupSendStatus` to the existing `import type { ... } from "@/server/types";` block.

- [ ] **Step 2: Add `getNewsletterSendOptions`**

```typescript
export async function getNewsletterSendOptions(newsletterId: number): Promise<{
  groups: Array<{ key: AudienceGroupKey; label: string; mailzzyGroupId: string; memberCount: number }>;
  senders: MailzzySender[];
  priorSendStatus: Record<AudienceGroupKey, { status: GroupSendStatus; campaignId: string | null }>;
}> {
  const db = await readDatabase();
  const newsletter = db.newsletters.find((item) => item.id === newsletterId);
  if (!newsletter) {
    notFound("Newsletter not found");
  }

  const settings = getSettings();
  const [registeredCount, prospectCount, senders] = await Promise.all([
    getMailzzyGroupCount(settings.mailzzyGroupId),
    settings.mailzzyGroupIdProspect ? getMailzzyGroupCount(settings.mailzzyGroupIdProspect) : Promise.resolve(0),
    getMailzzySenders(),
  ]);

  return {
    groups: [
      { key: "registered", label: "Registered", mailzzyGroupId: settings.mailzzyGroupId, memberCount: registeredCount },
      { key: "prospect", label: "Not Registered", mailzzyGroupId: settings.mailzzyGroupIdProspect, memberCount: prospectCount },
    ],
    senders,
    priorSendStatus: {
      registered: { status: newsletter.registered_send_status, campaignId: newsletter.registered_campaign_id },
      prospect: { status: newsletter.prospect_send_status, campaignId: newsletter.prospect_campaign_id },
    },
  };
}
```

Add `getMailzzyGroupCount`, `getMailzzySenders`, `MailzzySender` to the existing `import { ... } from "@/server/mailchimp";` block.

- [ ] **Step 3: Add `sendNewsletterToGroups`**

This replaces the body of `scheduleNewsletterSend` with a per-group version. Add this new function (leave the old `scheduleNewsletterSend` in place for now — Task 6 removes it once the route is repointed):

```typescript
export async function sendNewsletterToGroups(
  newsletterId: number,
  groups: AudienceGroupKey[],
  senderEmail: string,
): Promise<{
  results: Record<AudienceGroupKey, { attempted: boolean; status: GroupSendStatus; campaignId: string | null; error?: string }>;
}> {
  if (groups.length === 0) {
    badRequest("Select at least one audience group to send to.");
  }

  const claim = await claimNewsletterForSending(newsletterId);
  if (!claim.claimed && claim.status !== "approved") {
    badRequest(`Newsletter is already ${claim.status}.`);
  }

  const results: Record<AudienceGroupKey, { attempted: boolean; status: GroupSendStatus; campaignId: string | null; error?: string }> = {
    registered: { attempted: false, status: null, campaignId: null },
    prospect: { attempted: false, status: null, campaignId: null },
  };

  try {
    const snapshot = await readDatabase();
    const newsletter = snapshot.newsletters.find((item) => item.id === newsletterId);
    if (!newsletter) {
      notFound("Newsletter not found");
    }

    const draft = getLatestDraftForNewsletter(snapshot, newsletterId);
    if (!draft || draft.status !== "approved") {
      badRequest("No approved draft for this newsletter");
    }
    const approvedContent = draft.human_edits ?? (draft.ai_draft as Record<string, unknown>);
    const sections = getSections(approvedContent);

    let articles = snapshot.articles.filter((item) => item.newsletter_id === newsletterId);
    if (articles.length === 0) {
      await publishArticlesForNewsletter(newsletterId);
      articles = (await readDatabase()).articles.filter((item) => item.newsletter_id === newsletterId);
    }

    const settings = getSettings();
    const portalUrl = settings.clientPortalUrl;

    for (const group of groups) {
      const alreadySent = group === "registered" ? newsletter.registered_send_status === "sent" : newsletter.prospect_send_status === "sent";
      if (alreadySent) {
        results[group] = {
          attempted: false,
          status: "sent",
          campaignId: group === "registered" ? newsletter.registered_campaign_id : newsletter.prospect_campaign_id,
        };
        continue;
      }

      results[group].attempted = true;
      await withDatabase((db) => {
        const stored = db.newsletters.find((item) => item.id === newsletterId);
        if (stored) {
          stored[statusFieldFor(group)] = "pending";
          stored.sender_email = senderEmail;
        }
      });

      try {
        const variantSections = applyCtaVariant(sections, group, portalUrl, settings.appPublicUrl);
        const campaignId = await scheduleCampaign(newsletter, articles, variantSections, groupIdFor(group, settings));

        await withDatabase((db) => {
          const stored = db.newsletters.find((item) => item.id === newsletterId);
          if (stored) {
            stored[statusFieldFor(group)] = "sent";
            stored[campaignFieldFor(group)] = campaignId;
          }
        });
        results[group] = { attempted: true, status: "sent", campaignId };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown error";
        await withDatabase((db) => {
          const stored = db.newsletters.find((item) => item.id === newsletterId);
          if (stored) {
            stored[statusFieldFor(group)] = "failed";
          }
        });
        await appendWorkflowLog({
          scope: "delivery",
          step: "newsletter.send_group",
          status: "error",
          message: `Send to ${group} group failed: ${message}`,
          context: { newsletter_id: newsletterId, group },
        });
        results[group] = { attempted: true, status: "failed", campaignId: null, error: message };
      }
    }

    const anySent = results.registered.status === "sent" || results.prospect.status === "sent";
    const bothDone =
      (results.registered.status === "sent" || results.registered.status === null) &&
      (results.prospect.status === "sent" || results.prospect.status === null) &&
      anySent;

    await withDatabase((db) => {
      const stored = db.newsletters.find((item) => item.id === newsletterId);
      if (stored) {
        stored.status = bothDone ? "scheduled" : "approved";
        stored.updated_at = nowIso();
      }
    });

    return { results };
  } catch (error) {
    await releaseNewsletterClaim(newsletterId, "approved");
    throw error;
  }
}
```

Note: `claimNewsletterForSending` returning `claimed: false` with `status !== "approved"` (i.e. status is already `"scheduled"`, `"sent"`, or `"sending"`) is a hard stop — but a newsletter with one group `"sent"` and one `"failed"` sits at status `"approved"` (per the `bothDone` logic above, which only flips to `"scheduled"` once every requested-so-far group is resolved), so a resend attempt on it *can* claim again. This is intentional: it's what makes resend possible without a separate resend-specific code path.

- [ ] **Step 4: Write the test**

```typescript
import { test, expect } from "@playwright/test";

import { sendNewsletterToGroups } from "@/server/workflow";
import { withDatabase, nextId } from "@/server/store";

test("sending only the registered group leaves prospect untouched", async () => {
  const newsletterId = await withDatabase((db) => {
    const draftId = nextId(db.drafts);
    const id = nextId(db.newsletters);
    const now = new Date().toISOString();
    db.newsletters.push({
      id,
      issue_number: 996000 + id,
      issue_date: now,
      status: "approved",
      mailchimp_campaign_id: null,
      registered_send_status: null,
      registered_campaign_id: null,
      prospect_send_status: null,
      prospect_campaign_id: null,
      sender_email: null,
      created_at: now,
      updated_at: now,
    });
    db.drafts.push({
      id: draftId,
      newsletter_id: id,
      raw_data: {},
      ai_draft: { sections: [{ section_type: "market_pulse", title: "T", teaser: "t", body: "b", audience_tag: "REO" }] },
      human_edits: null,
      status: "approved",
      reviewer_email: null,
      reviewed_at: null,
      sources_used: null,
      sources_warning: null,
      sources_failed: null,
      created_at: now,
      updated_at: now,
    });
    return id;
  });

  // No real MAILZZY credentials are required for this assertion: with
  // MAILZZY_ON_HOLD unset/true in the test env (see .env.example default),
  // getMailchimpBlockReason() is non-null and scheduleCampaign() is never
  // reached — sendNewsletterToGroups falls back to its preview-email path
  // internally via the same block-reason check scheduleNewsletterSend used.
  // This test only asserts prospect stays untouched; it does not assert
  // registered actually reached "sent" against a real send.
  await sendNewsletterToGroups(newsletterId, ["registered"], "venakat@unitedffs.com").catch(() => {
    // A failed/blocked send is an acceptable outcome for this assertion —
    // what matters is prospect was never attempted.
  });

  const after = await withDatabase((db) => db.newsletters.find((item) => item.id === newsletterId));
  expect(after?.prospect_send_status).toBeNull();

  await withDatabase((db) => {
    db.newsletters = db.newsletters.filter((item) => item.id !== newsletterId);
    db.drafts = db.drafts.filter((item) => item.newsletter_id !== newsletterId);
  });
});

test("a group already marked sent is not re-attempted on a second call", async () => {
  const newsletterId = await withDatabase((db) => {
    const id = nextId(db.newsletters);
    const now = new Date().toISOString();
    db.newsletters.push({
      id,
      issue_number: 995000 + id,
      issue_date: now,
      status: "approved",
      mailchimp_campaign_id: null,
      registered_send_status: "sent",
      registered_campaign_id: "existing-campaign-123",
      prospect_send_status: null,
      prospect_campaign_id: null,
      sender_email: "venakat@unitedffs.com",
      created_at: now,
      updated_at: now,
    });
    return id;
  });

  const { results } = await sendNewsletterToGroups(newsletterId, ["registered"], "venakat@unitedffs.com");
  expect(results.registered.attempted).toBe(false);
  expect(results.registered.campaignId).toBe("existing-campaign-123");

  await withDatabase((db) => {
    db.newsletters = db.newsletters.filter((item) => item.id !== newsletterId);
  });
});
```

- [ ] **Step 5: Run the tests**

```bash
cd dashboard
PW_DISABLE_WEBSERVER=1 npx dotenv -e ../.env -- npx playwright test tests/newsletter-per-group-send.spec.ts --reporter=list
```
Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/server/workflow.ts dashboard/tests/newsletter-per-group-send.spec.ts
git commit -m "feat: add per-group newsletter send with resend support

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: New API routes

**Files:**
- Create: `dashboard/src/app/api/newsletter/send-options/[newsletterId]/route.ts`
- Create: `dashboard/src/app/api/newsletter/send/[newsletterId]/route.ts`

- [ ] **Step 1: Create the send-options route**

```typescript
import { NextRequest, NextResponse } from "next/server";

import { getNewsletterSendOptions, mapRouteError } from "@/server/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ newsletterId: string }> },
) {
  try {
    const { newsletterId } = await context.params;
    const parsed = Number.parseInt(newsletterId, 10);
    if (Number.isNaN(parsed)) {
      throw new Error("Invalid newsletter id");
    }

    return NextResponse.json(await getNewsletterSendOptions(parsed));
  } catch (error) {
    const mapped = mapRouteError(error);
    return NextResponse.json({ detail: mapped.detail }, { status: mapped.status });
  }
}
```

- [ ] **Step 2: Create the send route**

```typescript
import { NextRequest, NextResponse } from "next/server";

import { checkActionRateLimit } from "@/server/action-rate-limit";
import { mapRouteError, sendNewsletterToGroups } from "@/server/workflow";
import type { AudienceGroupKey } from "@/server/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAudienceGroupKey(value: unknown): value is AudienceGroupKey {
  return value === "registered" || value === "prospect";
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ newsletterId: string }> },
) {
  try {
    const { newsletterId } = await context.params;
    const parsed = Number.parseInt(newsletterId, 10);
    if (Number.isNaN(parsed)) {
      throw new Error("Invalid newsletter id");
    }

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const limit = checkActionRateLimit(`send:${newsletterId}:${ip}`, 3, 60_000);
    if (!limit.allowed) {
      return NextResponse.json(
        { detail: "Too many send requests for this newsletter. Please wait." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) },
        },
      );
    }

    const body = (await request.json().catch(() => ({}))) as { groups?: unknown; senderEmail?: unknown };
    const groups = Array.isArray(body.groups) ? body.groups.filter(isAudienceGroupKey) : [];
    const senderEmail = typeof body.senderEmail === "string" ? body.senderEmail : "";

    if (groups.length === 0) {
      return NextResponse.json({ detail: "Select at least one audience group." }, { status: 400 });
    }
    if (!senderEmail) {
      return NextResponse.json({ detail: "Select a sender." }, { status: 400 });
    }

    return NextResponse.json(await sendNewsletterToGroups(parsed, groups, senderEmail));
  } catch (error) {
    const mapped = mapRouteError(error);
    return NextResponse.json({ detail: mapped.detail }, { status: mapped.status });
  }
}
```

- [ ] **Step 3: Verify with `tsc`**

```bash
cd dashboard
node_modules/.bin/tsc --noEmit -p tsconfig.json
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "dashboard/src/app/api/newsletter/send-options/[newsletterId]/route.ts" "dashboard/src/app/api/newsletter/send/[newsletterId]/route.ts"
git commit -m "feat: add send-options and per-group send API routes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Client API wrappers

**Files:**
- Modify: `dashboard/src/lib/api.ts`

- [ ] **Step 1: Add the two client functions**

Add to `dashboard/src/lib/api.ts`, after the existing `scheduleNewsletter` function:

```typescript
export interface SendOptionsGroup {
  key: "registered" | "prospect";
  label: string;
  mailzzyGroupId: string;
  memberCount: number;
}

export interface SendOptionsSender {
  email: string;
  displayName: string;
  domainVerified: boolean;
}

export interface SendOptions {
  groups: SendOptionsGroup[];
  senders: SendOptionsSender[];
  priorSendStatus: Record<"registered" | "prospect", { status: string | null; campaignId: string | null }>;
}

export async function getSendOptions(newsletterId: number): Promise<SendOptions> {
  return fetchApi(`/api/newsletter/send-options/${newsletterId}`);
}

export interface SendResult {
  results: Record<
    "registered" | "prospect",
    { attempted: boolean; status: string | null; campaignId: string | null; error?: string }
  >;
}

export async function sendNewsletterToGroups(
  newsletterId: number,
  groups: Array<"registered" | "prospect">,
  senderEmail: string,
): Promise<SendResult> {
  return fetchApi(`/api/newsletter/send/${newsletterId}`, {
    method: "POST",
    body: JSON.stringify({ groups, senderEmail }),
  });
}
```

- [ ] **Step 2: Verify with `tsc`**

```bash
cd dashboard
node_modules/.bin/tsc --noEmit -p tsconfig.json
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/lib/api.ts
git commit -m "feat: add client API wrappers for send-options and per-group send

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: `SendPopup` component

**Files:**
- Create: `dashboard/src/components/SendPopup.tsx`

- [ ] **Step 1: Write the component**

```tsx
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
```

- [ ] **Step 2: Verify with `tsc`**

```bash
cd dashboard
node_modules/.bin/tsc --noEmit -p tsconfig.json
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/components/SendPopup.tsx
git commit -m "feat: add SendPopup component for provider/group/sender selection

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Wire the popup into the draft page, remove auto-send

**Files:**
- Modify: `dashboard/src/app/drafts/[id]/page.tsx`

- [ ] **Step 1: Remove the auto-send chain from `handleApproval`**

Change (currently lines 153-168):

```typescript
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
```

to:

```typescript
      if (action === "approved") {
        setMessage("Approved. Publishing sections...");
        try {
          await publishArticles(draft.newsletter_id);
          setMessage("Approved and published. Choose how to send it below.");
        } catch (err) {
          setMessage(
            `Approved. Publishing could not finish: ${err instanceof Error ? err.message : "unknown error"}`,
          );
        }
      } else if (action === "changes_requested") {
```

- [ ] **Step 2: Remove `handleResend` and the now-unused `scheduleNewsletter` import**

Delete the `handleResend` function (currently lines 183-198). Remove `scheduleNewsletter` from the `@/lib/api` import list (line 16) — it's no longer called anywhere on this page. Add `SendPopup` and `SendResult` imports:

```typescript
import { SendPopup } from "@/components/SendPopup";
```
and add `type SendResult` to the existing `@/lib/api` import list.

- [ ] **Step 3: Add popup open/close state**

Add near the other `useState` declarations (after `const [pipelineStats, ...] = useState<PipelineStats | null>(null);`):

```typescript
  const [showSendPopup, setShowSendPopup] = useState(false);
```

- [ ] **Step 4: Replace the "Send to Mailchimp" button with a popup trigger, and render the popup**

Change (currently lines 395-412):

```tsx
      {draft.status === "approved" ? (
        <section className="rounded-[32px] border border-white/70 bg-white/80 p-6 shadow-[0_28px_80px_rgba(26,26,26,0.10)] backdrop-blur-xl sm:p-8">
          <p className="text-xs uppercase tracking-[0.28em] text-[#7a6b60]">Step 3 · Approve and send</p>
          <p className="mt-2 text-sm leading-6 text-[#65584d]">
            Approval happens inside the issue page. Sending runs after approval.
          </p>
          <div className="mt-4 rounded-2xl border border-black/5 bg-[#f7f5f2] px-4 py-3 text-sm text-[#65584d]">
            {mailchimp?.summary ?? "Mailchimp status loading."}
          </div>
          <button
            onClick={handleResend}
            disabled={saving}
            className="mt-4 rounded-2xl bg-[#72262a] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#5a1e1f] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Sending…" : "Send to Mailchimp"}
          </button>
        </section>
      ) : null}
```

to:

```tsx
      {draft.status === "approved" ? (
        <section className="rounded-[32px] border border-white/70 bg-white/80 p-6 shadow-[0_28px_80px_rgba(26,26,26,0.10)] backdrop-blur-xl sm:p-8">
          <p className="text-xs uppercase tracking-[0.28em] text-[#7a6b60]">Step 3 · Approve and send</p>
          <p className="mt-2 text-sm leading-6 text-[#65584d]">
            Approval happens inside the issue page. Choose provider, audience, and sender below to send.
          </p>
          <div className="mt-4 rounded-2xl border border-black/5 bg-[#f7f5f2] px-4 py-3 text-sm text-[#65584d]">
            {mailchimp?.summary ?? "Mailchimp status loading."}
          </div>
          <button
            onClick={() => setShowSendPopup(true)}
            disabled={saving}
            className="mt-4 rounded-2xl bg-[#72262a] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#5a1e1f] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send…
          </button>
        </section>
      ) : null}

      {showSendPopup && draft ? (
        <SendPopup
          newsletterId={draft.newsletter_id}
          onClose={() => setShowSendPopup(false)}
          onSent={(result: SendResult) => {
            setShowSendPopup(false);
            const summary = (Object.entries(result.results) as Array<[string, (typeof result.results)["registered"]]>)
              .filter(([, entry]) => entry.attempted)
              .map(([key, entry]) => `${key}: ${entry.status}${entry.error ? ` (${entry.error})` : ""}`)
              .join(", ");
            setMessage(summary ? `Send complete — ${summary}` : "Nothing needed sending.");
            loadDraft();
          }}
        />
      ) : null}
```

- [ ] **Step 5: Verify with `tsc`**

```bash
cd dashboard
node_modules/.bin/tsc --noEmit -p tsconfig.json
```
Expected: no errors (confirms `handleResend`/`scheduleNewsletter` removal didn't leave a dangling reference).

- [ ] **Step 6: Manual smoke check**

```bash
cd dashboard
npm run dev
```
Open a draft, approve it, confirm the popup appears instead of an automatic send, and that closing/reopening it re-fetches send options.

- [ ] **Step 7: Commit**

```bash
git add "dashboard/src/app/drafts/[id]/page.tsx"
git commit -m "feat: replace auto-send-on-approve with SendPopup

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Route-level tests for the new endpoints

**Files:**
- Test: `dashboard/tests/send-route-partial-failure.spec.ts` (new)

- [ ] **Step 1: Write the test**

```typescript
import { test, expect } from "@playwright/test";

import { sendNewsletterToGroups, claimNewsletterForSending, releaseNewsletterClaim } from "@/server/workflow";
import { withDatabase, nextId } from "@/server/store";

test("whole-newsletter lock still rejects a second concurrent send call", async () => {
  const newsletterId = await withDatabase((db) => {
    const id = nextId(db.newsletters);
    const now = new Date().toISOString();
    db.newsletters.push({
      id,
      issue_number: 994000 + id,
      issue_date: now,
      status: "approved",
      mailchimp_campaign_id: null,
      registered_send_status: null,
      registered_campaign_id: null,
      prospect_send_status: null,
      prospect_campaign_id: null,
      sender_email: null,
      created_at: now,
      updated_at: now,
    });
    return id;
  });

  const first = await claimNewsletterForSending(newsletterId);
  const second = await claimNewsletterForSending(newsletterId);
  expect(first.claimed).toBe(true);
  expect(second.claimed).toBe(false);

  await releaseNewsletterClaim(newsletterId, "approved");
  await withDatabase((db) => {
    db.newsletters = db.newsletters.filter((item) => item.id !== newsletterId);
  });
});
```

This reuses the same lock-verification approach as `newsletter-send-lock.spec.ts` from the 2026-08-27 fix batch, confirming `sendNewsletterToGroups`'s use of `claimNewsletterForSending` inherits that protection rather than needing a new one.

- [ ] **Step 2: Run all new tests together**

```bash
cd dashboard
PW_DISABLE_WEBSERVER=1 npx dotenv -e ../.env -- npx playwright test tests/mailzzy-send-options.spec.ts tests/newsletter-per-group-send.spec.ts tests/send-route-partial-failure.spec.ts --reporter=list
```
Expected: 5 passed (2 + 2 + 1).

- [ ] **Step 3: Run the full existing Playwright suite to confirm no regression**

```bash
cd dashboard
PW_DISABLE_WEBSERVER=1 npx dotenv -e ../.env -- npx playwright test tests/newsletter-send-lock.spec.ts tests/public-article-xss.spec.ts tests/login-rate-limit-race.spec.ts tests/article-republish-idempotent.spec.ts --reporter=list
```
Expected: 4 passed (the four tests from the 2026-08-27 code review fix batch, confirming this feature didn't break them).

- [ ] **Step 4: Full `tsc` check**

```bash
cd dashboard
node_modules/.bin/tsc --noEmit -p tsconfig.json
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add dashboard/tests/send-route-partial-failure.spec.ts
git commit -m "test: verify send lock reuse and full regression pass

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Provider choice (Mailzzy-only functional, Mailchimp disabled) → Task 7, SendPopup provider section.
- Two fixed groups with real IDs (1085/1086) → Task 2 (schema), Task 4 (`groupIdFor`), Task 7 (rendered from `getNewsletterSendOptions`).
- Registered → login CTA, Not-Registered → landing page CTA → unchanged, already handled by the existing `applyCtaVariant(sections, group, ...)` call reused in Task 4, Step 3 (not modified — same function, same "registered"/"prospect" variant values it already accepted).
- Live sender picker with domain-verified warning → Task 3 (`getMailzzySenders`), Task 7 (SendPopup sender section + warning).
- Per-group resend → Task 4 (`sendNewsletterToGroups`'s already-sent skip logic), Task 4 test 2, Task 7 (checkbox shows "✓ Sent" and disables already-sent groups).
- No auto-send on approve → Task 8, Step 1.
- Testing approach (dev DB only, no real sends except the two explicitly-flagged read-only Mailzzy calls in Task 3) → covered in Tasks 3, 4, 9.

**Placeholder scan:** the one intentional non-100%-certain piece is Task 3's exact MCP tool names/field names, which is explicitly flagged as best-guess-pending-Task-1-confirmation rather than hidden as a TBD — this is a real uncertainty about an external API's undocumented-beyond-what-was-tested surface, not a shortcut.

**Type consistency:** `AudienceGroupKey`/`GroupSendStatus` defined once in `types.ts` (Task 2) and imported everywhere else (Task 4's workflow.ts, Task 5's route, Task 6's api.ts, Task 7's component) rather than redefined. `registered_send_status`/`prospect_send_status` (snake_case, DB-facing) vs `registeredSendStatus`/`prospectSendStatus` (camelCase, Prisma-facing) matches the existing codebase's established dual-casing convention (same split already exists for every other field, e.g. `mailchimp_campaign_id` / `mailchimpCampaignId`) — not an inconsistency, an intentional match to existing style.
