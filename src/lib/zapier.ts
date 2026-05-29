import { getSetting } from "./settings";

/**
 * Fire-and-forget outbound webhook to Zapier.
 *
 * Set ZAPIER_WEBHOOK_URL in /settings. Each call POSTs JSON to that URL.
 * No throws — if the user hasn't configured Zapier, calls silently no-op.
 * No awaits — we don't block AIRE on Zapier latency.
 *
 * Events Caleb might wire downstream:
 *   - deal.created          → log to Google Sheet, ping Slack
 *   - contact.stage_changed → trigger drip campaign rotation
 *   - activity.logged       → audit trail
 *   - tc.packet_sent        → notify TC channel
 *   - mission.completed     → celebration confetti in #wins
 */
export type ZapEvent =
  | "deal.created"
  | "contact.stage_changed"
  | "activity.logged"
  | "tc.packet_sent"
  | "mission.completed";

export async function triggerZap(
  event: ZapEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  const url = await getSetting("ZAPIER_WEBHOOK_URL");
  if (!url) return;

  const body = JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    source: "aire",
    ...payload,
  });

  // Fire-and-forget. AbortSignal caps it at 5s so a broken Zap can't hang AIRE.
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal: AbortSignal.timeout(5_000),
  }).catch(() => {
    // Swallow — Zapier is non-critical glue. Caleb sees connection status in /settings.
  });
}
