from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models.draft import Draft, DraftStatus
from models.approval_log import ApprovalLog, ApprovalAction
from models.newsletter import NewsletterStatus

router = APIRouter()


class DraftUpdate(BaseModel):
    human_edits: Optional[dict] = None
    status: Optional[DraftStatus] = None
    reviewer_email: Optional[str] = None
    notes: Optional[str] = None


class DraftResponse(BaseModel):
    id: int
    newsletter_id: int
    issue_number: int
    raw_data: dict
    ai_draft: dict
    human_edits: Optional[dict]
    status: str
    reviewer_email: Optional[str]
    reviewed_at: Optional[datetime]
    sources_used: Optional[list]
    sources_warning: Optional[list]
    sources_failed: Optional[list]
    created_at: datetime

    model_config = {"from_attributes": True}


@router.post("/generate/{newsletter_id}")
def generate_draft(newsletter_id: int, db: Session = Depends(get_db)):
    """Generate AI draft from collected raw data."""
    draft = db.query(Draft).filter(
        Draft.newsletter_id == newsletter_id
    ).order_by(Draft.created_at.desc()).first()

    if not draft:
        raise HTTPException(status_code=404, detail="No draft found for this newsletter. Run pipeline first.")

    if not draft.raw_data:
        raise HTTPException(status_code=400, detail="No raw data collected. Run pipeline first.")

    from services.ai_drafter import generate_ai_draft
    ai_draft = generate_ai_draft(draft.raw_data)
    draft.ai_draft = ai_draft
    db.commit()
    db.refresh(draft)

    sections = ai_draft.get("sections", [])
    if sections:
        from services.email_notifier import send_review_notification
        send_review_notification(
            draft.id,
            draft.newsletter.issue_number,
            sections,
        )

    return DraftResponse.model_validate(draft)


@router.get("/", response_model=list[DraftResponse])
def list_drafts(
    status: Optional[DraftStatus] = None,
    db: Session = Depends(get_db),
):
    """List all drafts, optionally filtered by status."""
    query = db.query(Draft).order_by(Draft.updated_at.desc())
    if status:
        query = query.filter(Draft.status == status.value)
    return [DraftResponse.model_validate(d) for d in query.all()]


@router.get("/{draft_id}", response_model=DraftResponse)
def get_draft(draft_id: int, db: Session = Depends(get_db)):
    """Get a single draft by ID."""
    draft = db.query(Draft).filter(Draft.id == draft_id).first()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    return DraftResponse.model_validate(draft)


@router.patch("/{draft_id}", response_model=DraftResponse)
def update_draft(draft_id: int, update: DraftUpdate, db: Session = Depends(get_db)):
    """Update a draft (human edits, status change, approval/rejection)."""
    draft = db.query(Draft).filter(Draft.id == draft_id).first()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")

    if update.human_edits is not None:
        draft.human_edits = update.human_edits

    if update.status is not None:
        status_value = update.status.value
        draft.status = status_value
        draft.reviewed_at = datetime.utcnow()
        if update.reviewer_email:
            draft.reviewer_email = update.reviewer_email

        if status_value == DraftStatus.APPROVED.value:
            draft.newsletter.status = NewsletterStatus.APPROVED.value
        elif status_value in {
            DraftStatus.PENDING.value,
            DraftStatus.REJECTED.value,
            DraftStatus.CHANGES_REQUESTED.value,
        } and draft.newsletter.status not in {
            NewsletterStatus.SCHEDULED.value,
            NewsletterStatus.SENT.value,
        }:
            draft.newsletter.status = NewsletterStatus.DRAFT.value

        action_map = {
            DraftStatus.APPROVED.value: ApprovalAction.APPROVE.value,
            DraftStatus.REJECTED.value: ApprovalAction.REJECT.value,
            DraftStatus.CHANGES_REQUESTED.value: ApprovalAction.REQUEST_CHANGES.value,
        }
        if status_value in action_map:
            log = ApprovalLog(
                draft_id=draft.id,
                action=action_map[status_value],
                reviewer=update.reviewer_email or "unknown",
                notes=update.notes,
            )
            db.add(log)

    db.commit()
    db.refresh(draft)
    return DraftResponse.model_validate(draft)
