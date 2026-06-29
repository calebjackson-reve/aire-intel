#!/usr/bin/env node
/**
 * One-time dotloop OAuth setup.
 *
 * dotloop v2 is OAuth 2.0 only (3-legged auth-code flow). After your app is
 * approved at info.dotloop.com/developers you'll have a client id + secret.
 * This script runs the consent flow locally and prints the REFRESH TOKEN to
 * paste into aire-platform/.env as DOTLOOP_REFRESH_TOKEN.
 *
 * Prereqs:
 *   1. Register the redirect URI below with your dotloop app:
 *        http://localhost:4477/callback
 *   2. export DOTLOOP_CLIENT_ID=...  DOTLOOP_CLIENT_SECRET=...
 *
 * Run:  node scripts/dotloop-auth.mjs
 */

import http from "node:http";
import { exec } from "node:child_process";

const CLIENT_ID = process.env.DOTLOOP_CLIENT_ID;
const CLIENT_SECRET = process.env.DOTLOOP_CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:4477/callback";
const AUTH_BASE = "https://auth.dotloop.com/oauth";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Set DOTLOOP_CLIENT_ID and DOTLOOP_CLIENT_SECRET first.");
  process.exit(1);
}

const authorizeUrl =
  `${AUTH_BASE}/authorize?response_type=code` +
  `&client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&scope=${encodeURIComponent("loop:read loop:write")}`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  if (!url.pathname.startsWith("/callback")) {
    res.writeHead(404).end();
    return;
  }
  const code = url.searchParams.get("code");
  if (!code) {
    res.writeHead(400).end("No code in callback.");
    return;
  }
  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
    });
    const tokenRes = await fetch(`${AUTH_BASE}/token`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const data = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(JSON.stringify(data));

    res.writeHead(200, { "Content-Type": "text/html" }).end(
      "<h2>dotloop connected ✅</h2><p>You can close this tab and return to the terminal.</p>",
    );
    console.log("\n✅ Success. Add these to aire-platform/.env:\n");
    console.log(`DOTLOOP_CLIENT_ID=${CLIENT_ID}`);
    console.log(`DOTLOOP_CLIENT_SECRET=${CLIENT_SECRET}`);
    console.log(`DOTLOOP_REFRESH_TOKEN=${data.refresh_token}`);
    console.log("\n(Access token auto-refreshes; profile id auto-resolves on first call.)\n");
  } catch (err) {
    res.writeHead(500).end("Token exchange failed: " + String(err));
    console.error("Token exchange failed:", err);
  } finally {
    setTimeout(() => server.close(() => process.exit(0)), 500);
  }
});

server.listen(4477, () => {
  console.log("Listening on", REDIRECT_URI);
  console.log("Opening dotloop consent screen…\n", authorizeUrl, "\n");
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  exec(`${opener} "${authorizeUrl}"`);
});
