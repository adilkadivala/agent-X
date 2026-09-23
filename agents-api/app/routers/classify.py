"""
Classify router — bulk Jev classification of follower personas.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.auth import require_service_token
from app.db import get_db, FollowerSample, FollowerType
from app.classifier import classify_followers_bulk, classify_follower

router = APIRouter(dependencies=[Depends(require_service_token)])


class FollowerItem(BaseModel):
    platformFollowerId: str
    handle: str
    bio: Optional[str] = ""
    description: Optional[str] = ""


class ClassifyFollowersRequest(BaseModel):
    followers: Optional[List[FollowerItem]] = None
    accountId: Optional[str] = None


@router.post("/followers")
async def classify_followers(payload: ClassifyFollowersRequest, db: AsyncSession = Depends(get_db)):
    """Bulk Jev classification job for follower personas."""
    # Option 1: Direct list of followers provided
    if payload.followers:
        input_data = [f.model_dump() for f in payload.followers]
        classified = await classify_followers_bulk(input_data)
        return {"total": len(classified), "classified": classified}

    # Option 2: Re-classify existing followers for an account in DB
    if payload.accountId:
        stmt = select(FollowerSample).where(FollowerSample.connectedAccountId == payload.accountId)
        res = await db.execute(stmt)
        followers = res.scalars().all()

        updated = 0
        for f in followers:
            new_type = classify_follower(bio="", username=f.handle)
            f.classifiedType = FollowerType(new_type)
            updated += 1

        await db.commit()
        return {"total": updated, "message": f"Updated classification for {updated} followers"}

    raise HTTPException(status_code=400, detail="Must provide either followers list or accountId")
