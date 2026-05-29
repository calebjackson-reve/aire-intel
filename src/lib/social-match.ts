/**
 * Social-handle matching utilities.
 *
 * Two responsibilities:
 *   1. Parse Facebook "Download Your Information" friends exports (JSON or HTML)
 *   2. Fuzzy-match a list of FB friend names against existing leads
 *
 * The match is deliberately conservative — false positives are worse than
 * false negatives because they pollute Caleb's contact data. Returns confidence
 * scores so the UI can sort and let him confirm each match.
 */

export interface FBFriend {
  name: string;
  url?: string;            // facebook.com/username if available
  timestamp?: number;      // when they were friended
}

export interface MatchCandidate {
  leadId: string;
  leadName: string;
  leadEmail: string | null;
  fbFriend: FBFriend;
  score: number;           // 0.0 - 1.0
  reason: string;          // "exact name match" | "first+last match" | "fuzzy 87%"
}

/**
 * Parse Facebook's friends.json export.
 * Format: { "friends_v2": [{ "name": "Sarah Johnson", "timestamp": 1654321098 }, ...] }
 */
export function parseFacebookJson(raw: string): FBFriend[] {
  try {
    const data = JSON.parse(raw);
    const list = data.friends_v2 ?? data.friends ?? [];
    return list.map((f: { name: string; timestamp?: number; url?: string }) => ({
      name: f.name,
      url: f.url,
      timestamp: f.timestamp,
    }));
  } catch {
    return [];
  }
}

/**
 * Parse Facebook's friends.html export.
 * Format is messy — anchor tags with names, sometimes with profile URLs.
 */
export function parseFacebookHtml(raw: string): FBFriend[] {
  const friends: FBFriend[] = [];
  // Match <a href="https://www.facebook.com/...">Name</a> patterns
  const linkRe = /<a[^>]+href="(https?:\/\/(?:www\.)?facebook\.com\/[^"]+)"[^>]*>([^<]+)<\/a>/gi;
  let m;
  while ((m = linkRe.exec(raw)) !== null) {
    const url = m[1];
    const name = m[2].trim();
    // Skip the user's own profile link or non-friend links
    if (!name || name.length < 2 || name.includes("Facebook")) continue;
    friends.push({ name, url });
  }
  // Dedupe by URL
  const seen = new Set<string>();
  return friends.filter((f) => {
    const key = f.url ?? f.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Normalize a name for comparison.
 * - Lowercase, strip accents, strip non-letter characters except space.
 * - Collapse multiple spaces.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")    // strip combining marks
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Levenshtein distance for fuzzy name match — O(m*n). */
function lev(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

/** Similarity score [0,1] from Levenshtein. */
function sim(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (!max) return 1;
  return 1 - lev(a, b) / max;
}

/**
 * Match one FB friend against a list of leads.
 * Returns the best candidate or null. Threshold is conservative.
 */
export function matchFriend(
  fbFriend: FBFriend,
  leads: Array<{ id: string; name: string; email: string | null; firstName: string | null; lastName: string | null }>,
): MatchCandidate | null {
  const fbNorm = normalize(fbFriend.name);
  const fbTokens = fbNorm.split(" ").filter(Boolean);
  if (!fbTokens.length) return null;

  let best: MatchCandidate | null = null;

  for (const lead of leads) {
    const leadNorm = normalize(lead.name);
    const leadTokens = leadNorm.split(" ").filter(Boolean);

    // 1. Exact normalized match — confidence 1.0
    if (fbNorm === leadNorm) {
      return {
        leadId: lead.id,
        leadName: lead.name,
        leadEmail: lead.email,
        fbFriend,
        score: 1.0,
        reason: "exact name match",
      };
    }

    // 2. First + last token match — confidence 0.95
    if (fbTokens.length >= 2 && leadTokens.length >= 2) {
      if (fbTokens[0] === leadTokens[0] && fbTokens[fbTokens.length - 1] === leadTokens[leadTokens.length - 1]) {
        const cand: MatchCandidate = {
          leadId: lead.id,
          leadName: lead.name,
          leadEmail: lead.email,
          fbFriend,
          score: 0.95,
          reason: "first + last match",
        };
        if (!best || cand.score > best.score) best = cand;
        continue;
      }
    }

    // 3. Fuzzy similarity ≥ 0.85 — confidence = similarity
    const score = sim(fbNorm, leadNorm);
    if (score >= 0.85) {
      const cand: MatchCandidate = {
        leadId: lead.id,
        leadName: lead.name,
        leadEmail: lead.email,
        fbFriend,
        score,
        reason: `fuzzy ${Math.round(score * 100)}%`,
      };
      if (!best || cand.score > best.score) best = cand;
    }
  }

  return best;
}

/**
 * Cross-reference a parsed FB friends list against all leads.
 * Returns matches sorted by confidence + the count of unmatched friends.
 */
export function crossReference(
  friends: FBFriend[],
  leads: Array<{ id: string; name: string; email: string | null; firstName: string | null; lastName: string | null }>,
): { matches: MatchCandidate[]; unmatchedCount: number } {
  const matches: MatchCandidate[] = [];
  const usedLeadIds = new Set<string>();
  let unmatched = 0;

  // Sort friends so longer / more-unique names match first
  const sorted = [...friends].sort((a, b) => b.name.length - a.name.length);

  for (const friend of sorted) {
    // Skip leads we already matched to a different friend
    const eligible = leads.filter((l) => !usedLeadIds.has(l.id));
    const match = matchFriend(friend, eligible);
    if (match) {
      matches.push(match);
      usedLeadIds.add(match.leadId);
    } else {
      unmatched++;
    }
  }

  return {
    matches: matches.sort((a, b) => b.score - a.score),
    unmatchedCount: unmatched,
  };
}
