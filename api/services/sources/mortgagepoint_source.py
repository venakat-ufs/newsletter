import re
from html import unescape

import httpx

from services.sources.base import BaseSource, SourceResult

# Formerly DS News — rebranded to The MortgagePoint in 2024
MORTGAGEPOINT_RSS_URL = "https://themortgagepoint.com/feed/"

# Broad filter — this publication is already highly REO-focused
REO_KEYWORDS = [
    "reo", "foreclosure", "foreclosed", "bank owned", "bank-owned",
    "distressed", "delinquency", "delinquent", "default", "servicer",
    "servicing", "loss mitigation", "fannie", "freddie", "hud",
    "real estate owned", "disposition", "forbearance", "mortgage",
    "nonperforming", "non-performing", "seriously delinquent",
    "inventory", "housing", "market", "rates", "federal reserve",
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


class MortgagePointSource(BaseSource):
    """
    Pulls REO/default-servicing news from The MortgagePoint RSS feed.
    Formerly DS News — the most REO-specific trade publication in the industry.
    """

    name = "mortgagepoint"

    def collect(self) -> SourceResult:
        try:
            response = httpx.get(
                MORTGAGEPOINT_RSS_URL,
                headers={"User-Agent": "ufs-newsletter/1.0", "Accept": "application/rss+xml"},
                timeout=15,
                follow_redirects=True,
            )
            response.raise_for_status()
        except Exception as e:
            return SourceResult(
                source=self.name,
                data=[],
                errors=[f"MortgagePoint RSS fetch failed: {str(e)}"],
                success=False,
            )

        items = _parse_rss(response.text)

        for item in items:
            item["source_name"] = "The MortgagePoint"
            item["content_type"] = "industry_news"

        if items:
            return SourceResult(
                source=self.name,
                data=items,
                errors=[],
                success=True,
            )

        return SourceResult(
            source=self.name,
            data=[],
            errors=["MortgagePoint RSS returned no articles"],
            success=False,
        )
