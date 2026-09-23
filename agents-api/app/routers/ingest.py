"""
Ingestion router — syncs recent posts and follower samples from X API into Postgres.
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime
import logging

from app.auth import require_service_token
from app.db import get_db, ConnectedAccount, Post, PostScore, FollowerSample, PostType, FollowerType
from app.utils import decrypt_token, new_cuid
from app.scoring import score_post
from app.classifier import classify_follower
from app import x_client

logger = logging.getLogger("agents-api.ingest")
router = APIRouter(dependencies=[Depends(require_service_token)])

# In-memory job status map for polling
_JOBS: dict[str, dict] = {}


async def _run_ingest_job(account_id: str):
    _JOBS[account_id] = {"status": "RUNNING", "startedAt": datetime.utcnow().isoformat(), "error": None}
    logger.info("[ingest] Starting ingestion job for account %s", account_id)

    try:
        from app.db import AsyncSessionLocal
        async with AsyncSessionLocal() as session:
            # 1. Fetch connected account
            stmt = select(ConnectedAccount).where(ConnectedAccount.id == account_id)
            res = await session.execute(stmt)
            account = res.scalar_one_or_none()

            if not account:
                _JOBS[account_id] = {"status": "FAILED", "error": "ConnectedAccount not found"}
                return

            platform_user_id = account.platformUserId

            # 2. Ingest tweets
            try:
                tweets_data = await x_client.get_user_tweets(platform_user_id, max_results=20)
                tweets = tweets_data.get("data", [])
                logger.info("[ingest] Retrieved %d tweets for account %s", len(tweets), account_id)

                for tweet in tweets:
                    pid = tweet.get("id")
                    text = tweet.get("text", "")
                    created_at_str = tweet.get("created_at")
                    published_at = datetime.fromisoformat(created_at_str.replace("Z", "+00:00")) if created_at_str else datetime.utcnow()
                    metrics = tweet.get("public_metrics", {})

                    # Run scoring
                    scores = score_post(text)

                    # Upsert Post
                    stmt_post = select(Post).where(Post.connectedAccountId == account_id, Post.platformPostId == pid)
                    post_res = await session.execute(stmt_post)
                    existing_post = post_res.scalar_one_or_none()

                    if existing_post:
                        existing_post.text = text
                        existing_post.metrics = metrics
                    else:
                        post_id = new_cuid()
                        new_post = Post(
                            id=post_id,
                            connectedAccountId=account_id,
                            platformPostId=pid,
                            type=PostType.TEXT,
                            text=text,
                            publishedAt=published_at,
                            metrics=metrics,
                        )
                        session.add(new_post)
                        await session.flush()

                        # Add score
                        new_score = PostScore(
                            id=new_cuid(),
                            postId=post_id,
                            hookScore=scores["hookScore"],
                            structureScore=scores["structureScore"],
                            sentimentScore=scores["sentimentScore"],
                            shareabilityScore=scores["shareabilityScore"],
                            aiSlopScore=scores["aiSlopScore"],
                            overallScore=scores["overallScore"],
                        )
                        session.add(new_score)

            except Exception as e:
                logger.warning("[ingest] Tweet fetch failed or rate limited: %s", e)

            # 3. Ingest follower sample
            try:
                followers_data = await x_client.get_followers(platform_user_id, max_results=50)
                followers = followers_data.get("data", [])

                for f in followers:
                    fid = f.get("id")
                    handle = f.get("username", "")
                    desc = f.get("description", "")
                    c_type = classify_follower(bio=desc, username=handle)

                    stmt_fol = select(FollowerSample).where(FollowerSample.connectedAccountId == account_id, FollowerSample.platformFollowerId == fid)
                    fol_res = await session.execute(stmt_fol)
                    existing_fol = fol_res.scalar_one_or_none()

                    if not existing_fol:
                        session.add(FollowerSample(
                            id=new_cuid(),
                            connectedAccountId=account_id,
                            platformFollowerId=fid,
                            handle=handle,
                            classifiedType=FollowerType(c_type),
                            engagementCount=1,
                            lastActiveAt=datetime.utcnow(),
                        ))
            except Exception as e:
                logger.warning("[ingest] Follower fetch failed or rate limited: %s", e)

            await session.commit()

        _JOBS[account_id] = {
            "status": "COMPLETED",
            "completedAt": datetime.utcnow().isoformat(),
            "error": None,
        }
        logger.info("[ingest] Completed ingestion job for account %s", account_id)

    except Exception as exc:
        logger.error("[ingest] Ingestion job failed: %s", exc)
        _JOBS[account_id] = {
            "status": "FAILED",
            "error": str(exc),
            "failedAt": datetime.utcnow().isoformat(),
        }


@router.post("/{platform}/{account_id}")
async def trigger_ingest(platform: str, account_id: str, background_tasks: BackgroundTasks):
    """Trigger background ingestion for a platform account."""
    if platform.upper() != "X":
        raise HTTPException(status_code=400, detail=f"Platform {platform} not supported yet")

    _JOBS[account_id] = {"status": "QUEUED", "startedAt": datetime.utcnow().isoformat(), "error": None}
    background_tasks.add_task(_run_ingest_job, account_id)
    return {"ok": True, "account_id": account_id, "status": "QUEUED"}


@router.get("/{account_id}/status")
async def get_ingest_status(account_id: str):
    """Get the current ingestion status for an account."""
    job = _JOBS.get(account_id, {"status": "IDLE", "message": "No recent ingestion job"})
    return {"account_id": account_id, **job}
