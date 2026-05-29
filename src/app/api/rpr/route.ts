import { NextRequest } from "next/server";
import { getRPRConfig, fetchRPRMarketData } from "@/lib/rpr";

export async function GET(req: NextRequest) {
  const zip = new URL(req.url).searchParams.get("zip") || "70808";
  const config = await getRPRConfig();
  if (!config) return Response.json({ connected: false, data: null });

  const data = await fetchRPRMarketData(zip);
  return Response.json({ connected: true, data });
}
