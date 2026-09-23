"""
Async SQLAlchemy engine + session factory.
All models are defined here as plain dataclasses mapped to the same PostgreSQL
tables that the Express/Prisma gateway writes.  We use Core-style ORM mappings
(not declarative) so we can share the DB without fighting Prisma migrations.
"""
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy import (
    String, Integer, Boolean, DateTime, Text, JSON, ForeignKey,
    UniqueConstraint, Index, Enum as SAEnum, func,
)
from datetime import datetime
from typing import Optional, List
import enum

from app.config import settings

engine = create_async_engine(settings.database_url, echo=False, pool_size=10, max_overflow=5)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


# ── Enums (must match Prisma schema exactly) ──────────────────────────────────

class Platform(str, enum.Enum):
    X = "X"
    LINKEDIN = "LINKEDIN"
    REDDIT = "REDDIT"


class AccountStatus(str, enum.Enum):
    CONNECTED = "CONNECTED"
    DISCONNECTED = "DISCONNECTED"
    EXPIRED = "EXPIRED"


class PostType(str, enum.Enum):
    TEXT = "TEXT"
    THREAD = "THREAD"
    IMAGE = "IMAGE"
    VIDEO = "VIDEO"


class FollowerType(str, enum.Enum):
    ENGINEER = "ENGINEER"
    FOUNDER = "FOUNDER"
    INVESTOR = "INVESTOR"
    JOURNALIST = "JOURNALIST"
    GENERAL = "GENERAL"
    OTHER = "OTHER"


class Severity(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class FlagStatus(str, enum.Enum):
    OPEN = "OPEN"
    DISMISSED = "DISMISSED"
    RESOLVED = "RESOLVED"


class ReportType(str, enum.Enum):
    POST_ANALYSIS = "POST_ANALYSIS"
    POSTMORTEM = "POSTMORTEM"
    WEEKLY = "WEEKLY"


class SuggestionCategory(str, enum.Enum):
    CONTENT = "CONTENT"
    TIMING = "TIMING"
    COMPLIANCE = "COMPLIANCE"


class SuggestionStatus(str, enum.Enum):
    NEW = "NEW"
    ACCEPTED = "ACCEPTED"
    DISMISSED = "DISMISSED"


class OpportunitySourceType(str, enum.Enum):
    FOLLOWING = "FOLLOWING"
    MOST_ENGAGED = "MOST_ENGAGED"
    TOPIC = "TOPIC"


class OpportunityStatus(str, enum.Enum):
    NEW = "NEW"
    DRAFTED = "DRAFTED"
    DISMISSED = "DISMISSED"


class DraftKind(str, enum.Enum):
    ORIGINAL = "ORIGINAL"
    REPLY = "REPLY"
    QUOTE = "QUOTE"


class DraftStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    SCHEDULED = "SCHEDULED"
    PUBLISHED = "PUBLISHED"
    FAILED = "FAILED"


# ── ORM Models ────────────────────────────────────────────────────────────────

class Base(DeclarativeBase):
    pass


class ConnectedAccount(Base):
    __tablename__ = "ConnectedAccount"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    userId: Mapped[str] = mapped_column(String, ForeignKey("User.id", ondelete="CASCADE"), nullable=False)
    platform: Mapped[str] = mapped_column(SAEnum(Platform, name="Platform", create_type=False), nullable=False)
    platformUserId: Mapped[str] = mapped_column(String, nullable=False)
    handle: Mapped[str] = mapped_column(String, nullable=False)
    accessTokenEnc: Mapped[str] = mapped_column(String, nullable=False)
    refreshTokenEnc: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    scopes: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    status: Mapped[str] = mapped_column(SAEnum(AccountStatus, name="AccountStatus", create_type=False), default="CONNECTED")
    connectedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())
    disconnectedAt: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    posts: Mapped[List["Post"]] = relationship(back_populates="connectedAccount")
    followerSamples: Mapped[List["FollowerSample"]] = relationship(back_populates="connectedAccount")
    reports: Mapped[List["Report"]] = relationship(back_populates="connectedAccount")
    suggestions: Mapped[List["Suggestion"]] = relationship(back_populates="connectedAccount")
    complianceFlags: Mapped[List["ComplianceFlag"]] = relationship(back_populates="connectedAccount")
    opportunities: Mapped[List["Opportunity"]] = relationship(back_populates="connectedAccount")
    drafts: Mapped[List["Draft"]] = relationship(back_populates="connectedAccount")


class Post(Base):
    __tablename__ = "Post"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    connectedAccountId: Mapped[str] = mapped_column(String, ForeignKey("ConnectedAccount.id", ondelete="CASCADE"), nullable=False)
    connectedAccount: Mapped[ConnectedAccount] = relationship(back_populates="posts")
    platformPostId: Mapped[str] = mapped_column(String, nullable=False)
    type: Mapped[str] = mapped_column(SAEnum(PostType, name="PostType", create_type=False), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    publishedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    metrics: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    ingestedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())

    score: Mapped[Optional["PostScore"]] = relationship(back_populates="post", uselist=False)
    complianceFlags: Mapped[List["ComplianceFlag"]] = relationship(back_populates="post")


class PostScore(Base):
    __tablename__ = "PostScore"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    postId: Mapped[str] = mapped_column(String, ForeignKey("Post.id", ondelete="CASCADE"), unique=True, nullable=False)
    post: Mapped[Post] = relationship(back_populates="score")
    hookScore: Mapped[int] = mapped_column(Integer, nullable=False)
    structureScore: Mapped[int] = mapped_column(Integer, nullable=False)
    sentimentScore: Mapped[int] = mapped_column(Integer, nullable=False)
    shareabilityScore: Mapped[int] = mapped_column(Integer, nullable=False)
    aiSlopScore: Mapped[int] = mapped_column(Integer, nullable=False)
    overallScore: Mapped[int] = mapped_column(Integer, nullable=False)
    computedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())


class FollowerSample(Base):
    __tablename__ = "FollowerSample"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    connectedAccountId: Mapped[str] = mapped_column(String, ForeignKey("ConnectedAccount.id", ondelete="CASCADE"), nullable=False)
    connectedAccount: Mapped[ConnectedAccount] = relationship(back_populates="followerSamples")
    platformFollowerId: Mapped[str] = mapped_column(String, nullable=False)
    handle: Mapped[str] = mapped_column(String, nullable=False)
    classifiedType: Mapped[str] = mapped_column(SAEnum(FollowerType, name="FollowerType", create_type=False), nullable=False)
    engagementCount: Mapped[int] = mapped_column(Integer, default=0)
    lastActiveAt: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    sampledAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())


class GuidelineRule(Base):
    __tablename__ = "GuidelineRule"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    platform: Mapped[str] = mapped_column(SAEnum(Platform, name="Platform", create_type=False), nullable=False)
    ruleId: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(SAEnum(Severity, name="Severity", create_type=False), nullable=False)
    sourceUrl: Mapped[str] = mapped_column(String, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1)
    effectiveAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())

    complianceFlags: Mapped[List["ComplianceFlag"]] = relationship(back_populates="rule")


class ComplianceFlag(Base):
    __tablename__ = "ComplianceFlag"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    connectedAccountId: Mapped[str] = mapped_column(String, ForeignKey("ConnectedAccount.id", ondelete="CASCADE"), nullable=False)
    connectedAccount: Mapped[ConnectedAccount] = relationship(back_populates="complianceFlags")
    postId: Mapped[Optional[str]] = mapped_column(String, ForeignKey("Post.id", ondelete="SET NULL"), nullable=True)
    post: Mapped[Optional[Post]] = relationship(back_populates="complianceFlags")
    guidelineRuleId: Mapped[str] = mapped_column(String, ForeignKey("GuidelineRule.id"), nullable=False)
    rule: Mapped[GuidelineRule] = relationship(back_populates="complianceFlags")
    severity: Mapped[str] = mapped_column(SAEnum(Severity, name="Severity", create_type=False), nullable=False)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(SAEnum(FlagStatus, name="FlagStatus", create_type=False), default="OPEN")
    flaggedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())
    resolvedAt: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class Report(Base):
    __tablename__ = "Report"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    connectedAccountId: Mapped[str] = mapped_column(String, ForeignKey("ConnectedAccount.id", ondelete="CASCADE"), nullable=False)
    connectedAccount: Mapped[ConnectedAccount] = relationship(back_populates="reports")
    type: Mapped[str] = mapped_column(SAEnum(ReportType, name="ReportType", create_type=False), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    periodStart: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    periodEnd: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())


class Suggestion(Base):
    __tablename__ = "Suggestion"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    connectedAccountId: Mapped[str] = mapped_column(String, ForeignKey("ConnectedAccount.id", ondelete="CASCADE"), nullable=False)
    connectedAccount: Mapped[ConnectedAccount] = relationship(back_populates="suggestions")
    category: Mapped[str] = mapped_column(SAEnum(SuggestionCategory, name="SuggestionCategory", create_type=False), nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    evidence: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(SAEnum(SuggestionStatus, name="SuggestionStatus", create_type=False), default="NEW")
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())


class Opportunity(Base):
    __tablename__ = "Opportunity"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    connectedAccountId: Mapped[str] = mapped_column(String, ForeignKey("ConnectedAccount.id", ondelete="CASCADE"), nullable=False)
    connectedAccount: Mapped[ConnectedAccount] = relationship(back_populates="opportunities")
    sourcePlatformPostId: Mapped[str] = mapped_column(String, nullable=False)
    sourceHandle: Mapped[str] = mapped_column(String, nullable=False)
    sourceText: Mapped[str] = mapped_column(Text, nullable=False)
    impressions: Mapped[int] = mapped_column(Integer, nullable=False)
    sourceType: Mapped[str] = mapped_column(SAEnum(OpportunitySourceType, name="OpportunitySourceType", create_type=False), nullable=False)
    status: Mapped[str] = mapped_column(SAEnum(OpportunityStatus, name="OpportunityStatus", create_type=False), default="NEW")
    discoveredAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())

    drafts: Mapped[List["Draft"]] = relationship(back_populates="opportunity")


class Draft(Base):
    __tablename__ = "Draft"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    connectedAccountId: Mapped[str] = mapped_column(String, ForeignKey("ConnectedAccount.id", ondelete="CASCADE"), nullable=False)
    connectedAccount: Mapped[ConnectedAccount] = relationship(back_populates="drafts")
    opportunityId: Mapped[Optional[str]] = mapped_column(String, ForeignKey("Opportunity.id", ondelete="SET NULL"), nullable=True)
    opportunity: Mapped[Optional[Opportunity]] = relationship(back_populates="drafts")
    kind: Mapped[str] = mapped_column(SAEnum(DraftKind, name="DraftKind", create_type=False), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    guardrailResults: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    scheduledAt: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(SAEnum(DraftStatus, name="DraftStatus", create_type=False), default="DRAFT")
    publishedPostId: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    approvedAt: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())

