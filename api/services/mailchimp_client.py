from datetime import datetime, timedelta

import mailchimp_marketing as MailchimpMarketing
from mailchimp_marketing.api_client import ApiClientError

from config import get_settings
from models.article import Article


def _get_client() -> MailchimpMarketing.Client:
    settings = _require_mailchimp_settings()
    client = MailchimpMarketing.Client()
    client.set_config({
        "api_key": settings.mailchimp_api_key,
        "server": settings.mailchimp_server_prefix,
    })
    return client


def _require_mailchimp_settings():
    settings = get_settings()
    missing = []
    if not settings.mailchimp_api_key:
        missing.append("MAILCHIMP_API_KEY")
    if not settings.mailchimp_server_prefix:
        missing.append("MAILCHIMP_SERVER_PREFIX")
    if not settings.mailchimp_list_id:
        missing.append("MAILCHIMP_LIST_ID")
    if missing:
        raise RuntimeError(f"Mailchimp not configured: {', '.join(missing)}")
    return settings


def _build_html_content(newsletter, articles: list[Article]) -> str:
    """Build newsletter HTML from published article content."""
    html_parts = []

    html_parts.append("""
    <div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;">
        <div style="background:#1a1a2e;color:white;padding:24px;text-align:center;">
            <h1 style="margin:0;font-size:28px;">The Disposition Desk</h1>
            <p style="margin:8px 0 0;opacity:0.8;">Weekly REO Industry Intelligence by United Field Services</p>
            <p style="margin:8px 0 0;opacity:0.68;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;">Issue #""" + str(newsletter.issue_number) + """</p>
        </div>
    """)

    section_icons = {
        "market_pulse": "📊",
        "top_banks": "🏦",
        "hot_markets": "📍",
        "industry_news": "📰",
        "ufs_spotlight": "💼",
    }

    for article in articles:
        icon = section_icons.get(article.section_type, "📋")
        article_url = article.ms_platform_url or "#"
        html_parts.append(f"""
        <div style="padding:24px;border-bottom:1px solid #eee;">
            <h2 style="color:#1a1a2e;margin:0 0 8px;">{icon} {article.title}</h2>
            <p style="color:#555;line-height:1.6;">{article.teaser}</p>
            <a href="{article_url}" style="display:inline-block;margin-top:12px;padding:10px 20px;background:#e94560;color:white;text-decoration:none;border-radius:4px;">Read More →</a>
        </div>
        """)

    html_parts.append("""
        <div style="background:#f5f5f5;padding:20px;text-align:center;font-size:12px;color:#888;">
            <p>United Field Services | <a href="https://unitedffs.com">unitedffs.com</a></p>
            <p><a href="https://clients.unitedffs.com/register/client">Register</a> | <a href="https://unitedffs.com/help-center-for-clients/">Help Center</a></p>
        </div>
    </div>
    """)

    return "\n".join(html_parts)


def _next_tuesday_9am() -> str:
    """Calculate next Tuesday at 9:00 AM UTC."""
    now = datetime.utcnow()
    days_until_tuesday = (1 - now.weekday()) % 7
    if days_until_tuesday == 0 and now.hour >= 9:
        days_until_tuesday = 7
    next_tue = now + timedelta(days=days_until_tuesday)
    send_time = next_tue.replace(hour=9, minute=0, second=0, microsecond=0)
    return send_time.strftime("%Y-%m-%dT%H:%M:%S+00:00")


def schedule_campaign(newsletter, articles: list[Article]) -> str:
    """Create and schedule a Mailchimp campaign for next Tuesday 9AM."""
    settings = _require_mailchimp_settings()
    client = _get_client()

    try:
        campaign = client.campaigns.create({
            "type": "regular",
            "recipients": {"list_id": settings.mailchimp_list_id},
            "settings": {
                "subject_line": f"The Disposition Desk — Issue #{newsletter.issue_number}",
                "from_name": "United Field Services",
                "reply_to": "newsletter@unitedffs.com",
                "title": f"Disposition Desk #{newsletter.issue_number}",
            },
        })

        campaign_id = campaign["id"]

        html_content = _build_html_content(newsletter, articles)
        client.campaigns.set_content(campaign_id, {"html": html_content})

        send_time = _next_tuesday_9am()
        client.campaigns.schedule(campaign_id, {"schedule_time": send_time})

        return campaign_id

    except ApiClientError as e:
        raise RuntimeError(f"Mailchimp error: {e.text}")


def get_campaign_status(campaign_id: str) -> dict:
    """Get the status of a Mailchimp campaign."""
    try:
        client = _get_client()
    except RuntimeError as exc:
        return {"status": "unconfigured", "campaign_id": campaign_id, "error": str(exc)}
    try:
        campaign = client.campaigns.get(campaign_id)
        return {
            "status": campaign.get("status"),
            "send_time": campaign.get("send_time"),
            "emails_sent": campaign.get("emails_sent"),
        }
    except ApiClientError as e:
        return {"status": "error", "error": str(e)}
