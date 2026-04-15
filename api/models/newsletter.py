import enum
from datetime import datetime

from sqlalchemy import Integer, String, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class NewsletterStatus(str, enum.Enum):
    DRAFT = "draft"
    APPROVED = "approved"
    SCHEDULED = "scheduled"
    SENT = "sent"
    FAILED = "failed"


class Newsletter(Base):
    __tablename__ = "newsletters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    issue_number: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    issue_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default=NewsletterStatus.DRAFT.value)
    mailchimp_campaign_id: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    articles = relationship("Article", back_populates="newsletter", cascade="all, delete-orphan")
    drafts = relationship("Draft", back_populates="newsletter", cascade="all, delete-orphan")
