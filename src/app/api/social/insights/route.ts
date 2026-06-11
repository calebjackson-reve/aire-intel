export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { getPageInsights } from "@/lib/meta-insights";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const refresh = searchParams.get("refresh") === "1";
  const data = await getPageInsights(refresh);
  return Response.json(data);
}
