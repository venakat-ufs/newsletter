# Graph Report - .  (2026-04-14)

## Corpus Check
- 38 files · ~11,491 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 250 nodes · 611 edges · 30 communities detected
- Extraction: 48% EXTRACTED · 52% INFERRED · 0% AMBIGUOUS · INFERRED: 317 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]

## God Nodes (most connected - your core abstractions)
1. `SourceResult` - 62 edges
2. `BaseSource` - 53 edges
3. `DraftStatus` - 21 edges
4. `Draft` - 21 edges
5. `NewsletterStatus` - 21 edges
6. `Run all data sources and aggregate results.     Returns (raw_data_dict, sources_` - 21 edges
7. `Organize raw data by newsletter section for the AI drafter.     Returns a dict k` - 21 edges
8. `Full pipeline: collect data → create newsletter + draft → return summary.` - 21 edges
9. `GrokSource` - 18 edges
10. `RedditSource` - 18 edges

## Surprising Connections (you probably didn't know these)
- `Base` --uses--> `Article`  [INFERRED]
  api\database.py → api\models\article.py
- `Base` --uses--> `DraftStatus`  [INFERRED]
  api\database.py → api\models\draft.py
- `Base` --uses--> `Draft`  [INFERRED]
  api\database.py → api\models\draft.py
- `Base` --uses--> `NewsletterStatus`  [INFERRED]
  api\database.py → api\models\newsletter.py
- `Base` --uses--> `Newsletter`  [INFERRED]
  api\database.py → api\models\newsletter.py

## Communities

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (42): ABC, AuctionPortalsSource, _probe_portal(), Auction Portals Signal Source — checks availability of major REO/foreclosure auc, Probes all major REO/foreclosure auction portals for availability and listing si, BaseSource, collect(), Run collect with error handling so pipeline never crashes from one source. (+34 more)

### Community 1 - "Community 1"
Cohesion: 0.19
Nodes (30): BaseSource, Full pipeline: collect data → create newsletter + draft → return summary., Full pipeline: collect data → create newsletter + draft → return summary., Full pipeline: collect data → create newsletter + draft → return summary., Run all data sources and aggregate results.     Returns (raw_data_dict, sources_, Run all data sources and aggregate results.     Returns (raw_data_dict, sources_, Run all data sources and aggregate results.     Returns (raw_data_dict, sources_, Organize raw data by newsletter section for the AI drafter.     Returns a dict k (+22 more)

### Community 2 - "Community 2"
Cohesion: 0.13
Nodes (19): ApprovalAction, ApprovalLog, AudienceTag, SectionType, Base, BaseModel, Base, DeclarativeBase (+11 more)

### Community 3 - "Community 3"
Cohesion: 0.17
Nodes (17): Article, get_articles(), publish_articles(), Publish approved draft content as public article pages., Get all articles for a newsletter., Render a public article page for email click-throughs., view_public_article(), _build_html_content() (+9 more)

### Community 4 - "Community 4"
Cohesion: 0.32
Nodes (3): get_pinchtab_cookie_header(), PinchTabClient, PinchTabSession

### Community 5 - "Community 5"
Cohesion: 0.31
Nodes (8): _build_headers(), _collect_listing_items(), _collect_research_items(), _parse_listing_count(), _parse_listing_urls(), _parse_rss_items(), _read_xml_tag(), _strip_tags()

### Community 6 - "Community 6"
Cohesion: 0.29
Nodes (6): collect_source(), collect_sources(), list_sources(), List the available Python source collectors., Run every source collector once and return the live summary., Run a single source collector for manual debugging.

### Community 7 - "Community 7"
Cohesion: 0.52
Nodes (6): aggregate_for_sections(), collect_all_sources(), get_all_sources(), get_source_by_name(), _get_source_data(), run_pipeline()

### Community 8 - "Community 8"
Cohesion: 0.47
Nodes (5): _draft_section(), generate_ai_draft(), _load_prompt(), Draft a single newsletter section using OpenAI., Generate AI drafts for all 5 newsletter sections.     raw_data should contain a

### Community 9 - "Community 9"
Cohesion: 0.53
Nodes (1): GrokSource

### Community 10 - "Community 10"
Cohesion: 0.6
Nodes (1): RedditSource

### Community 11 - "Community 11"
Cohesion: 0.53
Nodes (4): _distress_score(), _fetch_tsv(), _latest_period_rows(), _safe_float()

### Community 12 - "Community 12"
Cohesion: 0.6
Nodes (3): fetch_with_scrapling(), fetch_with_stealth_retry(), ScraplingFetchResult

### Community 13 - "Community 13"
Cohesion: 0.7
Nodes (3): FedLargeBanksSource, _fetch_largest_banks(), _fmt_billions()

### Community 14 - "Community 14"
Cohesion: 0.6
Nodes (3): GsaAuctionsSource, _probe_agency(), _probe_gsa()

### Community 15 - "Community 15"
Cohesion: 0.6
Nodes (3): _extract_count(), _extract_json_data(), _flatten_keys()

### Community 16 - "Community 16"
Cohesion: 0.6
Nodes (3): _is_relevant(), _parse_rss(), _rss_field()

### Community 17 - "Community 17"
Cohesion: 0.67
Nodes (3): BaseSettings, get_settings(), Settings

### Community 18 - "Community 18"
Cohesion: 0.67
Nodes (2): _fetch_high_npl_banks(), _fetch_recent_failures()

### Community 19 - "Community 19"
Cohesion: 0.67
Nodes (2): _parse_rss(), _rss_field()

### Community 20 - "Community 20"
Cohesion: 0.67
Nodes (2): Kick off weekly data collection from all sources., trigger_pipeline()

### Community 21 - "Community 21"
Cohesion: 1.0
Nodes (2): _public_base_url(), publish_articles_from_draft()

### Community 22 - "Community 22"
Cohesion: 0.67
Nodes (2): Send email to reviewer when a new AI draft is ready for review., send_review_notification()

### Community 23 - "Community 23"
Cohesion: 0.67
Nodes (1): _fetch_series()

### Community 24 - "Community 24"
Cohesion: 1.0
Nodes (0): 

### Community 25 - "Community 25"
Cohesion: 1.0
Nodes (0): 

### Community 26 - "Community 26"
Cohesion: 1.0
Nodes (0): 

### Community 27 - "Community 27"
Cohesion: 1.0
Nodes (0): 

### Community 28 - "Community 28"
Cohesion: 1.0
Nodes (1): Collect data from this source. Must not raise — return errors in SourceResult.

### Community 29 - "Community 29"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **9 isolated node(s):** `Kick off weekly data collection from all sources.`, `List the available Python source collectors.`, `Run every source collector once and return the live summary.`, `Run a single source collector for manual debugging.`, `Draft a single newsletter section using OpenAI.` (+4 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 24`** (2 nodes): `main.py`, `health()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (1 nodes): `Collect data from this source. Must not raise — return errors in SourceResult.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SourceResult` connect `Community 0` to `Community 1`, `Community 9`, `Community 10`, `Community 13`, `Community 14`?**
  _High betweenness centrality (0.179) - this node is a cross-community bridge._
- **Why does `Article` connect `Community 3` to `Community 1`, `Community 2`?**
  _High betweenness centrality (0.113) - this node is a cross-community bridge._
- **Why does `BaseSource` connect `Community 0` to `Community 1`, `Community 9`, `Community 10`, `Community 13`, `Community 14`?**
  _High betweenness centrality (0.089) - this node is a cross-community bridge._
- **Are the 59 inferred relationships involving `SourceResult` (e.g. with `Run all data sources and aggregate results.     Returns (raw_data_dict, sources_` and `Organize raw data by newsletter section for the AI drafter.     Returns a dict k`) actually correct?**
  _`SourceResult` has 59 INFERRED edges - model-reasoned connections that need verification._
- **Are the 50 inferred relationships involving `BaseSource` (e.g. with `AuctionPortalsSource` and `Auction Portals Signal Source — checks availability of major REO/foreclosure auc`) actually correct?**
  _`BaseSource` has 50 INFERRED edges - model-reasoned connections that need verification._
- **Are the 19 inferred relationships involving `DraftStatus` (e.g. with `Run all data sources and aggregate results.     Returns (raw_data_dict, sources_` and `Organize raw data by newsletter section for the AI drafter.     Returns a dict k`) actually correct?**
  _`DraftStatus` has 19 INFERRED edges - model-reasoned connections that need verification._
- **Are the 19 inferred relationships involving `Draft` (e.g. with `Run all data sources and aggregate results.     Returns (raw_data_dict, sources_` and `Organize raw data by newsletter section for the AI drafter.     Returns a dict k`) actually correct?**
  _`Draft` has 19 INFERRED edges - model-reasoned connections that need verification._