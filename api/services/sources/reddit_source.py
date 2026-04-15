import httpx
import praw

from config import get_settings
from services.sources.base import BaseSource, SourceResult

SUBREDDITS = [
    "realestate",
    "RealEstateInvesting",
    # r/foreclosure is private (403) — removed
]

KEYWORDS = ["REO", "foreclosure", "bank owned", "bank-owned", "asset manager", "default servicing"]


class RedditSource(BaseSource):
    """Pulls top REO/foreclosure discussions from relevant subreddits."""

    name = "reddit"

    def _matches_keywords(self, title: str, text: str) -> bool:
        combined = f"{title} {text}".lower()
        return any(kw.lower() in combined for kw in KEYWORDS)

    def _collect_with_praw(self, settings) -> SourceResult:
        reddit = praw.Reddit(
            client_id=settings.reddit_client_id,
            client_secret=settings.reddit_client_secret,
            user_agent=settings.reddit_user_agent,
        )

        all_posts = []
        errors = []

        for sub_name in SUBREDDITS:
            try:
                subreddit = reddit.subreddit(sub_name)
                for post in subreddit.top(time_filter="week", limit=20):
                    if self._matches_keywords(post.title, post.selftext or ""):
                        all_posts.append({
                            "subreddit": sub_name,
                            "title": post.title,
                            "text": post.selftext[:1000] if post.selftext else "",
                            "score": post.score,
                            "num_comments": post.num_comments,
                            "author": str(post.author) if post.author else "[deleted]",
                            "url": f"https://reddit.com{post.permalink}",
                            "created_utc": post.created_utc,
                            "retrieval_mode": "praw",
                        })
            except Exception as e:
                errors.append(f"Subreddit r/{sub_name} failed: {str(e)}")

        return SourceResult(
            source=self.name,
            data=all_posts,
            errors=errors,
            success=len(all_posts) > 0 or len(errors) == 0,
        )

    def _collect_public_json(self, settings) -> SourceResult:
        all_posts = []
        errors = []
        headers = {
            "User-Agent": settings.reddit_user_agent or "ufs-newsletter/1.0",
            "Accept": "application/json",
        }
        seen_urls = set()

        for sub_name in SUBREDDITS:
            try:
                response = httpx.get(
                    f"https://www.reddit.com/r/{sub_name}/top.json",
                    params={"t": "week", "limit": 20, "raw_json": 1},
                    headers=headers,
                    follow_redirects=True,
                    timeout=15,
                )
                response.raise_for_status()
                payload = response.json()

                for child in payload.get("data", {}).get("children", []):
                    post = child.get("data", {})
                    title = post.get("title", "")
                    text = post.get("selftext", "") or ""
                    url = f"https://reddit.com{post.get('permalink', '')}"
                    if url in seen_urls or not self._matches_keywords(title, text):
                        continue
                    seen_urls.add(url)
                    all_posts.append({
                        "subreddit": sub_name,
                        "title": title,
                        "text": text[:1000],
                        "score": post.get("score", 0),
                        "num_comments": post.get("num_comments", 0),
                        "author": post.get("author", "[deleted]"),
                        "url": url,
                        "created_utc": post.get("created_utc"),
                        "retrieval_mode": "public_json",
                    })
            except Exception as e:
                errors.append(f"Subreddit r/{sub_name} public JSON failed: {str(e)}")

        return SourceResult(
            source=self.name,
            data=all_posts,
            errors=errors,
            success=len(all_posts) > 0 or len(errors) == 0,
        )

    def collect(self) -> SourceResult:
        settings = get_settings()
        if settings.reddit_client_id and settings.reddit_client_secret:
            result = self._collect_with_praw(settings)
            if result.data or not result.errors:
                return result

            fallback = self._collect_public_json(settings)
            fallback.errors = [*result.errors, *fallback.errors]
            return fallback

        fallback = self._collect_public_json(settings)
        if fallback.data or not fallback.errors:
            return fallback

        return SourceResult(
            source=self.name,
            data=[],
            errors=["Reddit API credentials not configured", *fallback.errors],
            success=False,
        )
