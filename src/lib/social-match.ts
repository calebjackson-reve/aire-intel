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

// ─── vCard parser ──────────────────────────────────────────────────────────
export interface VCardContact {
  name: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  uid?: string;
}

/** Parse a .vcf file (single or multi-card) into structured contacts. */
export function parseVCard(raw: string): VCardContact[] {
  const contacts: VCardContact[] = [];
  const cards = raw.split(/BEGIN:VCARD/i).slice(1);

  for (const card of cards) {
    const get = (key: string) => {
      const m = card.match(new RegExp(`^${key}[^:]*:(.+)$`, "im"));
      return m?.[1]?.trim().replace(/\r/g, "") ?? undefined;
    };

    const fnLine = get("FN");
    if (!fnLine) continue;

    const nLine = get("N"); // last;first;middle;prefix;suffix
    const parts = nLine?.split(";") ?? [];
    const firstName = parts[1]?.trim() || undefined;
    const lastName = parts[0]?.trim() || undefined;

    // Pick first phone (work, cell, home — whatever's there)
    const phoneLine = card.match(/^TEL[^:]*:(.+)$/im)?.[1]?.trim().replace(/\r/g, "");
    // Pick first email
    const emailLine = card.match(/^EMAIL[^:]*:(.+)$/im)?.[1]?.trim().replace(/\r/g, "");
    const uid = get("UID");

    contacts.push({
      name: fnLine,
      firstName,
      lastName,
      email: emailLine,
      phone: phoneLine,
      uid,
    });
  }

  return contacts;
}

// ─── Instagram export parser ──────────────────────────────────────────────
export interface IGPerson {
  handle: string;
  name?: string;
  url?: string;
}

/**
 * Parse Instagram "Download Your Information" following/followers JSON.
 * Format: { "relationships_followers": [{ "string_list_data": [{ "value": "@handle", "href": "..." }] }] }
 * or the simpler flat array format from newer IG exports.
 */
export function parseInstagramJson(raw: string): IGPerson[] {
  try {
    const data = JSON.parse(raw);
    const extract = (arr: unknown[]): IGPerson[] =>
      arr.flatMap((entry: unknown) => {
        const e = entry as Record<string, unknown>;
        // Nested format
        const items = (e.string_list_data ?? e.data ?? []) as Array<Record<string, string>>;
        if (items.length) {
          return items.map((i) => ({
            handle: (i.value ?? i.username ?? "").replace(/^@/, ""),
            name: i.title ?? undefined,
            url: i.href ?? undefined,
          })).filter((p) => p.handle);
        }
        // Flat format
        if (e.username || e.value) {
          return [{ handle: String(e.username ?? e.value ?? "").replace(/^@/, ""), name: e.full_name as string | undefined }];
        }
        return [];
      });

    // Try multiple known IG export shapes
    const list =
      data.relationships_followers ??
      data.relationships_following ??
      data.followers ??
      data.following ??
      (Array.isArray(data) ? data : []);

    return extract(list).filter((p) => p.handle.length > 0);
  } catch {
    return [];
  }
}

// ─── Cross-source dedup across SocialPerson + Lead ───────────────────────
/** Normalize phone to 10-digit US. */
export function normPhone(s: string | null | undefined): string {
  return (s ?? "").replace(/[^\d]/g, "").replace(/^1(\d{10})$/, "$1").slice(-10);
}

export function normEmail(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

/** Find duplicate pairs within an array of people (name/phone/email overlap). */
export function findDuplicates<T extends { id: string; name: string; phone?: string | null; email?: string | null }>(
  people: T[],
): Array<{ a: T; b: T; score: number; reason: string }> {
  const dupes: Array<{ a: T; b: T; score: number; reason: string }> = [];
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const a = people[i], b = people[j];
      const aPhone = normPhone(a.phone), bPhone = normPhone(b.phone);
      const aEmail = normEmail(a.email), bEmail = normEmail(b.email);
      if (aPhone.length === 10 && aPhone === bPhone) {
        dupes.push({ a, b, score: 1.0, reason: "same phone" }); continue;
      }
      if (aEmail && aEmail === bEmail) {
        dupes.push({ a, b, score: 1.0, reason: "same email" }); continue;
      }
      const nameSim = sim(normalize(a.name), normalize(b.name));
      if (nameSim >= 0.92) {
        dupes.push({ a, b, score: nameSim, reason: `name match ${Math.round(nameSim * 100)}%` });
      }
    }
  }
  return dupes.sort((x, y) => y.score - x.score);
}
