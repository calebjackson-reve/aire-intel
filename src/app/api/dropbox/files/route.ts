export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";

const DBX = "https://api.dropboxapi.com/2";

interface DbxEntry { ".tag": string; name: string; path_display: string }
interface ThumbEntry { ".tag": string; metadata?: { path_display: string }; thumbnail?: string }

export async function GET(req: NextRequest) {
  const token = process.env.DROPBOX_ACCESS_TOKEN;
  if (!token) return Response.json({ error: "DROPBOX_ACCESS_TOKEN not set" }, { status: 503 });

  const path = new URL(req.url).searchParams.get("path") ?? "";

  const listRes = await fetch(`${DBX}/files/list_folder`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ path, recursive: false }),
    signal: AbortSignal.timeout(12_000),
  });

  if (!listRes.ok) {
    const err = await listRes.json().catch(() => ({}));
    return Response.json({ error: err }, { status: listRes.status });
  }

  const data = await listRes.json() as { entries: DbxEntry[]; has_more: boolean };
  const folders = data.entries.filter(e => e[".tag"] === "folder");
  const images  = data.entries.filter(e => e[".tag"] === "file" && /\.(jpg|jpeg|png|webp|heic|gif|tiff?)$/i.test(e.name));

  // Batch-fetch thumbnails for up to 25 images
  const thumbMap: Record<string, string> = {};
  if (images.length > 0) {
    const thumbRes = await fetch(`${DBX}/files/get_thumbnail_batch`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        entries: images.slice(0, 25).map(f => ({ path: f.path_display, format: "jpeg", size: "w256h256" })),
      }),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);

    if (thumbRes?.ok) {
      const td = await thumbRes.json() as { entries: ThumbEntry[] };
      td.entries.forEach(e => {
        if (e[".tag"] === "success" && e.metadata?.path_display && e.thumbnail) {
          thumbMap[e.metadata.path_display] = `data:image/jpeg;base64,${e.thumbnail}`;
        }
      });
    }
  }

  return Response.json({
    entries: [
      ...folders.map(f => ({ name: f.name, path: f.path_display, type: "folder", thumbnail: null })),
      ...images.map(f => ({ name: f.name, path: f.path_display, type: "file", thumbnail: thumbMap[f.path_display] ?? null })),
    ],
    hasMore: data.has_more,
  });
}
