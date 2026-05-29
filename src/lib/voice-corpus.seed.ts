// Voice Corpus — manual seed (fallback)
//
// When the ContactLog doesn't yet hold enough real sent messages to mine (e.g. a
// fresh DB, or before full Lofty history syncs), Caleb pastes real texts/emails
// he's actually sent here. These get scrubbed (PII removed) and merged in exactly
// like mined samples — they anchor the comms agents to his real voice.
//
// Rules for what to paste:
//   - REAL messages Caleb actually sent (not idealized / rewritten).
//   - One per array entry. Texts and emails both welcome.
//   - Don't bother removing names/phones/emails — scrub() strips them on load.
//   - Aim for 15–40 strong, varied ones (first touch, follow-up, under contract,
//     congrats, scheduling, dead-lead re-engagement, etc.).

import type { VoiceSample } from "./voice-corpus";

export const VOICE_CORPUS_SEED: VoiceSample[] = [
  // Example shape (delete these and paste Caleb's real ones):
  // {
  //   channel: "text",
  //   body: "hey — that place on Goodwood just dropped 10k. want me to set up a look thurs after 4?",
  //   stage: "active",
  //   type: "buyer",
  // },
];
