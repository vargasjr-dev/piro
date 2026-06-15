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

// ── benchmark_run: drop threshold/passed, add costUsd ────────────────────────
await sql`ALTER TABLE benchmark_run DROP COLUMN IF EXISTS threshold`;
await sql`ALTER TABLE benchmark_run DROP COLUMN IF EXISTS passed`;
await sql`ALTER TABLE benchmark_run ADD COLUMN IF NOT EXISTS "costUsd" REAL`;
console.log("✓ benchmark_run schema: dropped threshold/passed, added costUsd");

// ── training_run table ────────────────────────────────────────────────────────
await sql`
  CREATE TABLE IF NOT EXISTS training_run (
    id                  TEXT        PRIMARY KEY,
    "userId"            TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    "modelTemplate"     TEXT        NOT NULL,
    "dataSource"        TEXT        NOT NULL,
    status              TEXT        NOT NULL DEFAULT 'queued',
    epochs              INTEGER     NOT NULL DEFAULT 10,
    "configJson"        TEXT,
    "finalTrainLoss"    REAL,
    "finalValLoss"      REAL,
    "finalValAccuracy"  REAL,
    error               TEXT,
    "queuedAt"          TIMESTAMP   NOT NULL DEFAULT NOW(),
    "completedAt"       TIMESTAMP
  )
`;
await sql`CREATE INDEX IF NOT EXISTS tr_user_queued ON training_run ("userId", "queuedAt" DESC)`;
console.log("✓ training_run table");

// ── model table ───────────────────────────────────────────────────────────────
await sql`
  CREATE TABLE IF NOT EXISTS model (
    id                TEXT        PRIMARY KEY,
    "userId"          TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    name              TEXT        NOT NULL,
    description       TEXT,
    "parameterCount"  INTEGER,
    "createdAt"       TIMESTAMP   NOT NULL DEFAULT NOW()
  )
`;
await sql`CREATE INDEX IF NOT EXISTS m_user_created ON model ("userId", "createdAt" DESC)`;
console.log("✓ model table");

// ── model_training_run table ──────────────────────────────────────────────────
await sql`
  CREATE TABLE IF NOT EXISTS model_training_run (
    id              TEXT  PRIMARY KEY,
    "modelId"       TEXT  NOT NULL UNIQUE REFERENCES model(id) ON DELETE CASCADE,
    "trainingRunId" TEXT  NOT NULL REFERENCES training_run(id) ON DELETE CASCADE
  )
`;
console.log("✓ model_training_run table");

// ── model_hosted_api table ────────────────────────────────────────────────────
await sql`
  CREATE TABLE IF NOT EXISTS model_hosted_api (
    id              TEXT  PRIMARY KEY,
    "modelId"       TEXT  NOT NULL UNIQUE REFERENCES model(id) ON DELETE CASCADE,
    provider        TEXT  NOT NULL,
    "apiModelName"  TEXT  NOT NULL,
    "apiKeyEnvVar"  TEXT  NOT NULL
  )
`;
console.log("✓ model_hosted_api table");

// ── seed hosted models for existing users ─────────────────────────────────────
// Model IDs match benchmark_run.target values so counts join correctly.
await sql`
  INSERT INTO model (id, "userId", name, description, "createdAt")
  SELECT 'gpt-4o-mini', id, 'GPT-4o Mini', 'OpenAI GPT-4o Mini — fast, cheap baseline', NOW()
  FROM "user"
  WHERE NOT EXISTS (SELECT 1 FROM model WHERE id = 'gpt-4o-mini')
  LIMIT 1
`;
await sql`
  INSERT INTO model_hosted_api (id, "modelId", provider, "apiModelName", "apiKeyEnvVar")
  VALUES ('gpt-4o-mini-api', 'gpt-4o-mini', 'openai', 'gpt-4o-mini', 'OPENAI_API_KEY')
  ON CONFLICT DO NOTHING
`;
console.log("✓ seeded model: gpt-4o-mini");

await sql`
  INSERT INTO model (id, "userId", name, description, "createdAt")
  SELECT 'gpt-4o', id, 'GPT-4o', 'OpenAI GPT-4o — strongest baseline', NOW()
  FROM "user"
  WHERE NOT EXISTS (SELECT 1 FROM model WHERE id = 'gpt-4o')
  LIMIT 1
`;
await sql`
  INSERT INTO model_hosted_api (id, "modelId", provider, "apiModelName", "apiKeyEnvVar")
  VALUES ('gpt-4o-api', 'gpt-4o', 'openai', 'gpt-4o', 'OPENAI_API_KEY')
  ON CONFLICT DO NOTHING
`;
console.log("✓ seeded model: gpt-4o");

console.log("Migrations complete ✓");
