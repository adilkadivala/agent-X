# TODOs — x-agent

## Multi-RSS ranking + GitHub adapter

- **What:** Support multiple RSS feeds, design-doc rank formula (recency + keyword + diversity), optional GitHub commits/releases adapter.
- **Why:** Restores multi-source personality after minimal-lake v1 proves the browser post loop.
- **Pros:** Better content fuel; ship notes grounded in real work; less manual inbox.
- **Cons:** More failure modes (API rate limits, rank tuning); not needed until single feed feels thin.
- **Context:** See design doc sections "Ranking formula" and "Source adapters". v1 uses inbox-first + one `RSS_FEED_URL` only. Eng plan scope 1A deliberately deferred this.
- **Depends on / blocked by:** Worker live successfully for ~7 days (design success criteria); eng plan T6 done.
- **Status:** deferred
- **Added:** 2026-08-03 via /plan-eng-review

## Thin dashboard v1.1 (Home / Kill / History)

- **What:** Local web UI bound to 127.0.0.1: status, pause/resume, last N posts with scores.
- **Why:** Trust and kill switch without SSH/logs; completes A→B form factor.
- **Pros:** Matches original agent+dashboard desire; shared SQLite already designed.
- **Cons:** Extra app surface; password/bind if ever remote; not needed to prove posting.
- **Context:** Design v1.1 thin pages only (no sources/voice UI until v1.2). Eng plan defers all Next work from minimal lake.
- **Depends on / blocked by:** Worker + SQLite stable; preferably 7-day unattended success.
- **Status:** deferred
- **Added:** 2026-08-03 via /plan-eng-review
