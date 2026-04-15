from datetime import datetime, timedelta

import httpx

from config import get_settings
from services.sources.base import BaseSource, SourceResult

QUERIES = [
    "REO foreclosure real estate",
    "bank owned properties",
    "mortgage default foreclosure",
    "HUD REO disposition",
]

NEWS_API_URL = "https://newsapi.org/v2/everything"
RELEVANT_TERMS = [
    "reo",
    "foreclosure",
    "foreclosed",
    "bank owned",
    "bank-owned",
    "distressed property",
    "hud home",
    "homepath",
    "homesteps",
    "fannie mae",
    "freddie mac",
    "disposition",
]


class NewsApiSource(BaseSource):
    """Pulls published news articles about REO/foreclosures from News API."""

    name = "news_api"

    def _is_relevant(self, article: dict) -> bool:
        combined = " ".join([
            article.get("title", "") or "",
            article.get("description", "") or "",
            article.get("content", "") or "",
        ]).lower()
        return any(term in combined for term in RELEVANT_TERMS)

    def collect(self) -> SourceResult:
        settings = get_settings()
        if not settings.news_api_key:
            return SourceResult(
                source=self.name,
                data=[],
                errors=["NEWS_API_KEY not configured"],
                success=False,
            )

        week_ago = (datetime.utcnow() - timedelta(days=7)).strftime("%Y-%m-%d")
        all_articles = []
        errors = []
        seen_urls = set()

        for query in QUERIES:
            try:
                response = httpx.get(
                    NEWS_API_URL,
                    params={
                        "q": query,
                        "from": week_ago,
                        "sortBy": "relevancy",
                        "language": "en",
                        "pageSize": 10,
                        "apiKey": settings.news_api_key,
                    },
                    timeout=15,
                )
                response.raise_for_status()
                data = response.json()

                for article in data.get("articles", []):
                    if not self._is_relevant(article):
                        continue

                    url = article.get("url", "")
                    if url in seen_urls:
                        continue
                    seen_urls.add(url)

                    all_articles.append({
                        "query": query,
                        "title": article.get("title", ""),
                        "description": article.get("description", ""),
                        "source_name": article.get("source", {}).get("name", ""),
                        "url": url,
                        "published_at": article.get("publishedAt", ""),
                        "content_preview": (article.get("content") or "")[:500],
                    })

            except Exception as e:
                errors.append(f"News API query '{query}' failed: {str(e)}")

        if all_articles:
            return SourceResult(
                source=self.name,
                data=all_articles,
                errors=errors,
                success=True,
            )

        return SourceResult(
            source=self.name,
            data=[],
            errors=errors or ["News API returned no articles"],
            success=False,
        )
