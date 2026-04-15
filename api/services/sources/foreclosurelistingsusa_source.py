from __future__ import annotations

import re
from typing import Any

from services.sources.base import BaseSource, SourceResult
from services.sources.reo_source_utils import (
    absolutize_url,
    build_property,
    clean_text,
    dedupe_properties,
    detect_status,
    extract_city_state_zip,
    fetch_with_fallback,
    log_step,
    parse_price,
    run_with_concurrency,
)


class ForeclosureListingsUSASource(BaseSource):
    name = "foreclosure_listings_usa"

    TARGET_PAGES = [
        "https://www.foreclosurelistings.com/",
        "https://www.foreclosurelistings.com/list/TX/",
        "https://www.foreclosurelistings.com/list/FL/",
        "https://www.foreclosurelistings.com/list/CA/",
        "https://www.foreclosurelistings.com/list/TX/HARRIS/HOUSTON/",
    ]

    async def collect(self) -> SourceResult:
        log_step(self.name, "collect_start", pages=len(self.TARGET_PAGES))

        errors: list[str] = []
        properties: list[dict[str, Any]] = []
        counts: list[int] = []

        tasks = [
            fetch_with_fallback(
                page_url,
                wait_selector="div.property, #carouselLatestHomes, div.details",
                scroll=True,
                source=self.name,
                timeout_seconds=14,
                retries=2,
            )
            for page_url in self.TARGET_PAGES
        ]
        responses = await run_with_concurrency(tasks, limit=3, timeout_seconds=24)

        for idx, response in enumerate(responses):
            page_url = self.TARGET_PAGES[idx]
            if isinstance(response, Exception):
                errors.append(f"{page_url}: {response}")
                log_step(self.name, "page_exception", url=page_url, error=str(response), level="warning")
                continue

            if response.errors:
                errors.extend([f"{page_url}: {err}" for err in response.errors])

            if not response.text:
                continue

            page_props = self._extract_properties(response.text, response.url)
            page_counts = self._extract_counts(response.text)
            properties.extend(page_props)
            counts.extend(page_counts)

            log_step(
                self.name,
                "page_parsed",
                url=response.url,
                extracted_properties=len(page_props),
                count_signals=len(page_counts),
                mode=response.mode,
            )

        deduped = dedupe_properties(properties, limit=50)
        listings_count = max(counts) if counts else len(deduped)

        payload = {
            "source": self.name,
            "listings_count": int(listings_count),
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

    def _extract_counts(self, html: str) -> list[int]:
        counts: list[int] = []
        patterns = [
            r"([\d,]+)\s+foreclosure",
            r"([\d,]+)\s+properties",
            r"Showing\s+\d+\s*-\s*\d+\s+of\s+([\d,]+)",
            r"([\d,]+)\s+results",
        ]
        for pattern in patterns:
            for match in re.findall(pattern, html, re.IGNORECASE):
                if isinstance(match, tuple):
                    match = match[0]
                digits = re.sub(r"[^\d]", "", str(match))
                if not digits:
                    continue
                try:
                    counts.append(int(digits))
                except ValueError:
                    continue
        return counts

    def _extract_properties(self, html: str, base_url: str) -> list[dict[str, Any]]:
        try:
            from bs4 import BeautifulSoup
        except Exception:
            return []

        soup = BeautifulSoup(html, "html.parser")
        records: list[dict[str, Any]] = []

        for card in soup.select("div.property"):
            text = clean_text(card.get_text(" ", strip=True))

            details = card.select_one("div.details")
            details_text = clean_text(details.get_text(" ", strip=True)) if details else text
            city, state, zip_code = extract_city_state_zip(details_text)

            link = card.select_one("a[href]")
            href = link.get("href") if link else ""
            url = absolutize_url(base_url, href)

            image = card.select_one("img[alt]")
            address = clean_text(image.get("alt")) if image and image.get("alt") else None

            status_label = ""
            if details:
                status_col = details.select_one("div.col-auto")
                if status_col:
                    status_label = status_col.get_text(" ", strip=True)
            if not status_label:
                status_label = details_text

            records.append(
                build_property(
                    source=self.name,
                    address=address,
                    city=city,
                    state=state,
                    zip_code=zip_code,
                    price=parse_price(details_text),
                    status=detect_status(status_label, default="foreclosure"),
                    url=url,
                )
            )

        if not records:
            for anchor in soup.select("a[href*='foreclosure-listing'], a[href*='pre-foreclosure-listing']"):
                href = anchor.get("href")
                if not href:
                    continue
                text = clean_text(anchor.get_text(" ", strip=True))
                city, state, zip_code = extract_city_state_zip(text)
                records.append(
                    build_property(
                        source=self.name,
                        address=text or None,
                        city=city,
                        state=state,
                        zip_code=zip_code,
                        price=parse_price(text),
                        status=detect_status(href, default="foreclosure"),
                        url=absolutize_url(base_url, href),
                    )
                )

        return records
