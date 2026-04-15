from __future__ import annotations

import re
from typing import Any

from services.sources.base import BaseSource, SourceResult
from services.sources.reo_source_utils import (
    aggregate_banks,
    build_property,
    clean_text,
    dedupe_properties,
    detect_status,
    extract_bank_mentions,
    extract_city_state_zip,
    fetch_with_fallback,
    fetch_with_requests,
    log_step,
    parse_price,
    run_with_concurrency,
)


class CountySource(BaseSource):
    """Generic county foreclosure auction engine.

    Expected normalized payload:
    {
      "source": "county_x",
      "listings_count": int,
      "top_banks": {},
      "properties": []
    }
    """

    def __init__(
        self,
        *,
        source_name: str,
        url: str,
        api_endpoint: str | None = None,
        api_params: dict[str, Any] | None = None,
    ):
        self.name = source_name
        self.url = url
        self.api_endpoint = api_endpoint
        self.api_params = api_params or {}

    async def collect(self) -> SourceResult:
        log_step(self.name, "collect_start", url=self.url, has_api=bool(self.api_endpoint))

        errors: list[str] = []
        properties: list[dict[str, Any]] = []

        tasks = [
            fetch_with_fallback(
                self.url,
                failover_urls=[self.url.replace("https://", "http://")],
                wait_selector="table tr, .auction-item, [class*='auction'], [class*='foreclosure']",
                scroll=True,
                source=self.name,
                timeout_seconds=14,
                retries=2,
            )
        ]
        if self.api_endpoint:
            tasks.append(
                fetch_with_requests(
                    self.api_endpoint,
                    params=self.api_params,
                    headers={"Accept": "application/json"},
                    source=self.name,
                    timeout_seconds=12,
                    retries=2,
                )
            )

        responses = await run_with_concurrency(tasks, limit=2, timeout_seconds=22)

        html_response = None
        api_response = None

        if responses:
            html_response = responses[0]
        if self.api_endpoint and len(responses) > 1:
            api_response = responses[1]

        if isinstance(api_response, Exception):
            errors.append(f"api exception: {api_response}")
            log_step(self.name, "api_exception", error=str(api_response), level="warning")
        elif api_response is not None:
            if api_response.errors:
                errors.extend([f"api: {err}" for err in api_response.errors])
            if api_response.ok and api_response.json_data is not None:
                api_props = self._extract_from_api(api_response.json_data)
                properties.extend(api_props)
                log_step(self.name, "api_parsed", extracted=len(api_props), url=api_response.url)

        if isinstance(html_response, Exception):
            errors.append(f"html exception: {html_response}")
            log_step(self.name, "html_exception", error=str(html_response), level="warning")
        elif html_response is not None:
            if html_response.errors:
                errors.extend([f"html: {err}" for err in html_response.errors])
            if html_response.text:
                html_props = self._extract_from_html(html_response.text, html_response.url)
                properties.extend(html_props)
                log_step(self.name, "html_parsed", extracted=len(html_props), url=html_response.url, mode=html_response.mode)

        deduped = dedupe_properties(properties, limit=50)

        top_banks = aggregate_banks(deduped)
        if not top_banks:
            bank_counter: dict[str, int] = {}
            for item in deduped:
                blob = clean_text(
                    " ".join(
                        [
                            str(item.get("address") or ""),
                            str(item.get("status") or ""),
                            str(item.get("url") or ""),
                            str(item.get("notes") or ""),
                        ]
                    )
                )
                for bank in extract_bank_mentions(blob):
                    bank_counter[bank] = bank_counter.get(bank, 0) + 1
            top_banks = bank_counter

        payload = {
            "source": self.name,
            "listings_count": len(deduped),
            "top_banks": top_banks,
            "properties": deduped,
        }

        log_step(
            self.name,
            "collect_done",
            listings_count=len(deduped),
            top_banks=len(top_banks),
            errors=len(errors),
        )

        return SourceResult(
            source=self.name,
            data=[payload],
            errors=errors,
            success=bool(deduped),
        )

    def _extract_from_api(self, payload: Any) -> list[dict[str, Any]]:
        records: list[dict[str, Any]] = []

        def walk(node: Any):
            if isinstance(node, dict):
                address = (
                    node.get("address")
                    or node.get("property_address")
                    or node.get("street")
                    or node.get("full_address")
                )
                city = node.get("city")
                state = node.get("state") or node.get("state_code")
                status = node.get("status") or node.get("auction_status") or "auction"
                url = clean_text(str(node.get("url") or node.get("detail_url") or self.url))
                price = parse_price(node.get("price") or node.get("opening_bid") or node.get("amount"))
                bank_name = (
                    node.get("bank")
                    or node.get("lender")
                    or node.get("plaintiff")
                    or node.get("creditor")
                )

                if address or city or state or price:
                    records.append(
                        build_property(
                            source=self.name,
                            address=address,
                            city=city,
                            state=state,
                            price=price,
                            status=detect_status(status, default="auction"),
                            url=url,
                            bank_name=bank_name,
                        )
                    )

                for value in node.values():
                    walk(value)
            elif isinstance(node, list):
                for value in node:
                    walk(value)

        walk(payload)
        return records

    def _extract_from_html(self, html: str, base_url: str) -> list[dict[str, Any]]:
        try:
            from bs4 import BeautifulSoup
        except Exception:
            return []

        soup = BeautifulSoup(html, "html.parser")
        records: list[dict[str, Any]] = []

        for row in soup.select("table tr, .auction-item, .auction-row, [class*='auction'], [class*='foreclosure']"):
            text = clean_text(row.get_text(" ", strip=True))
            if not text or len(text) < 8:
                continue

            city, state, zip_code = extract_city_state_zip(text)
            anchor = row.find("a", href=True)
            href = anchor.get("href") if anchor else base_url
            bank_name = None
            for bank in extract_bank_mentions(text):
                bank_name = bank
                break

            records.append(
                build_property(
                    source=self.name,
                    address=text[:160],
                    city=city,
                    state=state,
                    zip_code=zip_code,
                    price=parse_price(text),
                    status=detect_status(text, default="auction"),
                    url=href,
                    bank_name=bank_name,
                    extra={
                        "notes": text[:260],
                    },
                )
            )

        if not records:
            for anchor in soup.select("a[href]"):
                href = anchor.get("href") or ""
                text = clean_text(anchor.get_text(" ", strip=True))
                if not href:
                    continue
                if not any(token in href.lower() for token in ["auction", "foreclosure", "sale", "property"]):
                    continue
                city, state, zip_code = extract_city_state_zip(text)
                records.append(
                    build_property(
                        source=self.name,
                        address=text or None,
                        city=city,
                        state=state,
                        zip_code=zip_code,
                        price=parse_price(text),
                        status="auction",
                        url=href,
                    )
                )

        filtered: list[dict[str, Any]] = []
        for record in records:
            if record.get("city") or record.get("state") or record.get("price"):
                filtered.append(record)
                continue
            if re.search(r"\d{1,6}\s+[A-Za-z].+", str(record.get("address") or "")):
                filtered.append(record)

        return filtered
