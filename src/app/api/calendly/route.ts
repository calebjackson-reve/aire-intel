export const dynamic = "force-dynamic";
import { getCalendlyConfig, getCalendlyLink } from "@/lib/calendly";

export async function GET() {
  const config = await getCalendlyConfig();
  if (!config) return Response.json({ connected: false, link: null });

  const link = await getCalendlyLink();
  return Response.json({ connected: true, link });
}
