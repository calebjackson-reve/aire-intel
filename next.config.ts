import type { NextConfig } from "next";
import * as fs from "fs";
import * as path from "path";

function loadEnvFile(filename: string, override = false) {
  const envPath = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key && val && (override || !(key in process.env))) {
      process.env[key] = val;
    }
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local", true); // .env.local always wins

console.log("[next.config] ANTHROPIC_API_KEY present:", !!process.env.ANTHROPIC_API_KEY);

const nextConfig: NextConfig = {
  // Native / heavy server-only packages must not be bundled by Turbopack.
  serverExternalPackages: [
    "@resvg/resvg-js",
    "satori",
    "@prisma/adapter-pg",
    "@prisma/client",
    "better-sqlite3",
  ],
};
export default nextConfig;
