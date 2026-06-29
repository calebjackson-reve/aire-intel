export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const row = await prisma.setting.findUnique({ where: { key: "trend.topFormats" } }).catch(() => null);
  const topFormats = row?.value ? JSON.parse(row.value) : [];
  return NextResponse.json({ topFormats });
}
