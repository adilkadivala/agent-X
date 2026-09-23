"""
Analyze router — single post algorithmic scoring and full profile postmortem pipeline.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timedelta
import re
import logging

from app.auth import require_service_token
from app.db import get_db, ConnectedAccount, Post, PostScore, Report, ReportType, PostType
from app.utils import new_cuid
from app.scoring import score_post, fetch_and_score_post
from app.llm import generate_post_improvement_suggestions, generate_narrative_postmortem

logger = logging.getLogger("agents-api.analyze")
router = APIRouter(dependencies=[Depends(require_service_token)])


class AnalyzePostRequest(BaseModel):
    url: Optional[str] = None
    text: Optional[str] = None
    accountId: Optional[str] = None


@router.post("/post")
async def analyze_single_post(payload: AnalyzePostRequest, db: AsyncSession = Depends(get_db)):
    """v0 — single post: X API + Jev scoring + improvement suggestions."""
    tweet_id = None
    post_text = payload.text or ""

    if payload.url:
        match = re.search(r"/status/(\d+)", payload.url)
        tweet_id = match.group(1) if match else payload.url.strip()

    if tweet_id and not post_text:
        try:
            fetched = await fetch_and_score_post(tweet_id)
            post_text = fetched.get("text", "")
            scores = fetched.get("scores", score_post(post_text))
        except Exception as e:
            logger.warning("[analyze] Failed to fetch tweet %s from X API: %s; using heuristic fallback", tweet_id, e)
            post_text = f"Analyzed post #{tweet_id}"
            scores = score_post(post_text)
    else:
        scores = score_post(post_text)

    # Generate improvement tips via LLM
    suggestions = await generate_post_improvement_suggestions(post_text, scores)

    # Persist in DB if accountId is provided
    post_record_id = None
    if payload.accountId:
        pid = tweet_id or f"manual-{int(datetime.utcnow().timestamp())}"
        stmt = select(Post).where(Post.connectedAccountId == payload.accountId, Post.platformPostId == pid)
        res = await db.execute(stmt)
        existing = res.scalar_one_or_none()

        if existing:
            existing.text = post_text
            post_record_id = existing.id
            # update score
            stmt_score = select(PostScore).where(PostScore.postId == existing.id)
            score_res = await db.execute(stmt_score)
            s_rec = score_res.scalar_one_or_none()
            if s_rec:
                s_rec.hookScore = scores["hookScore"]
                s_rec.structureScore = scores["structureScore"]
                s_rec.sentimentScore = scores["sentimentScore"]
                s_rec.shareabilityScore = scores["shareabilityScore"]
                s_rec.aiSlopScore = scores["aiSlopScore"]
                s_rec.overallScore = scores["overallScore"]
        else:
            post_record_id = new_cuid()
            new_post = Post(
                id=post_record_id,
                connectedAccountId=payload.accountId,
                platformPostId=pid,
                type=PostType.TEXT,
                text=post_text,
                publishedAt=datetime.utcnow(),
                metrics={},
            )
            db.add(new_post)
            await db.flush()

            new_score = PostScore(
                id=new_cuid(),
                postId=post_record_id,
                hookScore=scores["hookScore"],
                structureScore=scores["structureScore"],
                sentimentScore=scores["sentimentScore"],
                shareabilityScore=scores["shareabilityScore"],
                aiSlopScore=scores["aiSlopScore"],
                overallScore=scores["overallScore"],
            )
            db.add(new_score)

        await db.commit()

    return {
        "postId": post_record_id or tweet_id or "local",
        "url": payload.url or "",
        "text": post_text,
        "scores": scores,
        "suggestions": suggestions,
        "message": "Analysis computed by Jev Intelligence Engine",
    }


@router.post("/profile/{account_id}")
async def analyze_profile_postmortem(account_id: str, db: AsyncSession = Depends(get_db)):
    """v1 — full postmortem pipeline: aggregates historical posts and generates report."""
    stmt_acc = select(ConnectedAccount).where(ConnectedAccount.id == account_id)
    acc_res = await db.execute(stmt_acc)
    account = acc_res.scalar_one_or_none()

    if not account:
        raise HTTPException(status_code=404, detail="ConnectedAccount not found")

    # Fetch recent posts for account
    stmt_posts = select(Post).where(Post.connectedAccountId == account_id).order_by(Post.publishedAt.desc()).limit(50)
    posts_res = await db.execute(stmt_posts)
    posts = posts_res.scalars().all()

    post_dicts = []
    for p in posts:
        # fetch score
        score_res = await db.execute(select(PostScore).where(PostScore.postId == p.id))
        s = score_res.scalar_one_or_none()
        post_dicts.append({
            "id": p.id,
            "platformPostId": p.platformPostId,
            "text": p.text,
            "publishedAt": p.publishedAt.isoformat() if p.publishedAt else None,
            "metrics": p.metrics or {},
            "score": {
                "hookScore": s.hookScore if s else 70,
                "structureScore": s.structureScore if s else 70,
                "sentimentScore": s.sentimentScore if s else 70,
                "shareabilityScore": s.shareabilityScore if s else 70,
                "aiSlopScore": s.aiSlopScore if s else 10,
                "overallScore": s.overallScore if s else 70,
            }
        })

    # Aggregate metrics
    avg_hook = round(sum(p["score"]["hookScore"] for p in post_dicts) / max(len(post_dicts), 1))
    avg_overall = round(sum(p["score"]["overallScore"] for p in post_dicts) / max(len(post_dicts), 1))

    stats = {
        "totalPosts": len(post_dicts),
        "averageHookScore": avg_hook,
        "averageOverallScore": avg_overall,
        "topPerformingPosts": sorted(post_dicts, key=lambda x: x["score"]["overallScore"], reverse=True)[:3],
    }

    # Generate LLM executive narrative
    narrative = await generate_narrative_postmortem(account.handle, post_dicts, stats)

    now = datetime.utcnow()
    period_start = now - timedelta(days=30)

    # Save Report record in Postgres
    report_id = new_cuid()
    report = Report(
        id=report_id,
        connectedAccountId=account_id,
        type=ReportType.POSTMORTEM,
        payload={
            "summary": narrative,
            "stats": stats,
            "generatedAt": now.isoformat(),
        },
        periodStart=period_start,
        periodEnd=now,
    )
    db.add(report)
    await db.commit()

    return {
        "reportId": report_id,
        "accountId": account_id,
        "handle": account.handle,
        "report": {
            "id": report_id,
            "type": "POSTMORTEM",
            "narrative": narrative,
            "stats": stats,
            "periodStart": period_start.isoformat(),
            "periodEnd": now.isoformat(),
        }
    }
