import enum
from datetime import datetime

from sqlalchemy import Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class ApprovalAction(str, enum.Enum):
    APPROVE = "approve"
    REJECT = "reject"
    REQUEST_CHANGES = "request_changes"
    EDIT = "edit"


class ApprovalLog(Base):
    __tablename__ = "approval_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    draft_id: Mapped[int] = mapped_column(ForeignKey("drafts.id"), nullable=False)
    action: Mapped[str] = mapped_column(String(30), nullable=False)
    reviewer: Mapped[str] = mapped_column(String(500), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    draft = relationship("Draft", back_populates="approval_logs")
