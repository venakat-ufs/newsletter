"""
GSA Auctions Source — U.S. General Services Administration property auctions.

GSA sells surplus federal property (including real estate) seized assets, and
forfeited property on behalf of multiple agencies (DOJ, USMS, Treasury).
URL: https://gsaauctions.gov

This source extracts auction signals from the GSA Auctions website,
including real property listings when accessible.
"""

import re
import httpx

from services.sources.base import BaseSource, SourceResult

GSA_BASE = "https://gsaauctions.gov"
GSA_AUCTIONS_URL = f"{GSA_BASE}/auctions/auctions-list"
GSA_REAL_PROPERTY_URL = f"{GSA_BASE}/auctions/auctions-list/?status=open&category=real-estate"

# U.S. Marshals Service — seizes and sells real property from federal forfeitures
USMS_URL = "https://www.usmarshals.gov/what-we-do/asset-forfeiture/current-auctions"

# Treasury Bureau of Fiscal Service — seized and forfeited real property
TREASURY_URL = "https://fiscalservice.gov/programs/asset-sales/"


def _probe_gsa(client: httpx.Client) -> tuple[dict, list[str]]:
    errors = []
    result = {
        "agency": "GSA (General Services Administration)",
        "portal_url": GSA_AUCTIONS_URL,
        "description": (
            "GSA sells surplus federal property, seized/forfeited real estate "
            "on behalf of DOJ, USMS, Treasury and other agencies"
        ),
        "http_status": None,
        "accessible": False,
        "listing_count": None,
        "property_types": ["Real Property", "Personal Property", "Vehicles"],
        "note": "",
        "source_url": GSA_BASE,
    }

    for url in [GSA_REAL_PROPERTY_URL, GSA_AUCTIONS_URL]:
        try:
            resp = client.get(
                url,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Accept": "text/html,application/json",
                },
                timeout=12,
            )
            result["http_status"] = resp.status_code
            if resp.status_code == 200:
                result["accessible"] = True
                text = resp.text[:8000]
                # Look for auction counts in React SPA state or meta tags
                count_patterns = [
                    r'"totalItems"\s*:\s*(\d+)',
                    r'"total"\s*:\s*(\d+)',
                    r'"count"\s*:\s*(\d+)',
                    r'(\d[\d,]+)\s*(?:auctions?|items?|properties)',
                    r'(?:auctions?|items?)\s*\((\d[\d,]+)\)',
                ]
                for pat in count_patterns:
                    m = re.search(pat, text, re.I)
                    if m:
                        raw = m.group(1).replace(",", "")
                        try:
                            n = int(raw)
                            if 1 < n < 100_000:
                                result["listing_count"] = n
                                break
                        except ValueError:
                            pass

                result["note"] = (
                    f"Accessible — {result['listing_count']:,} auctions found"
                    if result["listing_count"]
                    else "Accessible — React SPA, count JS-rendered"
                )
                break
        except Exception as e:
            errors.append(f"GSA probe error: {str(e)[:80]}")

    if not result["accessible"]:
        result["note"] = "Portal temporarily unavailable"
        errors.append("GSA Auctions returned non-200 status")

    return result, errors


def _probe_agency(name: str, url: str, description: str, client: httpx.Client) -> dict:
    result = {
        "agency": name,
        "portal_url": url,
        "description": description,
        "http_status": None,
        "accessible": False,
        "listing_count": None,
        "note": "",
        "source_url": url,
    }
    try:
        resp = client.get(
            url,
            headers={"User-Agent": "Mozilla/5.0", "Accept": "text/html"},
            timeout=10,
        )
        result["http_status"] = resp.status_code
        result["accessible"] = resp.status_code == 200
        result["note"] = "Accessible" if resp.status_code == 200 else f"HTTP {resp.status_code}"
    except Exception as e:
        result["note"] = f"Error: {str(e)[:60]}"
    return result


class GsaAuctionsSource(BaseSource):
    """
    Checks GSA Auctions and related government property disposition portals.
    Covers real estate sold through federal forfeiture, surplus, and seizure programs.
    Feeds the 'top_banks' section with government disposition data.
    """

    name = "gsa_auctions"

    def collect(self) -> SourceResult:
        errors: list[str] = []
        data: list[dict] = []

        with httpx.Client(timeout=12, follow_redirects=True) as client:
            gsa_data, gsa_errors = _probe_gsa(client)
            errors.extend(gsa_errors)
            data.append(gsa_data)

            # Probe USMS
            usms = _probe_agency(
                "U.S. Marshals Service",
                USMS_URL,
                "USMS seizes and auctions real property forfeited in federal criminal cases",
                client,
            )
            data.append(usms)

            # Probe Treasury/Fiscal Service
            treasury = _probe_agency(
                "Treasury / Fiscal Service",
                TREASURY_URL,
                "Bureau of Fiscal Service sells seized/forfeited real estate and assets",
                client,
            )
            data.append(treasury)

        accessible = [d for d in data if d.get("accessible")]

        return SourceResult(
            source=self.name,
            data=[
                {
                    "content_type": "government_auctions",
                    "description": "Federal government property auctions — GSA, USMS, Treasury",
                    "portals": data,
                    "accessible_count": len(accessible),
                    "total_portals": len(data),
                    "source_url": GSA_BASE,
                }
            ],
            errors=errors,
            success=True,
        )
