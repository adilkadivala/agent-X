"""
Suggestions router — generates strategic opportunity cards via LLM and saves to DB.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime

from app.auth import require_service_token
from app.db import get_db, ConnectedAccount, Post, Suggestion, SuggestionCategory, SuggestionStatus
from app.utils import new_cuid
from app.llm import generate_opportunity_suggestions

router = APIRouter(dependencies=[Depends(require_service_token)])


@router.post("/generate/{account_id}")
async def generate_suggestions_for_account(account_id: str, db: AsyncSession = Depends(get_db)):
    """Generate strategic suggestions for an account and persist to DB."""
    stmt_acc = select(ConnectedAccount).where(ConnectedAccount.id == account_id)
    acc_res = await db.execute(stmt_acc)
    account = acc_res.scalar_one_or_none()

    if not account:
        raise HTTPException(status_code=404, detail="ConnectedAccount not found")

    # Fetch recent posts
    stmt_posts = select(Post).where(Post.connectedAccountId == account_id).limit(20)
    posts_res = await db.execute(stmt_posts)
    posts = posts_res.scalars().all()
    post_dicts = [{"text": p.text, "type": p.type} for p in posts]

    # Generate suggestions via LLM
    cards = await generate_opportunity_suggestions(account.handle, post_dicts)

    saved_suggestions = []
    for card in cards:
        sug_id = new_cuid()
        category = SuggestionCategory(card["category"])
        new_sug = Suggestion(
            id=sug_id,
            connectedAccountId=account_id,
            category=category,
            title=card["title"],
            body=card["body"],
            evidence=card.get("evidence", {}),
            status=SuggestionStatus.NEW,
            createdAt=datetime.utcnow(),
        )
        db.add(new_sug)
        saved_suggestions.append({
            "id": sug_id,
            "category": card["category"],
            "title": card["title"],
            "body": card["body"],
            "evidence": card.get("evidence", {}),
            "status": "NEW",
            "createdAt": datetime.utcnow().isoformat(),
        })

    await db.commit()

    return {
        "accountId": account_id,
        "total": len(saved_suggestions),
        "suggestions": saved_suggestions,
    }
