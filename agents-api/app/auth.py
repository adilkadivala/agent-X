"""
FastAPI dependency: validates the internal X-Service-Token header.
The Express gateway sends this on every call to the agents-api.
Browser clients can never reach agents-api directly.
"""
from fastapi import Header, HTTPException, status
from app.config import settings


async def require_service_token(x_service_token: str = Header(...)):
    if x_service_token != settings.service_token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid service token")
