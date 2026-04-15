import csv
import gzip
import io

import httpx

from services.sources.base import BaseSource, SourceResult

# Redfin public S3 data — updated weekly, no auth required
_BASE = "https://redfin-public-data.s3.us-west-2.amazonaws.com/redfin_market_tracker"
STATE_TRACKER_URL = f"{_BASE}/state_market_tracker.tsv000.gz"
COUNTY_TRACKER_URL = f"{_BASE}/county_market_tracker.tsv000.gz"

# Columns we care about for the newsletter
MARKET_COLS = [
    "PERIOD_BEGIN", "PERIOD_END", "REGION", "STATE", "STATE_CODE",
    "PROPERTY_TYPE",
    "MEDIAN_SALE_PRICE", "MEDIAN_SALE_PRICE_YOY",
    "HOMES_SOLD", "HOMES_SOLD_YOY",
    "INVENTORY", "INVENTORY_YOY",
    "MONTHS_OF_SUPPLY",
    "MEDIAN_DOM", "MEDIAN_DOM_YOY",
    "PRICE_DROPS", "PRICE_DROPS_YOY",
    "NEW_LISTINGS", "NEW_LISTINGS_YOY",
    "AVG_SALE_TO_LIST",
]


def _fetch_tsv(url: str) -> tuple[list[dict], str | None]:
    """Download, decompress, and parse a Redfin gzipped TSV file."""
    try:
        response = httpx.get(url, timeout=30, follow_redirects=True)
        response.raise_for_status()
    except Exception as e:
        return [], f"Redfin fetch failed ({url}): {str(e)}"

    try:
        raw = gzip.decompress(response.content)
        text = raw.decode("utf-8", errors="replace")
    except Exception as e:
        return [], f"Redfin decompress failed: {str(e)}"

    reader = csv.DictReader(io.StringIO(text), delimiter="\t")
    rows = []
    for row in reader:
        slim = {k: row.get(k, "") for k in MARKET_COLS if k in row}
        if slim:
            rows.append(slim)
    return rows, None


def _latest_period_rows(rows: list[dict], property_type: str = "All Residential") -> list[dict]:
    """Filter to the most recent period and a single property type."""
    filtered = [r for r in rows if r.get("PROPERTY_TYPE", "") == property_type]
    if not filtered:
        filtered = rows

    periods = sorted({r.get("PERIOD_END", "") for r in filtered if r.get("PERIOD_END")})
    if not periods:
        return filtered[:50]

    latest = periods[-1]
    return [r for r in filtered if r.get("PERIOD_END") == latest]


def _safe_float(value: str) -> float | None:
    try:
        return float(value) if value not in ("", "N/A", "null") else None
    except (ValueError, TypeError):
        return None


def _distress_score(row: dict) -> float:
    """
    Score a market by distress signals relevant to REO activity:
    - High inventory growth (more supply, may include REO)
    - High price drops (sellers reducing = more motivated/distressed sellers)
    - High days on market (slower = more REO-type inventory)
    - Low sale-to-list ratio (below-ask sales signal weak demand)
    """
    score = 0.0
    inv_yoy = _safe_float(row.get("INVENTORY_YOY", ""))
    if inv_yoy is not None and inv_yoy > 0:
        score += min(inv_yoy * 10, 40)

    price_drops = _safe_float(row.get("PRICE_DROPS_YOY", ""))
    if price_drops is not None and price_drops > 0:
        score += min(price_drops * 10, 30)

    dom_yoy = _safe_float(row.get("MEDIAN_DOM_YOY", ""))
    if dom_yoy is not None and dom_yoy > 0:
        score += min(dom_yoy * 5, 20)

    stl = _safe_float(row.get("AVG_SALE_TO_LIST", ""))
    if stl is not None and stl < 1.0:
        score += (1.0 - stl) * 100

    return score


class RedfinMarketSource(BaseSource):
    """
    Pulls free weekly housing market data from Redfin's public S3 bucket.
    Provides state-level market pulse data and county-level hot market signals.
    Data updated weekly — no API key required.
    """

    name = "redfin_market"

    def collect(self) -> SourceResult:
        errors: list[str] = []

        # --- State-level data for Market Pulse ---
        state_rows, state_err = _fetch_tsv(STATE_TRACKER_URL)
        if state_err:
            errors.append(state_err)

        state_latest = _latest_period_rows(state_rows) if state_rows else []
        period_label = state_latest[0].get("PERIOD_END", "") if state_latest else "unknown"

        national_summary = {
            "period": period_label,
            "source": "redfin",
            "content_type": "market_pulse",
            "states": [
                {
                    "state": r.get("STATE", r.get("REGION", "")),
                    "state_code": r.get("STATE_CODE", ""),
                    "median_sale_price": r.get("MEDIAN_SALE_PRICE", ""),
                    "median_sale_price_yoy": r.get("MEDIAN_SALE_PRICE_YOY", ""),
                    "homes_sold": r.get("HOMES_SOLD", ""),
                    "homes_sold_yoy": r.get("HOMES_SOLD_YOY", ""),
                    "inventory": r.get("INVENTORY", ""),
                    "inventory_yoy": r.get("INVENTORY_YOY", ""),
                    "months_of_supply": r.get("MONTHS_OF_SUPPLY", ""),
                    "median_dom": r.get("MEDIAN_DOM", ""),
                    "price_drops": r.get("PRICE_DROPS", ""),
                    "price_drops_yoy": r.get("PRICE_DROPS_YOY", ""),
                }
                for r in state_latest
                if r.get("STATE") or r.get("REGION")
            ],
        }

        # --- County-level data for Hot Markets ---
        county_rows, county_err = _fetch_tsv(COUNTY_TRACKER_URL)
        if county_err:
            errors.append(county_err)

        county_latest = _latest_period_rows(county_rows) if county_rows else []

        # Rank counties by distress signals — most relevant for REO newsletter
        county_latest.sort(key=_distress_score, reverse=True)
        top_distressed = county_latest[:25]

        hot_markets = {
            "period": period_label,
            "source": "redfin",
            "content_type": "hot_markets",
            "top_counties": [
                {
                    "region": r.get("REGION", ""),
                    "state_code": r.get("STATE_CODE", ""),
                    "median_sale_price": r.get("MEDIAN_SALE_PRICE", ""),
                    "inventory": r.get("INVENTORY", ""),
                    "inventory_yoy": r.get("INVENTORY_YOY", ""),
                    "months_of_supply": r.get("MONTHS_OF_SUPPLY", ""),
                    "median_dom": r.get("MEDIAN_DOM", ""),
                    "price_drops": r.get("PRICE_DROPS", ""),
                    "price_drops_yoy": r.get("PRICE_DROPS_YOY", ""),
                    "distress_score": round(_distress_score(r), 2),
                }
                for r in top_distressed
            ],
        }

        data = []
        if national_summary["states"]:
            data.append(national_summary)
        if hot_markets["top_counties"]:
            data.append(hot_markets)

        if data:
            return SourceResult(
                source=self.name,
                data=data,
                errors=errors,
                success=True,
            )

        return SourceResult(
            source=self.name,
            data=[],
            errors=errors or ["Redfin market data returned no usable rows"],
            success=False,
        )
