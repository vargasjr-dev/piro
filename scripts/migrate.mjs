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

// ── benchmark: add dataSourceId, r2Prefix, scriptR2Key, updatedAt ────────────
await sql`ALTER TABLE benchmark ADD COLUMN IF NOT EXISTS "dataSourceId" TEXT`;
await sql`ALTER TABLE benchmark ADD COLUMN IF NOT EXISTS "r2Prefix" TEXT`;
await sql`ALTER TABLE benchmark ADD COLUMN IF NOT EXISTS "scriptR2Key" TEXT`;
await sql`ALTER TABLE benchmark ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()`;
console.log("✓ benchmark: added dataSourceId, r2Prefix, scriptR2Key, updatedAt");

// ── data_source table ─────────────────────────────────────────────────────────
await sql`
  CREATE TABLE IF NOT EXISTS data_source (
    id              TEXT        PRIMARY KEY,
    "userId"        TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    name            TEXT        NOT NULL,
    description     TEXT,
    type            TEXT        NOT NULL DEFAULT 'synthetic',
    "r2Prefix"      TEXT,
    "sampleCount"   INTEGER,
    "createdAt"     TIMESTAMP   NOT NULL DEFAULT NOW()
  )
`;
await sql`CREATE INDEX IF NOT EXISTS ds_user_created ON data_source ("userId", "createdAt" DESC)`;
console.log("✓ data_source table");

// Seed sorting-sequences for existing users
await sql`
  INSERT INTO data_source (id, "userId", name, description, type, "sampleCount", "createdAt")
  SELECT 'sorting-sequences', id,
    'Sorting Sequences',
    'Synthetic argmin task: find the minimum element in a short integer sequence. 4-element sequences, 5 classes.',
    'synthetic', 5000, NOW()
  FROM "user"
  WHERE NOT EXISTS (SELECT 1 FROM data_source WHERE id = 'sorting-sequences')
  LIMIT 1
`;
console.log("✓ seeded data_source: sorting-sequences");

// Note: counter-sequences is intentionally NOT bulk-seeded. Each user creates
// their own data source via `piro sources push <id>` — keeping research data
// scoped to the owning account.

// ── data_source: add scriptR2Key and generatedAt columns ─────────────────────
await sql`ALTER TABLE data_source ADD COLUMN IF NOT EXISTS "scriptR2Key" TEXT`;
await sql`ALTER TABLE data_source ADD COLUMN IF NOT EXISTS "generatedAt" TIMESTAMP`;
console.log("✓ data_source: added scriptR2Key, generatedAt");

// ── data_source: add updatedAt column ─────────────────────────────────────────
await sql`ALTER TABLE data_source ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()`;
console.log("✓ data_source: added updatedAt");

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

// ── training_run: add epochHistoryJson column ─────────────────────────────────
await sql`ALTER TABLE training_run ADD COLUMN IF NOT EXISTS "epochHistoryJson" TEXT`;
console.log("✓ training_run: added epochHistoryJson");

// ── training_run: add currentEpoch column ────────────────────────────────────
await sql`ALTER TABLE training_run ADD COLUMN IF NOT EXISTS "currentEpoch" INTEGER`;
console.log("✓ training_run: added currentEpoch");

// ── training_run: add modelName column ───────────────────────────────────────
await sql`ALTER TABLE training_run ADD COLUMN IF NOT EXISTS "modelName" TEXT`;
console.log("✓ training_run: added modelName");

// ── training_run: add startedAt column ───────────────────────────────────────
await sql`ALTER TABLE training_run ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP`;
console.log("✓ training_run: added startedAt");

// ── training_run: fix stale queued runs (no worker exists pre-engine) ─────────
await sql`
  UPDATE training_run
  SET
    status = 'error',
    error  = 'Run predates the training execution engine and was never executed. Please create a new run.',
    "completedAt" = NOW()
  WHERE status = 'queued'
`;
console.log("✓ training_run: marked stale queued runs as error");

// ── training_run: fix orphaned running runs (Modal container died without cleanup) ──
await sql`
  UPDATE training_run
  SET
    status = 'error',
    error  = 'Training container was cancelled or timed out before completing. Please start a new run.',
    "completedAt" = NOW()
  WHERE status = 'running'
    AND "queuedAt" < NOW() - INTERVAL '30 minutes'
`;
console.log("✓ training_run: marked orphaned running runs as error");

// ── model: add weightsB64 column ──────────────────────────────────────────────
await sql`ALTER TABLE model ADD COLUMN IF NOT EXISTS "weightsB64" TEXT`;
console.log("✓ model: added weightsB64");

// ── model: add inferenceEndpoint column ───────────────────────────────────────
await sql`ALTER TABLE model ADD COLUMN IF NOT EXISTS "inferenceEndpoint" TEXT`;
console.log("✓ model: added inferenceEndpoint");

// ── benchmark table ───────────────────────────────────────────────────────────
await sql`
  CREATE TABLE IF NOT EXISTS "benchmark" (
    "id"          text PRIMARY KEY,
    "userId"      text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "name"        text NOT NULL,
    "slug"        text NOT NULL,
    "description" text,
    "configJson"  text,
    "createdAt"   timestamp NOT NULL DEFAULT now(),
    UNIQUE ("userId", "slug")
  )
`;
console.log("✓ benchmark: table ensured");

// ── model_class table ─────────────────────────────────────────────────────────
await sql`
  CREATE TABLE IF NOT EXISTS "model_class" (
    "id"             text PRIMARY KEY,
    "userId"         text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "name"           text NOT NULL,
    "slug"           text NOT NULL,
    "description"    text,
    "parameterCount" integer,
    "configJson"     text,
    "createdAt"      timestamp NOT NULL DEFAULT now(),
    UNIQUE ("userId", "slug")
  )
`;
console.log("✓ model_class: table ensured");

// ── model: add weightsR2Key, drop weightsB64 + weightsJson ───────────────────
await sql`ALTER TABLE model ADD COLUMN IF NOT EXISTS "weightsR2Key" TEXT`;
console.log("✓ model: added weightsR2Key");
await sql`ALTER TABLE model DROP COLUMN IF EXISTS "weightsB64"`;
console.log("✓ model: dropped weightsB64");
await sql`ALTER TABLE model DROP COLUMN IF EXISTS "weightsJson"`;
console.log("✓ model: dropped weightsJson");

// ── repository: the root unit of model development ────────────────────────────
await sql`
  CREATE TABLE IF NOT EXISTS repository (
    id           text PRIMARY KEY,
    "userId"     text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    name         text NOT NULL,
    slug         text NOT NULL,
    description  text,
    "r2Prefix"   text,
    "createdAt"  timestamp NOT NULL DEFAULT now(),
    "updatedAt"  timestamp NOT NULL DEFAULT now()
  )
`;
await sql`CREATE INDEX IF NOT EXISTS repo_user_created ON repository ("userId", "createdAt" DESC)`;
await sql`CREATE UNIQUE INDEX IF NOT EXISTS repo_user_slug ON repository ("userId", "slug")`;
console.log("✓ repository table");

// ── Add repositoryId to component tables (nullable for legacy rows) ───────────
await sql`ALTER TABLE data_source ADD COLUMN IF NOT EXISTS "repositoryId" TEXT`;
await sql`ALTER TABLE benchmark ADD COLUMN IF NOT EXISTS "repositoryId" TEXT`;
await sql`ALTER TABLE model_class ADD COLUMN IF NOT EXISTS "repositoryId" TEXT`;
await sql`ALTER TABLE training_run ADD COLUMN IF NOT EXISTS "repositoryId" TEXT`;
console.log("✓ added repositoryId to data_source, benchmark, model_class, training_run");

console.log("Migrations complete ✓");
