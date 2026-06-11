export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { storeAsset } from "@/lib/render/storage";

export const runtime = "nodejs";

// Server-side multipart upload of a listing/source photo.
// (On Vercel, switch to @vercel/blob client-upload to bypass body limits.)
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "file required" }, { status: 400 });

  const contentProjectId = (form.get("contentProjectId") as string) || null;
  const slideIndexRaw = form.get("slideIndex");

  const buf = Buffer.from(await file.arrayBuffer());
  const stored = await storeAsset(file.name || "photo.jpg", buf, file.type || "image/jpeg");

  const asset = await prisma.mediaAsset.create({
    data: {
      contentProjectId,
      kind: "source_photo",
      url: stored.url,
      blobPathname: stored.pathname,
      mimeType: file.type || "image/jpeg",
      bytes: stored.bytes,
      slideIndex: slideIndexRaw != null ? Number(slideIndexRaw) : null,
    },
  });

  return Response.json(asset);
}
