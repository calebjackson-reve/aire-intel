-- Run this ONCE in Neon console after running: npx prisma migrate dev --name add_memory_index
-- Adds the computed tsvector column and GIN index for full-text search.
-- PostgreSQL 12+ required (Neon is 16+).

-- Add the tsvector column (computed from rawText, stored on disk)
ALTER TABLE "MemoryIndex"
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', COALESCE("rawText", ''))
  ) STORED;

-- GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_memory_index_search_vector
  ON "MemoryIndex" USING GIN (search_vector);

-- Index on sourceType for fast per-type queries
CREATE INDEX IF NOT EXISTS idx_memory_index_source_type
  ON "MemoryIndex" ("sourceType");
