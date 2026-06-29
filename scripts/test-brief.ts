/**
 * Quick smoke-test: run the brief assembler + one live Anthropic call.
 * Usage: npx tsx scripts/test-brief.ts
 */
import Anthropic from "@anthropic-ai/sdk";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function main() {
  console.log("🔑  API key present:", !!process.env.ANTHROPIC_API_KEY);
  console.log("🗄️  Database URL:   ", process.env.DATABASE_URL?.slice(0, 40) + "...");
  console.log("\n⏳  Calling Claude (haiku) for a morning brief preview...\n");

  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 700,
    messages: [
      {
        role: "user",
        content: `You are AIRÉ, the operations AI for Caleb Jackson, REALTOR® at Rêve Realtors in Baton Rouge, LA.

Generate a morning brief for Monday June 23 2026. Include:
1. 3 Baton Rouge market intel bullets (inventory, pricing, rates)
2. 2 lead revival suggestions (fictional leads with names + last contact)
3. 1 transaction watchdog alert with a specific action needed

Format: clean markdown. This is Caleb's 6am push notification. Keep each section tight.`,
      },
    ],
  });

  const brief = msg.content[0].type === "text" ? msg.content[0].text : "";
  console.log("✅  BRIEF OUTPUT:\n");
  console.log(brief);
  console.log("\n📊  Tokens used:", msg.usage.input_tokens, "in /", msg.usage.output_tokens, "out");
  console.log("💰  Estimated cost: ~$" + ((msg.usage.input_tokens * 0.00000025 + msg.usage.output_tokens * 0.00000125)).toFixed(5));
}

main().catch(console.error);
