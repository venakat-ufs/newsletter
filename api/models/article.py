import enum
from datetime import datetime

from sqlalchemy import Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class SectionType(str, enum.Enum):
    MARKET_PULSE = "market_pulse"
    TOP_BANKS = "top_banks"
    HOT_MARKETS = "hot_markets"
    INDUSTRY_NEWS = "industry_news"
    UFS_SPOTLIGHT = "ufs_spotlight"


class AudienceTag(str, enum.Enum):
    REO = "REO"
    PROPERTY_MGMT = "Property Mgmt"
    HOA = "HOA"
    ALL = "All"


class Article(Base):
    __tablename__ = "articles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    newsletter_id: Mapped[int] = mapped_column(ForeignKey("newsletters.id"), nullable=False)
    section_type: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    teaser: Mapped[str] = mapped_column(Text, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    audience_tag: Mapped[str] = mapped_column(String(50), default=AudienceTag.REO.value)
    publish_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    ms_platform_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    newsletter = relationship("Newsletter", back_populates="articles")
