#!/usr/bin/env tsx
/**
 * AIRE dotloop MCP server.
 *
 * Exposes the AIRE dotloop client (src/lib/dotloop.ts) as MCP tools so Claude
 * Code can read loop contents, reconcile compliance, and upload staged documents
 * straight into the correct loop folder — the capability Zapier's dotloop
 * integration does NOT provide (it can only create loops).
 *
 * Run:    npx tsx src/mcp/dotloop-server.ts
 * Auth:   reads DOTLOOP_ACCESS_TOKEN + DOTLOOP_PROFILE_ID via getDotloopConfig()
 *         (Setting table → .env fallback). Generate the PAT at
 *         dotloop.com → Account → Integrations → API Access Tokens.
 *
 * Register in ~/.claude/settings.json under mcpServers (see plan).
 *
 * Upload flow from chat: Claude downloads a staged PDF from Google Drive
 * (download_file_content → base64), then calls `upload_document` with that
 * base64 payload; this server decodes it and POSTs to dotloop.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  getDotloopConfig,
  fetchAllLoops,
  getLoopDocuments,
  getLoopComplianceStatus,
  uploadDocument,
} from "../lib/dotloop";

const server = new McpServer({ name: "aire-dotloop", version: "1.0.0" });

function text(payload: unknown) {
  return { content: [{ type: "text" as const, text: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2) }] };
}

function notConfigured() {
  return text(
    "Dotloop is not configured. Set DOTLOOP_ACCESS_TOKEN and DOTLOOP_PROFILE_ID " +
      "(AIRE Setting table or .env). Generate a Personal Access Token at " +
      "dotloop.com → Account → Integrations → API Access Tokens.",
  );
}

// ── list_loops ────────────────────────────────────────────────────────────────
server.registerTool(
  "list_loops",
  {
    title: "List dotloop loops",
    description: "List all loops on the configured dotloop profile (id, name, status, address, dates).",
    inputSchema: {},
  },
  async () => {
    const config = await getDotloopConfig();
    if (!config) return notConfigured();
    const loops = await fetchAllLoops(config);
    return text(
      loops.map((l) => ({
        id: l.id,
        name: l.name,
        status: l.status,
        loopType: l.loopType,
        address: l.streetAddress ?? [l.streetNumber, l.streetName].filter(Boolean).join(" "),
        city: l.city,
        state: l.state,
        closingDate: l.closingDate ?? l.expectedClosingDate,
      })),
    );
  },
);

// ── get_loop_documents ──────────────────────────────────────────────────────
server.registerTool(
  "get_loop_documents",
  {
    title: "Get loop documents",
    description: "List every document in a loop with its folder, signed status, and ids.",
    inputSchema: { loopId: z.string().describe("Dotloop loop id (numeric, as string).") },
  },
  async ({ loopId }) => {
    const docs = await getLoopDocuments(loopId);
    if (docs === null) return notConfigured();
    return text(docs);
  },
);

// ── get_loop_compliance_status ──────────────────────────────────────────────
server.registerTool(
  "get_loop_compliance_status",
  {
    title: "Get loop compliance status",
    description:
      "Reconcile a loop against the required-doc template for its side. Returns filed / missing / unexecuted (matched but unsigned — fails the both-signature gate) / optionalMissing.",
    inputSchema: {
      loopId: z.string().describe("Dotloop loop id."),
      side: z.enum(["LISTING", "PURCHASE"]).describe("Transaction side — LISTING (seller) or PURCHASE (buyer)."),
    },
  },
  async ({ loopId, side }) => {
    const status = await getLoopComplianceStatus(loopId, side);
    if (status === null) return notConfigured();
    return text(status);
  },
);

// ── upload_document ─────────────────────────────────────────────────────────
server.registerTool(
  "upload_document",
  {
    title: "Upload document to a loop folder",
    description:
      "Upload a base64-encoded PDF into a loop folder. Get folderId from get_loop_documents. " +
      "From chat: download the staged PDF from Google Drive (download_file_content) and pass its base64 here.",
    inputSchema: {
      loopId: z.string().describe("Dotloop loop id."),
      folderId: z.string().describe("Target folder id within the loop."),
      base64Content: z.string().describe("Base64-encoded PDF bytes."),
      name: z.string().describe("Document name (e.g. '13902 Ouachita Ave - Executed Act of Sale')."),
    },
  },
  async ({ loopId, folderId, base64Content, name }) => {
    const config = await getDotloopConfig();
    if (!config) return notConfigured();
    const bytes = new Uint8Array(Buffer.from(base64Content, "base64"));
    const result = await uploadDocument(loopId, folderId, bytes, name);
    return text({ uploaded: true, ...result });
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // eslint-disable-next-line no-console
  console.error("[aire-dotloop] MCP server ready on stdio.");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[aire-dotloop] fatal:", err);
  process.exit(1);
});
