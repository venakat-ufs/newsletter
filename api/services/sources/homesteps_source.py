import re

import httpx

from services.sources.base import BaseSource, SourceResult

# Freddie Mac HomeSteps — live REO inventory (returned HTTP 200 in testing)
HOMESTEPS_BASE = "https://www.homesteps.com"
HOMESTEPS_SEARCH_URL = f"{HOMESTEPS_BASE}/homes/search"

# States with highest historical REO volume
TARGET_STATES = ["FL", "CA", "TX", "OH", "IL", "GA", "MI", "NJ", "PA", "AZ"]

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


def _extract_count(text: str) -> int | None:
    """Try to extract listing count from page HTML."""
    patterns = [
        r'"totalCount"\s*:\s*(\d+)',
        r'"total"\s*:\s*(\d+)',
        r'"count"\s*:\s*(\d+)',
        r'([\d,]+)\s+(?:homes?|properties|listings)\s+(?:found|available|for sale)',
        r'(?:showing|found)\s+([\d,]+)\s+(?:homes?|properties)',
        r'([\d,]+)\s+REO',
        r'totalProperties["\']?\s*[:=]\s*(\d+)',
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            try:
                return int(match.group(1).replace(",", ""))
            except ValueError:
                continue
    return None


def _extract_json_data(text: str) -> dict:
    """Look for embedded JSON state with listing data."""
    data: dict = {}

    # Next.js __NEXT_DATA__
    next_match = re.search(r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>', text, re.DOTALL)
    if next_match:
        import json
        try:
            next_data = json.loads(next_match.group(1))
            data["next_data_keys"] = list(_flatten_keys(next_data))[:20]
        except (json.JSONDecodeError, Exception):
            pass

    return data


def _flatten_keys(obj, depth=0, max_depth=3) -> list:
    """Recursively collect keys from a nested dict."""
    if depth > max_depth or not isinstance(obj, dict):
        return []
    result = list(obj.keys())
    for v in obj.values():
        result.extend(_flatten_keys(v, depth + 1, max_depth))
    return result


class HomeStepsSource(BaseSource):
    """
    Collects Freddie Mac HomeSteps REO listing signals.
    HomeSteps is Freddie Mac's REO sales portal — direct GSE inventory.
    Attempts static HTML scrape; extracts count + listing signals.
    """

    name = "homesteps"

    def collect(self) -> SourceResult:
        errors: list[str] = []
        data: list[dict] = []

        # Try the main search page
        try:
            response = httpx.get(
                HOMESTEPS_SEARCH_URL,
                headers=HEADERS,
                timeout=20,
                follow_redirects=True,
            )
        except Exception as e:
            # Fall back to home page
            try:
                response = httpx.get(HOMESTEPS_BASE, headers=HEADERS, timeout=20, follow_redirects=True)
            except Exception as e2:
                return SourceResult(
                    source=self.name,
                    data=[],
                    errors=[f"HomeSteps fetch failed: {str(e)} | {str(e2)}"],
                    success=False,
                )

        if response.status_code == 403:
            return SourceResult(
                source=self.name,
                data=[],
                errors=["HomeSteps blocked this request (403). Add HOMESTEPS_COOKIE env var if available."],
                success=False,
            )

        html = response.text
        listing_count = _extract_count(html)
        embedded = _extract_json_data(html)

        # Build signal even without an exact count
        signal: dict = {
            "source_name": "Freddie Mac HomeSteps",
            "content_type": "reo_inventory_signal",
            "url": str(response.url),
            "portal": "homesteps",
            "gse": "Freddie Mac",
            "description": "Freddie Mac's official REO sales portal — 'First Look' program gives owner-occupants 20-day exclusive",
            "http_status": response.status_code,
        }

        if listing_count is not None:
            signal["listing_count"] = listing_count
            signal["listing_count_source"] = "extracted_from_html"

        if embedded:
            signal["embedded_keys"] = embedded.get("next_data_keys", [])

        # Check for any property-related text signals
        if re.search(r'no (?:homes?|properties|listings)\s+(?:found|available)', html, re.IGNORECASE):
            signal["availability_note"] = "Page indicates no listings found for this query"
        elif re.search(r'homes?|properties|foreclosures?', html, re.IGNORECASE):
            signal["availability_note"] = "Page contains property/homes references — may have active inventory"

        data.append(signal)

        return SourceResult(
            source=self.name,
            data=data,
            errors=errors,
            success=True,
        )
