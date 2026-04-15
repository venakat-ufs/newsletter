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


class RealtorForeclosureSource(BaseSource):
    name = "realtor_foreclosures"

    API_CANDIDATES = [
        {
            "url": "https://www.realtor.com/api/v1/rdc_search_srp",
            "params": {
                "client_id": "rdc-search-for-sale-search",
                "schema": "vesta",
                "limit": 50,
                "offset": 0,
                "status": "for_sale",
                "foreclosure": "true",
                "city": "Houston",
                "state_code": "TX",
                "sort": "relevance",
            },
        },
        {
            "url": "https://www.realtor.com/api/v1/rdc_search_srp",
            "params": {
                "client_id": "rdc-search-for-sale-search",
                "schema": "vesta",
                "limit": 50,
                "offset": 0,
                "status": "for_sale",
                "foreclosure": "true",
                "state_code": "FL",
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
                params=candidate["params"],
                headers={
                    "Accept": "application/json",
                    "Referer": "https://www.realtor.com/realestateandhomes-search/Texas/type-foreclosure",
                },
                source=self.name,
                timeout_seconds=12,
                retries=2,
            )
            for candidate in self.API_CANDIDATES
        ]
        api_results = await run_with_concurrency(api_tasks, limit=2, timeout_seconds=18)

        for idx, result in enumerate(api_results):
            candidate = self.API_CANDIDATES[idx]
            if isinstance(result, Exception):
                errors.append(f"hidden api {candidate['url']}: {result}")
                log_step(self.name, "api_exception", url=candidate["url"], error=str(result), level="warning")
                continue

            if result.errors:
                errors.extend([f"hidden api: {err}" for err in result.errors])

            if result.ok and result.json_data is not None:
                props, total = self._extract_from_api(result.json_data)
                properties.extend(props)
                if total is not None:
                    listings_count = total
                log_step(self.name, "api_parsed", url=result.url, extracted=len(props), listings_count=total)
                if props:
                    break

        if not properties:
            log_step(self.name, "fallback_to_browser")
            page = await fetch_with_fallback(
                "https://www.realtor.com/realestateandhomes-search/Texas/type-foreclosure",
                failover_urls=[
                    "https://www.realtor.com/realestateandhomes-search/Florida/type-foreclosure",
                    "https://www.realtor.com/realestateandhomes-search?status=foreclosure",
                ],
                wait_selectors=[
                    "section[data-testid='property-list-container'], [data-testid='property-card'], li[data-testid*='result-card']",
                    "section[data-testid='property-list-container'], [data-testid='property-card'], li[data-testid*='result-card']",
                    "script#__NEXT_DATA__",
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
                    packet_props, packet_count = self._extract_from_api(packet.get("payload"))
                    properties.extend(packet_props)
                    if packet_count is not None:
                        listings_count = packet_count

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
                for key in ["count", "total", "total_count", "matching_rows"]:
                    if key in node and isinstance(node[key], (int, float)):
                        total_count = int(node[key])

                has_location = any(k in node for k in ["location", "address", "line", "city"])
                has_price = any(k in node for k in ["price", "list_price", "price_raw"])
                if has_location and has_price:
                    location = node.get("location") if isinstance(node.get("location"), dict) else {}
                    address_obj = location.get("address") if isinstance(location, dict) else {}
                    if not isinstance(address_obj, dict):
                        address_obj = {}

                    address_line = (
                        address_obj.get("line")
                        or node.get("address")
                        or node.get("street_name")
                        or node.get("line")
                    )
                    city = address_obj.get("city") or node.get("city")
                    state = address_obj.get("state_code") or node.get("state_code") or node.get("state")
                    postal_code = address_obj.get("postal_code") or node.get("postal_code")
                    price = parse_price(
                        node.get("price")
                        or node.get("list_price")
                        or node.get("price_raw")
                        or node.get("list_price_min")
                    )
                    status = detect_status(
                        node.get("listing_status")
                        or node.get("status")
                        or node.get("flags"),
                        default="foreclosure",
                    )
                    url = clean_text(
                        str(
                            node.get("href")
                            or node.get("permalink")
                            or node.get("url")
                            or ""
                        )
                    )

                    records.append(
                        build_property(
                            source=self.name,
                            address=address_line,
                            city=city,
                            state=state,
                            zip_code=postal_code,
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
                from_next, next_total = self._extract_from_api(parsed)
                records.extend(from_next)
                log_step(self.name, "next_data_parsed", extracted=len(from_next), next_total=next_total)
            except Exception:
                pass

        selectors = [
            "[data-testid='property-card']",
            "li[data-testid*='result-card']",
            "section[data-testid='property-list-container'] li",
        ]

        for selector in selectors:
            for card in soup.select(selector):
                text = clean_text(card.get_text(" ", strip=True))
                if not text:
                    continue

                address = None
                heading = card.find(["h2", "h3", "h4"], string=True)
                if heading:
                    address = clean_text(heading.get_text(" ", strip=True))

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

            if records:
                break

        return records
