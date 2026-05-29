import { prisma } from "./prisma";

export interface RPRMarketData {
  medianPrice: number;
  avgDom: number;
  activeListings: number;
  zip: string;
}

async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key } }).catch(() => null);
  return row?.value || process.env[key] || null;
}

export async function getRPRConfig(): Promise<{ username: string; password: string } | null> {
  const [username, password] = await Promise.all([
    getSetting("RPR_USERNAME"),
    getSetting("RPR_PASSWORD"),
  ]);
  if (!username || !password) return null;
  return { username, password };
}

export async function fetchRPRMarketData(zipCode: string): Promise<RPRMarketData | null> {
  const config = await getRPRConfig();
  if (!config) return null;

  try {
    const auth = Buffer.from(`${config.username}:${config.password}`).toString("base64");
    const res = await fetch(
      `https://rpr.realtor/api/market-stats?zip=${zipCode}`,
      {
        headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
      }
    );
    if (!res.ok) return null;
    const data = await res.json() as { medianSalesPrice?: number; averageDaysOnMarket?: number; activeListings?: number };
    return {
      medianPrice: data.medianSalesPrice ?? 0,
      avgDom: data.averageDaysOnMarket ?? 0,
      activeListings: data.activeListings ?? 0,
      zip: zipCode,
    };
  } catch {
    return null;
  }
}
