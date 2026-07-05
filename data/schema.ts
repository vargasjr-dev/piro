import { pgTable, text, timestamp, boolean, integer, bigint, real, unique, index, pgEnum } from "drizzle-orm/pg-core";

// ── Billing ──────────────────────────────────────────────────────────────────

/**
 * One row per user — tracks their Stripe subscription state.
 * Created when a checkout session completes; updated on renewals/cancellations.
 *
 * planId:  'pro' (the only plan for now — $100/mo)
 * status:  mirrors Stripe subscription status ('active' | 'canceled' | 'past_due' | 'trialing')
 * trainingRunsUsed: how many training runs the user has kicked off in the current billing period.
 *   Reset to 0 when currentPeriodEnd ticks over.
 */
export const subscription = pgTable("subscription", {
  id: text("id").primaryKey(),                    // Stripe subscription ID
  userId: text("userId")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripeCustomerId").notNull(),
  planId: text("planId").notNull().default("pro"), // 'pro' only for now
  status: text("status").notNull(),                // 'active' | 'trialing' | 'past_due' | 'canceled'
  trainingRunsUsed: integer("trainingRunsUsed").notNull().default(0),
  trainingRunsLimit: integer("trainingRunsLimit").notNull().default(2),
  currentPeriodStart: timestamp("currentPeriodStart").notNull(),
  currentPeriodEnd: timestamp("currentPeriodEnd").notNull(),
  cancelAtPeriodEnd: boolean("cancelAtPeriodEnd").notNull().default(false),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});
// Note: boolean kept for the user/session/account tables above

// better-auth required tables
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  /** "user" (default) | "admin" — admins use Stripe test mode for billing flows. */
  role: text("role").notNull().default("user"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

/**
 * A repository — the root unit of model development in Piro.
 *
 * Like a GitHub repo, a Piro repo is a self-contained workspace that holds
 * all the components of a research line: data sources, architectures,
 * benchmarks, training configs, runs, and models. Everything co-evolves
 * within a repo and is version-controlled together.
 *
 * R2 prefix: repos/{id}/
 *   repos/{id}/data/{sourceId}/script.py
 *   repos/{id}/architectures/{classId}/model.py
 *   repos/{id}/benchmarks/{benchmarkId}/script.py
 *   repos/{id}/training/
 *   repos/{id}/runs/
 *   repos/{id}/models/
 */
export const repository = pgTable(
  "repository",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),             // URL-friendly id, unique per user
    description: text("description"),
    r2Prefix: text("r2Prefix"),               // repos/{id}/
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    index("repo_user_created").on(t.userId, t.createdAt),
    unique("repo_user_slug").on(t.userId, t.slug),
  ]
);

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
    costUsd: real("costUsd"),                   // total API cost for this benchmark × target
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
 * One row per benchmark run initiated from the UI.
 * Created when the user dispatches a run; updated to 'complete' or 'error'
 * when results arrive (or a timeout is detected).
 * The suiteRunId here matches suiteRunId on benchmark_run rows.
 */
export const benchmarkSuiteRun = pgTable(
  "benchmark_suite_run",
  {
    id: text("id").primaryKey(),              // same value as suiteRunId on benchmark_run
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("queued"), // 'queued' | 'complete' | 'error'
    benchmarks: text("benchmarks"),           // JSON string[] | null = all
    targets: text("targets"),                 // JSON string[] | null = all
    queuedAt: timestamp("queuedAt").notNull().defaultNow(),
    completedAt: timestamp("completedAt"),
    error: text("error"),
  },
  (t) => [
    index("bsr_user_queued").on(t.userId, t.queuedAt),
  ],
);

/**
 * A data source for training — either synthetic (generated by code) or
 * uploaded (stored as files in R2 under r2Prefix).
 */
export const dataSource = pgTable(
  "data_source",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    repositoryId: text("repositoryId"),      // FK → repository.id (nullable for legacy rows)
    name: text("name").notNull(),
    description: text("description"),
    type: text("type").notNull().default("synthetic"), // 'synthetic' | 'uploaded'
    r2Prefix: text("r2Prefix"),     // R2 prefix for all source files: sources/{id}/
    scriptR2Key: text("scriptR2Key"), // R2 key of the generation script: sources/{id}/script.py
    sampleCount: integer("sampleCount"),
    generatedAt: timestamp("generatedAt"), // last time data was generated + uploaded
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(), // last time the source metadata was edited
  },
  (t) => [
    index("ds_user_created").on(t.userId, t.createdAt),
  ]
);

/**
 * A benchmark definition — an evaluation protocol that trains models on a
 * data source and measures performance across held-out conditions.
 *
 * The benchmark's Python script (scriptR2Key) defines the eval logic:
 * how to generate test samples, how to score predictions, what metrics to
 * report. The dataSourceId links it to the training data.
 *
 * `slug` is a URL-friendly identifier used in routes and the CLI.
 * `configJson` stores eval-facing config (test lengths, sample counts, metrics).
 */
export const benchmark = pgTable(
  "benchmark",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    repositoryId: text("repositoryId"),      // FK → repository.id (nullable for legacy rows)
    name: text("name").notNull(),             // display name, e.g. "Length Generalization"
    slug: text("slug").notNull(),             // URL-friendly id, e.g. "length-generalization"
    description: text("description"),
    dataSourceId: text("dataSourceId"),       // FK → data_source.id (which data source this benchmark evaluates)
    r2Prefix: text("r2Prefix"),               // R2 prefix: benchmarks/{slug}/
    scriptR2Key: text("scriptR2Key"),         // R2 key of the eval script: benchmarks/{slug}/script.py
    configJson: text("configJson"),           // JSON of eval config (test lengths, samples per length, metrics)
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    index("bm_user_created").on(t.userId, t.createdAt),
    unique("bm_user_slug").on(t.userId, t.slug),
  ]
);

/**
 * A model class (architecture template) the user can train instances of.
 * The two built-in classes (CTM, Baseline Transformer) are lazy-seeded on
 * first visit to /classes. Future user-defined classes will live here too.
 *
 * `slug` maps to the `modelTemplate` string consumed by modal_app.py
 * (e.g. "ctm" | "baseline-transformer").
 * `configJson` stores the default hyperparams shown on the class card.
 */
export const modelClass = pgTable(
  "model_class",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    repositoryId: text("repositoryId"),      // FK → repository.id (nullable for legacy rows)
    name: text("name").notNull(),
    slug: text("slug").notNull(),             // maps to modal_app.py modelTemplate key
    description: text("description"),
    parameterCount: integer("parameterCount"),
    configJson: text("configJson"),           // JSON of default hyperparams for display (legacy — manifest.json in R2 is source of truth when moduleR2Key is set)
    /**
     * R2 key prefix for the Python module that defines this class.
     * Two objects live under this prefix:
     *   {moduleR2Key}/model.py       — the Python source (contains serialize())
     *   {moduleR2Key}/manifest.json  — pre-generated output of serialize()
     * Null = legacy row with no uploaded module (falls back to configJson).
     */
    moduleR2Key: text("moduleR2Key"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => [
    index("mc_user_created").on(t.userId, t.createdAt),
    unique("mc_user_slug").on(t.userId, t.slug),
  ]
);

/**
 * A training run: one invocation of model/trainer.py against a model template + data source.
 * Created from the UI; execution is delegated to the Python environment.
 */
export const trainingRun = pgTable(
  "training_run",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    repositoryId: text("repositoryId"),      // FK → repository.id (nullable for legacy rows)
    modelName: text("modelName"),                    // user-specified label for the resulting model
    modelTemplate: text("modelTemplate").notNull(), // 'ctm' | 'baseline-transformer'
    dataSource: text("dataSource").notNull(),        // 'sorting-sequences'
    status: text("status").notNull().default("queued"), // 'queued' | 'running' | 'complete' | 'error'
    epochs: integer("epochs").notNull().default(10),
    configJson: text("configJson"),                 // JSON snapshot of hyperparams used
    finalTrainLoss: real("finalTrainLoss"),
    finalValLoss: real("finalValLoss"),
    finalValAccuracy: real("finalValAccuracy"),
    epochHistoryJson: text("epochHistoryJson"), // JSON array of { epoch, trainLoss, valLoss, valAccuracy }
    currentEpoch: integer("currentEpoch"),      // updated after each epoch while running
    error: text("error"),
    queuedAt: timestamp("queuedAt").notNull().defaultNow(),
    startedAt: timestamp("startedAt"),          // when Modal container actually began training (after cold start)
    completedAt: timestamp("completedAt"),
  },
  (t) => [
    index("tr_user_queued").on(t.userId, t.queuedAt),
  ]
);

/**
 * A model — either a Piro-trained model or a hosted API model.
 * Discriminated by presence of a model_training_run or model_hosted_api row.
 */
export const model = pgTable(
  "model",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    parameterCount: integer("parameterCount"),
    /**
     * R2 key prefix for stored model weights. e.g. "models/{id}".
     * Two objects live under this prefix:
     *   {weightsR2Key}/weights.pt   — PyTorch state_dict (binary, for inference)
     *   {weightsR2Key}/weights.json — JSON tensor map (for visualization)
     * Null = weights not yet stored (model predates R2 storage or hasn't finished training).
     */
    weightsR2Key: text("weightsR2Key"),
    /** URL of the inference endpoint for this model (e.g. Modal /infer URL). Null = no inference available. */
    inferenceEndpoint: text("inferenceEndpoint"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    /**
     * Set when the model is archived. Archived models are hidden from the
     * active list but kept in DB so benchmark_run and training_run rows that
     * reference them remain intact.
     */
    archivedAt: timestamp("archivedAt"),
  },
  (t) => [
    index("m_user_created").on(t.userId, t.createdAt),
  ]
);

/**
 * 1:1 link between a model and the training run that produced it.
 * Presence of this row means the model is Piro-trained.
 */
// ── API Keys ──────────────────────────────────────────────────────────────────
// Keys are stored as SHA-256 hashes. The raw key is returned once at creation
// and never stored. Format: piro_<32 hex chars>  (e.g. piro_abc123...)
export const apiKey = pgTable(
  "api_key",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** SHA-256 hex digest of the raw key. Never expose this. */
    keyHash: text("keyHash").notNull(),
    /** First 12 chars of the raw key — safe to display for identification. */
    keyPrefix: text("keyPrefix").notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    lastUsedAt: timestamp("lastUsedAt"),
    revokedAt: timestamp("revokedAt"),
  },
  (t) => [unique("ak_hash").on(t.keyHash)],
);

export const modelTrainingRun = pgTable("model_training_run", {
  id: text("id").primaryKey(),
  modelId: text("modelId")
    .notNull()
    .unique()
    .references(() => model.id, { onDelete: "cascade" }),
  trainingRunId: text("trainingRunId")
    .notNull()
    .references(() => trainingRun.id, { onDelete: "cascade" }),
});

/**
 * 1:1 link between a model and its hosted API config.
 * Presence of this row means the model is a hosted external API.
 */
export const modelHostedApi = pgTable("model_hosted_api", {
  id: text("id").primaryKey(),
  modelId: text("modelId")
    .notNull()
    .unique()
    .references(() => model.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),        // 'openai' | 'anthropic'
  apiModelName: text("apiModelName").notNull(), // 'gpt-4o-mini' | 'gpt-4o'
  apiKeyEnvVar: text("apiKeyEnvVar").notNull(), // 'OPENAI_API_KEY'
});

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
