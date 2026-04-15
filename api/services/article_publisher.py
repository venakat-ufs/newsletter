from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from config import get_settings
from models.article import Article, AudienceTag
from models.draft import Draft, DraftStatus


def _public_base_url() -> str:
    settings = get_settings()
    return (settings.api_public_url or f"http://localhost:{settings.api_port}").rstrip("/")


def publish_articles_from_draft(db: Session, newsletter_id: int) -> list[Article]:
    draft = db.query(Draft).filter(
        Draft.newsletter_id == newsletter_id,
        Draft.status == DraftStatus.APPROVED.value,
    ).first()
    if not draft:
        raise HTTPException(status_code=400, detail="No approved draft for this newsletter")

    content = draft.human_edits if draft.human_edits else draft.ai_draft
    sections = content.get("sections", [])
    if not sections:
        raise HTTPException(status_code=400, detail="Approved draft has no sections to publish")

    db.query(Article).filter(Article.newsletter_id == newsletter_id).delete()

    publish_date = datetime.utcnow()
    articles: list[Article] = []
    for section in sections:
        article = Article(
            newsletter_id=newsletter_id,
            section_type=section["section_type"],
            title=section["title"],
            teaser=section["teaser"],
            body=section["body"],
            audience_tag=section.get("audience_tag", AudienceTag.REO.value),
            publish_date=publish_date,
        )
        db.add(article)
        db.flush()
        article.ms_platform_url = f"{_public_base_url()}/api/articles/public/{article.id}"
        articles.append(article)

    db.commit()

    for article in articles:
        db.refresh(article)

    return articles
