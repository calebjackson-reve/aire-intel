export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDarwinCsv } from "@/lib/darwin-parser";

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";

  let csvText: string;
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return Response.json({ error: "No file provided" }, { status: 400 });
    csvText = await file.text();
  } else {
    csvText = await request.text();
  }

  const deals = parseDarwinCsv(csvText);
  if (deals.length === 0) {
    return Response.json({ error: "No valid deals found in CSV. Expected Darwin format." }, { status: 400 });
  }

  // Wipe existing Darwin-sourced deals and re-insert (clean overwrite)
  await prisma.deal.deleteMany({ where: { source: "darwin" } });

  const created = await prisma.deal.createMany({
    data: deals.map(d => ({
      address: d.address,
      city: d.city,
      salePrice: d.salePrice,
      commission: d.commission,
      commissionPct: d.commissionPct,
      side: d.side,
      status: d.status,
      contractDate: d.contractDate,
      closingDate: d.closingDate ?? new Date(),
      source: d.source,
      notes: d.notes,
    })),
  });

  // Build a notification
  const closedCount = deals.filter(d => d.status === "closed").length;
  const pendingCount = deals.filter(d => d.status === "pending").length;
  const totalAgci = deals.filter(d => d.status === "closed").reduce((s, d) => s + d.commission, 0);
  const totalVolume = deals.filter(d => d.status === "closed").reduce((s, d) => s + d.salePrice, 0);

  await prisma.notification.create({
    data: {
      type: "sync_complete",
      title: "Darwin imported",
      body: `${closedCount} closed · ${pendingCount} pending · $${totalAgci.toLocaleString()} AGCI · $${(totalVolume / 1_000_000).toFixed(2)}M volume`,
      href: "/",
    },
  });

  return Response.json({
    imported: created.count,
    closed: closedCount,
    pending: pendingCount,
    totalAgci,
    totalVolume,
  });
}
