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


class BankForeclosuresSaleSource(BaseSource):
    name = "bank_foreclosures_sale"

    TARGET_PAGES = [
        "https://www.bankforeclosuressale.com/foreclosure-listings/",
        "https://www.bankforeclosuressale.com/foreclosure-listings/texas/",
        "https://www.bankforeclosuressale.com/foreclosure-listings/florida/",
        "https://www.bankforeclosuressale.com/foreclosure-listings/california/",
        "https://www.bankforeclosuressale.com/foreclosure-listings/texas/harris/houston/",
    ]

    async def collect(self) -> SourceResult:
        log_step(self.name, "collect_start", pages=len(self.TARGET_PAGES))

        errors: list[str] = []
        properties: list[dict[str, Any]] = []
        listings_count = 0

        tasks = [
            fetch_with_fallback(
                page_url,
                failover_urls=[page_url.rstrip("/")],
                wait_selector="div.item-wrap, div.property-item, h2.property-title",
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

            page_properties = self._extract_properties(response.text, response.url)
            listings_count += len(page_properties)
            properties.extend(page_properties)

            log_step(
                self.name,
                "page_parsed",
                url=response.url,
                extracted=len(page_properties),
                mode=response.mode,
            )

        deduped = dedupe_properties(properties, limit=50)
        payload = {
            "source": self.name,
            "listings_count": listings_count or len(deduped),
            "properties": deduped,
            "status": "ok" if deduped else "degraded",
        }

        log_step(
            self.name,
            "collect_done",
            listings_count=payload["listings_count"],
            properties=len(deduped),
            errors=len(errors),
        )

        return SourceResult(
            source=self.name,
            data=[payload],
            errors=errors,
            success=bool(deduped),
        )

    def _extract_properties(self, html: str, base_url: str) -> list[dict[str, Any]]:
        try:
            from bs4 import BeautifulSoup
        except Exception:
            return []

        soup = BeautifulSoup(html, "html.parser")
        records: list[dict[str, Any]] = []

        for card in soup.select("div.item-wrap div.property-item"):
            card_text = clean_text(card.get_text(" ", strip=True))
            price = parse_price(card_text)

            title_link = card.select_one("h2.property-title a[href]")
            location_text = clean_text(title_link.get_text(" ", strip=True)) if title_link else card_text
            city, state, zip_code = extract_city_state_zip(location_text)

            url = ""
            details_link = card.select_one("a.btn-primary[href]")
            if details_link and details_link.get("href"):
                url = absolutize_url(base_url, details_link.get("href"))
            elif title_link and title_link.get("href"):
                url = absolutize_url(base_url, title_link.get("href"))

            status_text = "foreclosure"
            script_link = card.select_one("a.hover-effect[href]")
            if script_link and script_link.get("href"):
                status_text = script_link.get("href")

            records.append(
                build_property(
                    source=self.name,
                    address=location_text,
                    city=city,
                    state=state,
                    zip_code=zip_code,
                    price=price,
                    status=detect_status(status_text, default="foreclosure"),
                    url=url,
                )
            )

        for path in re.findall(r"/(?:pre-foreclosure|foreclosure-listing)/[^\"'\s]+", html):
            full_url = absolutize_url(base_url, path)
            slug = path.split("/")[-2] if path.endswith("/") else path.split("/")[-1]
            slug_text = slug.replace("-", " ")
            city, state, zip_code = extract_city_state_zip(slug_text)
            records.append(
                build_property(
                    source=self.name,
                    address=slug_text,
                    city=city,
                    state=state,
                    zip_code=zip_code,
                    price=None,
                    status=detect_status(path, default="foreclosure"),
                    url=full_url,
                )
            )

        return records
