from html import escape

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from database import get_db
from models.article import Article
from services.article_publisher import publish_articles_from_draft

router = APIRouter()


@router.post("/publish/{newsletter_id}")
def publish_articles(newsletter_id: int, db: Session = Depends(get_db)):
    """Publish approved draft content as public article pages."""
    articles = publish_articles_from_draft(db, newsletter_id)
    return {
        "published": len(articles),
        "titles": [article.title for article in articles],
        "article_urls": [article.ms_platform_url for article in articles],
    }


@router.get("/{newsletter_id}")
def get_articles(newsletter_id: int, db: Session = Depends(get_db)):
    """Get all articles for a newsletter."""
    articles = db.query(Article).filter(Article.newsletter_id == newsletter_id).all()
    return [
        {
            "id": a.id,
            "section_type": a.section_type,
            "title": a.title,
            "teaser": a.teaser,
            "body": a.body,
            "audience_tag": a.audience_tag,
            "publish_date": a.publish_date.isoformat() if a.publish_date else None,
            "article_url": a.ms_platform_url,
        }
        for a in articles
    ]


@router.get("/public/{article_id}", response_class=HTMLResponse)
def view_public_article(article_id: int, db: Session = Depends(get_db)):
    """Render a public article page for email click-throughs."""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    issue_number = article.newsletter.issue_number if article.newsletter else article.newsletter_id
    teaser = escape(article.teaser)
    body_html = "<br><br>".join(
        escape(block.strip()) for block in article.body.split("\n\n") if block.strip()
    )
    publish_date = article.publish_date.strftime("%B %d, %Y") if article.publish_date else "Unpublished"

    return f"""
    <html>
      <head>
        <title>{escape(article.title)} | The Disposition Desk</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body style="margin:0;background:#f5f1e8;color:#171717;font-family:Georgia,serif;">
        <div style="max-width:760px;margin:0 auto;padding:48px 24px;">
          <div style="margin-bottom:32px;padding:28px 32px;background:#10222d;color:#f8f3ea;border-radius:24px;">
            <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.72;">
              The Disposition Desk
            </div>
            <h1 style="margin:14px 0 10px;font-size:40px;line-height:1.05;">{escape(article.title)}</h1>
            <p style="margin:0;font-size:18px;line-height:1.6;color:#d4dde1;">{teaser}</p>
          </div>

          <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:28px;font-family:Arial,sans-serif;">
            <span style="padding:8px 12px;border-radius:999px;background:#eadbc8;color:#6a4e2f;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;">Issue #{issue_number}</span>
            <span style="padding:8px 12px;border-radius:999px;background:#dce6ea;color:#214555;font-size:12px;">Published {publish_date}</span>
            <span style="padding:8px 12px;border-radius:999px;background:#efe7d8;color:#705c3d;font-size:12px;">Audience {escape(article.audience_tag)}</span>
          </div>

          <article style="background:#fffdf8;border-radius:24px;padding:32px;box-shadow:0 24px 60px rgba(16,34,45,0.08);font-size:18px;line-height:1.85;">
            {body_html}
          </article>
        </div>
      </body>
    </html>
    """
