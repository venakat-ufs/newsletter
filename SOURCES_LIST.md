# UFS Newsletter — All Data Sources

> **The Disposition Desk** · 15 active sources · Updated 2026-04-14

---

## Active Sources (15)

### News & Industry Intelligence

| # | Source | Key | Auth | URL | Section |
|---|--------|-----|------|-----|---------|
| 1 | **HousingWire RSS** | `housingwire` | None (free) | https://www.housingwire.com/feed/ | Industry News |
| 2 | **The MortgagePoint RSS** | `mortgagepoint` | None (free) | https://themortgagepoint.com/feed/ | Industry News |
| 3 | **Zillow Research RSS** | `zillow_research` | None (free) | https://zillow.mediaroom.com/press-releases | Industry News |
| 4 | **News API** | `news_api` | `NEWS_API_KEY` | https://newsapi.org/v2/everything | Industry News |
| 5 | **Grok / X** | `grok` | `GROK_API_KEY` | https://api.x.ai/v1/responses | Industry News |
| 6 | **Reddit** | `reddit` | Optional | https://reddit.com/r/realestate/top.json | Industry News |

### Market Data

| # | Source | Key | Auth | URL | Section |
|---|--------|-----|------|-----|---------|
| 7 | **Redfin S3 Market** | `redfin_market` | None (free) | https://redfin-public-data.s3.us-west-2.amazonaws.com/redfin_market_tracker/ | Market Pulse + Hot Markets |
| 8 | **FRED API** | `fred` | `FRED_API_KEY` (free) | https://api.stlouisfed.org/fred/series/observations | Market Pulse |
| 9 | **Foreclosure.com** | `foreclosure_com` | Cookie optional | https://www.foreclosure.com/listings/ | Market Pulse + Hot Markets |
| 10 | **Zillow Listings** | `zillow_listing` | Cookie optional | https://www.zillow.com/foreclosures/ | Market Pulse |

### Bank & REO Listings

| # | Source | Key | Auth | URL | Section |
|---|--------|-----|------|-----|---------|
| 11 | **Fed Large Banks** | `fed_large_banks` | None (free) | https://banks.data.fdic.gov/api/institutions | Top Banks |
| 12 | **FDIC BankFind** | `fdic` | None (free) | https://banks.data.fdic.gov/api/failures | Top Banks |
| 13 | **Freddie Mac HomeSteps** | `homesteps` | None (free) |https://www.homesteps.com/homes/search | Top Banks |
| 14 | **Auction Portals** | `auction_portals` | None (free) | 7 portals (see below) | Top Banks + Hot Markets |
| 15 | **GSA Gov Auctions** | `gsa_auctions` | None (free) | https://gsaauctions.gov | Top Banks |

---

## Auction Portals (inside source #14)

| Portal | URL | Status | Notes |
|--------|-----|--------|-------|
| Auction.com | https://www.auction.com/residential/ | ❌ 403 | Nation's largest REO marketplace — anti-bot |
| Hubzu | https://www.hubzu.com/homes-for-sale/ | ✅ Online | Foreclosure/REO/short-sale auctions |
| Xome Auctions | https://www.xome.com/foreclosures | ✅ Online | REO + HUD + short-sale nationwide |
| RealtyBid | https://www.realtybid.com/list-of-foreclosure-homes/ | ✅ Online | Covius-backed foreclosure platform |
| ServiceLink Auction | https://servicelinkauction.com/listings | ✅ Online | Full-service auction (Salesforce-backed) |
| Williams & Williams | https://www.williamsauction.com/ | ✅ Online | Live + online residential/commercial auctions |
| Bid4Assets | https://www.bid4assets.com/real-estate | ❌ 404 | Gov + distressed RE — API not public |

## Government Auction Portals (inside source #15)

| Portal | URL | Status | Notes |
|--------|-----|--------|-------|
| GSA Auctions | https://gsaauctions.gov | ✅ Online | Surplus + seized federal property |
| U.S. Marshals Service | https://www.usmarshals.gov/what-we-do/asset-forfeiture | ❌ 403 | Criminal forfeiture real property |
| Treasury / Fiscal Service | https://fiscalservice.gov/programs/asset-sales/ | ❌ Unavailable | Seized real estate + assets |

---

## FRED Series (inside source #8)

| Series ID | Description | Frequency |
|-----------|-------------|-----------|
| `DRSFRMACBS` | Single-Family Mortgage Delinquency Rate | Quarterly |
| `MORTGAGE30US` | 30-Year Fixed Mortgage Rate | Weekly |
| `HOUST` | Housing Starts — Total New Privately Owned | Monthly |
| `DRSFLNACBS` | Consumer Loan Delinquency Rate | Quarterly |

---

## Planned / Not Yet Implemented (14)

| Source | URL | Blocker |
|--------|-----|---------|
| Fannie Mae HomePath | https://www.homepath.com/ | 403 — needs headless browser |
| HUD Home Store | https://www.hudhomestore.gov/ | JS-rendered |
| Wells Fargo REO | https://reo.wellsfargo.com/ | Bot protection |
| Bank of America REO | https://propertysearch.bankofamerica.com/ | JS-rendered |
| Chase REO | https://www.chase.com/personal/mortgage/foreclosed-homes | JS-rendered |
| Auction.com (full) | https://www.auction.com/ | 403 — needs Playwright |
| Bid4Assets (full) | https://www.bid4assets.com/ | No public API |
| ATTOM Data | https://api.attomdata.com/ | Paid (~$95+/mo) |
| PropertyRadar | https://www.propertyradar.com/ | Paid ($119+/mo) |
| MBA NDS | https://www.mba.org/news-and-research/research-and-economics | No API — quarterly PDF |
| ICE First Look | https://www.icemortagetechnology.com/ | No API — monthly PDF |
| FHFA HPI | https://www.fhfa.gov/data/hpi | CSV download only |
| FFIEC NIC API | https://www.ffiec.gov/nicpubweb/ | 403 blocked |
| Fed Reserve LCR | https://www.federalreserve.gov/releases/lbr/ | Download-only, no JSON |

---

## Newsletter Sections → Sources

| Section | Sources |
|---------|---------|
| `market_pulse` | Redfin S3, FRED, Foreclosure.com, HousingWire |
| `top_banks` | Fed Large Banks, FDIC BankFind, HomeSteps, Auction Portals, GSA Auctions, Zillow Listings |
| `hot_markets` | Redfin S3 (distressed counties), Foreclosure.com, Auction Portals |
| `industry_news` | HousingWire, MortgagePoint, News API, Reddit, Grok, Zillow RSS |
| `ufs_spotlight` | AI-generated from pipeline context |
