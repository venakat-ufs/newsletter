from dataclasses import dataclass

from services.mailchimp_client import _build_html_content


@dataclass
class FakeNewsletter:
    issue_number: int = 1


@dataclass
class FakeArticle:
    section_type: str = "market_pulse"
    title: str = ""
    teaser: str = ""
    ms_platform_url: str = "https://example.com/a"


def test_build_html_content_escapes_malicious_title():
    article = FakeArticle(title="<script>alert(1)</script>", teaser="safe teaser")
    html_out = _build_html_content(FakeNewsletter(), [article])
    assert "<script>alert(1)</script>" not in html_out
    assert "&lt;script&gt;" in html_out
