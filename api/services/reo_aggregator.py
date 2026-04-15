from __future__ import annotations

import asyncio
from collections import Counter
from datetime import datetime, UTC
from typing import Any

from services.sources.base import BaseSource, SourceResult
from services.sources.reo_source_utils import (
    aggregate_banks,
    aggregate_states,
    dedupe_properties,
    log_step,
    property_dedupe_key,
)


SOURCE_TIMEOUT_SECONDS = 75


def get_new_reo_sources() -> list[BaseSource]:
    from services.sources.propwire_source import PropwireSource
    from services.sources.foreclosurelistingsusa_source import ForeclosureListingsUSASource
    from services.sources.ushud_source import USHUDSource
    from services.sources.bankforeclosuressale_source import BankForeclosuresSaleSource
    from services.sources.foreclosurerover_source import ForeclosureRoverSource
    from services.sources.realtor_foreclosure_source import RealtorForeclosureSource
    from services.sources.homes_foreclosure_source import HomesForeclosureSource
    from services.sources.county_source import CountySource

    county_sources: list[BaseSource] = [
        CountySource(
            source_name="county_miami_dade",
            url="https://miamidade.realforeclose.com/index.cfm?zaction=auction&zmethod=search",
        ),
        CountySource(
            source_name="county_hillsborough",
            url="https://www.hillsborough.realtaxdeed.com/index.cfm?zaction=AUCTION&ZMETHOD=SEARCH",
        ),
    ]

    return [
        PropwireSource(),
        ForeclosureListingsUSASource(),
        USHUDSource(),
        BankForeclosuresSaleSource(),
        ForeclosureRoverSource(),
        RealtorForeclosureSource(),
        HomesForeclosureSource(),
        *county_sources,
    ]



def _extract_source_payload(result: SourceResult) -> dict[str, Any]:
    if result.data and isinstance(result.data[0], dict):
        return result.data[0]
    return {
        "source": result.source,
        "listings_count": 0,
        "top_banks": {},
        "properties": [],
    }



def _merge_top_banks(
    source_payloads: dict[str, dict[str, Any]],
    merged_properties: list[dict[str, Any]],
) -> dict[str, int]:
    counter: Counter[str] = Counter()

    for payload in source_payloads.values():
        top_banks = payload.get("top_banks")
        if isinstance(top_banks, dict):
            for bank_name, count in top_banks.items():
                try:
                    counter[str(bank_name)] += int(count)
                except (TypeError, ValueError):
                    continue

    for bank_name, count in aggregate_banks(merged_properties).items():
        counter[bank_name] += count

    return dict(counter)



def _dedupe_merged_properties(
    source_payloads: dict[str, dict[str, Any]],
    limit: int = 500,
) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    seen: set[str] = set()

    for source_name, payload in source_payloads.items():
        properties = payload.get("properties") or []
        if not isinstance(properties, list):
            continue

        for prop in properties:
            if not isinstance(prop, dict):
                continue
            prop.setdefault("source", source_name)
            key = property_dedupe_key(prop)
            if key in seen:
                continue
            seen.add(key)
            merged.append(prop)
            if len(merged) >= limit:
                return merged

    return merged


async def _collect_source_with_failover(source: BaseSource) -> SourceResult:
    source_name = getattr(source, "name", source.__class__.__name__)
    log_step("reo_aggregator", "source_collect_start", source_name=source_name)

    try:
        result = await asyncio.wait_for(source.safe_collect_async(), timeout=SOURCE_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        log_step(
            "reo_aggregator",
            "source_collect_timeout",
            source_name=source_name,
            timeout=SOURCE_TIMEOUT_SECONDS,
            level="warning",
        )
        return SourceResult(
            source=source_name,
            collected_at=datetime.now(UTC).isoformat(),
            data=[{"source": source_name, "listings_count": 0, "properties": []}],
            errors=[f"collector timed out after {SOURCE_TIMEOUT_SECONDS}s"],
            success=False,
        )
    except Exception as exc:
        log_step(
            "reo_aggregator",
            "source_collect_exception",
            source_name=source_name,
            error=str(exc),
            level="warning",
        )
        return SourceResult(
            source=source_name,
            collected_at=datetime.now(UTC).isoformat(),
            data=[{"source": source_name, "listings_count": 0, "properties": []}],
            errors=[f"collector raised unexpected exception: {exc}"],
            success=False,
        )

    log_step(
        "reo_aggregator",
        "source_collect_done",
        source_name=source_name,
        success=result.success,
        errors=len(result.errors),
        data_items=len(result.data),
    )
    return result


async def collect_all_sources(
    sources: list[BaseSource] | None = None,
) -> dict[str, Any]:
    active_sources = sources or get_new_reo_sources()
    log_step("reo_aggregator", "collect_all_start", sources=[source.name for source in active_sources])

    results = await asyncio.gather(
        *[_collect_source_with_failover(source) for source in active_sources],
        return_exceptions=False,
    )

    source_payloads: dict[str, dict[str, Any]] = {}
    source_results: dict[str, dict[str, Any]] = {}
    total_listings = 0

    for result in results:
        payload = _extract_source_payload(result)
        source_payloads[result.source] = payload

        properties = payload.get("properties") or []
        deduped_properties = dedupe_properties(properties, limit=50) if isinstance(properties, list) else []

        raw_listings_count = payload.get("listings_count")
        if isinstance(raw_listings_count, (int, float)):
            listings_count = int(raw_listings_count)
        else:
            listings_count = len(deduped_properties)

        total_listings += max(listings_count, 0)

        source_results[result.source] = {
            "listings_count": listings_count,
            "success": result.success,
            "errors": result.errors,
            "properties": deduped_properties,
        }

    merged_properties = _dedupe_merged_properties(source_payloads)
    top_banks = _merge_top_banks(source_payloads, merged_properties)
    top_states = aggregate_states(merged_properties)

    summary = {
        "total_listings": total_listings,
        "by_source": {
            source: {
                "listings_count": source_data["listings_count"],
                "success": source_data["success"],
                "errors": source_data["errors"],
                "sample_properties": source_data["properties"][:5],
            }
            for source, source_data in source_results.items()
        },
        "top_banks": top_banks,
        "top_states": top_states,
        "merged_dataset": {
            "listings_count": len(merged_properties),
            "properties": merged_properties,
        },
        "raw_sources": {
            source: {
                "source": source,
                "listings_count": details["listings_count"],
                "properties": details["properties"],
                "errors": details["errors"],
                "success": details["success"],
            }
            for source, details in source_results.items()
        },
    }

    log_step(
        "reo_aggregator",
        "collect_all_done",
        total_listings=total_listings,
        merged_listings=summary["merged_dataset"]["listings_count"],
        top_banks=len(top_banks),
        top_states=len(top_states),
    )

    return summary
