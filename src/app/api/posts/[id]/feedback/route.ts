export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// Records Caleb's thumbs-up / thumbs-down on a generated post.
// Feeds the preference learning loop — approved posts extract patterns,
// rejected posts flag what to avoid.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { feedback, note } = await req.json() as { feedback: "approved" | "rejected" | "edited"; note?: string };

  if (!["approved", "rejected", "edited"].includes(feedback)) {
    return Response.json({ error: "feedback must be approved | rejected | edited" }, { status: 400 });
  }

  const post = await prisma.scheduledPost.findUnique({ where: { id } });
  if (!post) return Response.json({ error: "Post not found" }, { status: 404 });

  await prisma.scheduledPost.update({
    where: { id },
    data: { userFeedback: feedback, feedbackNote: note ?? null },
  });

  // Extract and store patterns from approved posts
  if (feedback === "approved" && post.caption) {
    await extractAndStorePatterns(post.caption, post.postType, true);
  }
  if (feedback === "rejected" && post.caption) {
    await extractAndStorePatterns(post.caption, post.postType, false);
  }

  return Response.json({ ok: true, feedback });
}

async function extractAndStorePatterns(caption: string, postType: string | null, approved: boolean) {
  const patterns: Array<{ patternType: string; value: string }> = [];

  // Hook pattern — first line
  const firstLine = caption.split("\n")[0].trim();
  if (firstLine.length > 0 && firstLine.length < 100) {
    // Classify hook style
    const hookStyle = firstLine.includes("?") ? "question_hook"
      : /^\d/.test(firstLine) ? "number_hook"
      : firstLine.includes(".") && firstLine.split(" ").length <= 5 ? "fragment_hook"
      : "statement_hook";
    patterns.push({ patternType: "hook_style", value: hookStyle });
  }

  // Post type
  if (postType) {
    patterns.push({ patternType: "post_type", value: postType });
  }

  // Hashtag count
  const tagCount = (caption.match(/#\w+/g) ?? []).length;
  if (tagCount > 0) {
    const bucket = tagCount <= 5 ? "5_or_fewer" : tagCount <= 8 ? "6_to_8" : "over_8";
    patterns.push({ patternType: "hashtag_count", value: bucket });
  }

  // CTA style
  if (/\(\d{3}\)/.test(caption)) patterns.push({ patternType: "cta_format", value: "phone_number" });
  if (/dm|message/i.test(caption)) patterns.push({ patternType: "cta_format", value: "dm_cta" });
  if (/link in bio/i.test(caption)) patterns.push({ patternType: "cta_format", value: "link_in_bio" });

  // Caption length
  const wordCount = caption.split(/\s+/).length;
  const lengthBucket = wordCount < 50 ? "short" : wordCount < 100 ? "medium" : "long";
  patterns.push({ patternType: "caption_length", value: lengthBucket });

  // Upsert each pattern with approval/rejection increment
  await Promise.all(patterns.map(async ({ patternType, value }) => {
    const existing = await prisma.contentPreference.findUnique({ where: { patternType_value: { patternType, value } } });
    const newApprovals = (existing?.approvals ?? 0) + (approved ? 1 : 0);
    const newRejections = (existing?.rejections ?? 0) + (approved ? 0 : 1);
    const total = newApprovals + newRejections;
    const rate = total > 0 ? newApprovals / total : 0;

    await prisma.contentPreference.upsert({
      where: { patternType_value: { patternType, value } },
      update: { approvals: newApprovals, rejections: newRejections, approvalRate: rate, lastSeen: new Date() },
      create: { patternType, value, approvals: newApprovals, rejections: newRejections, approvalRate: rate },
    });
  }));
}
