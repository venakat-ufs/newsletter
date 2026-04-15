from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.newsletter import Newsletter, NewsletterStatus
from models.draft import Draft, DraftStatus
from models.article import Article

router = APIRouter()


@router.post("/schedule/{newsletter_id}")
def schedule_newsletter(newsletter_id: int, db: Session = Depends(get_db)):
    """Schedule approved newsletter for Mailchimp send (Tuesday 9AM)."""
    newsletter = db.query(Newsletter).filter(Newsletter.id == newsletter_id).first()
    if not newsletter:
        raise HTTPException(status_code=404, detail="Newsletter not found")

    draft = db.query(Draft).filter(
        Draft.newsletter_id == newsletter_id,
        Draft.status == DraftStatus.APPROVED.value,
    ).first()
    if not draft:
        raise HTTPException(status_code=400, detail="No approved draft for this newsletter")

    from services.mailchimp_client import schedule_campaign
    from services.article_publisher import publish_articles_from_draft

    if newsletter.mailchimp_campaign_id and newsletter.status == NewsletterStatus.SCHEDULED.value:
        return {"status": "already_scheduled", "campaign_id": newsletter.mailchimp_campaign_id}

    articles = db.query(Article).filter(Article.newsletter_id == newsletter_id).all()
    if not articles:
        articles = publish_articles_from_draft(db, newsletter_id)

    try:
        campaign_id = schedule_campaign(newsletter, articles)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    newsletter.mailchimp_campaign_id = campaign_id
    newsletter.status = NewsletterStatus.SCHEDULED.value
    db.commit()

    return {"status": "scheduled", "campaign_id": campaign_id, "article_count": len(articles)}


@router.get("/status/{newsletter_id}")
def get_newsletter_status(newsletter_id: int, db: Session = Depends(get_db)):
    """Check Mailchimp campaign status for a newsletter."""
    newsletter = db.query(Newsletter).filter(Newsletter.id == newsletter_id).first()
    if not newsletter:
        raise HTTPException(status_code=404, detail="Newsletter not found")

    if not newsletter.mailchimp_campaign_id:
        return {"status": newsletter.status, "campaign_id": None}

    from services.mailchimp_client import get_campaign_status
    mc_status = get_campaign_status(newsletter.mailchimp_campaign_id)
    return {"status": newsletter.status, "mailchimp_status": mc_status}


@router.get("/", response_model=None)
def list_newsletters(db: Session = Depends(get_db)):
    """List all newsletters."""
    newsletters = db.query(Newsletter).order_by(Newsletter.issue_date.desc()).all()
    return [
        {
            "id": n.id,
            "issue_number": n.issue_number,
            "issue_date": n.issue_date.isoformat(),
            "status": n.status,
            "mailchimp_campaign_id": n.mailchimp_campaign_id,
            "created_at": n.created_at.isoformat(),
        }
        for n in newsletters
    ]
