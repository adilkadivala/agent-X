"""
APScheduler cron: weekly guideline refresh.
"""
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
import logging
import httpx

logger = logging.getLogger("agents-api.scheduler")


async def _refresh_guidelines_job():
    """
    Weekly cron: calls the guidelines router to refresh guideline rules
    from X Developer Policy. Runs internally with service token.
    """
    try:
        from app.config import settings
        from app.services.guidelines import refresh_rules_from_policy

        updated = await refresh_rules_from_policy()
        logger.info("[scheduler] Guidelines refreshed — %d rules active", len(updated))
    except Exception as exc:
        logger.error("[scheduler] Guidelines refresh failed: %s", exc)


def start_scheduler() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler()

    # Run every Sunday at 02:00 AM UTC
    scheduler.add_job(
        _refresh_guidelines_job,
        CronTrigger(day_of_week="sun", hour=2, minute=0),
        id="weekly_guideline_refresh",
        name="Weekly X Policy Guideline Sync",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("[scheduler] APScheduler started — weekly guideline job registered")
    return scheduler
