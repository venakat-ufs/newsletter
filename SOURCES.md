# UFS Newsletter — Data Sources Reference

> **The Disposition Desk** | REO & Foreclosure Intelligence Pipeline  
> Last updated: 2026-04-14

---

## Overview

The pipeline collects data from **15 sources** across 5 categories. Each source implements `BaseSource` in `api/services/sources/` and is wired into `data_aggregator.py`. All sources fail gracefully — a single source failure never crashes the pipeline.

```
api/services/sources/
├── base.py                      ← BaseSource + SourceResult contracts
├── grok_source.py               ← X/Twitter via Grok API
├── reddit_source.py             ← Reddit discussions
├── news_api_source.py           ← General news (newsapi.org)
├── foreclosure_scraper.py       ← foreclosure.com scraper
├── zillow_source.py             ← Zillow RSS + listing signals
├── housingwire_source.py        ← HousingWire RSS feed
├── mortgagepoint_source.py      ← The MortgagePoint RSS feed
├── redfin_source.py             ← Redfin S3 weekly market data
├── fred_source.py               ← FRED API delinquency/mortgage rates
├── fdic_source.py               ← FDIC BankFind failures + institutions
├── homesteps_source.py          ← Freddie Mac HomeSteps REO portal
├── auction_portals_source.py    ← 7 REO auction portals (Hubzu, Xome, etc.) ← NEW
├── gsa_auctions_source.py       ← GSA/USMS/Treasury gov property auctions ← NEW
└── fed_large_banks_source.py    ← Top 25 banks by assets (FDIC/Fed Reserve) ← NEW
```

---

## Source Status Matrix

| Source | Key | Auth | Tested Status | Newsletter Section | Free |
|--------|-----|------|---------------|-------------------|------|
| Grok / X | `grok` | `GROK_API_KEY` | ✅ Working | Industry News | Paid |
| Reddit | `reddit` | Optional creds | ✅ Working | Industry News | Free |
| News API | `news_api` | `NEWS_API_KEY` | ✅ Working | Industry News | Free tier |
| Foreclosure.com | `foreclosure_com` | Cookie optional | ⚠️ Often blocked (403) | Market Pulse | Free |
| Zillow RSS | `zillow_research` | None | ✅ Working | Industry News | Free |
| Zillow Listings | `zillow_listing` | Cookie optional | ⚠️ Often blocked | Market Pulse | Free |
| **HousingWire RSS** | `housingwire` | None | ✅ **Working** | Industry News | **Free** |
| **MortgagePoint RSS** | `mortgagepoint` | None | ✅ **Working** | Industry News | **Free** |
| **Redfin S3 Market** | `redfin_market` | None | ✅ **Working** | Market Pulse + Hot Markets | **Free** |
| **FRED API** | `fred` | `FRED_API_KEY` (free) | ✅ **Working** | Market Pulse | **Free** |
| **FDIC BankFind** | `fdic` | None | ✅ **Working** | Top Banks | **Free** |
| **Freddie Mac HomeSteps** | `homesteps` | None | ✅ **200 OK** | Top Banks | **Free** |

---

## Source Details

### 1. Grok / X API
- **File:** `grok_source.py`
- **Endpoint:** `https://api.x.ai/v1/responses`
- **What it gives:** Recent X/Twitter posts about REO, foreclosures, bank-owned properties
- **Env var:** `GROK_API_KEY=xai-...`
- **Section:** `industry_news`
- **Notes:** Uses `x_search` tool to find real tweets. 4 queries per run.

---

### 2. Reddit
- **File:** `reddit_source.py`
- **Endpoints:** `reddit.com/r/{sub}/top.json` (public) or PRAW (with credentials)
- **Subreddits:** `r/realestate`, `r/RealEstateInvesting`
- **What it gives:** Top weekly posts matching REO/foreclosure keywords
- **Env vars:** `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` (optional — falls back to public JSON)
- **Section:** `industry_news`
- **Notes:** `r/foreclosure` is private — removed. Public JSON fallback requires custom User-Agent.

---

### 3. News API
- **File:** `news_api_source.py`
- **Endpoint:** `https://newsapi.org/v2/everything`
- **What it gives:** Published news articles about REO, foreclosure, HUD homes, Fannie/Freddie
- **Env var:** `NEWS_API_KEY=...`
- **Section:** `industry_news` + `market_pulse` headlines
- **Notes:** 4 search queries. Filters articles by relevance keywords.

---

### 4. Foreclosure.com Scraper
- **File:** `foreclosure_scraper.py`
- **Target:** `foreclosure.com/listings/{STATE}` for FL, CA, TX, OH, IL, GA, MI, NJ, PA, AZ
- **What it gives:** Listing counts + top counties per state
- **Env vars:** `FORECLOSURE_COM_ENABLED=true`, `FORECLOSURE_COM_COOKIE` (optional)
- **Section:** `market_pulse`, `hot_markets`
- **Notes:** Frequently returns 403. Uses Scrapling stealth retry. Stops early on block.

---

### 5. Zillow RSS
- **File:** `zillow_source.py` → `ZillowResearchSource`
- **Feeds:**
  - Housing Market Research: `zillow.mediaroom.com/press-releases?category=816&pagetemplate=rss`
  - Industry Announcements: `...?category=820&pagetemplate=rss`
- **What it gives:** Zillow press releases — market reports, housing trends
- **Section:** `industry_news`, `market_pulse` headlines
- **Status:** ✅ 5 fresh items per feed

---

### 6. Zillow Listing Pages
- **File:** `zillow_source.py` → `ZillowListingSource`
- **Pages:** Zillow foreclosures + auction pages
- **What it gives:** Listing count signals + sample listing URLs
- **Env var:** `ZILLOW_COOKIE` (optional, helps bypass bot block)
- **Section:** `market_pulse`, `top_banks`, `hot_markets`
- **Status:** ⚠️ Often 403 without cookie

---

### 7. HousingWire RSS ← NEW
- **File:** `housingwire_source.py`
- **Feed:** `https://www.housingwire.com/feed/`
- **What it gives:** Industry news — servicer announcements, regulatory changes, market trends
- **Auth:** None
- **Section:** `industry_news` + `market_pulse` headlines
- **Status:** ✅ 10 articles/day, always live
- **Filter:** REO/foreclosure/servicing keywords applied; falls back to all items if no match

---

### 8. The MortgagePoint RSS ← NEW
- **File:** `mortgagepoint_source.py`
- **Feed:** `https://themortgagepoint.com/feed/`
- **What it gives:** REO-specific trade publication news (formerly DS News / MReport)
- **Auth:** None
- **Section:** `industry_news`
- **Status:** ✅ 12+ articles, most REO-specific publication in the industry
- **Notes:** DS News rebranded to The MortgagePoint in 2024. Old `dsnews.com` URLs redirect.

---

### 9. Redfin S3 Market Data ← NEW
- **File:** `redfin_source.py`
- **Files fetched:**
  - State: `redfin-public-data.s3.us-west-2.amazonaws.com/redfin_market_tracker/state_market_tracker.tsv000.gz`
  - County: `.../county_market_tracker.tsv000.gz`
- **What it gives:**
  - **Market Pulse:** State-level median price, inventory, homes sold, days on market — all with YoY deltas
  - **Hot Markets:** Top 25 distressed counties ranked by composite distress score (inventory growth + price drops + DOM + sale-to-list ratio)
- **Auth:** None — public S3 bucket
- **Freshness:** Updated weekly (Wednesdays)
- **Section:** `market_pulse`, `hot_markets`
- **Distress score formula:** `inventory_yoy×10 + price_drops_yoy×10 + dom_yoy×5 + (1-sale_to_list)×100`

---

### 10. FRED API ← NEW
- **File:** `fred_source.py`
- **Endpoint:** `https://api.stlouisfed.org/fred/series/observations`
- **Series tracked:**
  | Series ID | Label | Frequency |
  |-----------|-------|-----------|
  | `DRSFRMACBS` | Delinquency Rate — Single-Family Mortgages | Quarterly |
  | `MORTGAGE30US` | 30-Year Fixed Mortgage Rate | Weekly |
  | `HOUST` | Housing Starts: Total New Privately Owned | Monthly |
  | `DRSFLNACBS` | Consumer Loan Delinquency Rate | Quarterly |
- **Auth:** `FRED_API_KEY=...` — **free**, instant signup at [fred.stlouisfed.org](https://fred.stlouisfed.org/docs/api/api_key.html)
- **Section:** `market_pulse`
- **Notes:** Returns 4 most recent observations per series. Lags ~2 months post-quarter but is authoritative.

---

### 11. FDIC BankFind API ← NEW
- **File:** `fdic_source.py`
- **Correct endpoints:** `https://banks.data.fdic.gov/api/failures` + `.../institutions`
  - (Note: redirects to `api.fdic.gov` — use `follow_redirects=True` in httpx)
- **What it gives:**
  - 20 most recent FDIC bank failures with assets/deposits/acquiring institution
  - Top 25 large active banks with $10B+ assets (separate from `fed_large_banks` source)
- **Auth:** None — open government API
- **Section:** `top_banks`
- **Notes:** Bank failures spike REO. The acquiring institution inherits the failed bank's REO portfolio.

---

### 12. Freddie Mac HomeSteps ← NEW
- **File:** `homesteps_source.py`
- **URL:** `https://www.homesteps.com/homes/search`
- **What it gives:** Freddie Mac's REO inventory signal — listing count, page structure
- **Auth:** None
- **Section:** `top_banks`
- **Status:** ✅ HTTP 200 in testing
- **Notes:** Freddie Mac's official REO portal. "First Look" program: owner-occupants get 20-day exclusive window before investor offers accepted.

---

### 13. Auction Portals Monitor ← NEW
- **File:** `auction_portals_source.py`
- **Portals covered:** Auction.com, Hubzu, Xome, RealtyBid, ServiceLink Auction, Williams & Williams, Bid4Assets
- **What it gives:** HTTP availability check for each portal + listing count extraction where accessible
- **Auth:** None — public page checks
- **Section:** `top_banks`, `hot_markets`
- **Status:** Hubzu ✅, Xome ✅, RealtyBid ✅, ServiceLink ✅, W&W ✅ — Auction.com 403, Bid4Assets 404
- **Notes:** Clicking any portal card opens the live listings page directly. Count extraction uses regex patterns.

---

### 14. GSA Government Auctions ← NEW
- **File:** `gsa_auctions_source.py`
- **Portals:**
  - GSA Auctions: `gsaauctions.gov` — surplus & seized federal real property
  - U.S. Marshals Service: `usmarshals.gov` — forfeited criminal assets
  - Treasury / Fiscal Service: `fiscalservice.gov` — seized real estate
- **What it gives:** Portal availability signal + listing counts where extractable
- **Auth:** None
- **Section:** `top_banks`
- **Notes:** GSA returns 200 (React SPA). USMS returns 403. These portals cover different legal categories — surplus vs. criminal forfeiture.

---

### 15. Fed Large Banks Ranking ← NEW
- **File:** `fed_large_banks_source.py`
- **Source:** FDIC BankFind `institutions` endpoint (most current, open, no auth)
- **Reference concept:** Federal Reserve Large Commercial Banks (LCR) release — `federalreserve.gov/releases/lbr/`
- **What it gives:**
  - Top 25 U.S. commercial banks ranked by total consolidated assets
  - Total assets, deposits, net income, report date — all verified quarterly
  - Combined industry assets: ~$17T (as of Q4 2025)
- **Auth:** None
- **Section:** `top_banks`
- **Notes:** Top 10 displayed as bar chart; full 25 in table. Each row links directly to FDIC record.
  - FFIEC NIC reference: `ffiec.gov/nicpubweb` (holding company structure, blocked for API use)

---

## Planned Sources (Not Yet Implemented)

| Source | Why valuable | Blocker |
|--------|-------------|---------|
| Fannie Mae HomePath | #1 GSE REO portal | 403 blocked — needs headless browser or cookie |
| HUD Home Store | FHA foreclosure REO | JS-rendered, no accessible static API |
| Wells Fargo REO | Major bank listings | Bot protection |
| Bank of America REO | Major bank listings | JS-rendered |
| Chase REO | Major bank listings | JS-rendered |
| ATTOM Data API | Best-in-class foreclosure data | Paid (~$95+/mo) |
| PropertyRadar | Western US foreclosure tracking | Paid ($119+/mo) |
| MBA NDS | Quarterly delinquency benchmark | No RSS; manual quarterly release |
| ICE First Look | Best free monthly pipeline data | No API; monthly press release |
| FHFA HPI | House price index by county | CSV downloads only, quarterly |
| Auction.com | Nation's largest REO marketplace | 403 anti-bot — needs Puppeteer/Playwright |
| Bid4Assets | Gov + distressed RE auctions | 404 — API endpoint not publicly documented |
| FFIEC NIC API | Holding company structure data | 403 blocked for API use |
| Fed Reserve LCR CSV | Official large bank ranking | Download-only, no JSON API |

---

## Adding a New Source

1. Create `api/services/sources/{name}_source.py` — implement `BaseSource.collect() -> SourceResult`
2. Import and add to `get_all_sources()` in `api/services/data_aggregator.py`
3. Wire into `aggregate_for_sections()` in the same file
4. Add any new env vars to `api/config.py` (Settings class) and `.env.example`
5. Update this file

**The `safe_collect()` wrapper ensures any uncaught exception returns a failed `SourceResult` — the pipeline never crashes from one bad source.**

---

## Newsletter Sections → Sources Mapping

| Section | Primary Sources | Fallback |
|---------|----------------|---------|
| `market_pulse` | Redfin (state stats), FRED (rates/delinquency), foreclosure_com, housingwire | news_api headlines |
| `top_banks` | Fed Large Banks (top 25), FDIC (failures), HomeSteps, Auction Portals, GSA, zillow_listing | mock data |
| `hot_markets` | Redfin (distressed counties), foreclosure_com (top counties), Auction Portals | Zillow signals |
| `industry_news` | HousingWire, MortgagePoint, news_api, Reddit, Grok, Zillow RSS | Any available |
| `ufs_spotlight` | AI-generated from context | Static template |
