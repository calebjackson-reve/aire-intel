export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { prisma } from "@/lib/prisma";
import { renderSlidePng } from "@/lib/render/satori";
import { storeAsset } from "@/lib/render/storage";
import { CAROUSEL, type SlideSpec, type AgentBrand } from "@/lib/render/types";

export const runtime = "nodejs";

const AGENT: AgentBrand = {
  name: "Caleb Jackson",
  brokerage: "Rêve Realtors®",
  handle: "@reverealtors",
};

// Resolve a stored asset URL (local "/generated/..." or remote https) to a data URI
async function toDataUri(url?: string | null): Promise<string | undefined> {
  if (!url) return undefined;
  try {
    if (url.startsWith("/")) {
      const buf = await readFile(join(process.cwd(), "public", url.replace(/^\//, "")));
      return `data:image/jpeg;base64,${buf.toString("base64")}`;
    }
    const res = await fetch(url);
    const mime = res.headers.get("content-type") || "image/jpeg";
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return undefined;
  }
}

export async function POST(req: NextRequest) {
  const { contentProjectId } = await req.json();
  if (!contentProjectId) return Response.json({ error: "contentProjectId required" }, { status: 400 });

  const project = await prisma.contentProject.findUnique({
    where: { id: contentProjectId },
    include: { media: true },
  });
  if (!project) return Response.json({ error: "project not found" }, { status: 404 });

  // slideSpec may be the slides array directly, or { slides: [...] }
  const raw = project.slideSpec as unknown;
  const slides: SlideSpec[] = Array.isArray(raw)
    ? (raw as SlideSpec[])
    : ((raw as { slides?: SlideSpec[] })?.slides ?? []);

  if (slides.length === 0) return Response.json({ error: "no slideSpec to render" }, { status: 400 });

  const photos = project.media
    .filter((m) => m.kind === "source_photo")
    .sort((a, b) => (a.slideIndex ?? 0) - (b.slideIndex ?? 0));

  // Idempotent: clear prior rendered slides for this project
  await prisma.mediaAsset.deleteMany({ where: { contentProjectId, kind: "carousel_slide" } });

  const created = [];
  for (let i = 0; i < slides.length; i++) {
    const spec = slides[i];
    const photoUri =
      spec.photoSlot != null && photos[spec.photoSlot]
        ? await toDataUri(photos[spec.photoSlot].url)
        : undefined;

    let png: Buffer;
    try {
      png = await renderSlidePng(spec, { w: CAROUSEL.width, h: CAROUSEL.height, photoUri, agent: AGENT });
    } catch (e) {
      return Response.json(
        { error: `render failed at slide ${i} (${spec.layoutVariant}): ${String((e as Error)?.message).split("\n")[0]}` },
        { status: 500 }
      );
    }
    const stored = await storeAsset(`slide-${contentProjectId}-${i}.png`, png, "image/png");

    const asset = await prisma.mediaAsset.create({
      data: {
        contentProjectId,
        kind: "carousel_slide",
        url: stored.url,
        blobPathname: stored.pathname,
        width: CAROUSEL.width,
        height: CAROUSEL.height,
        slideIndex: i,
        layoutVariant: spec.layoutVariant,
        mimeType: "image/png",
        bytes: stored.bytes,
      },
    });
    created.push(asset);
  }

  return Response.json({ slides: created });
}
