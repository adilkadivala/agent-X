"""
Guidelines service — manage GuidelineRule DB records and refresh from policy source.
"""
import logging
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.db import AsyncSessionLocal, GuidelineRule, Platform, Severity
from app.utils import new_cuid
from app.guardrail import DEFAULT_X_RULES

logger = logging.getLogger("agents-api.guidelines")


async def get_current_rules() -> list[dict]:
    """Return all current guideline rules from DB. Bootstraps from defaults if empty."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(GuidelineRule).order_by(GuidelineRule.ruleId)
        )
        rules = result.scalars().all()

        if not rules:
            # Seed DB with DEFAULT_X_RULES on first call
            await _seed_default_rules(session)
            result = await session.execute(select(GuidelineRule).order_by(GuidelineRule.ruleId))
            rules = result.scalars().all()

        return [
            {
                "id": r.id,
                "platform": r.platform,
                "ruleId": r.ruleId,
                "category": r.category,
                "description": r.description,
                "severity": r.severity,
                "sourceUrl": r.sourceUrl,
                "version": r.version,
                "effectiveAt": r.effectiveAt.isoformat() if r.effectiveAt else None,
            }
            for r in rules
        ]


async def _seed_default_rules(session: AsyncSession) -> None:
    """Seed DB with DEFAULT_X_RULES from guardrail.py."""
    for rule in DEFAULT_X_RULES:
        existing = await session.execute(
            select(GuidelineRule).where(
                GuidelineRule.platform == Platform.X,
                GuidelineRule.ruleId == rule["ruleId"],
            )
        )
        if existing.scalars().first():
            continue
        session.add(
            GuidelineRule(
                id=new_cuid(),
                platform=Platform.X,
                ruleId=rule["ruleId"],
                category=rule["category"],
                description=rule["description"],
                severity=Severity(rule["severity"]),
                sourceUrl=rule.get("sourceUrl", ""),
                version=1,
                effectiveAt=datetime.utcnow(),
            )
        )
    await session.commit()
    logger.info("[guidelines] Seeded %d default X rules", len(DEFAULT_X_RULES))


async def refresh_rules_from_policy() -> list[dict]:
    """
    Re-syncs rules from DEFAULT_X_RULES (and in future, from live policy crawl).
    """
    async with AsyncSessionLocal() as session:
        for rule_data in DEFAULT_X_RULES:
            existing_result = await session.execute(
                select(GuidelineRule).where(
                    GuidelineRule.platform == Platform.X,
                    GuidelineRule.ruleId == rule_data["ruleId"],
                )
            )
            existing = existing_result.scalars().first()
            if existing:
                existing.description = rule_data["description"]
                existing.severity = Severity(rule_data["severity"])
                existing.sourceUrl = rule_data.get("sourceUrl", "")
                existing.effectiveAt = datetime.utcnow()
            else:
                session.add(
                    GuidelineRule(
                        id=new_cuid(),
                        platform=Platform.X,
                        ruleId=rule_data["ruleId"],
                        category=rule_data["category"],
                        description=rule_data["description"],
                        severity=Severity(rule_data["severity"]),
                        sourceUrl=rule_data.get("sourceUrl", ""),
                        version=1,
                        effectiveAt=datetime.utcnow(),
                    )
                )

        await session.commit()
        logger.info("[guidelines] Refreshed %d rules from policy source", len(DEFAULT_X_RULES))

    return await get_current_rules()
