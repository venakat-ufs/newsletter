"""
Auction Portals Signal Source — checks availability of major REO/foreclosure auction portals
and extracts whatever listing counts or data is accessible from each.

Portals covered:
  - Auction.com (nation's largest REO marketplace, $42B+ in sales)
  - Hubzu (HousingWire-featured foreclosure/REO auction platform)
  - Xome Auctions (nationwide REO, short-sale, foreclosure & HUD)
  - RealtyBid (Covius solution, foreclosure/distressed listings)
  - ServiceLink Auction (full-service, Salesforce-backed)
  - Williams & Williams (live + online auctions, residential/commercial/land)
  - Bid4Assets (distressed RE + government agency auctions)
"""

import re
import httpx

from services.sources.base import BaseSource, SourceResult

PORTALS = [
    {
        "name": "Auction.com",
        "url": "https://www.auction.com/",
        "search_url": "https://www.auction.com/residential/",
        "description": "Nation's largest online RE marketplace — 25,000+ exclusive foreclosure & bank-owned listings, $42B+ in sales",
        "category": "REO Auction",
        "access_type": "public_browse",
    },
    {
        "name": "Hubzu",
        "url": "https://www.hubzu.com/",
        "search_url": "https://www.hubzu.com/homes-for-sale/",
        "description": "End-to-end asset management & disposition for residential foreclosures, short sales, REO auctions (HousingWire-featured)",
        "category": "REO Auction",
        "access_type": "public_browse",
    },
    {
        "name": "Xome Auctions",
        "url": "https://www.xome.com/",
        "search_url": "https://www.xome.com/foreclosures",
        "description": "Nationwide REO, short-sale, foreclosure and HUD properties with advanced search filters and concierge service",
        "category": "REO Auction",
        "access_type": "public_browse",
    },
    {
        "name": "RealtyBid",
        "url": "https://www.realtybid.com/",
        "search_url": "https://www.realtybid.com/list-of-foreclosure-homes/",
        "description": "Covius platform primarily for foreclosure/distressed listings — bid on bank-owned homes nationwide",
        "category": "REO Auction",
        "access_type": "public_browse",
    },
    {
        "name": "ServiceLink Auction",
        "url": "https://servicelinkauction.com/",
        "search_url": "https://servicelinkauction.com/listings",
        "description": "Full-service auction integrating title, valuation, asset mgmt and preservation; speeds up sale timelines",
        "category": "REO Auction",
        "access_type": "public_browse",
    },
    {
        "name": "Williams & Williams",
        "url": "https://www.williamsauction.com/",
        "search_url": "https://www.williamsauction.com/",
        "description": "Renowned auction company — live & online auctions for residential, commercial and land properties",
        "category": "Live Auction",
        "access_type": "public_browse",
    },
    {
        "name": "Bid4Assets",
        "url": "https://www.bid4assets.com/",
        "search_url": "https://www.bid4assets.com/real-estate",
        "description": "Leading online auction site — distressed RE & government agency auctions, free registration",
        "category": "Distressed/Gov Auction",
        "access_type": "public_browse",
    },
]

_COUNT_PATTERNS = [
    r"(\d[\d,]+)\s*(?:properties|listings?|homes?|results?)",
    r"(?:properties|listings?|homes?|results?)\s*:\s*(\d[\d,]+)",
    r'"totalCount"\s*:\s*(\d+)',
    r'"total"\s*:\s*(\d+)',
    r'"count"\s*:\s*(\d+)',
    r"(\d[\d,]+)\s*(?:foreclosures?|REO|bank.owned)",
]


def _probe_portal(portal: dict, client: httpx.Client) -> dict:
    result = {
        "portal_name": portal["name"],
        "portal_url": portal["url"],
        "search_url": portal["search_url"],
        "description": portal["description"],
        "category": portal["category"],
        "http_status": None,
        "listing_count": None,
        "accessible": False,
        "note": "",
        "source_url": portal["url"],
    }
    try:
        resp = client.get(
            portal["search_url"],
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/122.0.0.0 Safari/537.36"
                ),
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
            },
            follow_redirects=True,
            timeout=12,
        )
        result["http_status"] = resp.status_code
        result["accessible"] = resp.status_code == 200

        if resp.status_code == 200:
            text = resp.text[:8000]
            for pattern in _COUNT_PATTERNS:
                m = re.search(pattern, text, re.I)
                if m:
                    raw = m.group(1).replace(",", "")
                    try:
                        n = int(raw)
                        if 10 < n < 10_000_000:
                            result["listing_count"] = n
                            break
                    except ValueError:
                        pass
            if result["listing_count"]:
                result["note"] = f"{result['listing_count']:,} listings detected"
            else:
                result["note"] = "Site accessible — listing count JS-rendered"
        elif resp.status_code == 403:
            result["note"] = "Access blocked (anti-bot protection)"
        elif resp.status_code == 404:
            result["note"] = "Endpoint not found — check URL"
        else:
            result["note"] = f"HTTP {resp.status_code}"

    except httpx.TimeoutException:
        result["note"] = "Request timed out"
    except Exception as e:
        result["note"] = f"Error: {str(e)[:80]}"

    return result


class AuctionPortalsSource(BaseSource):
    """
    Probes all major REO/foreclosure auction portals for availability and listing signals.
    Returns portal metadata, HTTP status, and extracted listing counts where accessible.
    Feeds the 'top_banks' and 'hot_markets' sections with portal intelligence.
    """

    name = "auction_portals"

    def collect(self) -> SourceResult:
        errors: list[str] = []
        data: list[dict] = []

        with httpx.Client(timeout=12, follow_redirects=True) as client:
            for portal in PORTALS:
                probe = _probe_portal(portal, client)
                data.append(probe)

        accessible = [d for d in data if d["accessible"]]
        blocked = [d for d in data if not d["accessible"]]

        if blocked:
            errors.append(
                f"{len(blocked)} portal(s) blocked/unavailable: "
                + ", ".join(d["portal_name"] for d in blocked)
            )

        total_known_listings = sum(
            d["listing_count"] for d in data if d["listing_count"]
        )

        return SourceResult(
            source=self.name,
            data=[
                {
                    "content_type": "auction_portals",
                    "description": "Major REO/foreclosure auction portals — availability and listing signals",
                    "portals": data,
                    "accessible_count": len(accessible),
                    "total_portals": len(PORTALS),
                    "total_known_listings": total_known_listings or None,
                    "source_url": "https://www.auction.com/",
                }
            ],
            errors=errors,
            success=True,
        )
