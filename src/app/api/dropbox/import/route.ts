export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { storeAsset } from "@/lib/render/storage";

export async function POST(req: NextRequest) {
  const token = process.env.DROPBOX_ACCESS_TOKEN;
  if (!token) return Response.json({ error: "DROPBOX_ACCESS_TOKEN not set" }, { status: 503 });

  const { path } = await req.json() as { path: string };
  if (!path) return Response.json({ error: "path required" }, { status: 400 });

  const res = await fetch("https://content.dropboxapi.com/2/files/download", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Dropbox-API-Arg": JSON.stringify({ path }),
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) return Response.json({ error: "Dropbox download failed", status: res.status }, { status: 502 });

  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  const filename = path.split("/").pop() ?? "photo.jpg";

  const asset = await storeAsset(filename, buffer, contentType);
  return Response.json({ url: asset.url, bytes: asset.bytes });
}
