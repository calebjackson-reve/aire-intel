export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { scorePost } from "@/lib/content-quality";

export async function POST(req: NextRequest) {
  const { raw, caption } = await req.json() as { raw: string; caption?: string };
  if (!raw) return Response.json({ error: "raw required" }, { status: 400 });
  const result = scorePost(raw, caption);
  return Response.json(result);
}
