export const dynamic = "force-dynamic";
import { buildContentAudit } from "@/lib/meta-insights";

export async function GET() {
  const audit = await buildContentAudit();
  return Response.json(audit);
}
