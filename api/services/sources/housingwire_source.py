import re
from html import unescape

import httpx

from services.sources.base import BaseSource, SourceResult

HOUSINGWIRE_RSS_URL = "https://www.housingwire.com/feed/"

REO_KEYWORDS = [
    "reo", "foreclosure", "foreclosed", "bank owned", "bank-owned",
    "distressed", "delinquency", "delinquent", "default", "servicer",
    "servicing", "loss mitigation", "fannie", "freddie", "hud",
    "real estate owned", "disposition", "forbearance", "mortgage performance",
    "nonperforming", "non-performing", "seriously delinquent",
]


def _rss_field(block: str, tag: str) -> str:
    match = re.search(rf"<{tag}[^>]*>([\s\S]*?)</{tag}>", block, re.IGNORECASE)
    if not match:
        return ""
    text = match.group(1)
    cdata = re.search(r"<!\[CDATA\[([\s\S]*?)\]\]>", text)
    if cdata:
        text = cdata.group(1)
    else:
        text = re.sub(r"<[^>]+>", " ", text)
    return unescape(text.strip())


def _parse_rss(xml_text: str) -> list[dict]:
    items = []
    for match in re.finditer(r"<item>([\s\S]*?)</item>", xml_text, re.IGNORECASE):
        block = match.group(1)
        title = _rss_field(block, "title")
        link = _rss_field(block, "link")
        if not title:
            continue
        items.append({
            "title": title,
            "url": link,
            "description": _rss_field(block, "description"),
            "published_at": _rss_field(block, "pubDate"),
            "category": _rss_field(block, "category"),
        })
    return items


def _is_relevant(article: dict) -> bool:
    combined = " ".join([
        article.get("title", ""),
        article.get("description", ""),
        article.get("category", ""),
    ]).lower()
    return any(kw in combined for kw in REO_KEYWORDS)


class HousingWireSource(BaseSource):
    """Pulls REO/foreclosure/servicing news from HousingWire RSS feed."""

    name = "housingwire"

    def collect(self) -> SourceResult:
        try:
            response = httpx.get(
                HOUSINGWIRE_RSS_URL,
                headers={"User-Agent": "ufs-newsletter/1.0", "Accept": "application/rss+xml"},
                timeout=15,
                follow_redirects=True,
            )
            response.raise_for_status()
        except Exception as e:
            return SourceResult(
                source=self.name,
                data=[],
                errors=[f"HousingWire RSS fetch failed: {str(e)}"],
                success=False,
            )

        all_items = _parse_rss(response.text)
        relevant = [item for item in all_items if _is_relevant(item)]

        # If strict filter returns nothing, fall back to all items (still industry news)
        data = relevant if relevant else all_items[:10]

        for item in data:
            item["source_name"] = "HousingWire"
            item["content_type"] = "industry_news"

        if data:
            return SourceResult(
                source=self.name,
                data=data,
                errors=[],
                success=True,
            )

        return SourceResult(
            source=self.name,
            data=[],
            errors=["HousingWire RSS returned no articles"],
            success=False,
        )
