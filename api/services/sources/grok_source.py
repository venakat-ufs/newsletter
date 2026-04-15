import json
import re
from datetime import datetime, timedelta

import httpx

from config import get_settings
from services.sources.base import BaseSource, SourceResult

SEARCH_QUERIES = [
    "REO foreclosure real estate",
    "bank owned properties market",
    "foreclosure activity 2026",
    "REO listing agent",
]


class GrokSource(BaseSource):
    """Pulls REO/foreclosure discussions and news from X via Grok API."""

    name = "grok"

    def _extract_response_text(self, payload: dict) -> str:
        if isinstance(payload.get("output_text"), str) and payload["output_text"].strip():
            return payload["output_text"].strip()

        parts: list[str] = []
        for item in payload.get("output", []) or []:
            if not isinstance(item, dict):
                continue

            if isinstance(item.get("text"), str) and item["text"].strip():
                parts.append(item["text"].strip())

            content = item.get("content")
            if not isinstance(content, list):
                continue

            for part in content:
                if not isinstance(part, dict):
                    continue
                text_value = part.get("text")
                if isinstance(text_value, str) and text_value.strip():
                    parts.append(text_value.strip())
                    continue
                nested = part.get("text", {})
                if isinstance(nested, dict):
                    nested_value = nested.get("value")
                    if isinstance(nested_value, str) and nested_value.strip():
                        parts.append(nested_value.strip())

        return "\n".join(parts).strip()

    def _extract_json_array_candidate(self, value: str) -> str:
        trimmed = value.strip()
        without_fences = re.sub(r"^\s*```json\s*|\s*```\s*$|^\s*```\s*", "", trimmed, flags=re.I)
        match = re.search(r"\[[\s\S]*\]", without_fences)
        return match.group(0) if match else without_fences

    def _normalize_post(self, post: dict, query: str) -> dict | None:
        author = post.get("author", "")
        content = post.get("content", "")
        url = post.get("url", "")

        if not isinstance(author, str) or not author.strip():
            return None
        if not isinstance(content, str) or not content.strip():
            return None
        if not isinstance(url, str) or not url.strip():
            return None

        return {
            "author": author.strip(),
            "content": content.strip(),
            "url": url.strip(),
            "query": query,
            "engagement": post.get("engagement", "") if isinstance(post.get("engagement"), str) else "",
            "posted_date": post.get("posted_date", "") if isinstance(post.get("posted_date"), str) else "",
            "takeaway": post.get("takeaway", "") if isinstance(post.get("takeaway"), str) else "",
        }

    def collect(self) -> SourceResult:
        settings = get_settings()
        if not settings.grok_api_key:
            return SourceResult(
                source=self.name,
                data=[],
                errors=["GROK_API_KEY not configured"],
                success=False,
            )

        all_posts = []
        errors = []
        week_ago = (datetime.utcnow() - timedelta(days=7)).strftime("%Y-%m-%d")
        today = datetime.utcnow().strftime("%Y-%m-%d")

        for query in SEARCH_QUERIES:
            try:
                response = httpx.post(
                    "https://api.x.ai/v1/responses",
                    headers={
                        "Authorization": f"Bearer {settings.grok_api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "grok-4.20-beta-latest-non-reasoning",
                        "temperature": 0.2,
                        "max_output_tokens": 1400,
                        "input": [
                            {
                                "role": "system",
                                "content": (
                                    "You are a research assistant for an REO newsletter. "
                                    "Use X search if available. Find the most relevant recent X posts "
                                    "about the requested topic from the past 7 days. Return only a JSON "
                                    "array. Each item must contain: author, content, engagement, "
                                    "posted_date, url, takeaway."
                                ),
                            },
                            {
                                "role": "user",
                                "content": (
                                    f"Topic: {query}\n"
                                    f"Date window: {week_ago} to {today}\n"
                                    "Return at most 6 posts. If you cannot find enough recent posts, "
                                    "return an empty JSON array."
                                ),
                            },
                        ],
                        "tools": [{"type": "x_search"}],
                    },
                    timeout=30,
                )
                response.raise_for_status()
                payload = response.json()
                content = self._extract_response_text(payload) or "[]"
                normalized_content = self._extract_json_array_candidate(content)
                try:
                    posts = json.loads(normalized_content)
                    if isinstance(posts, list):
                        accepted = 0
                        for post in posts:
                            if not isinstance(post, dict):
                                continue
                            normalized = self._normalize_post(post, query)
                            if not normalized:
                                continue
                            all_posts.append(normalized)
                            accepted += 1
                        if accepted == 0:
                            errors.append(f"Grok query '{query}' returned no structured posts.")
                except json.JSONDecodeError:
                    errors.append(f"Grok query '{query}' returned unstructured output.")

            except Exception as e:
                errors.append(f"Grok query '{query}' failed: {str(e)}")

        return SourceResult(
            source=self.name,
            data=all_posts,
            errors=errors,
            success=len(all_posts) > 0,
        )
