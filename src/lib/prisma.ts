import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

/**
 * Dual-mode Prisma client.
 *
 * - Local dev:  DATABASE_URL = "file:./prisma/dev.db"  -> SQLite (better-sqlite3 adapter)
 * - Production: DATABASE_URL = "postgresql://..."      -> Postgres (pg adapter)
 *
 * The driver is chosen at runtime from the connection-string scheme, so the same
 * codebase runs on SQLite locally and Postgres in production with no code change.
 * (When deploying, also flip the datasource `provider` in prisma/schema.prisma to
 * "postgresql" and run a fresh `prisma migrate` — see DEPLOYMENT.md.)
 */
function createPrismaClient() {
  const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";

  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    // Production: Postgres via driver adapter
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaPg } = require("@prisma/adapter-pg");
    const adapter = new PrismaPg({ connectionString: url });
    return new PrismaClient({ adapter, log: ["error"] });
  }

  // Local dev: SQLite via better-sqlite3 adapter
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3");
  const db = new Database(url.replace("file:", ""));
  const adapter = new PrismaBetterSqlite3({ url: db.name as `${string}` | ":memory:" });
  return new PrismaClient({ adapter, log: ["error"] });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
