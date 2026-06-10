// AIRE: loop:inbound-reply-handler

export type ReplyIntent = "interested" | "objection" | "question" | "unsubscribe";

const UNSUBSCRIBE =
  /\b(stop|unsubscribe|remove me|opt.?out|dont text|don't text|take me off|no more messages)\b/i;
const INTERESTED =
  /\b(yes|interested|want to see|love to see|sounds good|let'?s do|tell me more|definitely|absolutely|for sure|sign me up|i'?d like|i would like|when can|can we schedule|show me|id love|i'm in|count me in)\b/i;
const OBJECTION =
  /\b(not interested|no thanks|maybe later|bad time|not ready|can'?t|cannot|no longer|don'?t|dont|busy|not now|pass)\b|^\s*not\b/i;

/** Classify the intent of an inbound lead reply using keyword matching only. */
export function classifyReplyIntent(text: string): ReplyIntent {
  const t = text.trim();
  if (UNSUBSCRIBE.test(t)) return "unsubscribe";
  if (INTERESTED.test(t)) return "interested";
  if (t.includes("?")) return "question";
  if (OBJECTION.test(t)) return "objection";
  return "question";
}
