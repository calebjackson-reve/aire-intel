// Parses Instagram and Facebook HTML data export files into structured records.
// Meta's takeout HTML uses obfuscated CSS classes — we parse by stripping
// style/script blocks and splitting on landmark text strings.

export interface ImportedPostInput {
  platform: string;
  caption?: string;
  publishedAt: Date;
  postType?: string;
  isReel?: boolean;
  imageCount?: number;
  hashtags?: string[];
  hashtagCount?: number;
  hasLocation?: boolean;
  reach?: number;
  impressions?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  profileVisits?: number;
  follows?: number;
  engagementRate?: number;
  hookStyle?: string;
  captionLength?: number;
  ctaType?: string;
}

export interface AudienceSnapshotInput {
  snapshotDate: Date;
  platform: string;
  totalFollowers?: number;
  followerDelta?: number;
  accountsReached?: number;
  reachDelta?: number;
  nonFollowerPct?: number;
  totalInteractions?: number;
  interactionDelta?: number;
  reelsInteractions?: number;
  postInteractions?: number;
  storyInteractions?: number;
  topCities?: Record<string, number>;
  ageBreakdown?: Record<string, number>;
  genderBreakdown?: Record<string, number>;
  peakDay?: string;
  peakHour?: number;
}

export interface PostLibraryEntry {
  caption?: string;
  publishedAt?: Date;
  mediaCount?: number;
  isReel?: boolean;
}

// ── Utility: strip HTML to plain text ────────────────────────────────────────

function stripHtml(html: string): string {
  // Remove style + script blocks first
  let text = html.replace(/<style[\s\S]*?<\/style>/gi, " ");
  text = text.replace(/<script[\s\S]*?<\/script>/gi, " ");
  // Remove all HTML tags
  text = text.replace(/<[^>]+>/g, " ");
  // Decode common HTML entities + numeric entities (IG uses zero-padded &#039;)
  text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, " ");
  text = text.replace(/&#0*(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
  // Collapse whitespace
  return text.replace(/\s+/g, " ").trim();
}

function parseNumber(str: string): number | undefined {
  const n = parseInt(str.replace(/[,\s]/g, ""), 10);
  return isNaN(n) ? undefined : n;
}

function parseFloat2(str: string): number | undefined {
  const n = parseFloat(str.replace(/[,%\s]/g, ""));
  return isNaN(n) ? undefined : n;
}

// ── Caption analysis ──────────────────────────────────────────────────────────

export function analyzeCaption(caption: string): {
  hookStyle: string;
  captionLength: number;
  ctaType: string;
  hashtags: string[];
  hashtagCount: number;
  hasLocation: boolean;
} {
  const words = caption.trim().split(/\s+/);
  const captionLength = words.length;

  // Hook style: first 10 words
  const opening = words.slice(0, 10).join(" ").toLowerCase();
  let hookStyle = "statement";
  if (opening.includes("?")) hookStyle = "question";
  else if (/^\d+/.test(opening)) hookStyle = "number";
  else if (/i (was|am|have|had|just|went|met|sold|lost|found|thought|knew)/i.test(opening)) hookStyle = "story";
  else if (words[0] && words[0].length <= 4 && !/[a-z]/.test(words[0])) hookStyle = "fragment";

  // CTA type
  const bodyLower = caption.toLowerCase();
  let ctaType = "none";
  if (/call|text me|call me|reach me/.test(bodyLower)) ctaType = "phone";
  else if (/dm|message me|slide into|inbox/.test(bodyLower)) ctaType = "dm";
  else if (/link in bio|in bio|bio link|linktree/.test(bodyLower)) ctaType = "link_bio";
  else if (/comment|tag a friend|share this/.test(bodyLower)) ctaType = "engagement";

  // Hashtags
  const hashtags = (caption.match(/#\w+/g) || []).map(h => h.toLowerCase());

  // Location signal
  const hasLocation = /baton rouge|zachary|central|clinton|st\. francisville|feliciana/i.test(caption);

  return { hookStyle, captionLength, ctaType, hashtags, hashtagCount: hashtags.length, hasLocation };
}

// ── Post type classifier ──────────────────────────────────────────────────────

export function classifyPostType(caption: string, isReel = false): string {
  if (isReel) return "reel";
  const lower = caption.toLowerCase();
  if (/just listed|new listing|now listed|for sale|active listing/.test(lower)) return "just_listed";
  if (/just sold|sold!|closed!|we sold|officially sold|under contract/.test(lower)) return "just_sold";
  if (/my client|my buyer|my seller|for drew|for tori|for the|their new|helped .+ (buy|sell|find)/.test(lower)) return "client_story";
  if (/\d (reason|tip|thing|step|mistake|fact)/.test(lower)) return "educational";
  if (/market update|interest rate|inventory|days on market|median/.test(lower)) return "market_update";
  return "personal";
}

// ── Instagram post library parser (posts_1.html / reels.html) ────────────────

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// IG post timestamps look like: "Jun 19, 2026 6:19 am" (abbreviated month, lowercase am/pm).
// Also tolerates full month names and uppercase AM/PM.
const IG_TIMESTAMP_RE = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*([ap])m/gi;

function parseIgDate(m: RegExpMatchArray): Date | undefined {
  const month = MONTHS[m[1].slice(0, 3).toLowerCase()];
  if (month === undefined) return undefined;
  const day = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  let hour = parseInt(m[4], 10);
  const min = parseInt(m[5], 10);
  const isPm = m[6].toLowerCase() === "p";
  if (isPm && hour !== 12) hour += 12;
  if (!isPm && hour === 12) hour = 0;
  const d = new Date(year, month, day, hour, min);
  return isNaN(d.getTime()) ? undefined : d;
}

// Metadata markers that separate the real caption from IG's export junk
// (geo coords, camera metadata, tagged-user list).
const CAPTION_CUTOFFS = ["Latitude", "Longitude", "Has Camera Metadata", "Tagged users", "Coauthor", "Invited coauthor"];

function cleanCaption(raw: string): string {
  let caption = raw;
  // Cut at the earliest metadata marker
  let cutIdx = caption.length;
  for (const marker of CAPTION_CUTOFFS) {
    const idx = caption.indexOf(marker);
    if (idx >= 0 && idx < cutIdx) cutIdx = idx;
  }
  caption = caption.slice(0, cutIdx).trim();
  // Strip the leading export boilerplate that precedes the first post/reel.
  // Only the first entry carries the "Generated by … UTC" header, so anchor on it.
  caption = caption.replace(/^[\s\S]*?\d{1,2}:\d{2}\s*[AP]M UTC/i, "").trim();
  // Then drop the "Contains data you requested from … at HH:MM AM" range line (greedy to last time).
  caption = caption.replace(/^\s*Contains data you requested from .+ at \d{1,2}:\d{2}\s*[AP]M\b/i, "").trim();
  return caption;
}

export function parseInstagramPostLibrary(html: string): PostLibraryEntry[] {
  const text = stripHtml(html);
  const entries: PostLibraryEntry[] = [];

  const matches = [...text.matchAll(IG_TIMESTAMP_RE)];

  for (let i = 0; i < matches.length; i++) {
    const tsMatch = matches[i];
    const tsIdx = tsMatch.index!;

    // Caption is the text between the previous timestamp and this one.
    const prevEnd = i > 0 ? matches[i - 1].index! + matches[i - 1][0].length : 0;
    const rawBefore = text.slice(prevEnd, tsIdx).trim();
    const caption = cleanCaption(rawBefore);

    const publishedAt = parseIgDate(tsMatch);

    if (caption || publishedAt) {
      entries.push({ caption: caption || undefined, publishedAt });
    }
  }

  return entries;
}

// ── Instagram reels parser ────────────────────────────────────────────────────

export function parseInstagramReels(html: string): PostLibraryEntry[] {
  const entries = parseInstagramPostLibrary(html);
  return entries.map(e => ({ ...e, isReel: true }));
}

// ── Audience insights parser ──────────────────────────────────────────────────

// IG insight files use a clean "Label value" layout (label first, then number),
// e.g. "Followers 2,293" or "Reels Shares 136". These helpers read that format.
function labelNum(text: string, label: string): number | undefined {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = text.match(new RegExp(esc + "\\s+([\\d,]+)"));
  return m ? parseNumber(m[1]) : undefined;
}

function labelPct(text: string, label: string): number | undefined {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = text.match(new RegExp(esc + "\\s+([+-]?\\d+\\.?\\d*)\\s*%"));
  return m ? parseFloat2(m[1]) : undefined;
}

// Parse a "Key: 1.2%, Key2: 3.4%, ..." segment between two anchor labels.
function parsePctSegment(text: string, startLabel: string, endLabel?: string): Record<string, number> {
  const startIdx = text.indexOf(startLabel);
  if (startIdx < 0) return {};
  const from = startIdx + startLabel.length;
  const to = endLabel ? (text.indexOf(endLabel, from) >= 0 ? text.indexOf(endLabel, from) : text.length) : text.length;
  const segment = text.slice(from, to);
  const out: Record<string, number> = {};
  // Keys may start with a digit (age buckets like "13-17") or a letter (cities).
  const re = /([A-Za-z0-9][A-Za-z0-9+\- ]*?):\s*([\d.]+)\s*%/g;
  for (const m of segment.matchAll(re)) {
    const key = m[1].trim();
    const val = parseFloat(m[2]);
    if (key && !isNaN(val)) out[key] = val;
  }
  return out;
}

export function parseAudienceInsights(html: string): AudienceSnapshotInput {
  const text = stripHtml(html);
  const snapshot: AudienceSnapshotInput = {
    snapshotDate: new Date(),
    platform: "instagram",
  };

  // "Followers 2,293" (label-then-number)
  snapshot.totalFollowers = labelNum(text, "Followers");
  // "Followers Delta +2.6%"
  snapshot.followerDelta = labelPct(text, "Followers Delta");

  // Day-of-week activity: "Monday Follower Activity 1,484" … pick the peak
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  let peakCount = 0;
  for (const day of days) {
    const count = labelNum(text, `${day} Follower Activity`) ?? 0;
    if (count > peakCount) { peakCount = count; snapshot.peakDay = day; }
  }

  // Age breakdown for all genders
  const age = parsePctSegment(text, "Follower Percentage by Age for All Genders", "Follower Percentage by Age for Men");
  if (Object.keys(age).length) snapshot.ageBreakdown = age;

  // Gender split: "Total Follower Percentage for Men 40%" / "…for Women 59.9%"
  const men = labelPct(text, "Total Follower Percentage for Men");
  const women = labelPct(text, "Total Follower Percentage for Women");
  if (men !== undefined || women !== undefined) {
    snapshot.genderBreakdown = { women: women ?? 0, men: men ?? 0 };
  }

  // Top cities: "Follower Percentage by City Baton Rouge: 6.9%, Zachary: 6%, …"
  const cities = parsePctSegment(text, "Follower Percentage by City", "Follower Percentage by Country");
  if (Object.keys(cities).length) snapshot.topCities = cities;

  return snapshot;
}

// ── Content interactions parser (content_interactions.html) ───────────────────

export interface ContentInteractionSummary {
  totalInteractions?: number;
  interactionDelta?: number;
  postInteractions?: number;
  postLikes?: number;
  postComments?: number;
  postShares?: number;
  postSaves?: number;
  storyInteractions?: number;
  reelsInteractions?: number;
  reelsInteractionDelta?: number;
  reelsLikes?: number;
  reelsComments?: number;
  reelsShares?: number;
  reelsSaves?: number;
}

export function parseContentInteractions(html: string): ContentInteractionSummary {
  const text = stripHtml(html);
  return {
    totalInteractions: labelNum(text, "Content Interactions"),
    interactionDelta: labelPct(text, "Content Interactions Delta"),
    postInteractions: labelNum(text, "Post Interactions"),
    postLikes: labelNum(text, "Post Likes"),
    postComments: labelNum(text, "Post Comments"),
    postShares: labelNum(text, "Post Shares"),
    postSaves: labelNum(text, "Post Saves"),
    storyInteractions: labelNum(text, "Story Interactions"),
    reelsInteractions: labelNum(text, "Reels Interactions"),
    reelsInteractionDelta: labelPct(text, "Reels Interactions Delta"),
    reelsLikes: labelNum(text, "Reels Likes"),
    reelsComments: labelNum(text, "Reels Comments"),
    reelsShares: labelNum(text, "Reels Shares"),
    reelsSaves: labelNum(text, "Reels Saves"),
  };
}

// ── Profiles reached parser (profiles_reached.html) ───────────────────────────

export interface ProfilesReachedSummary {
  accountsReached?: number;
  reachDelta?: number;
  nonFollowerPct?: number;
  impressions?: number;
  profileVisits?: number;
  externalLinkTaps?: number;
}

export function parseProfilesReached(html: string): ProfilesReachedSummary {
  const text = stripHtml(html);
  return {
    accountsReached: labelNum(text, "Accounts Reached"),
    reachDelta: labelPct(text, "Accounts Reached Delta"),
    nonFollowerPct: labelPct(text, "Non-Followers"),
    impressions: labelNum(text, "Impressions"),
    profileVisits: labelNum(text, "Profile visits"),
    externalLinkTaps: labelNum(text, "External link taps"),
  };
}

// ── Merge post library entries with their metrics ─────────────────────────────

export function buildImportedPosts(
  libraryPosts: PostLibraryEntry[],
  libraryReels: PostLibraryEntry[],
  platform = "instagram"
): ImportedPostInput[] {
  const results: ImportedPostInput[] = [];

  const process = (entries: PostLibraryEntry[], isReel: boolean) => {
    for (const entry of entries) {
      if (!entry.publishedAt && !entry.caption) continue;

      const caption = entry.caption || "";
      const analysis = caption ? analyzeCaption(caption) : {
        hookStyle: "statement", captionLength: 0, ctaType: "none",
        hashtags: [], hashtagCount: 0, hasLocation: false,
      };

      const postType = classifyPostType(caption, isReel);

      results.push({
        platform,
        caption: caption || undefined,
        publishedAt: entry.publishedAt || new Date(),
        postType,
        isReel,
        imageCount: entry.mediaCount || (isReel ? 0 : 1),
        hashtags: analysis.hashtags,
        hashtagCount: analysis.hashtagCount,
        hasLocation: analysis.hasLocation,
        hookStyle: analysis.hookStyle,
        captionLength: analysis.captionLength,
        ctaType: analysis.ctaType,
      });
    }
  };

  process(libraryPosts, false);
  process(libraryReels, true);

  return results;
}

// ── Seed snapshot from audit findings (used when export lacks full insight files) ──

export function buildSeedAudienceSnapshot(): AudienceSnapshotInput {
  return {
    snapshotDate: new Date("2026-06-23"),
    platform: "instagram",
    totalFollowers: 2293,
    followerDelta: 2.6,
    accountsReached: 16257,
    reachDelta: 748,
    nonFollowerPct: 90.8,
    totalInteractions: 2178,
    interactionDelta: 286,
    reelsInteractions: 940,
    postInteractions: 1140,
    peakDay: "Sunday",
    topCities: {
      "Baton Rouge": 6.9,
      "Zachary": 6.0,
      "Lafayette": 4.6,
      "Clinton": 3.4,
      "Central": 3.3,
    },
    ageBreakdown: { "25-34": 76, "35-44": 13, "18-24": 7, "45-54": 3, "55+": 1 },
    genderBreakdown: { women: 59.9, men: 40 },
  };
}
