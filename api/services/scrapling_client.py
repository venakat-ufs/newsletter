from dataclasses import dataclass
from typing import Literal

from config import get_settings

try:
    from scrapling import Fetcher
except Exception as exc:  # pragma: no cover - depends on optional runtime dependency
    Fetcher = None
    FETCHER_IMPORT_ERROR = str(exc)
else:  # pragma: no cover - exercised only when dependency is installed
    FETCHER_IMPORT_ERROR = ""

try:
    from scrapling.fetchers.stealth_chrome import StealthyFetcher
except Exception as exc:  # pragma: no cover - depends on optional runtime dependency
    StealthyFetcher = None
    STEALTH_IMPORT_ERROR = str(exc)
else:  # pragma: no cover - exercised only when dependency is installed
    STEALTH_IMPORT_ERROR = ""

ScrapeMode = Literal["static", "stealth"]


@dataclass
class ScraplingFetchResult:
    url: str
    mode: ScrapeMode
    status_code: int | None
    text: str
    error: str | None = None

    @property
    def ok(self) -> bool:
        return self.error is None and self.status_code is not None and self.status_code < 400


def fetch_with_scrapling(
    url: str,
    *,
    mode: ScrapeMode = "static",
    headers: dict[str, str] | None = None,
) -> ScraplingFetchResult:
    settings = get_settings()
    if not settings.scrapling_enabled:
        return ScraplingFetchResult(
            url=url,
            mode=mode,
            status_code=None,
            text="",
            error="SCRAPLING_ENABLED is false",
        )

    try:
        if mode == "stealth":
            if StealthyFetcher is None:
                raise RuntimeError(
                    "Scrapling stealth fetcher unavailable. "
                    "Install scrapling[fetchers] and its browser runtime. "
                    f"Import error: {STEALTH_IMPORT_ERROR or FETCHER_IMPORT_ERROR or 'unknown error'}"
                )

            response = StealthyFetcher.fetch(
                url,
                # StealthyFetcher expects milliseconds, not seconds.
                timeout=settings.scrapling_timeout_seconds * 1000,
                follow_redirects=settings.scrapling_follow_redirects,
                headless=settings.scrapling_headless,
                network_idle=True,
                google_search=False,
                extra_headers=headers or {},
            )
        else:
            if Fetcher is None:
                raise RuntimeError(
                    "Scrapling fetcher unavailable. "
                    "Install scrapling[fetchers]. "
                    f"Import error: {FETCHER_IMPORT_ERROR or 'unknown error'}"
                )

            response = Fetcher.get(
                url,
                timeout=settings.scrapling_timeout_seconds,
                follow_redirects=settings.scrapling_follow_redirects,
                retries=1,
                headers=headers or {},
                impersonate="chrome",
            )

        text = response.text or ""
        if not text and getattr(response, "body", None):
            text = response.body.decode("utf-8", errors="ignore")

        return ScraplingFetchResult(
            url=str(response.url),
            mode=mode,
            status_code=response.status,
            text=text,
        )
    except Exception as exc:  # pragma: no cover - depends on upstream site/runtime state
        return ScraplingFetchResult(
            url=url,
            mode=mode,
            status_code=None,
            text="",
            error=str(exc),
        )


def fetch_with_stealth_retry(
    url: str,
    *,
    headers: dict[str, str] | None = None,
) -> tuple[ScraplingFetchResult, list[str]]:
    settings = get_settings()
    errors: list[str] = []
    primary = fetch_with_scrapling(url, mode="static", headers=headers)

    if primary.error:
        errors.append(primary.error)
    elif primary.status_code is not None and primary.status_code >= 400:
        errors.append(f"HTTP {primary.status_code} via static fetch")

    if primary.ok or not settings.scrapling_stealth_retry:
        return primary, errors

    if primary.status_code != 403:
        return primary, errors

    stealth = fetch_with_scrapling(url, mode="stealth", headers=headers)
    if stealth.error:
        errors.append(f"Stealth retry failed: {stealth.error}")
        return primary, errors

    if stealth.status_code is not None and stealth.status_code >= 400:
        errors.append(f"HTTP {stealth.status_code} via stealth fetch")
        return stealth, errors

    return stealth, errors
