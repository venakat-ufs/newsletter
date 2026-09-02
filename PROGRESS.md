# UFS Newsletter System — The Disposition Desk

## 2026-09-02 — Post-Approve Send Popup + Store Scalability Fix (branch `fix/code-review-findings-2026-08-27`)

### What Was Done

Replaced the newsletter auto-send-on-approve flow with an explicit popup (Mailzzy-only for now; Mailchimp shown disabled) that lets a reviewer pick audience group(s) — Registered (Mailzzy group `1085`) and/or Not Registered (`1086`) — and a live-fetched sender, with per-group send-status tracking so a partial failure can be resent for just the failed group without risking a duplicate send to the group that already succeeded.

Full design: `docs/superpowers/specs/2026-09-02-post-approve-send-popup-design.md`. Full plan: `docs/superpowers/plans/2026-09-02-post-approve-send-popup.md`. Mailzzy API/MCP reference (with corrections found live): `docs/mailzzy-api-reference.md`.

**Along the way, found and fixed a real, unrelated, pre-existing scalability bug**: `readDatabase()`/`withDatabase()` (the shared data-loading function behind almost every operation in this app) loads every row of every table on every call. Once the dev drafts table grew to 52 real rows with 500-700KB of `raw_data` each (~26MB total), Prisma's query engine started hanging indefinitely (confirmed by letting it run 4+ minutes with zero result, vs. ~4 seconds for the identical data over a raw driver — reproduced against both the transaction and session poolers, ruled out as a pgbouncer/prepared-statement issue). This wasn't caused by anything in this session's work — it's how the store has always behaved, just never tripped over until the table grew large enough. Given this function backs nearly every real user action (approving, sending, checking status), this was very likely responsible for real latency/hangs in actual use, not just in testing.

**Fix**: `drafts.raw_data` is now excluded from the bulk read by default (`DraftRecord` carries a `RAW_DATA_NOT_LOADED` sentinel) and hydrated on demand via `getDraftsRawData()` for the one place that genuinely needs it (AI draft generation's current + historical comparison). `persistDatabase()`'s draft upsert checks the sentinel before ever writing `raw_data` back, so an update triggered by an unrelated field change can never overwrite a draft's real stored data with the placeholder — this data-loss risk was caught and designed around before shipping, not after. Scales however large the drafts table gets, since the one large field is never part of the bulk fetch regardless of row count. Considered switching away from Prisma entirely (raw SQL/Drizzle) — concluded it wouldn't meaningfully help beyond this fix and isn't worth the migration risk; see the conversation for the full reasoning.

**Also fixed in passing**: a second, genuinely separate race condition in `login-rate-limit.ts` — concurrent *first-ever* failed-login attempts for a brand-new key could race on create-vs-increment and undercount, bypassing the lockout threshold. Fixed with a single atomic `INSERT ... ON CONFLICT ... DO UPDATE` statement. Verified with repeated test runs, no flakes.

### Current State

- All of the above is committed on branch `fix/code-review-findings-2026-08-27` (same branch as the 2026-08-27 code review fixes), on top of commit `fc4f6b8`. **Still not pushed or merged to `main`.**
- Full regression pass: 8/8 tests passing together (per-group send ×2, Mailzzy group/sender lookups ×2, XSS, send-lock, article-republish, login-rate-limit-race).
- Verified with `tsc --noEmit`, `eslint`, and a full `next build` (production build succeeds, both new routes appear correctly in the route manifest).
- Real Mailzzy groups exist and are ready: Registered = `1085`, Not Registered = `1086` (both currently empty — contact import is a separate manual step). One sender configured (`venakat@unitedffs.com`), domain **not yet verified** — needs fixing in the Mailzzy dashboard before a real send.

### Known Follow-Ups

- Mailchimp is still just a disabled placeholder in the popup — only Mailzzy actually sends.
- Sender picker currently has only one real option (see above) — the UI is built for multiple, just nothing to pick from yet.
- The pre-existing Mailchimp→Mailzzy migration files (`env.ts`/`mailchimp.ts`/`system-status.ts` uncommitted changes from an earlier session) are still sitting uncommitted, untouched by any of today's work.
- `getMailzzyGroupCounts`/`getMailzzySenders` call the real, live-confirmed MCP tool names (`mcp_crm_groups_list`, `mcp_crm_senders_list`) — but the pre-existing `scheduleCampaign()`'s tool name (`mcp_crm_campaigns_send`) has not been independently re-verified against a live call in this session (only inferred from the confirmed `mcp_crm_<domain>_<verb>` naming convention).

---

## 2026-08-27 — Code Review Fixes (7 findings, uncommitted-to-main branch)

### What Was Done
A full read-only code review of the whole codebase (dashboard + api/) surfaced 10 findings, ranked by severity. One (`proxy.ts` SSO-cookie granting full `/api/*` access) was scoped out to be handled separately. The remaining 8 were planned in `docs/superpowers/plans/2026-08-27-code-review-fixes.md` and implemented one Mailzzy-hardening item was dropped by request (unshipped code, not worth hardening yet) — 7 fixes landed:

1. **Duplicate newsletter sends** — `scheduleNewsletterSend` had no lock; two concurrent calls (double-click, retry) could both pass the guard and send the same newsletter twice to real subscribers. Added an atomic claim/release (`claimNewsletterForSending` / `releaseNewsletterClaim` in `workflow.ts`), plus a new `"sending"` `NewsletterStatus` value.
2. **Stored XSS on the public article page** — `getPublicArticleMarkup` rendered article title/teaser/body as raw HTML on an unauthenticated route. Now escaped via a shared `escapeHtml` (exported from `lib/newsletter-html.ts`, de-duplicated out of `email.ts`).
3. **Login rate-limit TOCTOU race** — `login-rate-limit.ts`'s read-then-write attempt counter could lose increments under a concurrent brute-force burst. Switched to Prisma's atomic `increment`.
4. **Article republish not idempotent** — republishing deleted and recreated all articles with new ids, breaking links already emailed to subscribers. Now upserts by `section_type`, keeping the same id/URL for unchanged sections.
5. **Python API had zero authentication** — every route in `api/` (including a real newsletter-send endpoint) was open to anyone who could reach the port. Added a shared-secret `X-Internal-Api-Key` header dependency on every route except `/api/health` and the public article page.
6. **Python outbound-email HTML injection** — same class of bug as #2, in `mailchimp_client.py` and `email_notifier.py`'s outbound HTML. Escaped with `html.escape()`.
7. **PinchTab (scraping helper) browser leak** — `pinchtab_client.py` started a remote browser profile per scrape and never closed it. Now stopped in a `finally` block.

Each fix has its own commit with a real test (Playwright `tests/*.spec.ts` for TypeScript, `pytest` for Python), run individually and then all together — everything passes. No test touches the real Mailchimp/Mailzzy send APIs or the production database (local `.env` points at a separate dev Supabase project, `beapnobefsyhipwhpbyi`, not production's `irnmsoaqxjadmecinmoc`).

### Current State
- All 7 fixes are committed on branch `fix/code-review-findings-2026-08-27`, created off `main` at `48be45d`.
- **Not pushed anywhere, not merged to `main`.** Production (EC2) and the deployed dashboard are untouched.
- Full review findings and the implementation plan (exact diffs, test code) live in `docs/superpowers/plans/2026-08-27-code-review-fixes.md`.
- Pre-existing uncommitted local changes (the Mailchimp→Mailzzy migration in `env.ts`/`mailchimp.ts`/`system-status.ts`, from an earlier session) were left untouched throughout — they still sit as uncommitted working-tree changes on top of this branch, separate from the 7 fixes above.

### Known Follow-Ups
- The Python API auth fix (#5) needs `INTERNAL_API_KEY` set in whatever environment runs `api/` once deployed, or every protected route will 503. Not urgent today since nothing in production currently calls that service.
- The new `"sending"` newsletter status isn't in the history page's `statusColors` map yet, so it'll render as a plain gray badge (not broken, just unstyled) for the few seconds a send is in flight.
- Not yet merged/pushed — needs a decision on PR vs. direct merge, and a call on what to do with the pending Mailzzy migration first.

---

## Project Status: 15-Source Pipeline + Redesigned Data Page

---

## 2026-04-14 — Session 3: New Sources + Data Page Redesign

### What Was Completed

**Fixed FDIC Source (critical):**
- URL corrected: `api.fdic.gov` (returns 400) → `banks.data.fdic.gov` with `follow_redirects=True`
- Field names corrected: `FAILDATE→RESDATE`, `RESTYPE1→RESTYPE`
- Live test: 20 recent failures returned, most recent: METROPOLITAN CAPITAL B&T (1/30/2026)

**3 New Python Sources:**
- `auction_portals_source.py` — 7 REO auction portals (Hubzu, Xome, RealtyBid, ServiceLink, W&W, Bid4Assets, Auction.com)
- `gsa_auctions_source.py` — GSA/USMS/Treasury government property auctions
- `fed_large_banks_source.py` — Top 25 U.S. banks by assets (JPMorgan $3.75T, BofA $2.64T, Citibank $1.84T...)

**Pipeline: 15 Sources Total** (up from 12)

**Redesigned `/data` Page:**
- CSS-only bar charts on FRED indicators, Redfin counties, FDIC failures, Fed large banks
- Source `↗` attribution links on every table row and every portal card
- Clickable auction portal cards (online/blocked status + listing counts)
- Government auction portal section
- Error message includes FastAPI URL for easier debugging

**Env Fix (root cause of API 404):**
- `dashboard/.env.local` → `NEXT_PUBLIC_API_URL=http://localhost:8000`

### Files Changed
- `api/services/sources/fdic_source.py` — URL + field name fix
- `api/services/sources/auction_portals_source.py` — NEW
- `api/services/sources/gsa_auctions_source.py` — NEW
- `api/services/sources/fed_large_banks_source.py` — NEW
- `api/services/data_aggregator.py` — 3 new sources wired in
- `dashboard/src/app/data/page.tsx` — full redesign
- `dashboard/.env.local` — env fix
- `SOURCES.md` — updated to 15 sources

### To Run
```bash
# Terminal 1
cd api && python -m uvicorn main:app --host 0.0.0.0 --port 8000

# Terminal 2 (restart picks up .env.local)
cd dashboard && npm run dev
```
Login → click **Data** in nav

---

## Project Status: Core Build Complete + Running Locally

---

## 2026-03-16 — Session 2: Local Workflow Completion + Delivery Hardening

### What Was Completed
- Wired mock fallback support for News API and Foreclosure.com so local pipeline runs with richer data even when credentials or live scraping are unavailable.
- Added config flags for mock-source control and a configurable dashboard URL for reviewer emails.
- Wired reviewer email notifications into AI draft generation.
- Synced newsletter status when draft review status changes.
- Hardened article publishing to be idempotent and fixed article serialization for stored string fields.
- Fixed Docker Compose so the API container uses the Postgres service hostname instead of `localhost`.

### Current Local Workflow
- Pipeline can now use:
  - `zillow_mock`
  - `news_api_mock` when `NEWS_API_KEY` is missing or live calls fail
  - `foreclosure_com_mock` when live scraping returns no usable data
- AI draft generation optionally notifies the configured reviewer.
- Approving a draft updates both the draft and newsletter state before article publish / Mailchimp scheduling.

### Remaining External Dependencies
- Grok and Reddit still require real credentials for live data.
- Zillow live integration still depends on the teammate repo.
- Mailchimp scheduling is still mock-backed until real Mailchimp credentials are provided.
- MS Platform publishing is still database-only; external publish integration is not implemented.

---

## 2026-03-15 — Session 1: Full System Build + Local Dev Running

### What Was Built
**Complete newsletter system** with Python/FastAPI backend + Next.js dashboard.

### Architecture
```
ufs-newsletter/
├── api/              (Python/FastAPI — port 8000)
├── dashboard/        (Next.js — port 3000)
├── docker-compose.yml
├── .env / .env.example
└── .gitignore
```

### Backend (api/)
| File | Purpose |
|------|---------|
| `main.py` | FastAPI entry, CORS, route registration |
| `config.py` | Pydantic settings from .env |
| `database.py` | SQLAlchemy engine (SQLite for dev, Supabase for prod) |
| `models/newsletter.py` | Newsletter model (id, issue_number, issue_date, status) |
| `models/article.py` | Article model (section_type, title, teaser, body, audience_tag) |
| `models/draft.py` | Draft model (raw_data, ai_draft, human_edits, status, sources) |
| `models/approval_log.py` | Approval log (action, reviewer, notes, timestamp) |
| `routes/pipeline.py` | POST /api/pipeline/trigger — runs all data sources |
| `routes/drafts.py` | GET/POST/PATCH /api/drafts — CRUD + AI generation |
| `routes/newsletter.py` | POST /api/newsletter/schedule — Mailchimp scheduling |
| `routes/articles.py` | POST /api/articles/publish — article publishing |
| `services/data_aggregator.py` | Runs all 5 sources, aggregates by section, creates newsletter+draft |
| `services/ai_drafter.py` | OpenAI GPT-4 drafting with prompt templates (5 sections) |
| `services/mailchimp_client.py` | Campaign creation, HTML rendering, Tuesday 9AM scheduling |
| `services/email_notifier.py` | SMTP reviewer notifications |

### Data Sources (api/services/sources/)
| Source | File | Status |
|--------|------|--------|
| Grok API (X/Twitter) | `grok_source.py` | Built — needs GROK_API_KEY |
| Reddit API | `reddit_source.py` | Built — needs REDDIT_CLIENT_ID/SECRET |
| News API (newsapi.org) | `news_api_source.py` | Built — needs NEWS_API_KEY |
| Foreclosure.com scraper | `foreclosure_scraper.py` | Built — enabled by default |
| Zillow agent (teammate) | `zillow_source.py` | Mock data working — awaiting teammate repo |

### AI Prompt Templates (api/prompts/)
- `market_pulse.txt` — Weekly REO volume, foreclosure activity
- `top_banks.txt` — Banks/servicers with most REO
- `hot_markets.txt` — Top 5 counties/metros
- `industry_news.txt` — Regulatory changes, market trends
- `ufs_spotlight.txt` — UFS service highlight

### Mock Data (api/fixtures/)
- `mock_reo_listings.json` — 15 REO listings across 8 states
- `mock_foreclosure_stats.json` — 10-state foreclosure data with counties + banks
- `mock_news_articles.json` — 5 realistic news articles

### Dashboard (dashboard/)
| File | Purpose |
|------|---------|
| `src/app/page.tsx` | Draft list page — view all drafts, trigger pipeline |
| `src/app/drafts/[id]/page.tsx` | Draft editor — edit sections, preview email, approve/reject |
| `src/app/history/page.tsx` | Newsletter history table |
| `src/app/layout.tsx` | Nav bar with Disposition Desk branding |
| `src/components/DraftCard.tsx` | Draft card with status badge, sources info |
| `src/components/SectionEditor.tsx` | Side-by-side AI original vs editable version |
| `src/components/EmailPreview.tsx` | Rendered email preview (Mailchimp-style) |
| `src/components/ApprovalActions.tsx` | Approve/Reject/Request Changes with reviewer email |
| `src/lib/api.ts` | FastAPI client with all endpoints typed |

### Database
- **Dev**: SQLite (`ufs_newsletter.db` in api/ folder)
- **Prod**: Supabase (user will provide connection string later)
- Models use String columns (not Enum) for SQLite compatibility

### Running Locally
```bash
# Terminal 1 — API
cd ufs-newsletter/api
python -m uvicorn main:app --host 0.0.0.0 --port 8000

# Terminal 2 — Dashboard
cd ufs-newsletter/dashboard
npm run dev
```
- API: http://localhost:8000
- Dashboard: http://localhost:3000
- API docs: http://localhost:8000/docs

### Verified Working
- [x] API starts without errors
- [x] Health check: GET /api/health → 200
- [x] Pipeline trigger: POST /api/pipeline/trigger → creates newsletter #1 + draft with mock Zillow data
- [x] Drafts list: GET /api/drafts/ → returns drafts
- [x] Dashboard builds (next build succeeds)
- [x] Dashboard serves on port 3000
- [x] Mock Zillow source loads 15 listings
- [x] 4 other sources gracefully fail when no API keys (no crashes)

### Key Design Decisions
1. **AI writes, data sources verify** — OpenAI only summarizes verified data, never generates facts
2. **Each source fails independently** — pipeline continues if 1-4 sources are down
3. **SQLite for dev** — zero config, swap to Supabase later with just a connection string change
4. **String columns over Enum** — SQLite compatibility without alembic migrations

---

## Next Steps
- [ ] Add API keys to .env (Grok, Reddit, News API, OpenAI) to test real data
- [ ] Provide Supabase connection string for production DB
- [ ] Integrate teammate's Zillow agent repo (replace mock data in zillow_source.py)
- [ ] Configure real Mailchimp account (API key, list ID, template ID)
- [ ] Set up SMTP for reviewer email notifications
- [ ] Test full flow: pipeline → AI draft → dashboard review → approve → Mailchimp schedule
- [ ] Deploy (Vercel for dashboard, Railway/Render for API)

## Env Vars Needed
```
OPENAI_API_KEY=          # For AI drafting
GROK_API_KEY=            # For X/Twitter data
REDDIT_CLIENT_ID=        # For Reddit data
REDDIT_CLIENT_SECRET=    # For Reddit data
NEWS_API_KEY=            # For news articles
MAILCHIMP_API_KEY=       # For email campaigns
MAILCHIMP_SERVER_PREFIX= # e.g. us21
MAILCHIMP_LIST_ID=       # Audience list
DATABASE_URL=            # Supabase connection string (for prod)
```
