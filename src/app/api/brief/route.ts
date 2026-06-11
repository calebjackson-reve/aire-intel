export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { assembleBrief } from "@/lib/brief-assembler";
import { getTodayCT } from "@/lib/brief-date";

// GET /api/brief — returns today's DailyBrief (assembles on-demand if not yet assembled)
export async function GET() {
  const today = getTodayCT();

  let record = await prisma.dailyBrief.findUnique({ where: { date: today } });

  if (!record) {
    // Assemble on-demand (first request of the day before cron fires)
    const assembled = await assembleBrief();
    record = await prisma.dailyBrief.findUnique({ where: { date: assembled.date } });
  }

  if (!record) {
    return Response.json({ brief: null, date: today });
  }

  return Response.json({ brief: record, date: today });
}
