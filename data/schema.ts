import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  real,
  unique,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";

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
  id: text("id").primaryKey(), // Stripe subscription ID
  userId: text("userId")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripeCustomerId").notNull(),
  planId: text("planId").notNull().default("pro"), // 'pro' only for now
  status: text("status").notNull(), // 'active' | 'trialing' | 'past_due' | 'canceled'
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
  /** URL-friendly handle, unique across all users. Used in routes like /repos/{username}/{slug}. */
  username: text("username").unique(),
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
 * githubOwner/githubRepository identify the external source-of-truth repository.
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
    slug: text("slug").notNull(), // URL-friendly id, unique per user
    description: text("description"),
    githubOwner: text("githubOwner"),
    githubRepository: text("githubRepository"),
    r2Prefix: text("r2Prefix"), // repos/{id}/
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    index("repo_user_created").on(t.userId, t.createdAt),
    unique("repo_user_slug").on(t.userId, t.slug),
  ],
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

// ---- Knowledge base tables removed (PR: nuke knowledge base) ----

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
  scoreCount: integer("scoreCount").notNull().default(0), // total score calls
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

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
    suiteRunId: text("suiteRunId").notNull(), // groups all rows from one script invocation
    benchmarkName: text("benchmarkName").notNull(), // e.g. "OODGeneralization"
    target: text("target").notNull(), // "gpt-4o-mini" | "gpt-4o" | "piro-student"
    score: real("score").notNull(), // 0.0 → 1.0
    costUsd: real("costUsd"), // total API cost for this benchmark × target
    durationMs: integer("durationMs"),
    metadata: text("metadata"), // JSON blob from BenchmarkResult.metadata
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
    id: text("id").primaryKey(), // same value as suiteRunId on benchmark_run
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("queued"), // 'queued' | 'complete' | 'error'
    benchmarks: text("benchmarks"), // JSON string[] | null = all
    targets: text("targets"), // JSON string[] | null = all
    queuedAt: timestamp("queuedAt").notNull().defaultNow(),
    completedAt: timestamp("completedAt"),
    error: text("error"),
  },
  (t) => [index("bsr_user_queued").on(t.userId, t.queuedAt)],
);

/**
 * A generated dataset — the output of running a source script from the
 * connected GitHub repo.
 *
 * The source script lives at `sourcePath` in the repo (convention:
 * `sources/<name>/main.py`). When the user triggers generation, the platform
 * runs the script and stores the output in R2 under `r2Prefix`.
 *
 * This is one of Piro's platform advantages over a plain GitHub repo:
 * we manage dataset generation and storage for you.
 */
export const dataset = pgTable(
  "dataset",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    repositoryId: text("repositoryId")
      .notNull()
      .references(() => repository.id, { onDelete: "cascade" }),
    /** Display name — derived from the source directory (e.g. "associative-recall"). */
    name: text("name").notNull(),
    /** Path in the repo to the source script (e.g. "sources/associative-recall/main.py"). */
    sourcePath: text("sourcePath").notNull(),
    /** R2 prefix for generated data (e.g. "repos/{repoId}/datasets/{name}/"). */
    r2Prefix: text("r2Prefix").notNull(),
    sampleCount: integer("sampleCount"),
    generatedAt: timestamp("generatedAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => [index("ds_repo_created").on(t.repositoryId, t.createdAt)],
);

/**
 * One invocation of a source script. A source can have many runs, while each
 * run points at the dataset row that receives its generated output.
 */
export const generationRun = pgTable(
  "generation_run",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    repositoryId: text("repositoryId")
      .notNull()
      .references(() => repository.id, { onDelete: "cascade" }),
    datasetId: text("datasetId").references(() => dataset.id, {
      onDelete: "set null",
    }),
    sourceName: text("sourceName").notNull(),
    sourcePath: text("sourcePath").notNull(),
    /** 'queued' | 'running' | 'complete' | 'error'. */
    status: text("status").notNull().default("queued"),
    costUsd: real("costUsd"),
    error: text("error"),
    queuedAt: timestamp("queuedAt").notNull().defaultNow(),
    startedAt: timestamp("startedAt"),
    completedAt: timestamp("completedAt"),
  },
  (t) => [
    index("gr_repo_source_queued").on(t.repositoryId, t.sourcePath, t.queuedAt),
    index("gr_user_queued").on(t.userId, t.queuedAt),
  ],
);

/**
 * A training run: one invocation against an architecture + dataset.
 * The architecture code lives in the repo (e.g. "architectures/ctm").
 * The dataset is a generated artifact tracked in the `dataset` table.
 */
export const trainingRun = pgTable(
  "training_run",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    repositoryId: text("repositoryId"),
    modelName: text("modelName"),
    /** Path in the repo to the architecture (e.g. "architectures/ctm"). */
    architecturePath: text("architecturePath").notNull(),
    /** FK → dataset.id (which generated dataset to train on). */
    datasetId: text("datasetId").references(() => dataset.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("queued"),
    maxSteps: integer("maxSteps").notNull().default(5000),
    configJson: text("configJson"),
    finalTrainLoss: real("finalTrainLoss"),
    finalValLoss: real("finalValLoss"),
    finalValAccuracy: real("finalValAccuracy"),
    stepHistoryJson: text("stepHistoryJson"),
    /** Last optimizer step included in the latest durable R2 checkpoint. */
    currentStep: integer("currentStep"),
    /** JSON snapshot of live work inside the current checkpoint interval. */
    progressJson: text("progressJson"),
    error: text("error"),
    /** Last worker heartbeat; used to reconcile platform-level terminations. */
    heartbeatAt: timestamp("heartbeatAt"),
    /** Application deadline before Modal's hard execution timeout. */
    timeoutAt: timestamp("timeoutAt"),
    /** Wall-clock execution time from worker start, in milliseconds. */
    runtimeMs: integer("runtimeMs"),
    /** Estimated Modal compute cost based on declared resources and runtime. */
    costUsd: real("costUsd"),
    /** Cost provenance, e.g. "modal_standard_estimate" until provider billing is imported. */
    costBasis: text("costBasis"),
    resourceType: text("resourceType"),
    gpuType: text("gpuType"),
    cpuCores: real("cpuCores"),
    memoryMb: integer("memoryMb"),
    /** R2 object key for the latest resumable optimizer checkpoint. */
    checkpointR2Key: text("checkpointR2Key"),
    checkpointStep: integer("checkpointStep"),
    checkpointAt: timestamp("checkpointAt"),
    queuedAt: timestamp("queuedAt").notNull().defaultNow(),
    startedAt: timestamp("startedAt"),
    completedAt: timestamp("completedAt"),
  },
  (t) => [index("tr_user_queued").on(t.userId, t.queuedAt)],
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
  (t) => [index("m_user_created").on(t.userId, t.createdAt)],
);

/**
 * A physical inference worker. Nodes are registered by the future runtime
 * control plane and considered online while their heartbeat is fresh.
 */
export const inferenceNode = pgTable(
  "inference_node",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    gpuType: text("gpuType").notNull(),
    lastHeartbeatAt: timestamp("lastHeartbeatAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => [
    index("inference_node_gpu_heartbeat").on(t.gpuType, t.lastHeartbeatAt),
  ],
);

/**
 * A hosted model deployment. Deployments are the user-visible stateful
 * inference targets; the model row holds the underlying model metadata.
 *
 * isAdmin marks a deployment as part of the shared/global Piro fleet.
 * enabled controls whether the deployment is available in the model picker.
 */
export const deployment = pgTable(
  "deployment",
  {
    id: text("id").primaryKey(),
    modelId: text("modelId")
      .notNull()
      .references(() => model.id, { onDelete: "cascade" }),
    createdByUserId: text("createdByUserId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    isAdmin: boolean("isAdmin").notNull().default(false),
    enabled: boolean("enabled").notNull().default(true),
    nodeId: text("nodeId").references(() => inferenceNode.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    index("deployment_creator_enabled").on(t.createdByUserId, t.enabled),
    index("deployment_admin_enabled").on(t.isAdmin, t.enabled),
    index("deployment_node").on(t.nodeId),
  ],
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
  provider: text("provider").notNull(), // 'openai' | 'anthropic'
  apiModelName: text("apiModelName").notNull(), // 'gpt-4o-mini' | 'gpt-4o'
  apiKeyEnvVar: text("apiKeyEnvVar").notNull(), // 'OPENAI_API_KEY'
});

// fileIndex table removed (was part of knowledge base)
