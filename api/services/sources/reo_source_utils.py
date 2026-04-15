import asyncio
from collections import Counter
from dataclasses import dataclass
import json
import logging
import random
import re
from typing import Any, Awaitable
from urllib.parse import quote_plus, urljoin

import requests


if not logging.getLogger().handlers:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )

LOGGER = logging.getLogger("reo.sources")


USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.4; rv:123.0) Gecko/20100101 Firefox/123.0",
]

BLOCKED_MARKERS = [
    "access denied",
    "forbidden",
    "captcha",
    "enable js",
    "request could not be processed",
    "temporarily unavailable",
]

STATE_CODE_PATTERN = re.compile(r"\b([A-Z]{2})\b")
CITY_STATE_ZIP_PATTERN = re.compile(
    r"(?P<city>[A-Za-z][A-Za-z .'-]+),\s*(?P<state>[A-Z]{2})(?:\s+(?P<zip>\d{5}))?"
)
PRICE_PATTERN = re.compile(r"\$\s*([\d,]+)")

BANK_PATTERNS = [
    r"Bank of America",
    r"Wells Fargo",
    r"JPMorgan Chase",
    r"Chase",
    r"U\\.?S\\.? Bank",
    r"Citi(?:bank)?",
    r"PNC",
    r"Truist",
    r"Flagstar",
    r"Mr\\.? Cooper",
    r"Fannie Mae",
    r"Freddie Mac",
    r"HUD",
    r"VA",
]


@dataclass
class FetchResult:
    url: str
    status_code: int | None
    text: str = ""
    json_data: Any = None
    errors: list[str] | None = None
    mode: str = "requests"
    network_json: list[dict[str, Any]] | None = None

    @property
    def ok(self) -> bool:
        return self.status_code is not None and 200 <= self.status_code < 300



def log_step(source: str, step: str, *, level: str = "info", **fields: Any) -> None:
    logger = logging.getLogger(f"reo.sources.{source}")
    payload = f"[{source}] {step}"
    if fields:
        payload = payload + " | " + json.dumps(fields, default=str, sort_keys=True)
    log_fn = getattr(logger, level, logger.info)
    log_fn(payload)



def random_user_agent() -> str:
    return random.choice(USER_AGENTS)



def clean_text(value: str | None) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", value).strip()



def parse_price(value: str | int | float | None) -> int | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value)
    match = PRICE_PATTERN.search(str(value))
    if not match:
        digits = re.sub(r"[^\d]", "", str(value))
        if not digits:
            return None
        try:
            return int(digits)
        except ValueError:
            return None
    try:
        return int(match.group(1).replace(",", ""))
    except ValueError:
        return None



def extract_city_state_zip(text: str) -> tuple[str | None, str | None, str | None]:
    normalized = clean_text(text)
    if not normalized:
        return None, None, None
    match = CITY_STATE_ZIP_PATTERN.search(normalized)
    if not match:
        return None, None, None
    city = clean_text(match.group("city"))
    state = clean_text(match.group("state"))
    zip_code = clean_text(match.group("zip")) if match.group("zip") else None
    return city or None, state or None, zip_code or None



def detect_status(value: str | None, *, default: str = "foreclosure") -> str:
    text = clean_text(value).lower()
    if not text:
        return default
    if "reo" in text:
        return "reo"
    if "auction" in text or "sheriff" in text or "tax deed" in text:
        return "auction"
    if "foreclosure" in text:
        return "foreclosure"
    return default



def absolutize_url(base_url: str, href: str | None) -> str:
    if not href:
        return ""
    href = clean_text(href)
    if href.startswith("javascript:"):
        match = re.search(r"'(https?://[^']+)'", href)
        if match:
            return match.group(1)
        match = re.search(r"'(/[^']+)'", href)
        if match:
            return urljoin(base_url, match.group(1))
        return ""
    return urljoin(base_url, href)



def build_property(
    *,
    source: str,
    address: str | None,
    city: str | None,
    state: str | None,
    price: int | None,
    status: str,
    url: str,
    zip_code: str | None = None,
    bank_name: str | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "source": source,
        "address": clean_text(address) or None,
        "city": clean_text(city) or None,
        "state": clean_text(state) or None,
        "zip": clean_text(zip_code) or None,
        "price": price,
        "status": detect_status(status),
        "url": clean_text(url),
    }
    if bank_name:
        payload["bank_name"] = clean_text(bank_name)
    if extra:
        payload.update(extra)
    return payload



def property_dedupe_key(item: dict[str, Any]) -> str:
    address = clean_text(str(item.get("address") or "")).lower()
    city = clean_text(str(item.get("city") or "")).lower()
    state = clean_text(str(item.get("state") or "")).lower()
    url = clean_text(str(item.get("url") or "")).lower()
    if address and city and state:
        return f"{address}|{city}|{state}"
    if address and state:
        return f"{address}|{state}"
    if url:
        return url
    return json.dumps(item, sort_keys=True)



def dedupe_properties(properties: list[dict[str, Any]], limit: int = 50) -> list[dict[str, Any]]:
    deduped: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in properties:
        key = property_dedupe_key(item)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
        if len(deduped) >= limit:
            break
    return deduped



def aggregate_banks(properties: list[dict[str, Any]]) -> dict[str, int]:
    counter: Counter[str] = Counter()
    for item in properties:
        bank_name = clean_text(str(item.get("bank_name") or ""))
        if bank_name:
            counter[bank_name] += 1
            continue
        blob = " ".join(
            clean_text(str(item.get(key) or ""))
            for key in ["address", "city", "state", "status", "url", "notes"]
        )
        for pattern in BANK_PATTERNS:
            match = re.search(pattern, blob, re.IGNORECASE)
            if match:
                counter[match.group(0)] += 1
    return dict(counter)



def aggregate_states(properties: list[dict[str, Any]]) -> dict[str, int]:
    counter: Counter[str] = Counter()
    for item in properties:
        state = clean_text(str(item.get("state") or "")).upper()
        if not state:
            location_blob = clean_text(
                " ".join([
                    str(item.get("address") or ""),
                    str(item.get("city") or ""),
                    str(item.get("url") or ""),
                ])
            )
            match = STATE_CODE_PATTERN.search(location_blob.upper())
            if match:
                state = match.group(1)
        if state:
            counter[state] += 1
    return dict(counter)



def _request_call(
    method: str,
    url: str,
    *,
    params: dict[str, Any] | None,
    data: dict[str, Any] | None,
    json_body: dict[str, Any] | None,
    headers: dict[str, str],
    timeout_seconds: int,
    verify: bool,
) -> requests.Response:
    return requests.request(
        method=method,
        url=url,
        params=params,
        data=data,
        json=json_body,
        headers=headers,
        timeout=timeout_seconds,
        allow_redirects=True,
        verify=verify,
    )



def _is_blocked_response(status_code: int | None, text: str) -> bool:
    if status_code in {401, 403, 429, 503}:
        return True
    lower = (text or "").lower()
    return any(marker in lower for marker in BLOCKED_MARKERS)


async def fetch_with_requests(
    url: str,
    *,
    method: str = "GET",
    params: dict[str, Any] | None = None,
    data: dict[str, Any] | None = None,
    json_body: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    timeout_seconds: int = 18,
    retries: int = 3,
    verify: bool = True,
    source: str = "network",
) -> FetchResult:
    errors: list[str] = []
    headers = dict(headers or {})

    log_step(source, "requests_start", url=url, method=method, retries=retries, timeout_seconds=timeout_seconds)

    for attempt in range(1, retries + 1):
        request_headers = {
            "User-Agent": random_user_agent(),
            "Accept": "text/html,application/json,application/xhtml+xml",
            **headers,
        }

        try:
            response = await asyncio.to_thread(
                _request_call,
                method,
                url,
                params=params,
                data=data,
                json_body=json_body,
                headers=request_headers,
                timeout_seconds=timeout_seconds,
                verify=verify,
            )
        except Exception as exc:
            err = f"attempt {attempt}: {exc}"
            errors.append(err)
            log_step(source, "requests_attempt_error", url=url, attempt=attempt, error=str(exc), level="warning")
            await asyncio.sleep(min(0.7 * attempt, 2.0))
            continue

        text = response.text or ""
        json_data = None
        content_type = (response.headers.get("content-type") or "").lower()
        if "json" in content_type:
            try:
                json_data = response.json()
            except ValueError:
                json_data = None

        blocked = _is_blocked_response(response.status_code, text)
        log_step(
            source,
            "requests_attempt_done",
            url=str(response.url),
            attempt=attempt,
            status_code=response.status_code,
            blocked=blocked,
            mode="requests",
        )

        if response.status_code < 400 and not blocked:
            return FetchResult(
                url=str(response.url),
                status_code=response.status_code,
                text=text,
                json_data=json_data,
                errors=errors,
                mode="requests",
            )

        errors.append(f"attempt {attempt}: HTTP {response.status_code}")

        should_retry = attempt < retries and (blocked or (response.status_code >= 500))
        if should_retry:
            await asyncio.sleep(min(0.8 * attempt, 2.2))
            continue

        return FetchResult(
            url=str(response.url),
            status_code=response.status_code,
            text=text,
            json_data=json_data,
            errors=errors,
            mode="requests",
        )

    return FetchResult(
        url=url,
        status_code=None,
        text="",
        json_data=None,
        errors=errors,
        mode="requests",
    )


async def fetch_with_playwright(
    url: str,
    *,
    wait_selector: str | None = None,
    scroll: bool = False,
    timeout_ms: int = 25000,
    headers: dict[str, str] | None = None,
    source: str = "network",
) -> FetchResult:
    errors: list[str] = []
    network_json: list[dict[str, Any]] = []

    log_step(source, "playwright_start", url=url, wait_selector=wait_selector, scroll=scroll, timeout_ms=timeout_ms)

    try:
        from playwright.async_api import TimeoutError as PlaywrightTimeoutError
        from playwright.async_api import async_playwright
    except Exception as exc:
        return FetchResult(
            url=url,
            status_code=None,
            text="",
            errors=[f"playwright unavailable: {exc}"],
            mode="playwright",
        )

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent=(headers or {}).get("User-Agent") or random_user_agent(),
                extra_http_headers=headers or {},
            )
            page = await context.new_page()

            async def _handle_response(response):
                try:
                    content_type = (response.headers.get("content-type") or "").lower()
                    response_url = response.url.lower()
                    if (
                        "json" in content_type
                        or "/api/" in response_url
                        or "search" in response_url
                        or "listings" in response_url
                    ):
                        payload = await response.json()
                        network_json.append({
                            "url": response.url,
                            "status": response.status,
                            "payload": payload,
                        })
                except Exception:
                    return

            def _capture_response(response):
                asyncio.create_task(_handle_response(response))

            page.on("response", _capture_response)

            response = await page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
            status_code = response.status if response else None

            if wait_selector:
                try:
                    await page.wait_for_selector(wait_selector, timeout=min(timeout_ms, 10000))
                except PlaywrightTimeoutError:
                    errors.append(f"wait_for_selector timeout: {wait_selector}")
                    log_step(source, "playwright_wait_selector_timeout", url=url, wait_selector=wait_selector, level="warning")

            if scroll:
                for _ in range(3):
                    await page.evaluate("window.scrollBy(0, document.body.scrollHeight)")
                    await asyncio.sleep(0.25)

            html = await page.content()
            final_url = page.url
            await context.close()
            await browser.close()

            log_step(
                source,
                "playwright_done",
                url=final_url,
                status_code=status_code,
                captured_network_json=len(network_json),
            )

            return FetchResult(
                url=final_url,
                status_code=status_code,
                text=html,
                json_data=None,
                errors=errors,
                mode="playwright",
                network_json=network_json,
            )
    except Exception as exc:
        errors.append(str(exc))
        log_step(source, "playwright_error", url=url, error=str(exc), level="warning")

    return FetchResult(
        url=url,
        status_code=None,
        text="",
        errors=errors,
        mode="playwright",
        network_json=network_json,
    )


async def fetch_with_fallback(
    url: str,
    *,
    method: str = "GET",
    params: dict[str, Any] | None = None,
    data: dict[str, Any] | None = None,
    json_body: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    wait_selector: str | None = None,
    wait_selectors: list[str] | None = None,
    failover_urls: list[str] | None = None,
    scroll: bool = False,
    timeout_seconds: int = 18,
    retries: int = 3,
    verify: bool = True,
    source: str = "network",
) -> FetchResult:
    candidate_urls = [url] + [candidate for candidate in (failover_urls or []) if candidate]
    # Preserve order, remove duplicates
    candidate_urls = list(dict.fromkeys(candidate_urls))

    selectors = wait_selectors or []
    if not selectors:
        selectors = [wait_selector] * len(candidate_urls)
    elif len(selectors) < len(candidate_urls):
        selectors = selectors + [selectors[-1]] * (len(candidate_urls) - len(selectors))

    all_errors: list[str] = []
    last_result: FetchResult | None = None

    log_step(source, "fallback_start", primary_url=url, failover_urls=failover_urls or [], attempts=len(candidate_urls))

    for idx, candidate_url in enumerate(candidate_urls):
        req_result = await fetch_with_requests(
            candidate_url,
            method=method,
            params=params,
            data=data,
            json_body=json_body,
            headers=headers,
            timeout_seconds=timeout_seconds,
            retries=retries,
            verify=verify,
            source=source,
        )
        last_result = req_result
        all_errors.extend(req_result.errors or [])

        blocked_or_failed = (not req_result.ok) or _is_blocked_response(req_result.status_code, req_result.text)
        if not blocked_or_failed:
            log_step(source, "fallback_success_requests", url=req_result.url, status_code=req_result.status_code, attempt_index=idx)
            req_result.errors = all_errors
            return req_result

    for idx, candidate_url in enumerate(candidate_urls):
        selector = selectors[idx] if idx < len(selectors) else wait_selector
        try:
            pw_result = await asyncio.wait_for(
                fetch_with_playwright(
                    candidate_url,
                    wait_selector=selector,
                    scroll=scroll,
                    headers=headers,
                    source=source,
                ),
                timeout=max(timeout_seconds * 2, 30),
            )
        except asyncio.TimeoutError:
            err = f"playwright timeout for {candidate_url}"
            all_errors.append(err)
            log_step(source, "fallback_playwright_timeout", url=candidate_url, level="warning")
            continue

        all_errors.extend(pw_result.errors or [])
        blocked_or_failed = (not pw_result.ok) or _is_blocked_response(pw_result.status_code, pw_result.text)
        if not blocked_or_failed:
            log_step(source, "fallback_success_playwright", url=pw_result.url, status_code=pw_result.status_code, attempt_index=idx)
            pw_result.errors = all_errors
            return pw_result

        last_result = pw_result

    if last_result is None:
        return FetchResult(
            url=url,
            status_code=None,
            text="",
            errors=all_errors or ["all fallback attempts failed"],
            mode="requests",
        )

    last_result.errors = all_errors
    log_step(source, "fallback_exhausted", url=last_result.url, status_code=last_result.status_code, total_errors=len(all_errors), level="warning")
    return last_result


async def run_with_concurrency(
    coros: list[Awaitable[Any]],
    *,
    limit: int = 4,
    timeout_seconds: float | None = None,
) -> list[Any]:
    semaphore = asyncio.Semaphore(max(1, limit))

    async def _runner(coro: Awaitable[Any]) -> Any:
        async with semaphore:
            if timeout_seconds is None:
                return await coro
            return await asyncio.wait_for(coro, timeout=timeout_seconds)

    return await asyncio.gather(*[_runner(coro) for coro in coros], return_exceptions=True)



def extract_bank_mentions(text: str) -> list[str]:
    text = clean_text(text)
    banks: list[str] = []
    for pattern in BANK_PATTERNS:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            banks.append(clean_text(match.group(0)))
    return banks



def parse_state_from_slug(slug: str) -> str | None:
    parts = [part for part in re.split(r"[-_/]", slug) if part]
    for part in parts:
        if len(part) == 2 and part.isalpha():
            return part.upper()
    return None



def parse_city_from_slug(slug: str) -> str | None:
    parts = [part for part in re.split(r"[-_/]", slug) if part]
    for idx, part in enumerate(parts):
        if len(part) == 2 and part.isalpha() and idx > 0:
            city_chunk = parts[max(0, idx - 2):idx]
            if city_chunk:
                return clean_text(" ".join(city_chunk).replace("%20", " ")).title()
    return None



def build_hud_search_url(city_or_state: str) -> str:
    return "https://www.hudhomestore.gov/searchresult?citystate=" + quote_plus(city_or_state)
