from __future__ import annotations

import json

from services.sources.base import BaseSource, SourceResult
from services.sources.reo_source_utils import (
    build_hud_search_url,
    build_property,
    clean_text,
    dedupe_properties,
    detect_status,
    fetch_with_fallback,
    log_step,
    parse_price,
    run_with_concurrency,
)


class USHUDSource(BaseSource):
    name = "ushud"

    SEARCH_AREAS = ["TX", "FL", "CA", "GA", "IL", "OH"]

    async def collect(self) -> SourceResult:
        log_step(self.name, "collect_start", search_areas=len(self.SEARCH_AREAS))

        errors: list[str] = []
        properties: list[dict] = []
        listings_count = 0

        tasks = [
            fetch_with_fallback(
                build_hud_search_url(search_area),
                failover_urls=[
                    f"https://www.hudhomestore.gov/searchresult?citystate={search_area.lower()}",
                ],
                wait_selector="#search_results_container, #request-verification-token",
                scroll=False,
                source=self.name,
                timeout_seconds=14,
                retries=2,
            )
            for search_area in self.SEARCH_AREAS
        ]
        responses = await run_with_concurrency(tasks, limit=4, timeout_seconds=22)

        for idx, response in enumerate(responses):
            search_area = self.SEARCH_AREAS[idx]

            if isinstance(response, Exception):
                errors.append(f"{search_area}: {response}")
                log_step(self.name, "area_exception", area=search_area, error=str(response), level="warning")
                continue

            if response.errors:
                errors.extend([f"{search_area}: {err}" for err in response.errors])

            if not response.text:
                continue

            area_properties = self._extract_available_properties(response.text)
            if not area_properties:
                log_step(self.name, "area_no_inventory", area=search_area)
                continue

            listings_count += len(area_properties)
            for item in area_properties:
                case_number = clean_text(str(item.get("propertyCaseNumber") or ""))
                details_url = (
                    f"https://www.hudhomestore.gov/PropertyDetails?caseNumber={case_number}"
                    if case_number
                    else response.url
                )
                properties.append(
                    build_property(
                        source=self.name,
                        address=item.get("propertyAddress"),
                        city=item.get("propertyCity"),
                        state=item.get("propertyState"),
                        zip_code=item.get("propertyZip"),
                        price=parse_price(item.get("listPrice")),
                        status=detect_status(
                            item.get("propertyStatusDesc") or item.get("propertyStatus"),
                            default="reo",
                        ),
                        url=details_url,
                        extra={
                            "case_number": case_number or None,
                            "county": clean_text(str(item.get("propertyCounty") or "")) or None,
                            "listing_period": clean_text(str(item.get("listingPeriod") or "")) or None,
                        },
                    )
                )

            log_step(
                self.name,
                "area_parsed",
                area=search_area,
                extracted=len(area_properties),
                mode=response.mode,
            )

        # Failover snapshot: if area queries fail, still attempt default searchresult page.
        if not properties:
            log_step(self.name, "global_failover_triggered")
            fallback_response = await fetch_with_fallback(
                "https://www.hudhomestore.gov/searchresult",
                wait_selector="#search_results_container, #request-verification-token",
                source=self.name,
                timeout_seconds=14,
                retries=2,
            )
            if fallback_response.errors:
                errors.extend([f"global failover: {err}" for err in fallback_response.errors])
            if fallback_response.text:
                fallback_items = self._extract_available_properties(fallback_response.text)
                listings_count += len(fallback_items)
                for item in fallback_items:
                    properties.append(
                        build_property(
                            source=self.name,
                            address=item.get("propertyAddress"),
                            city=item.get("propertyCity"),
                            state=item.get("propertyState"),
                            zip_code=item.get("propertyZip"),
                            price=parse_price(item.get("listPrice")),
                            status=detect_status(
                                item.get("propertyStatusDesc") or item.get("propertyStatus"),
                                default="reo",
                            ),
                            url=fallback_response.url,
                            extra={
                                "case_number": clean_text(str(item.get("propertyCaseNumber") or "")) or None,
                            },
                        )
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

    def _extract_available_properties(self, html: str) -> list[dict]:
        try:
            from bs4 import BeautifulSoup
        except Exception:
            return []

        soup = BeautifulSoup(html, "html.parser")
        input_node = soup.select_one("#available_prop")
        if input_node is None:
            return []

        raw_value = input_node.get("value") or "[]"
        raw_value = raw_value.strip()
        if raw_value in {"", "null"}:
            return []

        try:
            parsed = json.loads(raw_value)
        except json.JSONDecodeError:
            return []

        if not isinstance(parsed, list):
            return []

        return [item for item in parsed if isinstance(item, dict)]
