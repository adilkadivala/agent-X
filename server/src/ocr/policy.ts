/**
 * Original Content Rewards content policy helpers.
 * Aligned with https://help.x.com/en/using-x/original-content-rewards
 */

/** Engagement solicitation — OCR continuous eligibility forbids this. */
export const OCR_ENGAGE_SOLICIT =
  /\b(rt if|retweet if|like (and|&) (rt|retweet|share)|follow (me|for more|back)|link in bio|drop a like|hit (like|follow)|bookmark this|share (this|if)|who else (thinks|agrees)|tag (a|someone)|must follow|guaranteed viral)\b/i;

/** Monetization coaching / payout-maximizing talk — OCR ineligible content. */
export const OCR_MONETIZATION_COACHING =
  /\b(original content rewards|\bocr\b|creator (revenue|payout|studio)|revenue sharing|get (paid|monetiz)|monetiz(e|ation)|how to (earn|get paid) on x|payout tips|qualified impressions|premium (followers|impressions) hack)\b/i;

export function ocrContentViolations(text: string): string[] {
  const reasons: string[] = [];
  if (OCR_ENGAGE_SOLICIT.test(text)) {
    reasons.push("ocr: engagement solicitation");
  }
  if (OCR_MONETIZATION_COACHING.test(text)) {
    reasons.push("ocr: monetization coaching / payout talk");
  }
  return reasons;
}

/** Extra prompt rules for original posts under OCR. */
export const OCR_ORIGINAL_PROMPT_RULES = `
OCR / Original Content Rewards (must follow):
- Post must be YOUR original voice, expertise, or perspective — not a lightly edited copy of someone else's post.
- Commentary that adds a real take is fine; minimal captions on others' work are not.
- NEVER solicit likes, follows, RTs, bookmarks, or replies ("RT if", "follow for more", etc.).
- NEVER talk about monetization, payouts, OCR, Creator Revenue Sharing, or how to get paid on X.
- Do not aggregate or mash up others' posts without substantial new framing.
`.trim();
