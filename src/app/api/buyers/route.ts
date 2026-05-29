import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const searches = await prisma.buyerSearch.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      lead: { select: { id: true, name: true, phone: true, email: true } },
      alerts: {
        orderBy: { listedAt: "desc" },
        take: 5,
      },
      _count: { select: { alerts: true } },
    },
  });
  return Response.json(searches);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const search = await prisma.buyerSearch.create({
    data: {
      leadId:        body.leadId ?? null,
      name:          body.name,
      priceMin:      body.priceMin ? Number(body.priceMin) : null,
      priceMax:      body.priceMax ? Number(body.priceMax) : null,
      bedsMin:       body.bedsMin ? Number(body.bedsMin) : null,
      bathsMin:      body.bathsMin ? Number(body.bathsMin) : null,
      sqftMin:       body.sqftMin ? Number(body.sqftMin) : null,
      areas:         body.areas ?? null,
      propertyTypes: body.propertyTypes ?? null,
    },
    include: {
      lead: { select: { id: true, name: true, phone: true, email: true } },
      alerts: { orderBy: { listedAt: "desc" }, take: 5 },
      _count: { select: { alerts: true } },
    },
  });
  return Response.json(search, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const { id, ...data } = await request.json();
  const search = await prisma.buyerSearch.update({ where: { id }, data });
  return Response.json(search);
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json();
  await prisma.buyerSearch.delete({ where: { id } });
  return new Response(null, { status: 204 });
}
