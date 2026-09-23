"""
X API v2 client — wraps the most-used endpoints with Bearer auth.
Uses httpx.AsyncClient. All callers should await these coroutines.
"""
import httpx
from typing import Optional
from app.config import settings


_BASE = "https://api.twitter.com/2"

_BEARER_HEADERS = {
    "Authorization": f"Bearer {settings.x_bearer_token}",
}


async def get_user_by_id(user_id: str) -> dict:
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{_BASE}/users/{user_id}",
            headers=_BEARER_HEADERS,
            params={
                "user.fields": "id,name,username,profile_image_url,public_metrics,description",
            },
            timeout=15,
        )
        r.raise_for_status()
        return r.json()


async def get_user_tweets(
    user_id: str,
    max_results: int = 50,
    pagination_token: Optional[str] = None,
) -> dict:
    params: dict = {
        "max_results": min(max_results, 100),
        "tweet.fields": "id,text,created_at,public_metrics,entities,referenced_tweets",
        "exclude": "retweets,replies",
    }
    if pagination_token:
        params["pagination_token"] = pagination_token

    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{_BASE}/users/{user_id}/tweets",
            headers=_BEARER_HEADERS,
            params=params,
            timeout=20,
        )
        r.raise_for_status()
        return r.json()


async def get_tweet_by_id(tweet_id: str) -> dict:
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{_BASE}/tweets/{tweet_id}",
            headers=_BEARER_HEADERS,
            params={
                "tweet.fields": "id,text,created_at,public_metrics,entities,author_id",
                "expansions": "author_id",
                "user.fields": "name,username",
            },
            timeout=15,
        )
        r.raise_for_status()
        return r.json()


async def get_followers(
    user_id: str,
    max_results: int = 100,
    pagination_token: Optional[str] = None,
) -> dict:
    params: dict = {
        "max_results": min(max_results, 1000),
        "user.fields": "id,name,username,public_metrics,description",
    }
    if pagination_token:
        params["pagination_token"] = pagination_token

    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{_BASE}/users/{user_id}/followers",
            headers=_BEARER_HEADERS,
            params=params,
            timeout=20,
        )
        r.raise_for_status()
        return r.json()


async def get_home_timeline(user_id: str, max_results: int = 20) -> dict:
    """Requires user OAuth token — use user-context bearer."""
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{_BASE}/users/{user_id}/timelines/reverse_chronological",
            headers=_BEARER_HEADERS,
            params={
                "max_results": min(max_results, 100),
                "tweet.fields": "id,text,created_at,public_metrics,author_id",
                "expansions": "author_id",
                "user.fields": "name,username",
                "exclude": "retweets",
            },
            timeout=20,
        )
        r.raise_for_status()
        return r.json()
