from datetime import datetime

from sqlalchemy.orm import Session

from models.newsletter import Newsletter, NewsletterStatus
from models.draft import Draft, DraftStatus
from services.sources.base import SourceResult
from services.sources.grok_source import GrokSource
from services.sources.reddit_source import RedditSource
from services.sources.news_api_source import NewsApiSource
from services.sources.foreclosure_scraper import ForeclosureScraper
from services.sources.zillow_source import ZillowListingSource, ZillowResearchSource
from services.sources.housingwire_source import HousingWireSource
from services.sources.mortgagepoint_source import MortgagePointSource
from services.sources.redfin_source import RedfinMarketSource
from services.sources.fred_source import FredSource
from services.sources.fdic_source import FdicSource
from services.sources.homesteps_source import HomeStepsSource
from services.sources.auction_portals_source import AuctionPortalsSource
from services.sources.gsa_auctions_source import GsaAuctionsSource
from services.sources.fed_large_banks_source import FedLargeBanksSource


def get_all_sources():
    return [
        GrokSource(),
        RedditSource(),
        NewsApiSource(),
        ForeclosureScraper(),
        ZillowResearchSource(),
        ZillowListingSource(),
        HousingWireSource(),
        MortgagePointSource(),
        RedfinMarketSource(),
        FredSource(),
        FdicSource(),
        HomeStepsSource(),
        AuctionPortalsSource(),
        GsaAuctionsSource(),
        FedLargeBanksSource(),
    ]


def get_source_by_name(source_name: str):
    normalized = source_name.strip().lower()
    for source in get_all_sources():
        if source.name.lower() == normalized:
            return source
    return None


def collect_all_legacy_sources() -> tuple[dict, list[str], list[str], list[str]]:
    """
    Run all data sources and aggregate results.
    Returns (raw_data_dict, sources_used, sources_warning, sources_failed).
    """
    raw_data = {}
    sources_used = []
    sources_warning = []
    sources_failed = []

    for source in get_all_sources():
        result: SourceResult = source.safe_collect()
        raw_data[result.source] = result.to_dict()

        if result.success and not result.errors:
            sources_used.append(result.source)
        elif result.success:
            sources_warning.append(result.source)
        else:
            sources_failed.append(result.source)

    return raw_data, sources_used, sources_warning, sources_failed


async def collect_all_sources() -> dict:
    """Async REO collector for new listing-only sources."""
    from services.reo_aggregator import collect_all_sources as collect_new_reo_sources

    return await collect_new_reo_sources()


def _get_source_data(raw_data: dict, keys: list[str]) -> list[dict]:
    for key in keys:
        data = raw_data.get(key, {}).get("data", [])
        if data:
            return data
    return []


def aggregate_for_sections(raw_data: dict) -> dict:
    """
    Organize raw data by newsletter section for the AI drafter.
    Returns a dict keyed by section_type with relevant data.
    """
    sections = {
        "market_pulse": {
            "description": "Weekly REO volume, foreclosure activity, key market indicators",
            "data": [],
        },
        "top_banks": {
            "description": "Which banks/servicers listed the most REO this week",
            "data": [],
        },
        "hot_markets": {
            "description": "Top 5 counties/metros with highest REO activity this week",
            "data": [],
        },
        "industry_news": {
            "description": "Regulatory changes, servicer announcements, market trends",
            "data": [],
        },
        "ufs_spotlight": {
            "description": "UFS service highlight or client success story",
            "data": [],
        },
    }

    # Foreclosure.com → market_pulse, hot_markets
    fc_data = _get_source_data(raw_data, ["foreclosure_com"])
    if fc_data:
        sections["market_pulse"]["data"].extend(fc_data)
        county_list = []
        for state_data in fc_data:
            county_list.extend(state_data.get("top_counties", []))
        sections["hot_markets"]["data"].append({
            "source": "foreclosure_com",
            "states": fc_data,
            "counties": county_list,
        })

    # Zillow research/news → industry_news, market_pulse summary
    zl_research_data = _get_source_data(raw_data, ["zillow_research"])
    if zl_research_data:
        sections["industry_news"]["data"].extend(zl_research_data[:10])
        sections["market_pulse"]["data"].append({
            "source": "zillow_research",
            "article_count": len(zl_research_data),
            "top_headlines": [item.get("title", "") for item in zl_research_data[:5]],
        })

    # Zillow listing inventory → market_pulse, top_banks, hot_markets
    zl_listing_data = _get_source_data(raw_data, ["zillow_listing"])
    if zl_listing_data:
        sections["market_pulse"]["data"].append({
            "source": "zillow_listing_inventory",
            "page_count": len(zl_listing_data),
            "pages": zl_listing_data,
        })
        sections["top_banks"]["data"].append({
            "source": "zillow_listing_inventory",
            "pages": zl_listing_data,
        })
        sections["hot_markets"]["data"].append({
            "source": "zillow_listing_inventory",
            "pages": zl_listing_data,
        })

    # News API → industry_news, market_pulse
    news_data = _get_source_data(raw_data, ["news_api"])
    if news_data:
        sections["industry_news"]["data"].extend(news_data)
        sections["market_pulse"]["data"].append({
            "source": "news_api",
            "article_count": len(news_data),
            "top_headlines": [a["title"] for a in news_data[:5]],
        })

    # Grok (X) → industry_news
    grok_data = raw_data.get("grok", {}).get("data", [])
    if grok_data:
        sections["industry_news"]["data"].extend(
            item for item in grok_data if item.get("type") != "unstructured"
        )

    # Reddit → industry_news
    reddit_data = raw_data.get("reddit", {}).get("data", [])
    if reddit_data:
        sections["industry_news"]["data"].extend(reddit_data)

    # HousingWire RSS → industry_news + market_pulse headlines
    hw_data = raw_data.get("housingwire", {}).get("data", [])
    if hw_data:
        sections["industry_news"]["data"].extend(hw_data)
        sections["market_pulse"]["data"].append({
            "source": "housingwire",
            "article_count": len(hw_data),
            "top_headlines": [a["title"] for a in hw_data[:5]],
        })

    # MortgagePoint RSS → industry_news (most REO-specific trade pub)
    mp_data = raw_data.get("mortgagepoint", {}).get("data", [])
    if mp_data:
        sections["industry_news"]["data"].extend(mp_data)

    # Redfin market data → market_pulse (state stats) + hot_markets (distressed counties)
    redfin_data = raw_data.get("redfin_market", {}).get("data", [])
    for item in redfin_data:
        content_type = item.get("content_type", "")
        if content_type == "market_pulse":
            sections["market_pulse"]["data"].append(item)
        elif content_type == "hot_markets":
            sections["hot_markets"]["data"].append(item)

    # FRED API → market_pulse (delinquency rates, mortgage rates)
    fred_data = raw_data.get("fred", {}).get("data", [])
    if fred_data:
        sections["market_pulse"]["data"].append({
            "source": "fred",
            "content_type": "market_indicators",
            "series": fred_data,
        })

    # FDIC BankFind → top_banks (failures + large bank snapshot)
    fdic_data = raw_data.get("fdic", {}).get("data", [])
    if fdic_data:
        sections["top_banks"]["data"].extend(fdic_data)

    # HomeSteps (Freddie Mac) → top_banks
    homesteps_data = raw_data.get("homesteps", {}).get("data", [])
    if homesteps_data:
        sections["top_banks"]["data"].extend(homesteps_data)

    # Auction portals (Auction.com, Hubzu, Xome, RealtyBid, ServiceLink, W&W, Bid4Assets)
    auction_portals_data = raw_data.get("auction_portals", {}).get("data", [])
    if auction_portals_data:
        sections["top_banks"]["data"].extend(auction_portals_data)
        sections["hot_markets"]["data"].extend(auction_portals_data)

    # GSA government auctions (federal forfeitures, surplus property)
    gsa_data = raw_data.get("gsa_auctions", {}).get("data", [])
    if gsa_data:
        sections["top_banks"]["data"].extend(gsa_data)

    # Federal Reserve / FDIC large bank ranking
    fed_banks_data = raw_data.get("fed_large_banks", {}).get("data", [])
    if fed_banks_data:
        sections["top_banks"]["data"].extend(fed_banks_data)

    return sections


def run_pipeline(db: Session, force: bool = False) -> dict:
    """
    Full pipeline: collect data → create newsletter + draft → return summary.
    """
    raw_data, sources_used, sources_warning, sources_failed = collect_all_legacy_sources()
    section_data = aggregate_for_sections(raw_data)
    now = datetime.utcnow()

    last = db.query(Newsletter).order_by(Newsletter.issue_number.desc()).first()
    if (
        not force
        and
        last
        and last.issue_date.date() == now.date()
        and last.status == NewsletterStatus.DRAFT.value
    ):
        draft = db.query(Draft).filter(
            Draft.newsletter_id == last.id
        ).order_by(Draft.updated_at.desc()).first()
        if draft:
            ai_sections = draft.ai_draft.get("sections", []) if isinstance(draft.ai_draft, dict) else []
            human_sections = draft.human_edits.get("sections", []) if isinstance(draft.human_edits, dict) else []
            has_protected_work = (
                bool(ai_sections)
                or bool(human_sections)
                or draft.status != DraftStatus.PENDING.value
                or bool(draft.reviewer_email)
                or draft.reviewed_at is not None
            )
            if has_protected_work:
                return {
                    "newsletter_id": last.id,
                    "issue_number": last.issue_number,
                    "draft_id": draft.id,
                    "sources_used": draft.sources_used or [],
                    "sources_warning": draft.sources_warning or [],
                    "sources_failed": draft.sources_failed or [],
                    "reused_existing": True,
                    "preserved_existing": True,
                    "message": (
                        f"Issue #{last.issue_number} already has generated or reviewed draft work. "
                        "Current draft was preserved. Use force=true if you intentionally want a refresh."
                    ),
                }

            draft.raw_data = {
                "sources": raw_data,
                "sections": section_data,
                "meta": {
                    "sources_used": sources_used,
                    "sources_warning": sources_warning,
                    "sources_failed": sources_failed,
                },
            }
            draft.ai_draft = {}
            draft.human_edits = None
            draft.status = DraftStatus.PENDING.value
            draft.reviewer_email = None
            draft.reviewed_at = None
            draft.sources_used = sources_used
            draft.sources_failed = sources_failed
            db.commit()
            db.refresh(draft)
            return {
                "newsletter_id": last.id,
                "issue_number": last.issue_number,
                "draft_id": draft.id,
                "sources_used": sources_used,
                "sources_warning": sources_warning,
                "sources_failed": sources_failed,
                "reused_existing": True,
                "message": (
                    f"Pipeline refreshed existing issue #{last.issue_number}. "
                    f"{len(sources_used)} live, {len(sources_warning)} degraded, {len(sources_failed)} failed."
                ),
            }

    # Determine next issue number
    next_issue = (last.issue_number + 1) if last else 1

    # Create newsletter record
    newsletter = Newsletter(
        issue_number=next_issue,
        issue_date=now,
        status=NewsletterStatus.DRAFT.value,
    )
    db.add(newsletter)
    db.flush()

    # Create draft with raw data
    draft = Draft(
        newsletter_id=newsletter.id,
        raw_data={
            "sources": raw_data,
            "sections": section_data,
            "meta": {
                "sources_used": sources_used,
                "sources_warning": sources_warning,
                "sources_failed": sources_failed,
            },
        },
        ai_draft={},
        status=DraftStatus.PENDING.value,
        sources_used=sources_used,
        sources_failed=sources_failed,
    )
    db.add(draft)
    db.commit()

    return {
        "newsletter_id": newsletter.id,
        "issue_number": next_issue,
        "draft_id": draft.id,
        "sources_used": sources_used,
        "sources_warning": sources_warning,
        "sources_failed": sources_failed,
        "reused_existing": False,
        "message": (
            f"Pipeline complete. {len(sources_used)} live, "
            f"{len(sources_warning)} degraded, {len(sources_failed)} failed."
        ),
    }
