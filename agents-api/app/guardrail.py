"""
Content guardrail engine.
Checks post content against X platform policy rules before publishing.
"""
import re
from typing import TypedDict

# ── Default X Platform Rules ───────────────────────────────────────────────────

DEFAULT_X_RULES: list[dict] = [
    {
        "ruleId": "XP-001",
        "category": "ENGAGEMENT_BAIT",
        "description": "Content must not explicitly request follows, retweets, or likes in a manipulative pattern.",
        "severity": "MEDIUM",
        "sourceUrl": "https://help.x.com/en/using-x/engagement-bait-policy",
        "keywords": ["follow me", "retweet this", "like this", "rt if", "follow for follow", "f4f", "l4l"],
    },
    {
        "ruleId": "XP-002",
        "category": "HASHTAG_SPAM",
        "description": "Posts should not contain 5 or more hashtags — triggers spam classifier.",
        "severity": "LOW",
        "sourceUrl": "https://help.x.com/en/using-x/how-to-use-hashtags",
        "pattern": r"(#\w+.*?){5,}",
    },
    {
        "ruleId": "XP-003",
        "category": "INAUTHENTIC_BEHAVIOR",
        "description": "Content that signals coordination, mass posting scripts, or bulk follow activity.",
        "severity": "HIGH",
        "sourceUrl": "https://help.x.com/en/rules-and-policies/platform-manipulation",
        "keywords": [
            "auto follow", "mass follow", "bulk unfollow", "follow bot",
            "automation service", "grow followers fast", "buy followers",
        ],
    },
    {
        "ruleId": "XP-004",
        "category": "MISLEADING_STATISTICS",
        "description": "Unqualified extreme multiplier claims (100x, 1000x) without citations can be flagged as misleading.",
        "severity": "LOW",
        "sourceUrl": "https://help.x.com/en/rules-and-policies/misleading-information",
        "pattern": r"\b(100|200|500|1000)x\b",
    },
    {
        "ruleId": "XP-005",
        "category": "PLATFORM_DISPARAGEMENT",
        "description": "Explicit platform disparagement can result in reduced distribution.",
        "severity": "LOW",
        "sourceUrl": "https://help.x.com/en/rules-and-policies/twitter-rules",
        "keywords": ["twitter is dying", "leave twitter", "delete your twitter", "quit twitter"],
    },
    {
        "ruleId": "XP-006",
        "category": "SPAM_PATTERNS",
        "description": "Repetitive content, identical posts, or bot-like patterns.",
        "severity": "HIGH",
        "sourceUrl": "https://help.x.com/en/rules-and-policies/spam-and-appeals",
        "pattern": r"(.{10,})\1{2,}",  # same phrase repeated 3+ times
    },
    {
        "ruleId": "XP-007",
        "category": "LINK_SPAM",
        "description": "Multiple unrelated links in a single tweet signals promotional spam.",
        "severity": "MEDIUM",
        "sourceUrl": "https://help.x.com/en/rules-and-policies/spam-and-appeals",
        "pattern": r"(https?://\S+\s+){3,}",  # 3+ URLs in one post
    },
]


# ── Checking logic ─────────────────────────────────────────────────────────────

def check_content(text: str, rules: list[dict] | None = None) -> dict:
    """
    Check text against the given list of rules (or DEFAULT_X_RULES).
    Returns: {passed: bool, violations: [{ruleId, category, severity, explanation}]}
    """
    if rules is None:
        rules = DEFAULT_X_RULES

    violations = []
    lower = text.lower()

    for rule in rules:
        matched = False

        # Keyword-based check
        if keywords := rule.get("keywords"):
            for kw in keywords:
                if kw.lower() in lower:
                    matched = True
                    break

        # Regex-based check
        if not matched and (pattern := rule.get("pattern")):
            if re.search(pattern, text, re.IGNORECASE):
                matched = True

        if matched:
            violations.append({
                "ruleId": rule["ruleId"],
                "category": rule["category"],
                "severity": rule["severity"],
                "explanation": rule["description"],
                "sourceUrl": rule.get("sourceUrl", ""),
            })

    return {
        "passed": len(violations) == 0,
        "violations": violations,
        "checkedRules": len(rules),
    }


async def guardrail_check(text: str) -> dict:
    """
    Async wrapper for content guardrail check.
    Runs check_content with DEFAULT_X_RULES.
    """
    return check_content(text, DEFAULT_X_RULES)
