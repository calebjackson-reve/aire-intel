export const dynamic = "force-dynamic";

// The Brain's self-grade — per-engine-version prediction accuracy. Surface read;
// touches only the predictions layer (which reads immutable grade Observations).
import { scorecard } from "@/lib/brain/predictions";

export async function GET() {
  try {
    const scores = await scorecard();
    return Response.json({ scores, computed: true });
  } catch (err) {
    return Response.json({ scores: [], computed: false, error: err instanceof Error ? err.message : String(err) });
  }
}
