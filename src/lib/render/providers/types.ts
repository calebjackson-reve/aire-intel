// Render-provider seam.
//
// One narrow lifecycle every video-render backend satisfies: submit a timeline,
// get a renderId; poll the renderId, get a normalized status. Callers (the /reel
// command, the render-poll cron) never touch a provider's HTTP shape — they speak
// this interface only. Shotstack is the first adapter; Creatomate/Remotion drop in
// behind the same two methods without changing a single caller.
//
// Models src/lib/llm.ts: uniform interface, swappable implementations.

/** Normalized render lifecycle state, collapsed from each provider's vocabulary. */
export type RenderState = "queued" | "rendering" | "done" | "failed";

export interface RenderSubmission {
  /** Provider-side job id used for polling + webhook correlation. */
  renderId: string;
  /** Which adapter produced it (stored on RenderJob for poll routing). */
  provider: string;
}

export interface RenderStatus {
  state: RenderState;
  /** Public MP4 URL once state === "done". */
  url?: string;
  error?: string;
  /** Billable seconds, when the provider reports it (cost telemetry). */
  durationSec?: number;
}

export interface RenderProvider {
  /** Stable adapter id, e.g. "shotstack". Stored on RenderJob.provider. */
  readonly id: string;

  /** True when the keys this adapter needs are present in the environment. */
  configured(): boolean;

  /**
   * Submit a render. `timeline` is the provider's native timeline JSON — the
   * recipe→timeline bridge targets the active provider's format. `production`
   * selects the live (billed, watermark-free) endpoint over the sandbox.
   */
  submit(timeline: unknown, opts?: { production?: boolean }): Promise<RenderSubmission>;

  /** Poll a submitted render and normalize the provider's status payload. */
  poll(renderId: string, opts?: { production?: boolean }): Promise<RenderStatus>;
}
