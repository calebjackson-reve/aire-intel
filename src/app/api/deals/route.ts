import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { triggerZap } from "@/lib/zapier";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));
  const status = searchParams.get("status") || "closed";

  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);

  const deals = await prisma.deal.findMany({
    where: {
      status,
      closingDate: { gte: start, lt: end },
    },
    orderBy: { closingDate: "desc" },
  });

  return Response.json({ deals, year });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const deal = await prisma.deal.create({
    data: {
      leadId: body.leadId ?? null,
      address: body.address,
      city: body.city ?? null,
      salePrice: parseFloat(body.salePrice),
      commission: parseFloat(body.commission),
      commissionPct: body.commissionPct ? parseFloat(body.commissionPct) : null,
      side: body.side ?? "buyer",
      status: body.status ?? "closed",
      contractDate: body.contractDate ? new Date(body.contractDate) : null,
      closingDate: new Date(body.closingDate),
      source: body.source ?? "manual",
      notes: body.notes ?? null,
    },
  });

  triggerZap("deal.created", {
    dealId: deal.id,
    address: deal.address,
    salePrice: deal.salePrice,
    commission: deal.commission,
    side: deal.side,
    status: deal.status,
  });

  return Response.json(deal, { status: 201 });
}
