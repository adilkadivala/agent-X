"""
Guidelines router — retrieve and refresh guideline rules.
"""
from fastapi import APIRouter, Depends
from app.auth import require_service_token
from app.services.guidelines import get_current_rules, refresh_rules_from_policy

router = APIRouter(dependencies=[Depends(require_service_token)])


@router.get("/current")
async def current_rules():
    """Get the current active structured ruleset."""
    rules = await get_current_rules()
    return {"total": len(rules), "rules": rules}


@router.post("/refresh")
async def refresh_rules():
    """Trigger re-sync of rules from developer policy source."""
    refreshed = await refresh_rules_from_policy()
    return {"total": len(refreshed), "refreshed": True, "rules": refreshed}
