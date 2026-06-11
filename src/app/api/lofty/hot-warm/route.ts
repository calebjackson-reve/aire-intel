export const dynamic = "force-dynamic";
import { getLoftyCredentials, getLoftyAccessToken, fetchAllLoftyLeads, mapLoftyLeadToAire, LoftyLead } from "@/lib/lofty";

const HOT_STAGES = ["hot list", "hot"];
const WARM_STAGES = ["warm"];

export async function GET() {
  const creds = getLoftyCredentials();
  if (!creds) {
    return Response.json({ error: "Lofty credentials not configured" }, { status: 503 });
  }

  try {
    const token = await getLoftyAccessToken(creds);

    const res = await fetch("https://api.lofty.com/v1.0/leads?offset=0&limit=200", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
    });

    const data = await res.json() as { leads: LoftyLead[] };
    const leads = data.leads ?? [];

    const hot = leads.filter(l => HOT_STAGES.includes((l.stage ?? "").toLowerCase()));
    const warm = leads.filter(l => WARM_STAGES.includes((l.stage ?? "").toLowerCase()));

    const mapWithScore = (l: LoftyLead, tier: "hot" | "warm") => ({
      ...mapLoftyLeadToAire(l),
      loftyId: String(l.leadId),
      score: l.score ?? 0,
      tier,
      lastTouch: l.lastTouch ?? null,
      lastVisit: l.lastVisit ?? null,
      tags: l.tags?.map(t => t.tagName) ?? [],
      interestedIn: l.leadPropertyList?.slice(0, 3).map(p => ({
        address: p.streetAddress,
        city: p.city,
        price: p.price,
        beds: p.bedrooms,
        baths: p.bathrooms,
      })) ?? [],
    });

    return Response.json({
      hot: hot.map(l => mapWithScore(l, "hot")),
      warm: warm.map(l => mapWithScore(l, "warm")),
      total: hot.length + warm.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
