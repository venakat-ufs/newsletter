# UFS Newsletter System — The Disposition Desk

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
