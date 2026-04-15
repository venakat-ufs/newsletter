from __future__ import annotations

import re
from typing import Any

from services.sources.base import BaseSource, SourceResult
from services.sources.reo_source_utils import (
    build_property,
    clean_text,
    dedupe_properties,
    detect_status,
    extract_city_state_zip,
    fetch_with_fallback,
    log_step,
    parse_price,
)


class ForeclosureRoverSource(BaseSource):
    name = "foreclosure_rover"

    async def collect(self) -> SourceResult:
        log_step(self.name, "collect_start")

        errors: list[str] = []
        properties: list[dict[str, Any]] = []

        response = await fetch_with_fallback(
            "http://www.foreclosurerover.com/",
            failover_urls=[
                "http://foreclosurerover.com/",
                "http://www.foreclosurerover.com/foreclosure_homes.asp",
            ],
            wait_selector="map area[href*='foreclosures.asp'], .foreclosures",
            scroll=False,
            verify=False,
            source=self.name,
            timeout_seconds=12,
            retries=2,
        )
        if response.errors:
            errors.extend(response.errors)

        if not response.text:
            log_step(self.name, "collect_empty", errors=len(errors), level="warning")
            return SourceResult(
                source=self.name,
                data=[{"source": self.name, "listings_count": 0, "properties": []}],
                errors=errors or ["ForeclosureRover returned empty response"],
                success=False,
            )

        properties.extend(self._extract_featured_properties(response.text, response.url))
        state_links = self._extract_state_links(response.text)

        for state_code, state_url in state_links[:20]:
            properties.append(
                build_property(
                    source=self.name,
                    address=f"Foreclosure inventory in {state_code}",
                    city=None,
                    state=state_code,
                    price=None,
                    status="foreclosure",
                    url=state_url,
                    extra={"notes": "inventory gated behind signup"},
                )
            )

        deduped = dedupe_properties(properties, limit=50)
        listings_count = len(state_links) if state_links else len(deduped)

        payload = {
            "source": self.name,
            "listings_count": listings_count,
            "properties": deduped,
            "status": "ok" if deduped else "degraded",
        }

        log_step(
            self.name,
            "collect_done",
            listings_count=listings_count,
            properties=len(deduped),
            errors=len(errors),
        )

        return SourceResult(
            source=self.name,
            data=[payload],
            errors=errors,
            success=bool(deduped),
        )

    def _extract_featured_properties(self, html: str, base_url: str) -> list[dict[str, Any]]:
        records: list[dict[str, Any]] = []

        featured_pattern = re.compile(
            r"City:\s*(?P<city>[^<\n]+)<br>\s*"
            r"State:\s*(?P<state>[^<\n]+)<br>\s*"
            r"Zip:\s*(?P<zip>\d{5})<br>\s*"
            r"Appraised:\s*(?P<appraised>\$[\d,]+)<br>\s*"
            r"Bid Price:\s*(?P<bid>\$[\d,]+)",
            re.IGNORECASE,
        )

        for match in featured_pattern.finditer(html):
            city = clean_text(match.group("city"))
            state_raw = clean_text(match.group("state"))
            state = state_raw[:2].upper() if state_raw else None
            zip_code = clean_text(match.group("zip"))
            appraised_price = parse_price(match.group("appraised"))
            bid_price = parse_price(match.group("bid"))
            records.append(
                build_property(
                    source=self.name,
                    address=f"Featured listing, {city}",
                    city=city,
                    state=state,
                    zip_code=zip_code,
                    price=bid_price or appraised_price,
                    status="foreclosure",
                    url=base_url,
                    extra={
                        "appraised_price": appraised_price,
                        "bid_price": bid_price,
                    },
                )
            )

        if not records:
            text = clean_text(re.sub(r"<[^>]+>", " ", html))
            city, state, zip_code = extract_city_state_zip(text)
            price = parse_price(text)
            if city or state or price:
                records.append(
                    build_property(
                        source=self.name,
                        address=f"Foreclosure Rover sample listing ({city or 'N/A'})",
                        city=city,
                        state=state,
                        zip_code=zip_code,
                        price=price,
                        status=detect_status(text, default="foreclosure"),
                        url=base_url,
                    )
                )

        return records

    def _extract_state_links(self, html: str) -> list[tuple[str, str]]:
        links: list[tuple[str, str]] = []
        for state_code in re.findall(
            r"foreclosures\.asp\?[^\"'\s>]*state=([A-Z]{2})",
            html,
            re.IGNORECASE,
        ):
            normalized_state = state_code.upper()
            state_url = (
                "http://www.foreclosurerover.com/foreclosures.asp?"
                f"MinPrice=5000&MaxPrice=7000000&Type=Foreclosures&state={normalized_state}"
            )
            links.append((normalized_state, state_url))

        unique: list[tuple[str, str]] = []
        seen: set[str] = set()
        for state_code, state_url in links:
            if state_code in seen:
                continue
            seen.add(state_code)
            unique.append((state_code, state_url))
        return unique
