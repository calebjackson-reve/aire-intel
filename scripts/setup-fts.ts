import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString: url });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Adding tsvector column...");
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "MemoryIndex" ADD COLUMN IF NOT EXISTS search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', COALESCE("rawText", ''))) STORED`
  );
  console.log("Creating GIN index...");
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS idx_memory_search_vector ON "MemoryIndex" USING GIN (search_vector)`
  );
  const count = await prisma.memoryIndex.count();
  console.log(`Done. MemoryIndex rows: ${count}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
