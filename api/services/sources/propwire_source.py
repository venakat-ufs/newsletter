from __future__ import annotations

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


class PropwireSource(BaseSource):
    name = "propwire"

    API_CANDIDATES = [
        {
            "method": "POST",
            "url": "https://propwire.com/api/search/properties",
            "json_body": {
                "property_status": ["foreclosure", "reo", "auction"],
                "page": 1,
                "per_page": 50,
            },
        },
        {
            "method": "GET",
            "url": "https://propwire.com/api/properties/search",
            "params": {
                "status": "foreclosure",
                "limit": 50,
                "page": 1,
            },
        },
        {
            "method": "GET",
            "url": "https://api.propwire.com/v1/properties/search",
            "params": {
                "status": "foreclosure",
                "per_page": 50,
            },
        },
    ]

    async def collect(self) -> SourceResult:
        log_step(self.name, "collect_start", api_candidates=len(self.API_CANDIDATES))

        errors: list[str] = []
        properties: list[dict[str, Any]] = []
        listings_count: int | None = None

        probe_tasks = [
            fetch_with_requests(
                candidate["url"],
                method=candidate.get("method", "GET"),
                params=candidate.get("params"),
                json_body=candidate.get("json_body"),
                headers={"Accept": "application/json"},
                source=self.name,
                timeout_seconds=14,
                retries=2,
            )
            for candidate in self.API_CANDIDATES
        ]
        probe_results = await run_with_concurrency(probe_tasks, limit=3, timeout_seconds=18)

        for idx, result in enumerate(probe_results):
            candidate = self.API_CANDIDATES[idx]
            if isinstance(result, Exception):
                err = f"api probe {candidate['url']} raised: {result}"
                errors.append(err)
                log_step(self.name, "api_probe_exception", url=candidate["url"], error=str(result), level="warning")
                continue

            if result.errors:
                errors.extend([f"api probe {candidate['url']}: {err}" for err in result.errors])

            if not result.ok or result.json_data is None:
                continue

            extracted_properties, api_count = self._extract_from_api_payload(result.json_data)
            properties.extend(extracted_properties)
            if api_count is not None:
                listings_count = api_count

            log_step(
                self.name,
                "api_probe_success",
                url=candidate["url"],
                extracted=len(extracted_properties),
                listings_count=api_count,
            )

            if extracted_properties:
                break

        if not properties:
            log_step(self.name, "fallback_to_browser")
            page = await fetch_with_fallback(
                "https://propwire.com/search/foreclosure",
                failover_urls=[
                    "https://propwire.com/foreclosures",
                    "https://propwire.com/search",
                ],
                wait_selectors=[
                    "div[class*='property'], article, [data-testid*='property']",
                    "div[class*='property'], article, [data-testid*='property']",
                    "div[class*='property'], article, [data-testid*='property']",
                ],
                scroll=True,
                headers={"Accept": "text/html,application/json"},
                source=self.name,
                timeout_seconds=16,
                retries=2,
            )
            if page.errors:
                errors.extend([f"browser fallback: {err}" for err in page.errors])

            if page.network_json:
                for network_payload in page.network_json:
                    extracted_properties, api_count = self._extract_from_api_payload(
                        network_payload.get("payload")
                    )
                    properties.extend(extracted_properties)
                    if api_count is not None:
                        listings_count = api_count

            if page.text:
                properties.extend(self._extract_from_html(page.text, page.url))

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

    def _extract_from_api_payload(self, payload: Any) -> tuple[list[dict[str, Any]], int | None]:
        records: list[dict[str, Any]] = []
        listings_count: int | None = None

        def walk(node: Any):
            nonlocal listings_count
            if isinstance(node, dict):
                for count_key in ["total", "total_count", "count", "recordsTotal"]:
                    if count_key in node and isinstance(node[count_key], (int, float)):
                        listings_count = int(node[count_key])

                looks_like_property = any(
                    key in node for key in ["address", "property_address", "full_address"]
                ) and any(key in node for key in ["city", "state", "price", "list_price"])

                if looks_like_property:
                    address = (
                        node.get("address")
                        or node.get("property_address")
                        or node.get("full_address")
                        or node.get("street")
                    )
                    city = node.get("city")
                    state = node.get("state") or node.get("state_code")
                    price = parse_price(node.get("price") or node.get("list_price") or node.get("asking_price"))
                    status = detect_status(
                        node.get("status")
                        or node.get("listing_status")
                        or node.get("property_status"),
                        default="foreclosure",
                    )
                    url = clean_text(
                        str(
                            node.get("url")
                            or node.get("detail_url")
                            or node.get("property_url")
                            or ""
                        )
                    )
                    records.append(
                        build_property(
                            source=self.name,
                            address=address,
                            city=city,
                            state=state,
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
        return records, listings_count

    def _extract_from_html(self, html: str, base_url: str) -> list[dict[str, Any]]:
        try:
            from bs4 import BeautifulSoup
        except Exception:
            return []

        soup = BeautifulSoup(html, "html.parser")
        records: list[dict[str, Any]] = []

        selectors = [
            "div[class*='property-card']",
            "div[class*='listing-card']",
            "article",
            "[data-testid*='property']",
        ]

        seen_nodes: set[int] = set()
        for selector in selectors:
            for card in soup.select(selector):
                if id(card) in seen_nodes:
                    continue
                seen_nodes.add(id(card))
                text = clean_text(card.get_text(" ", strip=True))
                city, state, _ = extract_city_state_zip(text)
                address = None
                for attr in ["data-address", "aria-label", "title"]:
                    if card.get(attr):
                        address = clean_text(card.get(attr))
                        break
                if not address:
                    heading = card.find(["h2", "h3", "h4"])
                    if heading:
                        address = clean_text(heading.get_text(" ", strip=True))
                anchor = card.find("a", href=True)
                url = anchor["href"] if anchor else base_url
                records.append(
                    build_property(
                        source=self.name,
                        address=address,
                        city=city,
                        state=state,
                        price=parse_price(text),
                        status=detect_status(text, default="foreclosure"),
                        url=url,
                    )
                )

        return records
