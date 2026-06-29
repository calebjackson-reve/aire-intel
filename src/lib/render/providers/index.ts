// Provider selector — one place that resolves RENDER_API_PROVIDER to an adapter.
// Callers ask for the active provider; they never name a concrete one.

import type { RenderProvider } from "./types";
import { shotstackProvider } from "./shotstack";

const PROVIDERS: Record<string, RenderProvider> = {
  shotstack: shotstackProvider,
  // creatomate: creatomateProvider,  // ← second adapter slots in here
};

/**
 * Resolve the active render provider from RENDER_API_PROVIDER (default shotstack).
 * Throws if the configured name is unknown so misconfig fails loud, not silent.
 */
export function getRenderProvider(): RenderProvider {
  const name = (process.env.RENDER_API_PROVIDER ?? "shotstack").toLowerCase();
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new Error(
      `Unknown RENDER_API_PROVIDER "${name}". Known: ${Object.keys(PROVIDERS).join(", ")}`
    );
  }
  return provider;
}

export type { RenderProvider, RenderStatus, RenderSubmission, RenderState } from "./types";
