export const dynamic = "force-dynamic";
// Voice Corpus — mine & curate
//
// GET  /api/voice/mine          → preview the currently-saved corpus + a fresh mine
//                                  (does NOT persist) so Caleb can see what's there
// POST /api/voice/mine          → mine real sent messages, save as the curated corpus
//                                  body: { limit? }
//
// Mines Caleb's own outbound text/email out of the ContactLog so the comms agents
// learn his real voice. Nothing here sends a message; it only builds the few-shot
// corpus used by draft generation (see voice-corpus.ts + reve-system-prompt.ts).

import { NextRequest } from "next/server";
import {
  mineVoiceCorpus,
  getVoiceCorpus,
  saveVoiceCorpus,
} from "@/lib/voice-corpus";

export async function GET() {
  const [saved, candidates] = await Promise.all([
    getVoiceCorpus(),
    mineVoiceCorpus(50),
  ]);
  return Response.json({
    savedCount: saved.length,
    saved,
    candidateCount: candidates.length,
    candidates,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const limit = typeof body?.limit === "number" ? body.limit : 50;

  const samples = await mineVoiceCorpus(limit);
  if (samples.length === 0) {
    return Response.json(
      {
        saved: 0,
        note: "No usable outbound messages found. Paste real samples into voice-corpus.seed.ts and re-run.",
      },
      { status: 200 }
    );
  }

  await saveVoiceCorpus(samples);
  return Response.json({
    saved: samples.length,
    byChannel: {
      text: samples.filter((s) => s.channel === "text").length,
      email: samples.filter((s) => s.channel === "email").length,
    },
  });
}
