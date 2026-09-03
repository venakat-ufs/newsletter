# Code Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 8 remaining findings from the 2026-08-27 full code review (the `proxy.ts` SSO-cookie/API-access finding is being handled separately and is NOT in this plan).

**Architecture:** Each task is an independent, self-contained bug fix — no task depends on another completing first. Fixes reuse existing patterns already in the codebase (the `tryClaimJob` optimistic-concurrency pattern from `pipeline-jobs.ts`, the existing `escapeHtml` helper, Prisma's atomic `increment`) rather than introducing new libraries or abstractions.

**Tech Stack:** Next.js 16 / TypeScript / Prisma (dashboard), Python / FastAPI / httpx (api/). Tests: `@playwright/test` (already a devDependency, used here for direct server-function tests with no browser, matching how `dashboard/tests/*.spec.ts` already run) for TypeScript, `pytest` (matching `api/tests/test_reo_aggregator.py`) for Python.

---

### Task 1: Fix duplicate newsletter sends (no idempotency lock)

**Finding:** `scheduleNewsletterSend` reads a DB snapshot, checks `status !== "scheduled"`, then makes slow external Mailzzy API calls, and only writes `status = "scheduled"` back afterward. Two concurrent calls (double-click, client retry) both pass the check before either writes — both send live campaigns.

**Files:**
- Modify: `dashboard/src/server/types.ts:7-12`
- Modify: `dashboard/src/server/workflow.ts:2067-2225`
- Test: `dashboard/tests/newsletter-send-lock.spec.ts` (new)

- [ ] **Step 1: Add a `sending` status to `NewsletterStatus`**

In `dashboard/src/server/types.ts`, change:

```typescript
export type NewsletterStatus =
  | "draft"
  | "approved"
  | "scheduled"
  | "sent"
  | "failed";
```

to:

```typescript
export type NewsletterStatus =
  | "draft"
  | "approved"
  | "sending"
  | "scheduled"
  | "sent"
  | "failed";
```

- [ ] **Step 2: Add an atomic claim function in `workflow.ts`**

Add this new exported function right before `export async function scheduleNewsletterSend(` (currently `workflow.ts:2067`):

```typescript
export async function claimNewsletterForSending(
  newsletterId: number,
): Promise<{ claimed: boolean; status: NewsletterStatus; campaign_id: string | null }> {
  return withDatabase((db) => {
    const stored = db.newsletters.find((item) => item.id === newsletterId);
    if (!stored) {
      notFound("Newsletter not found");
    }
    if (stored.status === "scheduled" || stored.status === "sent" || stored.status === "sending") {
      return { claimed: false, status: stored.status, campaign_id: stored.mailchimp_campaign_id };
    }
    stored.status = "sending";
    stored.updated_at = nowIso();
    return { claimed: true, status: "sending", campaign_id: stored.mailchimp_campaign_id };
  });
}

export async function releaseNewsletterClaim(
  newsletterId: number,
  fallbackStatus: NewsletterStatus,
): Promise<void> {
  await withDatabase((db) => {
    const stored = db.newsletters.find((item) => item.id === newsletterId);
    if (stored && stored.status === "sending") {
      stored.status = fallbackStatus;
      stored.updated_at = nowIso();
    }
  });
}
```

`withDatabase` already serializes every write through a single in-process `writeQueue` plus a Prisma `$transaction` (see `store.ts:230-270`), so this check-and-set is atomic — the same pattern `pipeline-jobs.ts`'s `tryClaimJob` already uses for pipeline runs.

- [ ] **Step 3: Replace the snapshot-based guard in `scheduleNewsletterSend`**

In `dashboard/src/server/workflow.ts`, the function currently starts like this (`workflow.ts:2086-2116`):

```typescript
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

    if (newsletter.mailchimp_campaign_id && newsletter.status === "scheduled") {
      await appendWorkflowLog({
        scope: "delivery",
        step: "newsletter.schedule",
        status: "warning",
        message: "Newsletter is already scheduled.",
        context: {
          newsletter_id: newsletterId,
          campaign_id: newsletter.mailchimp_campaign_id,
        },
      });

      return {
        status: "already_scheduled",
        campaign_id: newsletter.mailchimp_campaign_id,
      };
    }
```

Replace it with:

```typescript
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

    const claim = await claimNewsletterForSending(newsletterId);
    if (!claim.claimed) {
      await appendWorkflowLog({
        scope: "delivery",
        step: "newsletter.schedule",
        status: "warning",
        message: `Newsletter is already ${claim.status}.`,
        context: {
          newsletter_id: newsletterId,
          campaign_id: claim.campaign_id,
        },
      });

      return {
        status: "already_scheduled",
        campaign_id: claim.campaign_id ?? "",
      };
    }
```

- [ ] **Step 4: Release the claim on every early-return and error path**

The function has two more early returns after the block above (the "Mailzzy not ready → preview sent" branch, currently `workflow.ts:2133-2174`) and a top-level `catch`. Every path that returns *without* reaching the final `status: "scheduled"` write (`workflow.ts:2210-2225`) must call `releaseNewsletterClaim(newsletterId, "approved")` first, so a retry isn't permanently stuck on `"sending"`.

Find the `catch` block that closes `scheduleNewsletterSend` (search for the closing `} catch (error) {` at the end of the function) and change it from whatever currently rethrows/maps the error to first release the claim:

```typescript
  } catch (error) {
    await releaseNewsletterClaim(newsletterId, "approved");
    throw error;
  }
```

Also add `await releaseNewsletterClaim(newsletterId, "approved");` immediately before each of the two `return { status: previewSent ? "preview_sent" : "delivery_blocked", ... }` statements in the "Mailzzy not ready" branch (`workflow.ts:2165-2173`).

- [ ] **Step 5: Write the concurrency test**

Create `dashboard/tests/newsletter-send-lock.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

import { claimNewsletterForSending, releaseNewsletterClaim } from "@/server/workflow";
import { withDatabase } from "@/server/store";
import { nextId } from "@/server/store";

test("claimNewsletterForSending only lets one concurrent caller win", async () => {
  const newsletterId = await withDatabase((db) => {
    const id = nextId(db.newsletters);
    const now = new Date().toISOString();
    db.newsletters.push({
      id,
      issue_number: 999000 + id,
      issue_date: now,
      status: "approved",
      mailchimp_campaign_id: null,
      created_at: now,
      updated_at: now,
    });
    return id;
  });

  const [first, second] = await Promise.all([
    claimNewsletterForSending(newsletterId),
    claimNewsletterForSending(newsletterId),
  ]);

  const claimedCount = [first, second].filter((result) => result.claimed).length;
  expect(claimedCount).toBe(1);

  await releaseNewsletterClaim(newsletterId, "approved");
  const afterRelease = await claimNewsletterForSending(newsletterId);
  expect(afterRelease.claimed).toBe(true);

  await withDatabase((db) => {
    db.newsletters = db.newsletters.filter((item) => item.id !== newsletterId);
  });
});
```

- [ ] **Step 6: Run the test**

```bash
cd dashboard
npm run db:prepare
npx dotenv -e ../.env -- playwright test tests/newsletter-send-lock.spec.ts
```

Expected: 1 passed. Before the fix (Step 2-4 reverted), this test fails with `claimedCount` equal to 2.

- [ ] **Step 7: Commit**

```bash
git add dashboard/src/server/types.ts dashboard/src/server/workflow.ts dashboard/tests/newsletter-send-lock.spec.ts
git commit -m "fix: add atomic claim to prevent duplicate newsletter sends"
```

---

### Task 2: Fix stored XSS in the public article page

**Finding:** `getPublicArticleMarkup` (`workflow.ts:1963-2007`) interpolates `article.title`, `article.teaser`, and `article.body` into raw HTML with no escaping, served unauthenticated at `/api/articles/public/[articleId]`.

**Files:**
- Modify: `dashboard/src/lib/newsletter-html.ts:27-34` (export the existing `escapeHtml`)
- Modify: `dashboard/src/server/email.ts:11-18` (reuse the exported one instead of duplicating)
- Modify: `dashboard/src/server/workflow.ts:1963-2010`
- Test: `dashboard/tests/public-article-xss.spec.ts` (new)

- [ ] **Step 1: Export the existing `escapeHtml` helper**

In `dashboard/src/lib/newsletter-html.ts:27`, change:

```typescript
function escapeHtml(value: string): string {
```

to:

```typescript
export function escapeHtml(value: string): string {
```

- [ ] **Step 2: Remove the duplicate copy in `email.ts` and import the shared one**

In `dashboard/src/server/email.ts`, delete the local `escapeHtml` function (`email.ts:11-18`) and add this import near the top of the file:

```typescript
import { escapeHtml } from "@/lib/newsletter-html";
```

- [ ] **Step 3: Escape output in `getPublicArticleMarkup`**

In `dashboard/src/server/workflow.ts`, add the same import near the top of the file (find the existing `import` block, e.g. near the other `@/lib/...` imports) and add:

```typescript
import { escapeHtml } from "@/lib/newsletter-html";
```

Then change `workflow.ts:1980-1998` from:

```typescript
  const bodyHtml = article.body
    .split(/\n\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p style="margin:0 0 22px;">${paragraph}</p>`)
    .join("");

  return `
    <html>
      <head>
        <title>${article.title} | The Disposition Desk</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body style="margin:0;background:#f4efe6;color:#17161d;font-family:Georgia,serif;">
        <div style="max-width:760px;margin:0 auto;padding:48px 24px;">
          <div style="margin-bottom:32px;padding:28px 32px;background:#10222d;color:#f8f3ea;border-radius:24px;">
            <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.72;">The Disposition Desk</div>
            <h1 style="margin:14px 0 10px;font-size:40px;line-height:1.05;">${article.title}</h1>
            <p style="margin:0;font-size:18px;line-height:1.6;color:#d4dde1;">${article.teaser}</p>
          </div>
```

to:

```typescript
  const bodyHtml = article.body
    .split(/\n\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p style="margin:0 0 22px;">${escapeHtml(paragraph)}</p>`)
    .join("");
  const safeTitle = escapeHtml(article.title);
  const safeTeaser = escapeHtml(article.teaser);

  return `
    <html>
      <head>
        <title>${safeTitle} | The Disposition Desk</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body style="margin:0;background:#f4efe6;color:#17161d;font-family:Georgia,serif;">
        <div style="max-width:760px;margin:0 auto;padding:48px 24px;">
          <div style="margin-bottom:32px;padding:28px 32px;background:#10222d;color:#f8f3ea;border-radius:24px;">
            <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.72;">The Disposition Desk</div>
            <h1 style="margin:14px 0 10px;font-size:40px;line-height:1.05;">${safeTitle}</h1>
            <p style="margin:0;font-size:18px;line-height:1.6;color:#d4dde1;">${safeTeaser}</p>
          </div>
```

- [ ] **Step 4: Write the XSS regression test**

Create `dashboard/tests/public-article-xss.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

import { getPublicArticleMarkup } from "@/server/workflow";
import { withDatabase, nextId } from "@/server/store";

test("public article markup escapes a malicious title", async () => {
  const articleId = await withDatabase((db) => {
    const newsletterId = nextId(db.newsletters);
    const now = new Date().toISOString();
    db.newsletters.push({
      id: newsletterId,
      issue_number: 998000 + newsletterId,
      issue_date: now,
      status: "sent",
      mailchimp_campaign_id: null,
      created_at: now,
      updated_at: now,
    });

    const id = nextId(db.articles);
    db.articles.push({
      id,
      newsletter_id: newsletterId,
      section_type: "market_pulse",
      title: '<script>window.__pwned = true;</script>',
      teaser: "safe teaser",
      body: "safe body",
      audience_tag: "REO",
      publish_date: now,
      ms_platform_url: null,
      created_at: now,
    });
    return id;
  });

  const html = await getPublicArticleMarkup(articleId);
  expect(html).not.toContain("<script>window.__pwned");
  expect(html).toContain("&lt;script&gt;");

  await withDatabase((db) => {
    db.articles = db.articles.filter((item) => item.id !== articleId);
    db.newsletters = db.newsletters.filter((item) => item.newsletter_id !== articleId);
  });
});
```

- [ ] **Step 5: Run the test**

```bash
cd dashboard
npx dotenv -e ../.env -- playwright test tests/public-article-xss.spec.ts
```

Expected: 1 passed. Reverting Step 3 makes it fail (the raw `<script>` tag would appear in the output).

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/lib/newsletter-html.ts dashboard/src/server/email.ts dashboard/src/server/workflow.ts dashboard/tests/public-article-xss.spec.ts
git commit -m "fix: escape article content on the public article page to prevent stored XSS"
```

---

### Task 3: Harden the Mailzzy HTTP calls (timeout, status checks, SSE parsing)

**Finding:** None of the three `fetch()` calls in `mailchimp.ts` have a timeout. `initMcpSession` and `mcpToolCall` never check `response.ok`. `mcpToolCall`'s SSE parser grabs the *first* `data:` line, which can be a keepalive/ping event instead of the real JSON-RPC result.

**Files:**
- Modify: `dashboard/src/server/mailchimp.ts:12-112`
- Test: `dashboard/tests/mailzzy-sse-parsing.spec.ts` (new)

- [ ] **Step 1: Add a shared timeout constant and apply it to all three fetches**

In `dashboard/src/server/mailchimp.ts`, add near the top of the file (after the existing imports):

```typescript
const MAILZZY_TIMEOUT_MS = 15_000;
```

Then add `signal: AbortSignal.timeout(MAILZZY_TIMEOUT_MS),` to the `fetch()` call inside `getMailzzyToken` (`mailchimp.ts:17-23`), `initMcpSession` (`mailchimp.ts:37-55`), and `mcpToolCall` (`mailchimp.ts:70-85`) — each currently ends its options object with `cache: "no-store",`; add the signal line right after it in all three places, e.g.:

```typescript
  const response = await fetch("https://api.mailzzy.com/core/public/api/access", {
    headers: {
      App: "mailzzy",
      Authorization: mailzzyBasicAuth(clientId, clientSecret),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(MAILZZY_TIMEOUT_MS),
  });
```

- [ ] **Step 2: Check `response.ok` in `initMcpSession`**

Change `mailchimp.ts:56-62` from:

```typescript
  const sessionId = response.headers.get("Mcp-Session-Id");
  if (!sessionId) {
    throw new Error("Mailzzy MCP did not return a session ID");
  }
  return sessionId;
```

to:

```typescript
  if (!response.ok) {
    throw new Error(`Mailzzy MCP init failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  }
  const sessionId = response.headers.get("Mcp-Session-Id");
  if (!sessionId) {
    throw new Error("Mailzzy MCP did not return a session ID");
  }
  return sessionId;
```

- [ ] **Step 3: Fix the SSE parser to find the real JSON-RPC response, and check `response.ok`**

Change `mailchimp.ts:86-112` from:

```typescript
  const text = await response.text();

  // Parse SSE: extract the data: {...} line
  const dataLine = text
    .split("\n")
    .find((line) => line.startsWith("data:"));
  const json = dataLine ? JSON.parse(dataLine.slice(5).trim()) : JSON.parse(text);

  const result = (json as { result?: { content?: Array<{ text?: string }>; isError?: boolean } })
    .result;
  if (!result) {
    throw new Error(`MCP call failed: ${text.slice(0, 300)}`);
  }
```

to:

```typescript
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Mailzzy MCP call failed (${response.status}): ${text.slice(0, 300)}`);
  }

  // SSE can emit keepalive/ping frames before the real JSON-RPC response.
  // Find the first data: line that actually parses as a JSON-RPC result/error.
  const dataLines = text.split("\n").filter((line) => line.startsWith("data:"));
  let json: { result?: { content?: Array<{ text?: string }>; isError?: boolean }; error?: unknown } | null = null;
  for (const line of dataLines) {
    try {
      const parsed = JSON.parse(line.slice(5).trim()) as typeof json;
      if (parsed && (parsed.result !== undefined || parsed.error !== undefined)) {
        json = parsed;
        break;
      }
    } catch {
      continue;
    }
  }
  if (!json) {
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Mailzzy MCP returned no parseable JSON-RPC response: ${text.slice(0, 300)}`);
    }
  }

  const result = json?.result;
  if (!result) {
    throw new Error(`MCP call failed: ${text.slice(0, 300)}`);
  }
```

- [ ] **Step 4: Write a unit test for the SSE-line-selection logic**

Since the parsing logic is now inline, extract just the selection loop into a small exported pure function so it's directly testable without a real HTTP call. Add this function above `mcpToolCall` in `mailchimp.ts`:

```typescript
export function selectMcpResponseLine(sseBody: string): { result?: unknown; error?: unknown } | null {
  const dataLines = sseBody.split("\n").filter((line) => line.startsWith("data:"));
  for (const line of dataLines) {
    try {
      const parsed = JSON.parse(line.slice(5).trim()) as { result?: unknown; error?: unknown };
      if (parsed && (parsed.result !== undefined || parsed.error !== undefined)) {
        return parsed;
      }
    } catch {
      continue;
    }
  }
  return null;
}
```

Then replace the inline loop in Step 3 with a call to it: `let json = selectMcpResponseLine(text);` (drop the `for` loop you just wrote in Step 3 — `selectMcpResponseLine` replaces it).

Create `dashboard/tests/mailzzy-sse-parsing.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

import { selectMcpResponseLine } from "@/server/mailchimp";

test("skips a keepalive ping frame and finds the real JSON-RPC result", () => {
  const sseBody = [
    'data: {"type":"ping"}',
    "",
    'data: {"jsonrpc":"2.0","id":2,"result":{"content":[{"text":"{\\"campaignId\\":42}"}]}}',
    "",
  ].join("\n");

  const parsed = selectMcpResponseLine(sseBody);
  expect(parsed).not.toBeNull();
  expect(parsed?.result).toBeDefined();
});

test("returns null when no line has a result or error", () => {
  const sseBody = 'data: {"type":"ping"}\n';
  expect(selectMcpResponseLine(sseBody)).toBeNull();
});
```

- [ ] **Step 5: Run the test**

```bash
cd dashboard
npx dotenv -e ../.env -- playwright test tests/mailzzy-sse-parsing.spec.ts
```

Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/server/mailchimp.ts dashboard/tests/mailzzy-sse-parsing.spec.ts
git commit -m "fix: add timeouts, status checks, and correct SSE parsing to Mailzzy calls"
```

---

### Task 4: Add authentication to the Python API

**Finding:** Every route in `api/` (including `POST /api/newsletter/schedule/{id}`, which sends a real campaign) has zero authentication, and the service listens on `0.0.0.0:8000` on the production box.

**Files:**
- Modify: `api/config.py:35-39`
- Create: `api/dependencies.py`
- Modify: `api/main.py:28-34`
- Test: `api/tests/test_api_auth.py` (new)

- [ ] **Step 1: Add an internal API key setting**

In `api/config.py`, add this field inside the `Settings` class, right after the `dashboard_url` line (`config.py:56`):

```python
    internal_api_key: str = ""
```

- [ ] **Step 2: Create the auth dependency**

Create `api/dependencies.py`:

```python
from fastapi import Header, HTTPException

from config import get_settings


def require_internal_api_key(x_internal_api_key: str = Header(default="")) -> None:
    """Require a shared-secret header on every non-health route.

    This service has no per-user auth (it's an internal automation API), so a
    single shared secret is the minimum bar to stop it being driven directly
    by anyone who can reach the host/port.
    """
    settings = get_settings()
    if not settings.internal_api_key:
        raise HTTPException(status_code=503, detail="INTERNAL_API_KEY is not configured")
    if x_internal_api_key != settings.internal_api_key:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
```

- [ ] **Step 3: Apply the dependency to every router except health**

In `api/main.py`, change `main.py:28-34` from:

```python
app.include_router(pipeline.router, prefix="/api/pipeline", tags=["Pipeline"])
app.include_router(drafts.router, prefix="/api/drafts", tags=["Drafts"])
app.include_router(newsletter.router, prefix="/api/newsletter", tags=["Newsletter"])
app.include_router(articles.router, prefix="/api/articles", tags=["Articles"])
app.include_router(sources.router, prefix="/api/sources", tags=["Sources"])
app.include_router(reo.router, prefix="/api/reo", tags=["REO New Sources"])
app.include_router(reo.router, prefix="/reo", tags=["REO New Sources"])
```

to:

```python
from dependencies import require_internal_api_key

auth_dependency = [Depends(require_internal_api_key)]

app.include_router(pipeline.router, prefix="/api/pipeline", tags=["Pipeline"], dependencies=auth_dependency)
app.include_router(drafts.router, prefix="/api/drafts", tags=["Drafts"], dependencies=auth_dependency)
app.include_router(newsletter.router, prefix="/api/newsletter", tags=["Newsletter"], dependencies=auth_dependency)
app.include_router(articles.router, prefix="/api/articles", tags=["Articles"], dependencies=auth_dependency)
app.include_router(sources.router, prefix="/api/sources", tags=["Sources"], dependencies=auth_dependency)
app.include_router(reo.router, prefix="/api/reo", tags=["REO New Sources"], dependencies=auth_dependency)
app.include_router(reo.router, prefix="/reo", tags=["REO New Sources"], dependencies=auth_dependency)
```

Also add `Depends` to the existing `from fastapi import FastAPI` line at the top of `main.py:1`:

```python
from fastapi import Depends, FastAPI
```

Leave `@app.get("/api/health")` (`main.py:37-39`) with no dependency, so uptime checks keep working unauthenticated.

Note: `api/routes/articles.py`'s public article endpoint (the one that correctly calls `html.escape()`) should **not** get this dependency if it's meant to stay publicly reachable the same way the Next.js `/api/articles/public/*` route is — check whether `articles.router` mixes a public read endpoint with the private `publish` endpoint before applying `dependencies=auth_dependency` to the whole router. If it does, split the public GET route into its own `APIRouter` first, or apply the dependency per-route with `Depends(require_internal_api_key)` in that route's signature instead of at `include_router` level.

- [ ] **Step 4: Write the auth test**

Create `api/tests/test_api_auth.py`:

```python
import os

os.environ["INTERNAL_API_KEY"] = "test-secret-key"

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_health_does_not_require_api_key():
    response = client.get("/api/health")
    assert response.status_code == 200


def test_pipeline_status_requires_api_key():
    response = client.get("/api/pipeline/status")
    assert response.status_code == 401


def test_pipeline_status_accepts_correct_api_key():
    response = client.get(
        "/api/pipeline/status",
        headers={"X-Internal-Api-Key": "test-secret-key"},
    )
    assert response.status_code != 401
```

(If `/api/pipeline/status` isn't a real route, use whichever simple `GET` route exists under `pipeline.router` — check `api/routes/pipeline.py` for the exact path before running.)

- [ ] **Step 5: Run the test**

```bash
cd api
python -m pytest tests/test_api_auth.py -v
```

Expected: 3 passed.

- [ ] **Step 6: Set the key in the environment**

Add to `.env` (both local and production, via the pm2 env on the EC2 box):

```
INTERNAL_API_KEY=<generate a random 32+ char value>
```

- [ ] **Step 7: Commit**

```bash
git add api/config.py api/dependencies.py api/main.py api/tests/test_api_auth.py
git commit -m "fix: require an internal API key on every Python API route except health"
```

---

### Task 5: Escape HTML in outbound Python emails

**Finding:** `api/services/mailchimp_client.py`'s `_build_html_content` and `api/services/email_notifier.py`'s `send_review_notification` interpolate `article.title`/`teaser`/`section.get('title')`/`section.get('teaser')` into outbound HTML with no escaping.

**Files:**
- Modify: `api/services/mailchimp_client.py:1-64`
- Modify: `api/services/email_notifier.py:1-25`
- Test: `api/tests/test_html_escaping.py` (new)

- [ ] **Step 1: Escape article content in `mailchimp_client.py`**

Add `import html` at the top of `api/services/mailchimp_client.py:1` (after the existing `from datetime import ...` line). Then change `mailchimp_client.py:55-64` from:

```python
    for article in articles:
        icon = section_icons.get(article.section_type, "📋")
        article_url = article.ms_platform_url or "#"
        html_parts.append(f"""
        <div style="padding:24px;border-bottom:1px solid #eee;">
            <h2 style="color:#1a1a2e;margin:0 0 8px;">{icon} {article.title}</h2>
            <p style="color:#555;line-height:1.6;">{article.teaser}</p>
            <a href="{article_url}" style="display:inline-block;margin-top:12px;padding:10px 20px;background:#e94560;color:white;text-decoration:none;border-radius:4px;">Read More →</a>
        </div>
        """)
```

to:

```python
    for article in articles:
        icon = section_icons.get(article.section_type, "📋")
        article_url = article.ms_platform_url or "#"
        safe_title = html.escape(article.title)
        safe_teaser = html.escape(article.teaser)
        html_parts.append(f"""
        <div style="padding:24px;border-bottom:1px solid #eee;">
            <h2 style="color:#1a1a2e;margin:0 0 8px;">{icon} {safe_title}</h2>
            <p style="color:#555;line-height:1.6;">{safe_teaser}</p>
            <a href="{article_url}" style="display:inline-block;margin-top:12px;padding:10px 20px;background:#e94560;color:white;text-decoration:none;border-radius:4px;">Read More →</a>
        </div>
        """)
```

- [ ] **Step 2: Escape section content in `email_notifier.py`**

Add `import html` at the top of `api/services/email_notifier.py:1` (after `import smtplib`). Then change `email_notifier.py:18-25` from:

```python
    sections_html = ""
    for section in sections_preview:
        sections_html += f"""
        <div style="margin-bottom:16px;padding:12px;background:#f8f8f8;border-radius:4px;">
            <strong>{section.get('title', 'Untitled')}</strong>
            <p style="color:#666;margin:4px 0 0;">{section.get('teaser', '')}</p>
        </div>
        """
```

to:

```python
    sections_html = ""
    for section in sections_preview:
        safe_title = html.escape(str(section.get("title", "Untitled")))
        safe_teaser = html.escape(str(section.get("teaser", "")))
        sections_html += f"""
        <div style="margin-bottom:16px;padding:12px;background:#f8f8f8;border-radius:4px;">
            <strong>{safe_title}</strong>
            <p style="color:#666;margin:4px 0 0;">{safe_teaser}</p>
        </div>
        """
```

- [ ] **Step 3: Write the escaping test**

Create `api/tests/test_html_escaping.py`:

```python
from dataclasses import dataclass

from services.mailchimp_client import _build_html_content


@dataclass
class FakeNewsletter:
    issue_number: int = 1


@dataclass
class FakeArticle:
    section_type: str = "market_pulse"
    title: str = ""
    teaser: str = ""
    ms_platform_url: str = "https://example.com/a"


def test_build_html_content_escapes_malicious_title():
    article = FakeArticle(title="<script>alert(1)</script>", teaser="safe teaser")
    html_out = _build_html_content(FakeNewsletter(), [article])
    assert "<script>alert(1)</script>" not in html_out
    assert "&lt;script&gt;" in html_out
```

- [ ] **Step 4: Run the test**

```bash
cd api
python -m pytest tests/test_html_escaping.py -v
```

Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add api/services/mailchimp_client.py api/services/email_notifier.py api/tests/test_html_escaping.py
git commit -m "fix: escape article/section content in outbound Python emails"
```

---

### Task 6: Fix the login rate-limit TOCTOU race

**Finding:** `recordFailedLoginInDatabase` (`login-rate-limit.ts:129-175`) does `findUnique` → compute `nextAttempts` → `update`. Concurrent failed-login bursts against the same key can lose increments, weakening the lockout.

**Files:**
- Modify: `dashboard/src/server/login-rate-limit.ts:129-175`
- Test: `dashboard/tests/login-rate-limit-race.spec.ts` (new)

- [ ] **Step 1: Replace the read-then-write with an atomic conditional increment**

Change `login-rate-limit.ts:129-175` from:

```typescript
async function recordFailedLoginInDatabase(key: string): Promise<void> {
  await ensureDatabaseReady();
  const now = nowMs();
  const nowText = nowIso();
  const current = await prisma.loginAttempt.findUnique({ where: { key } });

  if (!current) {
    await prisma.loginAttempt.create({
      data: {
        key,
        attempts: 1,
        windowStartedAt: nowText,
        blockedUntil: null,
        updatedAt: nowText,
      },
    });
    return;
  }

  const currentWindowMs = Date.parse(current.windowStartedAt);
  const windowExpired = !Number.isFinite(currentWindowMs) || now - currentWindowMs > WINDOW_MS;

  if (windowExpired) {
    await prisma.loginAttempt.update({
      where: { key },
      data: {
        attempts: 1,
        windowStartedAt: nowText,
        blockedUntil: null,
        updatedAt: nowText,
      },
    });
    return;
  }

  const nextAttempts = current.attempts + 1;
  const blockedUntil = nextAttempts >= MAX_ATTEMPTS ? new Date(now + BLOCK_MS).toISOString() : null;

  await prisma.loginAttempt.update({
    where: { key },
    data: {
      attempts: nextAttempts,
      blockedUntil,
      updatedAt: nowText,
    },
  });
}
```

to:

```typescript
async function recordFailedLoginInDatabase(key: string): Promise<void> {
  await ensureDatabaseReady();
  const now = nowMs();
  const nowText = nowIso();
  const windowCutoff = new Date(now - WINDOW_MS).toISOString();

  // Atomic: only increments if the row still exists AND its window hasn't
  // expired. Prisma's `increment` is a single UPDATE ... SET attempts =
  // attempts + 1 at the DB level, so concurrent callers can't lose a count.
  const incremented = await prisma.loginAttempt.updateMany({
    where: { key, windowStartedAt: { gt: windowCutoff } },
    data: {
      attempts: { increment: 1 },
      updatedAt: nowText,
    },
  });

  if (incremented.count === 0) {
    // No row yet, or the window expired — start a fresh window at attempts=1.
    // upsert here is fine even under a race: worst case two callers both
    // upsert to attempts=1, which just under-counts by one attempt, never
    // over-counts or bypasses the eventual block.
    await prisma.loginAttempt.upsert({
      where: { key },
      create: { key, attempts: 1, windowStartedAt: nowText, blockedUntil: null, updatedAt: nowText },
      update: { attempts: 1, windowStartedAt: nowText, blockedUntil: null, updatedAt: nowText },
    });
    return;
  }

  const updated = await prisma.loginAttempt.findUniqueOrThrow({ where: { key } });
  if (updated.attempts >= MAX_ATTEMPTS && !updated.blockedUntil) {
    await prisma.loginAttempt.update({
      where: { key },
      data: { blockedUntil: new Date(now + BLOCK_MS).toISOString() },
    });
  }
}
```

- [ ] **Step 2: Write the concurrency test**

Create `dashboard/tests/login-rate-limit-race.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

import { recordFailedLogin, checkLoginRateLimit, clearLoginRateLimit } from "@/server/login-rate-limit";

test("concurrent failed logins are all counted, no lost increments", async () => {
  const key = `race-test:${Date.now()}`;
  await clearLoginRateLimit(key);

  await Promise.all([
    recordFailedLogin(key),
    recordFailedLogin(key),
    recordFailedLogin(key),
    recordFailedLogin(key),
    recordFailedLogin(key),
  ]);

  const result = await checkLoginRateLimit(key);
  expect(result.allowed).toBe(false);

  await clearLoginRateLimit(key);
});
```

- [ ] **Step 3: Run the test**

```bash
cd dashboard
npx dotenv -e ../.env -- playwright test tests/login-rate-limit-race.spec.ts
```

Expected: 1 passed. Against the old read-then-write code this test is flaky/fails intermittently (some of the 5 concurrent increments get lost, so `attempts` can land under `MAX_ATTEMPTS`).

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/server/login-rate-limit.ts dashboard/tests/login-rate-limit-race.spec.ts
git commit -m "fix: use atomic increment for failed-login counting to close a TOCTOU race"
```

---

### Task 7: Make article republishing idempotent (stop breaking sent links)

**Finding:** `publishArticlesForNewsletter` (`workflow.ts:1893` area) deletes every existing article for the newsletter and recreates them with new sequential IDs on every call, so `ms_platform_url` changes on republish — breaking links already emailed to subscribers.

**Files:**
- Modify: `dashboard/src/server/workflow.ts:1893-1919`
- Test: `dashboard/tests/article-republish-idempotent.spec.ts` (new)

- [ ] **Step 1: Upsert by `section_type` instead of delete-all-then-recreate**

Change `workflow.ts:1893-1919` from:

```typescript
      db.articles = db.articles.filter((article) => article.newsletter_id !== newsletterId);

      const publishedAt = nowIso();
      const articles: ArticleRecord[] = sections.map((section) => {
        const id = nextId(db.articles);
        const article: ArticleRecord = {
          id,
          newsletter_id: newsletterId,
          section_type: section.section_type,
          title: section.title,
          teaser: section.teaser,
          body: section.body,
          audience_tag: section.audience_tag ?? "REO",
          publish_date: publishedAt,
          ms_platform_url: `${publicBaseUrl()}/api/articles/public/${id}`,
          created_at: publishedAt,
        };
        db.articles.push(article);
        return article;
      });

      return {
        published: articles.length,
        titles: articles.map((article) => article.title),
        article_urls: articles.map((article) => article.ms_platform_url ?? ""),
      };
    });
```

to:

```typescript
      const existingBySectionType = new Map(
        db.articles
          .filter((article) => article.newsletter_id === newsletterId)
          .map((article) => [article.section_type, article] as const),
      );
      const keepSectionTypes = new Set(sections.map((section) => section.section_type));

      // Drop only articles for sections that no longer exist in this draft —
      // keep existing ids/URLs for sections that are still present, so links
      // already emailed to subscribers keep working after a republish.
      db.articles = db.articles.filter(
        (article) => article.newsletter_id !== newsletterId || keepSectionTypes.has(article.section_type),
      );

      const publishedAt = nowIso();
      const articles: ArticleRecord[] = sections.map((section) => {
        const existing = existingBySectionType.get(section.section_type);
        if (existing) {
          existing.title = section.title;
          existing.teaser = section.teaser;
          existing.body = section.body;
          existing.audience_tag = section.audience_tag ?? "REO";
          existing.publish_date = publishedAt;
          return existing;
        }

        const id = nextId(db.articles);
        const article: ArticleRecord = {
          id,
          newsletter_id: newsletterId,
          section_type: section.section_type,
          title: section.title,
          teaser: section.teaser,
          body: section.body,
          audience_tag: section.audience_tag ?? "REO",
          publish_date: publishedAt,
          ms_platform_url: `${publicBaseUrl()}/api/articles/public/${id}`,
          created_at: publishedAt,
        };
        db.articles.push(article);
        return article;
      });

      return {
        published: articles.length,
        titles: articles.map((article) => article.title),
        article_urls: articles.map((article) => article.ms_platform_url ?? ""),
      };
    });
```

- [ ] **Step 2: Write the idempotency test**

Create `dashboard/tests/article-republish-idempotent.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

import { publishArticlesForNewsletter } from "@/server/workflow";
import { withDatabase, nextId } from "@/server/store";

test("republishing keeps the same article URL for an unchanged section", async () => {
  const newsletterId = await withDatabase((db) => {
    const draftId = nextId(db.drafts);
    const newsletterIdInner = nextId(db.newsletters);
    const now = new Date().toISOString();
    db.newsletters.push({
      id: newsletterIdInner,
      issue_number: 997000 + newsletterIdInner,
      issue_date: now,
      status: "approved",
      mailchimp_campaign_id: null,
      created_at: now,
      updated_at: now,
    });
    db.drafts.push({
      id: draftId,
      newsletter_id: newsletterIdInner,
      raw_data: {},
      ai_draft: {
        sections: [
          { section_type: "market_pulse", title: "First title", teaser: "t", body: "b", audience_tag: "REO" },
        ],
      },
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
    return newsletterIdInner;
  });

  const first = await publishArticlesForNewsletter(newsletterId);
  const second = await publishArticlesForNewsletter(newsletterId);

  expect(first.article_urls).toEqual(second.article_urls);

  await withDatabase((db) => {
    db.articles = db.articles.filter((item) => item.newsletter_id !== newsletterId);
    db.drafts = db.drafts.filter((item) => item.newsletter_id !== newsletterId);
    db.newsletters = db.newsletters.filter((item) => item.id !== newsletterId);
  });
});
```

- [ ] **Step 3: Run the test**

```bash
cd dashboard
npx dotenv -e ../.env -- playwright test tests/article-republish-idempotent.spec.ts
```

Expected: 1 passed. Against the old delete-and-recreate code, `first.article_urls` and `second.article_urls` differ (different ids), so the assertion fails.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/server/workflow.ts dashboard/tests/article-republish-idempotent.spec.ts
git commit -m "fix: make article republishing idempotent so emailed links keep working"
```

---

### Task 8: Close PinchTab browser profiles after use

**Finding:** `PinchTabClient.start_profile` (`api/services/pinchtab_client.py:101-113`) starts a browser instance on the external PinchTab service; nothing ever stops it, so every pipeline run that touches `foreclosure_com`/Zillow sources leaks another running instance.

**Files:**
- Modify: `api/services/pinchtab_client.py`
- Test: `api/tests/test_pinchtab_cleanup.py` (new)

**Note:** This assumes PinchTab exposes a `POST /profiles/{id}/stop` endpoint mirroring the existing `POST /profiles/{id}/start` — confirm this against PinchTab's actual API docs (or a quick manual call) before merging, since no stop call exists anywhere in this codebase to copy from.

- [ ] **Step 1: Add a `stop_profile` method**

In `api/services/pinchtab_client.py`, add this method to `PinchTabClient`, right after `start_profile` (after line 113):

```python
    def stop_profile(self, profile_id: str) -> None:
        try:
            self._request("POST", f"/profiles/{profile_id}/stop", timeout=15.0)
        except Exception:
            # Best-effort cleanup — don't let a stop failure mask the real result.
            pass
```

- [ ] **Step 2: Track and stop the profile in `prime_url`**

Change `prime_url` (`pinchtab_client.py:115-144`) from:

```python
    def prime_url(self, url: str) -> PinchTabSession:
        _, instance_url = self.start_profile()
        navigation = self._request(
            "POST",
            "/navigate",
            base_url=instance_url,
            json={"url": url, "newTab": True},
            timeout=60.0,
        )
        tab_id = str(navigation.get("tabId", "")).strip()
        if not tab_id:
            raise RuntimeError(f"PinchTab navigate did not return tabId: {navigation}")

        if self.settings.pinchtab_settle_seconds > 0:
            sleep(self.settings.pinchtab_settle_seconds)

        cookie_result = self._request(
            "GET",
            f"/tabs/{tab_id}/cookies",
            base_url=instance_url,
            params={"url": url},
            timeout=20.0,
        )
        cookies = cookie_result.get("cookies", [])
        return PinchTabSession(
            instance_url=instance_url,
            tab_id=tab_id,
            final_url=str(navigation.get("url") or url),
            cookies=cookies if isinstance(cookies, list) else [],
        )
```

to:

```python
    def prime_url(self, url: str) -> PinchTabSession:
        profile_id, instance_url = self.start_profile()
        try:
            navigation = self._request(
                "POST",
                "/navigate",
                base_url=instance_url,
                json={"url": url, "newTab": True},
                timeout=60.0,
            )
            tab_id = str(navigation.get("tabId", "")).strip()
            if not tab_id:
                raise RuntimeError(f"PinchTab navigate did not return tabId: {navigation}")

            if self.settings.pinchtab_settle_seconds > 0:
                sleep(self.settings.pinchtab_settle_seconds)

            cookie_result = self._request(
                "GET",
                f"/tabs/{tab_id}/cookies",
                base_url=instance_url,
                params={"url": url},
                timeout=20.0,
            )
            cookies = cookie_result.get("cookies", [])
            return PinchTabSession(
                instance_url=instance_url,
                tab_id=tab_id,
                final_url=str(navigation.get("url") or url),
                cookies=cookies if isinstance(cookies, list) else [],
            )
        finally:
            self.stop_profile(profile_id)
```

- [ ] **Step 3: Write the cleanup test**

Create `api/tests/test_pinchtab_cleanup.py`:

```python
from unittest.mock import patch

from services.pinchtab_client import PinchTabClient


def test_prime_url_stops_profile_even_on_navigate_failure(monkeypatch):
    monkeypatch.setenv("PINCHTAB_ENABLED", "true")
    client = PinchTabClient()

    stopped_ids = []

    def fake_request(method, path, **kwargs):
        if path == "/profiles":
            return {"data": [{"id": "profile-1", "name": client.profile_name}]}
        if path == "/profiles/profile-1/start":
            return {"port": 9999}
        if path == "/navigate":
            raise RuntimeError("navigate failed")
        raise AssertionError(f"unexpected call: {method} {path}")

    def fake_stop(profile_id):
        stopped_ids.append(profile_id)

    with patch.object(client, "_request", side_effect=fake_request):
        with patch.object(client, "stop_profile", side_effect=fake_stop):
            try:
                client.prime_url("https://example.com")
            except RuntimeError:
                pass

    assert stopped_ids == ["profile-1"]
```

- [ ] **Step 4: Run the test**

```bash
cd api
python -m pytest tests/test_pinchtab_cleanup.py -v
```

Expected: 1 passed. Against the old code (no `finally`), `stop_profile` never runs when `/navigate` raises, so `stopped_ids` stays empty and the assertion fails.

- [ ] **Step 5: Commit**

```bash
git add api/services/pinchtab_client.py api/tests/test_pinchtab_cleanup.py
git commit -m "fix: stop PinchTab browser profile after use to prevent resource leak"
```

---

## Self-Review

**Spec coverage:** All 8 remaining findings from the review (double-send race, XSS, Mailzzy timeout/status-check/SSE-parsing, Python API auth, Python HTML injection, login rate-limit race, article-republish idempotency, PinchTab leak) each have a task. The 9th finding (`proxy.ts` SSO cookie) is intentionally excluded per instructions — it's being handled separately.

**Placeholder scan:** No "TBD"/"handle appropriately" language. The one caveat (PinchTab's stop endpoint name) is flagged explicitly as something to confirm, not hidden as a placeholder — the code itself is a complete, real implementation.

**Type consistency:** `NewsletterStatus` gets `"sending"` added once (Task 1, Step 1) and used consistently in `claimNewsletterForSending`/`releaseNewsletterClaim`. `escapeHtml` is exported once (Task 2, Step 1) and imported the same way in both `email.ts` and `workflow.ts`. `selectMcpResponseLine` is defined once (Task 3, Step 4) and used in place of the inline loop from Step 3 of the same task.
