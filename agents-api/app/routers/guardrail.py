"""
Guardrail router — content safety and policy check before publishing.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.auth import require_service_token
from app.db import get_db, GuidelineRule
from app.guardrail import check_content, DEFAULT_X_RULES

router = APIRouter(dependencies=[Depends(require_service_token)])


class GuardrailCheckRequest(BaseModel):
    text: str


@router.post("/check")
async def run_guardrail_check(payload: GuardrailCheckRequest, db: AsyncSession = Depends(get_db)):
    """Run Jev boolean guardrail check on post content against active rules."""
    if not payload.text:
        return {"passed": True, "violations": [], "checkedRules": 0}

    # Fetch active rules from DB if present, otherwise fall back to DEFAULT_X_RULES
    try:
        stmt = select(GuidelineRule)
        res = await db.execute(stmt)
        db_rules = res.scalars().all()
        if db_rules:
            rules_to_check = [
                {
                    "ruleId": r.ruleId,
                    "category": r.category,
                    "description": r.description,
                    "severity": r.severity,
                    "sourceUrl": r.sourceUrl,
                }
                for r in db_rules
            ]
        else:
            rules_to_check = DEFAULT_X_RULES
    except Exception:
        rules_to_check = DEFAULT_X_RULES

    result = check_content(payload.text, rules_to_check)
    return result
