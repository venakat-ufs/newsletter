"""
Federal Reserve / FDIC Large Commercial Banks Source.

Pulls the top 25 U.S. commercial banks by total consolidated assets from the
FDIC BankFind API (the most reliable, always-current source for this data).
Also maps to the Federal Reserve's Large Commercial Banks (LCR) release concept.

Data sourced from:
  - FDIC BankFind: banks.data.fdic.gov/api/institutions
    (quarterly data, no API key required, official U.S. government data)
  - Concept reference: Federal Reserve H.8 / LCR release
    (https://www.federalreserve.gov/releases/lbr/)

Returns the top 25 largest banks with asset size, deposits, net income —
the institutions most likely to hold REO portfolios.
"""

import httpx

from services.sources.base import BaseSource, SourceResult

FDIC_INSTITUTIONS_URL = "https://banks.data.fdic.gov/api/institutions"

# FFIEC NIC — Large Bank Holding Companies reference (browseable portal)
FFIEC_NIC_URL = "https://www.ffiec.gov/nicpubweb/content/NICXBRL.aspx"
FED_LCR_URL = "https://www.federalreserve.gov/releases/lbr/"


def _fmt_billions(val_thousands: float | None) -> str | None:
    if val_thousands is None:
        return None
    return f"${val_thousands / 1_000_000:,.1f}B"


def _fetch_largest_banks() -> tuple[list[dict], list[str]]:
    errors: list[str] = []
    try:
        resp = httpx.get(
            FDIC_INSTITUTIONS_URL,
            params={
                "fields": "NAME,STNAME,ASSET,DEP,NETINC,REPDTE,CERT",
                "filters": "ACTIVE:1 AND ASSET:[10000000 TO *]",
                "limit": 25,
                "sort_by": "ASSET",
                "sort_order": "DESC",
            },
            headers={"Accept": "application/json"},
            follow_redirects=True,
            timeout=15,
        )
        resp.raise_for_status()
        payload = resp.json()
    except Exception as e:
        return [], [f"FDIC large banks request failed: {str(e)}"]

    banks: list[dict] = []
    for rank, item in enumerate(payload.get("data", []), start=1):
        d = item.get("data", {})
        asset_k = d.get("ASSET") or 0
        dep_k = d.get("DEP") or 0
        netinc_k = d.get("NETINC")
        banks.append({
            "rank": rank,
            "bank_name": d.get("NAME", ""),
            "state": d.get("STNAME", ""),
            "fdic_cert": d.get("CERT", ""),
            "report_date": d.get("REPDTE", ""),
            "total_assets_thousands": asset_k,
            "total_assets_display": _fmt_billions(asset_k),
            "total_deposits_thousands": dep_k,
            "total_deposits_display": _fmt_billions(dep_k),
            "net_income_thousands": netinc_k,
            "net_income_display": _fmt_billions(netinc_k) if netinc_k else "N/A",
            "source_url": f"https://banks.data.fdic.gov/api/institutions/{d.get('CERT', '')}",
            "portal_url": FED_LCR_URL,
        })

    return banks, errors


class FedLargeBanksSource(BaseSource):
    """
    Fetches the top 25 largest U.S. commercial banks by total consolidated assets.
    Uses FDIC BankFind API (official, no auth, quarterly data).
    Maps to Fed Reserve Large Commercial Banks (LCR) release concept.
    Feeds the 'top_banks' newsletter section.
    """

    name = "fed_large_banks"

    def collect(self) -> SourceResult:
        banks, errors = _fetch_largest_banks()

        if not banks:
            return SourceResult(
                source=self.name,
                data=[],
                errors=errors or ["No large bank data returned"],
                success=False,
            )

        total_assets_t = sum(b["total_assets_thousands"] for b in banks)
        report_date = banks[0]["report_date"] if banks else ""

        return SourceResult(
            source=self.name,
            data=[
                {
                    "content_type": "large_bank_ranking",
                    "description": (
                        "Top 25 U.S. commercial banks by total consolidated assets "
                        "(FDIC BankFind, quarterly data — concept: Fed Reserve LCR)"
                    ),
                    "report_date": report_date,
                    "total_industry_assets_display": _fmt_billions(total_assets_t),
                    "banks": banks,
                    "count": len(banks),
                    "source_url": FDIC_INSTITUTIONS_URL,
                    "reference_url": FED_LCR_URL,
                    "ffiec_nic_url": FFIEC_NIC_URL,
                }
            ],
            errors=errors,
            success=True,
        )
