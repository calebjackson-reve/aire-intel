// AIRE: loop:test-coverage-ratchet
// Smoke tests: verify auth gates and Prisma connectivity.
// These run on every coverage-check.sh execution.

import { POST } from "@/app/api/agents/coverage-ratchet/route";

describe("CRON_SECRET auth gate", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = "smoke-test-secret";
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalSecret;
    }
  });

  it("rejects POST with no Authorization header → 401", async () => {
    const req = new Request("http://localhost/api/agents/coverage-ratchet", {
      method: "POST",
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("rejects POST with wrong token → 401", async () => {
    const req = new Request("http://localhost/api/agents/coverage-ratchet", {
      method: "POST",
      headers: { authorization: "Bearer wrong-token" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});

describe("Prisma sanity", () => {
  it("executes SELECT 1 against the local database", async () => {
    const { prisma } = await import("@/lib/prisma");
    const result = await prisma.$queryRaw`SELECT 1 as val`;
    expect(result).toBeTruthy();
    expect(Array.isArray(result)).toBe(true);
  });
});
