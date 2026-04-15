import enum
from datetime import datetime

from sqlalchemy import Integer, String, DateTime, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class DraftStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CHANGES_REQUESTED = "changes_requested"


class Draft(Base):
    __tablename__ = "drafts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    newsletter_id: Mapped[int] = mapped_column(ForeignKey("newsletters.id"), nullable=False)
    raw_data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    ai_draft: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    human_edits: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default=DraftStatus.PENDING.value)
    reviewer_email: Mapped[str | None] = mapped_column(String(500), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    sources_used: Mapped[list | None] = mapped_column(JSON, nullable=True)
    sources_failed: Mapped[list | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    newsletter = relationship("Newsletter", back_populates="drafts")
    approval_logs = relationship("ApprovalLog", back_populates="draft", cascade="all, delete-orphan")

    @property
    def issue_number(self) -> int | None:
        newsletter = getattr(self, "newsletter", None)
        return newsletter.issue_number if newsletter else None

    @property
    def sources_warning(self) -> list | None:
        if not isinstance(self.raw_data, dict):
            return None
        meta = self.raw_data.get("meta")
        if not isinstance(meta, dict):
            return None
        warnings = meta.get("sources_warning")
        return warnings if isinstance(warnings, list) else None
