#!/usr/bin/env node
/**
 * Direct SQL migration — runs against Neon via HTTP.
 * Used by GHA instead of drizzle-kit push (which hangs in non-TTY environments).
 *
 * Idempotent: all statements use IF NOT EXISTS / DO NOTHING patterns.
 */
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("ERROR: DATABASE_URL is not set");
  process.exit(1);
}

const sql = neon(url);

console.log("Running migrations...");

// ── integration: add syncMeta column ──────────────────────────────────────
await sql`ALTER TABLE integration ADD COLUMN IF NOT EXISTS "syncMeta" TEXT`;
console.log('✓ integration."syncMeta" column');

// ── file_index table ──────────────────────────────────────────────────────
await sql`
  CREATE TABLE IF NOT EXISTS file_index (
    id            TEXT        PRIMARY KEY,
    "userId"      TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    "integrationId" TEXT      NOT NULL REFERENCES integration(id) ON DELETE CASCADE,
    provider      TEXT        NOT NULL,
    "itemType"    TEXT        NOT NULL,
    "r2Key"       TEXT        NOT NULL,
    title         TEXT        NOT NULL,
    "itemCreatedAt" TIMESTAMP,
    "createdAt"   TIMESTAMP   NOT NULL DEFAULT NOW()
  )
`;
console.log("✓ file_index table");

await sql`CREATE UNIQUE INDEX IF NOT EXISTS fi_r2key ON file_index ("r2Key")`;
await sql`CREATE INDEX IF NOT EXISTS fi_user_created ON file_index ("userId", "createdAt")`;
console.log("✓ file_index indexes");

console.log("Migrations complete ✓");
