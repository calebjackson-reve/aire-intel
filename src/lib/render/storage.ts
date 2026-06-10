import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

/**
 * One place for all asset storage so prod (Vercel Blob) and local dev (public/)
 * are interchangeable. Returns a PUBLIC HTTPS/relative URL Meta can consume.
 *
 * - If BLOB_READ_WRITE_TOKEN is set (Vercel), upload to Vercel Blob → public HTTPS URL.
 * - Else (local dev), write to public/generated/ → returns "/generated/<name>".
 */
export interface StoredAsset {
  url: string;
  pathname: string;
  bytes: number;
}

export async function storeAsset(
  filename: string,
  data: Buffer,
  contentType: string
): Promise<StoredAsset> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  if (token) {
    const { put } = await import("@vercel/blob");
    const blob = await put(filename, data, {
      access: "public",
      contentType,
      token,
      addRandomSuffix: true,
    });
    return { url: blob.url, pathname: blob.pathname, bytes: data.length };
  }

  // Local dev fallback — write under public/generated
  const dir = join(process.cwd(), "public", "generated");
  await mkdir(dir, { recursive: true });
  const safe = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  await writeFile(join(dir, safe), data);
  return { url: `/generated/${safe}`, pathname: `generated/${safe}`, bytes: data.length };
}
