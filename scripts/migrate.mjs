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

// ── benchmark_run table ───────────────────────────────────────────────────────
await sql`
  CREATE TABLE IF NOT EXISTS benchmark_run (
    id                TEXT        PRIMARY KEY,
    "userId"          TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    "suiteRunId"      TEXT        NOT NULL,
    "benchmarkName"   TEXT        NOT NULL,
    target            TEXT        NOT NULL,
    score             REAL        NOT NULL,
    threshold         REAL        NOT NULL,
    passed            BOOLEAN     NOT NULL,
    "durationMs"      INTEGER,
    metadata          TEXT,
    "ranAt"           TIMESTAMP   NOT NULL DEFAULT NOW(),
    "createdAt"       TIMESTAMP   NOT NULL DEFAULT NOW()
  )
`;
console.log("✓ benchmark_run table");

await sql`CREATE INDEX IF NOT EXISTS br_user_bench_ran ON benchmark_run ("userId", "benchmarkName", "ranAt" DESC)`;
await sql`CREATE INDEX IF NOT EXISTS br_suite ON benchmark_run ("suiteRunId")`;
console.log("✓ benchmark_run indexes");

// ── mentor table ─────────────────────────────────────────────────────────────
await sql`
  CREATE TABLE IF NOT EXISTS mentor (
    id              TEXT        PRIMARY KEY,
    "userId"        TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    name            TEXT        NOT NULL,
    description     TEXT,
    model           TEXT        NOT NULL DEFAULT 'claude-sonnet-4-5',
    "systemPrompt"  TEXT        NOT NULL,
    temperature     REAL        NOT NULL DEFAULT 0.2,
    "scoreCount"    INTEGER     NOT NULL DEFAULT 0,
    "createdAt"     TIMESTAMP   NOT NULL DEFAULT NOW(),
    "updatedAt"     TIMESTAMP   NOT NULL DEFAULT NOW()
  )
`;
console.log("✓ mentor table");

// ── sync_job table ────────────────────────────────────────────────────────────
await sql`
  CREATE TABLE IF NOT EXISTS sync_job (
    id              TEXT        PRIMARY KEY,
    "integrationId" TEXT        NOT NULL REFERENCES integration(id) ON DELETE CASCADE,
    "userId"        TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    status          TEXT        NOT NULL DEFAULT 'running',
    "startedAt"     TIMESTAMP   NOT NULL DEFAULT NOW(),
    "finishedAt"    TIMESTAMP,
    "durationMs"    INTEGER,
    "filesWritten"  INTEGER     NOT NULL DEFAULT 0,
    "bytesWritten"  BIGINT      NOT NULL DEFAULT 0,
    error           TEXT,
    "createdAt"     TIMESTAMP   NOT NULL DEFAULT NOW()
  )
`;
console.log("✓ sync_job table");

await sql`CREATE INDEX IF NOT EXISTS sj_integration_started ON sync_job ("integrationId", "startedAt" DESC)`;
console.log("✓ sync_job index");

// ── benchmark_suite_run table ─────────────────────────────────────────────────
await sql`
  CREATE TABLE IF NOT EXISTS benchmark_suite_run (
    id              TEXT        PRIMARY KEY,
    "userId"        TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    status          TEXT        NOT NULL DEFAULT 'queued',
    benchmarks      TEXT,
    targets         TEXT,
    "queuedAt"      TIMESTAMP   NOT NULL DEFAULT NOW(),
    "completedAt"   TIMESTAMP,
    error           TEXT
  )
`;
console.log("✓ benchmark_suite_run table");

await sql`CREATE INDEX IF NOT EXISTS bsr_user_queued ON benchmark_suite_run ("userId", "queuedAt" DESC)`;
console.log("✓ benchmark_suite_run index");

console.log("Migrations complete ✓");
