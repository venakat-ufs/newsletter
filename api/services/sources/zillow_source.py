from html import unescape
import re

from config import get_settings
from services.pinchtab_client import get_pinchtab_cookie_header
from services.scrapling_client import fetch_with_scrapling, fetch_with_stealth_retry
from services.sources.base import BaseSource, SourceResult

ZILLOW_RSS_FEEDS = [
    {
        "label": "Housing Market / Rental Research",
        "url": "https://zillow.mediaroom.com/press-releases?category=816&pagetemplate=rss",
    },
    {
        "label": "Industry Announcements",
        "url": "https://zillow.mediaroom.com/press-releases?category=820&pagetemplate=rss",
    },
    {
        "label": "Zillow Home Loans News",
        "url": "https://zillow.mediaroom.com/press-releases?category=821&pagetemplate=rss",
    },
]

ZILLOW_LISTING_PAGES = [
    {
        "label": "Foreclosures",
        "url": "https://www.zillow.com/homes/foreclosures/",
    },
    {
        "label": "Auctions",
        "url": "https://www.zillow.com/homes/auction/",
    },
]


def _strip_tags(value: str) -> str:
    return (
        unescape(value)
        .replace("<![CDATA[", "")
        .replace("]]>", "")
        .replace("\r", " ")
    )


def _read_xml_tag(block: str, tag_name: str) -> str:
    match = re.search(rf"<{tag_name}>([\s\S]*?)</{tag_name}>", block, re.IGNORECASE)
    if not match:
        return ""

    return re.sub(r"<[^>]+>", " ", _strip_tags(match.group(1))).strip()


def _parse_rss_items(xml: str) -> list[dict]:
    items: list[dict] = []

    for match in re.finditer(r"<item>([\s\S]*?)</item>", xml, re.IGNORECASE):
        block = match.group(1)
        title = _read_xml_tag(block, "title")
        link = _read_xml_tag(block, "link")
        description = _read_xml_tag(block, "description")
        category = _read_xml_tag(block, "category")
        published_at = _read_xml_tag(block, "pubDate")

        if not title or not link:
            continue

        items.append({
            "title": title,
            "url": link,
            "description": description,
            "category": category,
            "published_at": published_at,
        })

    return items


def _parse_listing_urls(text: str) -> list[str]:
    urls: list[str] = []
    seen: set[str] = set()
    patterns = [
        r"https://www\.zillow\.com/homedetails/[^\"' <]+",
        r"\"detailUrl\"\s*:\s*\"([^\"]+)\"",
        r"\"hdpUrl\"\s*:\s*\"([^\"]+)\"",
    ]

    for pattern in patterns:
        for match in re.finditer(pattern, text):
            raw_url = match.group(1) if match.groups() else match.group(0)
            url = raw_url.replace("\\u002F", "/").replace("\\/", "/")
            if url.startswith("/"):
                url = f"https://www.zillow.com{url}"
            if url not in seen:
                seen.add(url)
                urls.append(url)

    return urls


def _parse_listing_count(text: str) -> int | None:
    patterns = [
        r"([\d,]+)\s+homes?\b",
        r"([\d,]+)\s+results\b",
        r"totalResultCount[\"']?\s*[:=]\s*([0-9,]+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if not match:
            continue
        try:
            return int(match.group(1).replace(",", ""))
        except ValueError:
            continue
    return None


def _build_headers(settings) -> dict[str, str]:
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml",
    }
    if settings.zillow_cookie:
        headers["Cookie"] = settings.zillow_cookie
    return headers


def _collect_research_items(headers: dict[str, str]) -> tuple[list[dict], list[str]]:
    items: list[dict] = []
    errors: list[str] = []
    seen_urls: set[str] = set()

    for feed in ZILLOW_RSS_FEEDS:
        response = fetch_with_scrapling(feed["url"], mode="static", headers=headers)
        if response.error:
            errors.append(f"Zillow feed '{feed['label']}' failed: {response.error}")
            continue

        if response.status_code != 200:
            errors.append(f"Zillow feed '{feed['label']}' returned HTTP {response.status_code}")
            continue

        for item in _parse_rss_items(response.text):
            url = item.get("url", "")
            if not url or url in seen_urls:
                continue

            seen_urls.add(url)
            items.append({
                **item,
                "feed": feed["label"],
                "source_name": "Zillow",
                "content_type": "research",
            })

    return items, errors


def _collect_listing_items(settings, headers: dict[str, str]) -> tuple[list[dict], list[str]]:
    listing_signals: list[dict] = []
    errors: list[str] = []

    for page in ZILLOW_LISTING_PAGES:
        page_headers = dict(headers)
        if settings.pinchtab_enabled and "Cookie" not in page_headers:
            cookie_header, pinchtab_errors = get_pinchtab_cookie_header(page["url"])
            errors.extend(f"Zillow {page['label']}: {message}" for message in pinchtab_errors)
            if cookie_header:
                page_headers["Cookie"] = cookie_header

        response, fetch_errors = fetch_with_stealth_retry(page["url"], headers=page_headers)
        errors.extend(f"Zillow {page['label']}: {message}" for message in fetch_errors)

        if not response.ok:
            if response.error:
                errors.append(f"Zillow {page['label']} failed: {response.error}")
            elif response.status_code is not None:
                errors.append(f"Zillow {page['label']} returned HTTP {response.status_code}")
                if response.status_code == 403 and not settings.zillow_cookie:
                    errors.append(
                        "Zillow listing pages are blocking this runtime. "
                        "Provide ZILLOW_COOKIE from an allowed browser session to retry."
                    )
            else:
                errors.append(f"Zillow {page['label']} returned no response body")
            continue

        listing_urls = _parse_listing_urls(response.text)
        listing_count = _parse_listing_count(response.text)
        listing_signals.append({
            "title": f"Zillow {page['label']}",
            "url": response.url,
            "listing_count": listing_count,
            "sample_listing_urls": listing_urls[:10],
            "source_name": "Zillow",
            "content_type": "listing_inventory",
            "fetch_mode": response.mode,
            "page": page["label"],
        })

    return listing_signals, errors


class ZillowResearchSource(BaseSource):
    """Live Zillow research/news RSS collector."""

    name = "zillow_research"

    def collect(self) -> SourceResult:
        settings = get_settings()
        items, errors = _collect_research_items(_build_headers(settings))
        if items:
            return SourceResult(source=self.name, data=items, errors=errors, success=True)
        return SourceResult(
            source=self.name,
            data=[],
            errors=errors or ["Zillow RSS feeds returned no usable data"],
            success=False,
        )


class ZillowListingSource(BaseSource):
    """Best-effort Zillow listing collector via Scrapling."""

    name = "zillow_listing"

    def collect(self) -> SourceResult:
        settings = get_settings()
        listing_signals, errors = _collect_listing_items(settings, _build_headers(settings))
        if listing_signals:
            return SourceResult(source=self.name, data=listing_signals, errors=errors, success=True)
        return SourceResult(
            source=self.name,
            data=[],
            errors=errors or ["Zillow listing pages returned no usable data"],
            success=False,
        )


class ZillowSource(ZillowResearchSource):
    """Backward-compatible alias for older imports."""
