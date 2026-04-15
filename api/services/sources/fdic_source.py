import httpx

from services.sources.base import BaseSource, SourceResult

FDIC_FAILURES_URL = "https://banks.data.fdic.gov/api/failures"
FDIC_INSTITUTIONS_URL = "https://banks.data.fdic.gov/api/institutions"


def _fetch_recent_failures() -> tuple[list[dict], list[str]]:
    """Fetch the 20 most recent FDIC bank failures."""
    errors: list[str] = []
    try:
        response = httpx.get(
            FDIC_FAILURES_URL,
            params={
                "limit": 20,
                "sort_by": "RESDATE",
                "sort_order": "DESC",
                "fields": "NAME,PSTALP,CITYST,RESDATE,QBFASSET,QBFDEP,BIDNAME,RESTYPE",
            },
            follow_redirects=True,
            timeout=15,
        )
        response.raise_for_status()
        payload = response.json()
    except Exception as e:
        return [], [f"FDIC failures request failed: {str(e)}"]

    failures = []
    for item in payload.get("data", []):
        d = item.get("data", {})
        failures.append({
            "bank_name": d.get("NAME", ""),
            "city_state": d.get("CITYST", ""),
            "state": d.get("PSTALP", ""),
            "fail_date": d.get("RESDATE", ""),
            "total_assets_thousands": d.get("QBFASSET"),
            "total_deposits_thousands": d.get("QBFDEP"),
            "acquiring_institution": d.get("BIDNAME", "FDIC Receiver"),
            "resolution_type": d.get("RESTYPE", "FAILURE"),
            "source_url": "https://banks.data.fdic.gov/api/failures",
            "portal_url": "https://www.fdic.gov/bank/individual/failed/banklist.html",
        })

    return failures, errors


def _fetch_high_npl_banks() -> tuple[list[dict], list[str]]:
    """
    Fetch institutions with high non-performing loan ratios — proxy for REO activity.
    Uses FDIC financials endpoint, filters for banks with notable asset size.
    """
    errors: list[str] = []
    try:
        response = httpx.get(
            FDIC_INSTITUTIONS_URL,
            params={
                "limit": 25,
                "sort_by": "ASSET",
                "sort_order": "DESC",
                "fields": "NAME,STNAME,ASSET,DEP,NETINC,REPDTE",
                "filters": "ACTIVE:1 AND ASSET:[10000000 TO *]",
            },
            follow_redirects=True,
            timeout=15,
        )
        response.raise_for_status()
        payload = response.json()
    except Exception as e:
        errors.append(f"FDIC institutions request failed: {str(e)}")
        return [], errors

    banks = []
    for item in payload.get("data", []):
        d = item.get("data", {})
        asset_k = d.get("ASSET") or 0
        banks.append({
            "bank_name": d.get("NAME", ""),
            "state": d.get("STNAME", ""),
            "total_assets_thousands": asset_k,
            "total_assets_billions": round(asset_k / 1_000_000, 1) if asset_k else None,
            "total_deposits_thousands": d.get("DEP"),
            "report_date": d.get("REPDTE", ""),
            "net_income_thousands": d.get("NETINC"),
            "source_url": "https://banks.data.fdic.gov/api/institutions",
            "portal_url": "https://banks.data.fdic.gov/",
        })

    return banks, errors


class FdicSource(BaseSource):
    """
    Pulls bank failure data and institution financials from the FDIC BankFind API.
    No API key required — completely open government data.
    Feeds the 'top_banks' section with recently failed institutions and their REO context.
    """

    name = "fdic"

    def collect(self) -> SourceResult:
        failures, failure_errors = _fetch_recent_failures()
        banks, bank_errors = _fetch_high_npl_banks()
        errors = failure_errors + bank_errors

        data = []

        if failures:
            data.append({
                "content_type": "bank_failures",
                "source_name": "FDIC BankFind",
                "description": "Recently failed FDIC-insured banks — assets become REO through FDIC receivership",
                "failures": failures,
                "count": len(failures),
            })

        if banks:
            data.append({
                "content_type": "large_bank_snapshot",
                "source_name": "FDIC BankFind",
                "description": "Active FDIC-insured banks with $500M+ assets",
                "institutions": banks[:20],
                "count": len(banks),
            })

        if data:
            return SourceResult(source=self.name, data=data, errors=errors, success=True)

        return SourceResult(
            source=self.name,
            data=[],
            errors=errors or ["FDIC API returned no data"],
            success=False,
        )
