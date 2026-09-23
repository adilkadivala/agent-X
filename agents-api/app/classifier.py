"""
Follower classification — keyword-based persona detection.
Classifies X followers into ENGINEER, FOUNDER, INVESTOR, JOURNALIST, GENERAL, OTHER.
"""
import re
from typing import TypedDict

# ── Keyword sets ──────────────────────────────────────────────────────────────

ENGINEER_KEYWORDS = {
    "software", "engineer", "developer", "dev", "code", "coder", "coding",
    "swe", "backend", "frontend", "fullstack", "full-stack", "devops", "infra",
    "infrastructure", "ml", "machine learning", "deep learning", "ai", "cuda",
    "rust", "golang", "python", "typescript", "javascript", "haskell",
    "compiler", "distributed", "kernel", "embedded", "firmware", "open source",
    "open-source", "github", "stack overflow", "leetcode", "algorithm",
    "system design", "microservices", "kubernetes", "docker", "aws", "gcp", "azure",
    "ctO", "vp of engineering", "principal engineer", "staff engineer",
}

FOUNDER_KEYWORDS = {
    "founder", "co-founder", "cofounder", "ceo", "chief executive",
    "building", "startup", "launching", "bootstrapped", "solopreneur",
    "product hunt", "launched", "created", "shipped", "maker", "indie hacker",
    "yc", "y combinator", "techstars", "w22", "s23", "seed stage",
    "pre-seed", "series a", "exited", "acquired",
}

INVESTOR_KEYWORDS = {
    "investor", "vc", "venture capital", "venture capitalist",
    "angel investor", "angel", "limited partner", "lp", "gp", "general partner",
    "managing partner", "fund", "portfolio", "thesis", "deal flow",
    "capital", "seed fund", "writing checks", "backing founders",
    "partner at", "principal at", "associate at",
}

JOURNALIST_KEYWORDS = {
    "journalist", "reporter", "editor", "writer", "columnist",
    "contributor", "author", "media", "press", "publication",
    "newsletter", "podcast host", "correspondent", "tech reporter",
    "staff writer", "news", "coverage", "breaking",
    "techcrunch", "wired", "the verge", "bloomberg", "wsj", "new york times",
    "forbes", "fortune", "substack writer",
}

BOT_SIGNALS = [
    r"following back",
    r"follow (me|back)",
    r"gain followers",
    r"free followers",
    r"\d{4,} followers",  # suspiciously large counts in bio
    r"dm for (promo|collab|deal)",
    r"get rich",
    r"make money online",
    r"\$\d+ (per|a) (day|week|month)",
]


# ── Classification logic ───────────────────────────────────────────────────────

def classify_follower(bio: str, username: str, description: str = "") -> str:
    """
    Returns one of: ENGINEER, FOUNDER, INVESTOR, JOURNALIST, GENERAL, OTHER
    """
    combined = f"{bio} {description} {username}".lower()
    combined_clean = re.sub(r"[^\w\s]", " ", combined)
    words = set(combined_clean.split())

    # Bot/spam detection first
    for pattern in BOT_SIGNALS:
        if re.search(pattern, combined, re.IGNORECASE):
            return "OTHER"

    # Score each category by keyword hits
    scores = {
        "ENGINEER": len(words & ENGINEER_KEYWORDS),
        "FOUNDER": len(words & FOUNDER_KEYWORDS),
        "INVESTOR": len(words & INVESTOR_KEYWORDS),
        "JOURNALIST": len(words & JOURNALIST_KEYWORDS),
    }

    best_cat = max(scores, key=lambda k: scores[k])
    best_score = scores[best_cat]

    if best_score == 0:
        # Check for any bio at all
        if len(combined.strip()) < 5:
            return "OTHER"
        return "GENERAL"

    # Tie-breaking: FOUNDER + INVESTOR → FOUNDER; ENGINEER + FOUNDER → FOUNDER
    if scores["FOUNDER"] > 0 and scores["ENGINEER"] > 0:
        return "FOUNDER" if scores["FOUNDER"] >= scores["ENGINEER"] else "ENGINEER"
    if scores["FOUNDER"] > 0 and scores["INVESTOR"] > 0:
        return "INVESTOR" if scores["INVESTOR"] > scores["FOUNDER"] + 1 else "FOUNDER"

    return best_cat


async def classify_followers_bulk(followers: list[dict]) -> list[dict]:
    """
    Classify a list of followers.
    Input:  [{"platformFollowerId": str, "handle": str, "bio": str, "description": str}]
    Output: [{"platformFollowerId": str, "handle": str, "classifiedType": str}]
    """
    results = []
    for follower in followers:
        classified = classify_follower(
            bio=follower.get("bio", "") or follower.get("description", ""),
            username=follower.get("handle", "") or follower.get("username", ""),
            description=follower.get("description", ""),
        )
        results.append({
            "platformFollowerId": follower.get("platformFollowerId", follower.get("id", "")),
            "handle": follower.get("handle", follower.get("username", "")),
            "classifiedType": classified,
        })
    return results
