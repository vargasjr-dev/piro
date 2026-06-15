import { pgTable, text, timestamp, boolean, integer, bigint, real, unique, index } from "drizzle-orm/pg-core";

// better-auth required tables
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
});

// ---- Knowledge base ----

export const integration = pgTable("integration", {
  id: text("id").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // 'github' | 'gmail' | 'telegram'
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  expiresAt: timestamp("expiresAt"),
  providerUserId: text("providerUserId"),
  providerUsername: text("providerUsername"),
  status: text("status").notNull().default("active"), // 'active' | 'syncing' | 'error'
  syncMeta: text("syncMeta"), // JSON: { step, current?, done, total } — live progress during sync
  lastSyncAt: timestamp("lastSyncAt"),
  itemCount: integer("itemCount").notNull().default(0),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

/**
 * A mentor is an LLM agent configured to score student model responses (0.0→1.0).
 * The system prompt encodes the evaluation rubric — what "good" looks like for this user.
 * During RL training, N student responses are sent to the mentor; scores become GRPO rewards.
 */
export const mentor = pgTable("mentor", {
  id: text("id").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  model: text("model").notNull().default("claude-sonnet-4-5"),
  systemPrompt: text("systemPrompt").notNull(),
  temperature: real("temperature").notNull().default(0.2),
  scoreCount: integer("scoreCount").notNull().default(0),  // total score calls
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

/**
 * One row per sync job — append-only history.
 * Created at sync start, updated on completion or error.
 */
export const syncJob = pgTable(
  "sync_job",
  {
    id: text("id").primaryKey(),
    integrationId: text("integrationId")
      .notNull()
      .references(() => integration.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("running"), // 'running' | 'complete' | 'error'
    startedAt: timestamp("startedAt").notNull().defaultNow(),
    finishedAt: timestamp("finishedAt"),
    durationMs: integer("durationMs"),           // wall-clock ms from start to finish
    filesWritten: integer("filesWritten").notNull().default(0),
    bytesWritten: bigint("bytesWritten", { mode: "number" }).notNull().default(0), // sum of content byte lengths written to R2
    error: text("error"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => [
    index("sj_integration_started").on(t.integrationId, t.startedAt),
  ]
);

/**
 * One row per (benchmark × target) result from a run_benchmarks.py invocation.
 * Multiple rows with the same suiteRunId form one "suite run".
 * The Python script POSTs these via /api/benchmark-runs after finishing.
 */
export const benchmarkRun = pgTable(
  "benchmark_run",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    suiteRunId: text("suiteRunId").notNull(),   // groups all rows from one script invocation
    benchmarkName: text("benchmarkName").notNull(), // e.g. "OODGeneralization"
    target: text("target").notNull(),           // "gpt-4o-mini" | "gpt-4o" | "piro-student"
    score: real("score").notNull(),             // 0.0 → 1.0
    threshold: real("threshold").notNull(),
    passed: boolean("passed").notNull(),
    durationMs: integer("durationMs"),
    metadata: text("metadata"),                 // JSON blob from BenchmarkResult.metadata
    ranAt: timestamp("ranAt").notNull().defaultNow(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => [
    index("br_user_bench_ran").on(t.userId, t.benchmarkName, t.ranAt),
    index("br_suite").on(t.suiteRunId),
  ],
);

/**
 * Lightweight index of files stored in R2.
 * Content lives in R2 at `r2Key` — this table is metadata only,
 * used for "recent items" listings without hitting R2.
 */
export const fileIndex = pgTable(
  "file_index",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    integrationId: text("integrationId")
      .notNull()
      .references(() => integration.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // 'github' | 'gmail' | 'telegram'
    itemType: text("itemType").notNull(), // 'commit' | 'pr' | 'email' | 'message'
    r2Key: text("r2Key").notNull(),       // full R2 object key
    title: text("title").notNull(),       // human-readable one-liner for the UI
    itemCreatedAt: timestamp("itemCreatedAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => [
    unique("fi_r2key").on(t.r2Key),
    index("fi_user_created").on(t.userId, t.createdAt),
  ]
);
