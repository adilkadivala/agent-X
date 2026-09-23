"""
Jev-style heuristic post scoring engine.
Pure string analysis — no external ML/LLM dependencies.
All scores are 0–100 integers.
"""
import re
import httpx
from app.config import settings

# ── Heuristic constants ────────────────────────────────────────────────────────

HOOK_POWER_WORDS = {
    "secret", "mistake", "truth", "real", "revealed", "unpopular", "nobody",
    "never", "always", "why", "how", "what", "stop", "warning", "must",
    "shocking", "impossible", "surprising", "wrong", "better", "best", "worst",
}

AI_SLOP_PHRASES = [
    r"\bin conclusion\b",
    r"\bdelve\b",
    r"\bleverage\b",
    r"\bunlock\b",
    r"\bgroundbreaking\b",
    r"\bcutting.edge\b",
    r"\bsynergy\b",
    r"\bparadigm shift\b",
    r"\bin today.s (fast.paced|digital)\b",
    r"\bit.s worth noting\b",
    r"\bit is important to note\b",
    r"\bnot only .{1,40} but also\b",
    r"\bcertainly!\b",
    r"\bi.d be happy to\b",
    r"\bas an ai\b",
    r"\bfeel free to\b",
    r"\bdive (in|into|deep)\b",
    r"\bhere are \d+ (ways|things|tips|reasons|steps)\b",
    r"\btransformative\b",
    r"\brobust\b",
    r"\bseamless(ly)?\b",
    r"\bnavigating\b",
    r"\bfoster (a)?\b",
    r"\bempowering\b",
]

POSITIVE_WORDS = {
    "great", "amazing", "excellent", "love", "win", "winning", "success",
    "profit", "growth", "launch", "built", "shipped", "milestone", "excited",
    "proud", "grateful", "opportunity", "achieved", "revenue", "profitable",
}

NEGATIVE_WORDS = {
    "fail", "loss", "failed", "disappointed", "terrible", "horrible", "disaster",
    "crash", "problem", "broken", "wrong", "bad", "worse", "worst", "angry",
}

SHAREABILITY_SIGNALS = [
    r"\d+x",           # multiplier claims
    r"\$\d+",          # dollar amounts
    r"\d+%",           # percentages
    r"\d+ (days|weeks|months|years)",  # time claims
    r"thread\s*(🧵|👇|below)?",       # thread markers
    r"1\.",            # numbered lists
    r"hot take",       # opinion markers
    r"(unpopular|controversial) opinion",
    r"I (built|launched|shipped|created|made)",
]


# ── Scoring functions ──────────────────────────────────────────────────────────

def _hook_score(text: str) -> int:
    lines = text.strip().split("\n")
    first_line = lines[0].lower() if lines else ""
    score = 50

    # First line length: too long loses attention
    if len(first_line) < 10:
        score -= 15
    elif len(first_line) < 60:
        score += 10

    # Power words in first line
    words_in_first = set(re.findall(r"\w+", first_line))
    overlap = words_in_first & HOOK_POWER_WORDS
    score += min(20, len(overlap) * 8)

    # Ends with question mark in first line
    if first_line.rstrip().endswith("?"):
        score += 10

    # Has a number in first line (concrete)
    if re.search(r"\d", first_line):
        score += 8

    # Starts with I / personal story
    if first_line.startswith("i "):
        score += 5

    # Has colon (promise of content)
    if ":" in first_line:
        score += 5

    return max(0, min(100, score))


def _structure_score(text: str) -> int:
    score = 50
    lines = [l for l in text.split("\n") if l.strip()]
    total_chars = len(text)

    # Has multiple lines (not a wall of text)
    if len(lines) >= 3:
        score += 15
    elif len(lines) >= 2:
        score += 8

    # Reasonable paragraph length
    avg_line = total_chars / max(len(lines), 1)
    if avg_line < 100:
        score += 10

    # Has numbered or bulleted list
    if re.search(r"^\s*[\d•\-\*]\.", text, re.MULTILINE):
        score += 10

    # Very long single block
    if len(lines) == 1 and total_chars > 200:
        score -= 20

    # Too short to score structure
    if total_chars < 30:
        score -= 20

    return max(0, min(100, score))


def _sentiment_score(text: str) -> int:
    score = 65
    words = set(re.findall(r"\w+", text.lower()))

    pos_count = len(words & POSITIVE_WORDS)
    neg_count = len(words & NEGATIVE_WORDS)

    score += min(20, pos_count * 6)
    score -= min(25, neg_count * 8)

    # Excessive exclamation marks — comes across as desperate
    exc_count = text.count("!")
    if exc_count > 3:
        score -= 10

    return max(0, min(100, score))


def _shareability_score(text: str) -> int:
    score = 40
    lower = text.lower()

    for pattern in SHAREABILITY_SIGNALS:
        if re.search(pattern, lower, re.IGNORECASE):
            score += 8

    # Has genuine insight marker
    if any(kw in lower for kw in ["learned", "lesson", "mistake", "realized", "discovered"]):
        score += 12

    # Thread format is highly shareable
    if "🧵" in text or "(thread)" in lower:
        score += 15

    # Short pithy posts can go viral too
    if len(text) < 100 and score > 50:
        score += 5

    return max(0, min(100, score))


def _ai_slop_score(text: str) -> int:
    """Higher = more AI slop detected. 0 is clean, 100 is pure LLM boilerplate."""
    hits = 0
    lower = text.lower()

    for pattern in AI_SLOP_PHRASES:
        if re.search(pattern, lower, re.IGNORECASE):
            hits += 1

    # Excessive em-dashes (a tell for Claude/GPT output)
    em_count = text.count("—") + text.count("–")
    if em_count > 2:
        hits += 1

    # Very formal sentence starters
    if re.search(r"^(In (today|this|recent)|Furthermore|Moreover|Additionally)\b", text, re.MULTILINE):
        hits += 1

    return min(100, hits * 15)


def score_post(text: str) -> dict:
    """
    Run all heuristic scorers and return a combined scorecard.
    """
    hook = _hook_score(text)
    structure = _structure_score(text)
    sentiment = _sentiment_score(text)
    shareability = _shareability_score(text)
    ai_slop = _ai_slop_score(text)

    # Weighted overall: hook 30%, shareability 25%, structure 20%, sentiment 15%, ai_slop_penalty 10%
    overall = round(
        hook * 0.30
        + shareability * 0.25
        + structure * 0.20
        + sentiment * 0.15
        + (100 - ai_slop) * 0.10
    )

    return {
        "hookScore": hook,
        "structureScore": structure,
        "sentimentScore": sentiment,
        "shareabilityScore": shareability,
        "aiSlopScore": ai_slop,
        "overallScore": max(0, min(100, overall)),
    }


async def fetch_and_score_post(tweet_id: str, bearer_token: str | None = None) -> dict:
    """
    Fetch tweet from X API v2 and run Jev scoring.
    Falls back to bearer token from settings if not provided.
    """
    token = bearer_token or settings.x_bearer_token
    url = f"https://api.twitter.com/2/tweets/{tweet_id}"
    params = {
        "tweet.fields": "id,text,created_at,public_metrics,author_id",
        "expansions": "author_id",
        "user.fields": "name,username",
    }
    headers = {"Authorization": f"Bearer {token}"}

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(url, params=params, headers=headers)
            r.raise_for_status()
            data = r.json()

        tweet_data = data.get("data", {})
        text = tweet_data.get("text", "")
        metrics = tweet_data.get("public_metrics", {})
        users = {u["id"]: u for u in data.get("includes", {}).get("users", [])}
        author_id = tweet_data.get("author_id", "")
        author = users.get(author_id, {})

        scores = score_post(text)
        return {
            "platformPostId": tweet_id,
            "text": text,
            "authorHandle": author.get("username", ""),
            "authorName": author.get("name", ""),
            "metrics": metrics,
            "scores": scores,
        }
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 401:
            raise ValueError("X API authentication failed — check bearer token")
        raise ValueError(f"X API error {e.response.status_code}: {e.response.text[:200]}")
    except Exception as e:
        # Graceful degradation — score with empty text
        scores = score_post("")
        return {
            "platformPostId": tweet_id,
            "text": "",
            "error": str(e),
            "scores": scores,
        }
