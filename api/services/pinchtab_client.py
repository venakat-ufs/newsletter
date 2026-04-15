from __future__ import annotations

from dataclasses import dataclass
from time import sleep
from urllib.parse import urlparse

import httpx

from config import get_settings


@dataclass
class PinchTabSession:
    instance_url: str
    tab_id: str
    final_url: str
    cookies: list[dict]

    @property
    def cookie_header(self) -> str:
        pairs = []
        for cookie in self.cookies:
            name = str(cookie.get("name", "")).strip()
            value = str(cookie.get("value", "")).strip()
            if name and value:
                pairs.append(f"{name}={value}")
        return "; ".join(pairs)


class PinchTabClient:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.base_url = self.settings.pinchtab_base_url.rstrip("/")
        self.token = self.settings.pinchtab_token.strip()
        self.profile_name = self.settings.pinchtab_profile_name.strip() or "ufs-newsletter"

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    def _request(
        self,
        method: str,
        path: str,
        *,
        base_url: str | None = None,
        params: dict | None = None,
        json: dict | None = None,
        timeout: float = 20.0,
    ) -> dict:
        url = f"{(base_url or self.base_url).rstrip('/')}{path}"
        response = httpx.request(
            method,
            url,
            headers=self._headers(),
            params=params,
            json=json,
            timeout=timeout,
            follow_redirects=True,
        )
        response.raise_for_status()
        data = response.json()
        if isinstance(data, dict) and data.get("status") == "error":
            raise RuntimeError(data.get("error") or data.get("message") or f"PinchTab error on {path}")
        return data if isinstance(data, dict) else {"data": data}

    def _resolve_profile_id(self) -> str:
        profiles = self._request("GET", "/profiles", timeout=10.0)
        if isinstance(profiles.get("data"), list):
            entries = profiles["data"]
        elif isinstance(profiles, list):
            entries = profiles
        else:
            entries = profiles if isinstance(profiles, list) else profiles.get("profiles", [])

        for profile in entries:
            if not isinstance(profile, dict):
                continue
            if profile.get("id") == self.profile_name or profile.get("name") == self.profile_name:
                return str(profile.get("id") or self.profile_name)

        if not self.settings.pinchtab_create_profile:
            raise RuntimeError(
                f"PinchTab profile '{self.profile_name}' not found and PINCHTAB_CREATE_PROFILE is false"
            )

        created = self._request("POST", "/profiles", json={"name": self.profile_name}, timeout=15.0)
        profile_id = created.get("id")
        if not profile_id:
            raise RuntimeError(f"PinchTab created profile without id: {created}")
        return str(profile_id)

    def _instance_url_from_port(self, port: int | str) -> str:
        parsed = urlparse(self.base_url)
        scheme = parsed.scheme or "http"
        host = parsed.hostname or "127.0.0.1"
        return f"{scheme}://{host}:{port}"

    def start_profile(self) -> tuple[str, str]:
        profile_id = self._resolve_profile_id()
        started = self._request(
            "POST",
            f"/profiles/{profile_id}/start",
            json={"headless": self.settings.pinchtab_headless},
            timeout=30.0,
        )
        port = started.get("port")
        if not port:
            raise RuntimeError(f"PinchTab start response missing port: {started}")
        instance_url = self._instance_url_from_port(port)
        return profile_id, instance_url

    def prime_url(self, url: str) -> PinchTabSession:
        _, instance_url = self.start_profile()
        navigation = self._request(
            "POST",
            "/navigate",
            base_url=instance_url,
            json={"url": url, "newTab": True},
            timeout=60.0,
        )
        tab_id = str(navigation.get("tabId", "")).strip()
        if not tab_id:
            raise RuntimeError(f"PinchTab navigate did not return tabId: {navigation}")

        if self.settings.pinchtab_settle_seconds > 0:
            sleep(self.settings.pinchtab_settle_seconds)

        cookie_result = self._request(
            "GET",
            f"/tabs/{tab_id}/cookies",
            base_url=instance_url,
            params={"url": url},
            timeout=20.0,
        )
        cookies = cookie_result.get("cookies", [])
        return PinchTabSession(
            instance_url=instance_url,
            tab_id=tab_id,
            final_url=str(navigation.get("url") or url),
            cookies=cookies if isinstance(cookies, list) else [],
        )


def get_pinchtab_cookie_header(url: str) -> tuple[str, list[str]]:
    settings = get_settings()
    if not settings.pinchtab_enabled:
        return "", ["PINCHTAB_ENABLED is false"]

    try:
        session = PinchTabClient().prime_url(url)
    except Exception as exc:
        return "", [f"PinchTab session failed: {exc}"]

    if not session.cookies:
        return "", [
            "PinchTab navigation succeeded but no cookies were available for the target URL"
        ]

    return session.cookie_header, []
