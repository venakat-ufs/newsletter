from bs4 import BeautifulSoup

from config import get_settings
from services.pinchtab_client import get_pinchtab_cookie_header
from services.scrapling_client import fetch_with_stealth_retry
from services.sources.base import BaseSource, SourceResult

BASE_URL = "https://www.foreclosure.com"

STATE_PAGES = [
    "/listings/FL",
    "/listings/CA",
    "/listings/TX",
    "/listings/OH",
    "/listings/IL",
    "/listings/GA",
    "/listings/MI",
    "/listings/NJ",
    "/listings/PA",
    "/listings/AZ",
]


class ForeclosureScraper(BaseSource):
    """Scrapes foreclosure.com using Scrapling fetchers and an optional stealth retry."""

    name = "foreclosure_com"

    def collect(self) -> SourceResult:
        settings = get_settings()
        if not settings.foreclosure_com_enabled:
            return SourceResult(
                source=self.name,
                data=[],
                errors=["Foreclosure.com scraping disabled"],
                success=False,
            )

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "text/html,application/xhtml+xml",
        }
        if settings.foreclosure_com_cookie:
            headers["Cookie"] = settings.foreclosure_com_cookie

        all_data = []
        errors = []
        stop_early = False

        for page_path in STATE_PAGES:
            if stop_early:
                break

            url = f"{BASE_URL}{page_path}"
            page_headers = dict(headers)
            if settings.pinchtab_enabled and "Cookie" not in page_headers:
                cookie_header, pinchtab_errors = get_pinchtab_cookie_header(url)
                errors.extend(
                    f"Foreclosure.com {page_path}: {message}" for message in pinchtab_errors
                )
                if cookie_header:
                    page_headers["Cookie"] = cookie_header

            response, fetch_errors = fetch_with_stealth_retry(url, headers=page_headers)
            errors.extend(
                f"Foreclosure.com {page_path}: {message}" for message in fetch_errors
            )

            if any("playwright install" in message.lower() for message in fetch_errors):
                errors.append(
                    "Foreclosure.com stealth retry is unavailable because the browser runtime is not installed. "
                    "Stopping early instead of retrying every state."
                )
                stop_early = True

            if not response.ok:
                if response.error:
                    errors.append(f"Foreclosure.com {page_path} failed: {response.error}")
                elif response.status_code is not None:
                    errors.append(
                        f"Foreclosure.com {page_path} returned HTTP {response.status_code}"
                    )
                    if response.status_code == 403 and not all_data:
                        if not settings.foreclosure_com_cookie:
                            errors.append(
                                "Foreclosure.com likely requires a logged-in browser session. "
                                "Provide FORECLOSURE_COM_COOKIE to retry with Scrapling."
                            )
                        errors.append(
                            "Foreclosure.com is actively blocking the current runtime. "
                            "Stopping early after the first blocked page."
                        )
                        stop_early = True
                else:
                    errors.append(f"Foreclosure.com {page_path} returned no response body")
                continue

            soup = BeautifulSoup(response.text, "html.parser")
            state = page_path.split("/")[-1]

            listing_count = self._extract_listing_count(soup)
            top_counties = self._extract_top_counties(soup)

            all_data.append({
                "state": state,
                "url": response.url,
                "total_listings": listing_count,
                "top_counties": top_counties,
                "fetch_mode": response.mode,
            })

        if all_data:
            return SourceResult(
                source=self.name,
                data=all_data,
                errors=errors,
                success=True,
            )

        return SourceResult(
            source=self.name,
            data=[],
            errors=errors or ["Foreclosure.com scrape returned no data"],
            success=False,
        )

    def _extract_listing_count(self, soup: BeautifulSoup) -> int | None:
        """Try to extract total listing count from page."""
        count_el = soup.find("span", class_="results-count")
        if count_el:
            text = count_el.get_text(strip=True).replace(",", "")
            try:
                return int(text)
            except ValueError:
                pass

        heading = soup.find("h1")
        if heading:
            import re
            match = re.search(r"([\d,]+)\s+(?:Foreclosure|REO|Bank Owned)", heading.get_text())
            if match:
                return int(match.group(1).replace(",", ""))

        page_text = soup.get_text(" ", strip=True)
        import re
        for pattern in [
            r"([\d,]+)\s+(?:foreclosure|reo|bank owned|properties)\b",
            r"\b([\d,]+)\s+results\b",
            r"\bof\s+([\d,]+)\s+listings\b",
        ]:
            match = re.search(pattern, page_text, re.IGNORECASE)
            if match:
                try:
                    return int(match.group(1).replace(",", ""))
                except ValueError:
                    continue
        return None

    def _extract_top_counties(self, soup: BeautifulSoup) -> list[dict]:
        """Try to extract county-level data."""
        counties = []
        county_links = soup.select("a[href*='/listings/']")
        for link in county_links[:10]:
            text = link.get_text(strip=True)
            if "county" in text.lower() or "County" in text:
                counties.append({"name": text, "url": link.get("href", "")})
        return counties
