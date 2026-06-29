export const dynamic = "force-dynamic";

// Footage upload for the /reel pipeline.
//
// Phone footage is large (50–200MB+), which exceeds Vercel's ~4.5MB server-route
// body limit. So we DON'T proxy the bytes through this route. Instead we mint a
// short-lived client token (handleUpload) and the browser uploads DIRECTLY to
// Vercel Blob. The route only (a) authorizes the upload and (b) records the
// resulting public URL as a MediaAsset once the upload completes.
//
// Client usage (browser):
//   import { upload } from "@vercel/blob/client";
//   const blob = await upload(file.name, file, {
//     access: "public",
//     handleUploadUrl: "/api/reel/upload",
//   });
//   // blob.url is a public HTTPS URL → push into ReelInput.footage[].url
//
// NOTE: onUploadCompleted only fires when the app is on a public HTTPS host
// (i.e. the Vercel deployment), not on localhost. The client still receives
// blob.url locally; the MediaAsset row is just written in prod.

import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/error-memory";

const ALLOWED = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
  "image/jpeg",
  "image/png",
  "image/heic",
];

// Generous ceiling for raw phone footage; tune down if needed.
const MAX_BYTES = 500 * 1024 * 1024; // 500MB

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // clientPayload (optional) can carry the contentProjectId from the UI.
        return {
          allowedContentTypes: ALLOWED,
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: true,
          tokenPayload: clientPayload ?? null,
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Runs server-side after the browser finishes uploading (prod only).
        let contentProjectId: string | null = null;
        if (tokenPayload) {
          try {
            const parsed = JSON.parse(tokenPayload) as { contentProjectId?: string };
            contentProjectId = parsed.contentProjectId ?? null;
          } catch {
            // tokenPayload wasn't JSON — ignore, leave unlinked
          }
        }

        await prisma.mediaAsset.create({
          data: {
            contentProjectId,
            kind: "reel_footage",
            url: blob.url,
            blobPathname: blob.pathname,
            mimeType: blob.contentType ?? "video/mp4",
            bytes: 0, // size isn't returned in the completion payload; render step can backfill
          },
        });
      },
    });

    return Response.json(json);
  } catch (err) {
    await logError("api_failure", "reel/upload", err as Error, { route: "/api/reel/upload" });
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
