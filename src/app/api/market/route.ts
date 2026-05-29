import Anthropic from "@anthropic-ai/sdk";

function getClient() { return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }); }

export async function GET() {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
    timeZone: "America/Chicago",
  });

  const response = await getClient().messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 600,
    system: [
      {
        type: "text",
        text: `You are the market intelligence engine for Caleb Jackson, REALTOR® at Rêve Realtors® in Baton Rouge, Louisiana. Service area: East Baton Rouge, West Feliciana (St. Francisville), Pointe Coupee (New Roads), Zachary, Central. Specialty: luxury residential $500K–$5M+.

Output ONLY valid JSON, no markdown, no explanation:
{
  "headline": "one punchy sentence about current market conditions",
  "br_median": "EBR Parish median sale price as dollar amount string e.g. $342,000",
  "dom_avg": "average days on market for EBR luxury segment as number string e.g. 47",
  "inventory": "low | balanced | high",
  "inventory_note": "one short phrase explaining why",
  "rate_30yr": "current 30-year fixed rate as string e.g. 6.85%",
  "signal": "bull | neutral | bear",
  "caleb_note": "one sentence of what this means for Caleb's listings and buyers — hyperlocal, dry, no corporate speak",
  "top_zip": "hottest zip code in service area right now",
  "yoy_change": "year-over-year price change as string e.g. +4.2%"
}`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: `Today is ${today}. Market pulse.` }],
  });

  const text = response.content.find((b) => b.type === "text")?.text ?? "{}";
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return Response.json(JSON.parse(jsonMatch?.[0] ?? "{}"));
  } catch {
    return Response.json({ headline: "Market data unavailable", signal: "neutral" });
  }
}
