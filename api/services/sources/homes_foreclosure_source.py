from __future__ import annotations

import json
from typing import Any

from services.sources.base import BaseSource, SourceResult
from services.sources.reo_source_utils import (
    build_property,
    clean_text,
    dedupe_properties,
    detect_status,
    extract_city_state_zip,
    fetch_with_fallback,
    fetch_with_requests,
    log_step,
    parse_price,
    run_with_concurrency,
)


class HomesForeclosureSource(BaseSource):
    name = "homes_foreclosures"

    API_CANDIDATES = [
        {
            "url": "https://www.homes.com/api/search/listings",
            "params": {
                "for_sale": "true",
                "listing_type": "foreclosure",
                "limit": 50,
            },
        },
        {
            "url": "https://www.homes.com/api/v1/search",
            "params": {
                "query": "foreclosure",
                "limit": 50,
            },
        },
    ]

    async def collect(self) -> SourceResult:
        log_step(self.name, "collect_start", api_candidates=len(self.API_CANDIDATES))

        errors: list[str] = []
        properties: list[dict[str, Any]] = []
        listings_count: int | None = None

        api_tasks = [
            fetch_with_requests(
                candidate["url"],
                params=candidate.get("params"),
                headers={"Accept": "application/json"},
                source=self.name,
                timeout_seconds=12,
                retries=2,
            )
            for candidate in self.API_CANDIDATES
        ]
        api_results = await run_with_concurrency(api_tasks, limit=2, timeout_seconds=16)

        for idx, result in enumerate(api_results):
            candidate = self.API_CANDIDATES[idx]
            if isinstance(result, Exception):
                errors.append(f"api {candidate['url']}: {result}")
                log_step(self.name, "api_exception", url=candidate["url"], error=str(result), level="warning")
                continue

            if result.errors:
                errors.extend([f"api {candidate['url']}: {err}" for err in result.errors])
            if not result.ok or result.json_data is None:
                continue

            props, count = self._extract_from_api(result.json_data)
            properties.extend(props)
            if count is not None:
                listings_count = count
            log_step(self.name, "api_parsed", url=result.url, extracted=len(props), listings_count=count)
            if props:
                break

        if not properties:
            log_step(self.name, "fallback_to_browser")
            page = await fetch_with_fallback(
                "https://www.homes.com/for-sale/foreclosures/",
                failover_urls=[
                    "https://www.homes.com/for-sale/",
                    "https://www.homes.com/",
                ],
                wait_selectors=[
                    "[data-testid='listing-card'], article, div[class*='listing-card'], div[class*='property-card']",
                    "script#__NEXT_DATA__, main",
                    "script#__NEXT_DATA__, body",
                ],
                scroll=True,
                headers={"Accept": "text/html,application/json"},
                source=self.name,
                timeout_seconds=14,
                retries=2,
            )
            if page.errors:
                errors.extend([f"playwright: {err}" for err in page.errors])

            if page.network_json:
                for packet in page.network_json:
                    props, count = self._extract_from_api(packet.get("payload"))
                    properties.extend(props)
                    if count is not None:
                        listings_count = count

            if page.text:
                html_props = self._extract_from_html(page.text, page.url)
                properties.extend(html_props)
                log_step(self.name, "html_parsed", extracted=len(html_props), mode=page.mode)

        deduped = dedupe_properties(properties, limit=50)
        if listings_count is None:
            listings_count = len(deduped)

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

    def _extract_from_api(self, payload: Any) -> tuple[list[dict[str, Any]], int | None]:
        records: list[dict[str, Any]] = []
        total_count: int | None = None

        def walk(node: Any):
            nonlocal total_count
            if isinstance(node, dict):
                for key in ["count", "total", "total_count", "num_results"]:
                    if key in node and isinstance(node[key], (int, float)):
                        total_count = int(node[key])

                has_address = any(key in node for key in ["address", "street", "full_address", "line"])
                has_price = any(key in node for key in ["price", "list_price", "asking_price"])
                if has_address and has_price:
                    address_obj = node.get("address") if isinstance(node.get("address"), dict) else {}
                    address_line = (
                        address_obj.get("line")
                        or node.get("full_address")
                        or node.get("street")
                        or node.get("line")
                        or node.get("address")
                    )
                    city = address_obj.get("city") or node.get("city")
                    state = address_obj.get("state") or address_obj.get("state_code") or node.get("state")
                    zip_code = address_obj.get("postal_code") or node.get("zip")
                    price = parse_price(
                        node.get("price")
                        or node.get("list_price")
                        or node.get("asking_price")
                    )
                    status = detect_status(
                        node.get("status") or node.get("listing_type") or "foreclosure",
                        default="foreclosure",
                    )
                    url = clean_text(
                        str(
                            node.get("url")
                            or node.get("href")
                            or node.get("permalink")
                            or ""
                        )
                    )
                    records.append(
                        build_property(
                            source=self.name,
                            address=address_line,
                            city=city,
                            state=state,
                            zip_code=zip_code,
                            price=price,
                            status=status,
                            url=url,
                        )
                    )

                for value in node.values():
                    walk(value)
            elif isinstance(node, list):
                for value in node:
                    walk(value)

        walk(payload)
        return records, total_count

    def _extract_from_html(self, html: str, base_url: str) -> list[dict[str, Any]]:
        try:
            from bs4 import BeautifulSoup
        except Exception:
            return []

        soup = BeautifulSoup(html, "html.parser")
        records: list[dict[str, Any]] = []

        next_data = soup.select_one("script#__NEXT_DATA__")
        if next_data and next_data.string:
            try:
                parsed = json.loads(next_data.string)
                from_next, _ = self._extract_from_api(parsed)
                records.extend(from_next)
            except Exception:
                pass

        for card in soup.select(
            "[data-testid='listing-card'], article, div[class*='listing-card'], div[class*='property-card']"
        ):
            text = clean_text(card.get_text(" ", strip=True))
            if not text:
                continue

            heading = card.find(["h2", "h3", "h4"])
            address = clean_text(heading.get_text(" ", strip=True)) if heading else None
            city, state, zip_code = extract_city_state_zip(text)
            link = card.find("a", href=True)
            href = link.get("href") if link else ""

            records.append(
                build_property(
                    source=self.name,
                    address=address,
                    city=city,
                    state=state,
                    zip_code=zip_code,
                    price=parse_price(text),
                    status=detect_status(text, default="foreclosure"),
                    url=href or base_url,
                )
            )

        return records
