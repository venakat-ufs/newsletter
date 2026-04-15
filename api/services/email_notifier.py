import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from config import get_settings


def send_review_notification(draft_id: int, newsletter_issue: int, sections_preview: list[dict]):
    """Send email to reviewer when a new AI draft is ready for review."""
    settings = get_settings()

    if not settings.smtp_host or not settings.reviewer_email:
        print(f"[EMAIL SKIP] Would notify {settings.reviewer_email} about draft #{draft_id}")
        return False

    dashboard_url = f"{settings.dashboard_url.rstrip('/')}/drafts/{draft_id}"

    sections_html = ""
    for section in sections_preview:
        sections_html += f"""
        <div style="margin-bottom:16px;padding:12px;background:#f8f8f8;border-radius:4px;">
            <strong>{section.get('title', 'Untitled')}</strong>
            <p style="color:#666;margin:4px 0 0;">{section.get('teaser', '')}</p>
        </div>
        """

    html = f"""
    <div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;">
        <div style="background:#1a1a2e;color:white;padding:20px;text-align:center;">
            <h2 style="margin:0;">The Disposition Desk</h2>
            <p style="margin:4px 0 0;opacity:0.8;">Draft Ready for Review</p>
        </div>
        <div style="padding:24px;">
            <p>A new newsletter draft (Issue #{newsletter_issue}) is ready for your review.</p>
            <h3>Draft Preview:</h3>
            {sections_html}
            <div style="text-align:center;margin-top:24px;">
                <a href="{dashboard_url}" style="display:inline-block;padding:14px 32px;background:#e94560;color:white;text-decoration:none;border-radius:4px;font-size:16px;">
                    Review Now
                </a>
            </div>
            <p style="color:#888;font-size:12px;margin-top:24px;">
                This is an automated notification from the UFS Newsletter System.
            </p>
        </div>
    </div>
    """

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"[Review Needed] Disposition Desk Issue #{newsletter_issue}"
    msg["From"] = settings.smtp_user or "newsletter@unitedffs.com"
    msg["To"] = settings.reviewer_email
    msg.attach(MIMEText(html, "html"))

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.starttls()
            if settings.smtp_user and settings.smtp_pass:
                server.login(settings.smtp_user, settings.smtp_pass)
            server.send_message(msg)
        return True
    except Exception as e:
        print(f"[EMAIL ERROR] Failed to send review notification: {e}")
        return False
