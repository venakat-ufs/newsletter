import httpx

from config import get_settings
from services.sources.base import BaseSource, SourceResult

FRED_API_BASE = "https://api.stlouisfed.org/fred/series/observations"

# Key economic series for the REO/mortgage newsletter
FRED_SERIES = [
    {
        "series_id": "DRSFRMACBS",
        "label": "Delinquency Rate - Single-Family Residential Mortgages (All Commercial Banks)",
        "section": "market_pulse",
        "unit": "percent",
    },
    {
        "series_id": "MORTGAGE30US",
        "label": "30-Year Fixed Rate Mortgage Average",
        "section": "market_pulse",
        "unit": "percent",
    },
    {
        "series_id": "HOUST",
        "label": "Housing Starts: Total New Privately Owned",
        "section": "market_pulse",
        "unit": "thousands of units",
    },
    {
        "series_id": "DRSFLNACBS",
        "label": "Delinquency Rate - Consumer Loans (proxy for financial stress)",
        "section": "market_pulse",
        "unit": "percent",
    },
]

# How many of the most recent observations to return per series
OBSERVATIONS_LIMIT = 4


def _fetch_series(series_id: str, api_key: str) -> tuple[list[dict], str | None]:
    """Fetch the latest N observations for a FRED series."""
    try:
        response = httpx.get(
            FRED_API_BASE,
            params={
                "series_id": series_id,
                "api_key": api_key,
                "file_type": "json",
                "sort_order": "desc",
                "limit": OBSERVATIONS_LIMIT,
            },
            timeout=15,
        )
        response.raise_for_status()
        payload = response.json()
    except Exception as e:
        return [], f"FRED series {series_id} request failed: {str(e)}"

    observations = payload.get("observations", [])
    if not observations:
        return [], f"FRED series {series_id} returned no observations"

    return [
        {"date": obs.get("date", ""), "value": obs.get("value", "")}
        for obs in observations
        if obs.get("value") not in ("", ".", None)
    ], None


class FredSource(BaseSource):
    """
    Pulls mortgage delinquency, mortgage rate, and housing start data from
    the Federal Reserve FRED API. Free API key required (fred.stlouisfed.org).
    Data is quarterly/monthly — provides strong Market Pulse context.
    """

    name = "fred"

    def collect(self) -> SourceResult:
        settings = get_settings()
        if not settings.fred_api_key:
            return SourceResult(
                source=self.name,
                data=[],
                errors=[
                    "FRED_API_KEY not configured. "
                    "Get a free key at https://fred.stlouisfed.org/docs/api/api_key.html"
                ],
                success=False,
            )

        results = []
        errors = []

        for series in FRED_SERIES:
            observations, err = _fetch_series(series["series_id"], settings.fred_api_key)
            if err:
                errors.append(err)
                continue

            if not observations:
                continue

            latest = observations[0]
            results.append({
                "series_id": series["series_id"],
                "label": series["label"],
                "section": series["section"],
                "unit": series["unit"],
                "latest_date": latest["date"],
                "latest_value": latest["value"],
                "recent_observations": observations,
                "source_name": "Federal Reserve FRED",
                "content_type": "market_pulse",
            })

        if results:
            return SourceResult(
                source=self.name,
                data=results,
                errors=errors,
                success=True,
            )

        return SourceResult(
            source=self.name,
            data=[],
            errors=errors or ["FRED returned no usable data"],
            success=False,
        )
