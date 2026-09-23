"""
FastAPI agents-api — Main application entry point.
Internal service only; the Express gateway calls this with a service token header.
"""
import sys
from pathlib import Path

# Ensure project root is in sys.path so `app.*` imports work regardless of how it's executed
_root = str(Path(__file__).resolve().parent.parent)
if _root not in sys.path:
    sys.path.insert(0, _root)

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import engine
from app.routers import (
    ingest_router,
    analyze_router,
    classify_router,
    guardrail_router,
    guidelines_router,
    suggestions_router,
    publish_router,
)
from app.scheduler import start_scheduler

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")
logger = logging.getLogger("agents-api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("[agents-api] starting up — DB: %s", settings.database_url[:40])
    scheduler = start_scheduler()
    yield
    logger.info("[agents-api] shutting down")
    scheduler.shutdown(wait=False)


app = FastAPI(
    title="SuperGrow Agents API",
    description="Internal analysis, ingestion, guardrail, and publish pipeline. Not publicly reachable.",
    version="1.0.0",
    lifespan=lifespan,
)

# Only allow internal gateway calls
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.gateway_url],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ingest_router, prefix="/ingest", tags=["ingest"])
app.include_router(analyze_router, prefix="/analyze", tags=["analyze"])
app.include_router(classify_router, prefix="/classify", tags=["classify"])
app.include_router(guardrail_router, prefix="/guardrail", tags=["guardrail"])
app.include_router(guidelines_router, prefix="/guideline-rules", tags=["guidelines"])
app.include_router(suggestions_router, prefix="/suggestions", tags=["suggestions"])
app.include_router(publish_router, prefix="/publish", tags=["publish"])


@app.get("/health", tags=["health"])
async def health():
    return {"ok": True, "service": "agents-api", "version": "1.0.0"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.port, reload=True)
