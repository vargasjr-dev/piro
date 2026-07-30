import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;
const GLOBAL_MODEL_ID = "b675fccf-1a4a-4b91-8f92-d1453abdff55";
const LEGACY_ARCHITECTURE_PATH = "architectures/ashfall/ctm.py";
const CANONICAL_ARCHITECTURE_PATH = "architectures/ashfall/main.py";

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL must be configured");
}

const sql = neon(DATABASE_URL);

type TargetRow = {
  model_id: string;
  model_name: string;
  deployment_id: string;
  training_run_id: string;
  architecture_path: string;
};

type UpdatedRow = {
  training_run_id: string;
  architecture_path: string;
};

function assertExactlyOne<T>(rows: T[], description: string): T {
  if (rows.length !== 1) {
    throw new Error(
      `Expected exactly one ${description}; found ${rows.length}`,
    );
  }
  return rows[0];
}

function logTarget(label: string, target: TargetRow) {
  console.log(
    JSON.stringify({
      label,
      modelId: target.model_id,
      modelName: target.model_name,
      deploymentId: target.deployment_id,
      trainingRunId: target.training_run_id,
      architecturePath: target.architecture_path,
    }),
  );
}

console.log(`Inspecting global Ashfall model ${GLOBAL_MODEL_ID}`);

const beforeRows = await sql<TargetRow[]>`
  SELECT
    m.id AS model_id,
    m.name AS model_name,
    d.id AS deployment_id,
    mtr."trainingRunId" AS training_run_id,
    tr."architecturePath" AS architecture_path
  FROM model AS m
  INNER JOIN deployment AS d
    ON d."modelId" = m.id
  INNER JOIN model_training_run AS mtr
    ON mtr."modelId" = m.id
  INNER JOIN training_run AS tr
    ON tr.id = mtr."trainingRunId"
  WHERE m.id = ${GLOBAL_MODEL_ID}
    AND d."isAdmin" = true
    AND d.enabled = true
    AND d."targetUserId" IS NULL
`;

const before = assertExactlyOne(beforeRows, "active global Ashfall target");
logTarget("before", before);

if (before.architecture_path !== LEGACY_ARCHITECTURE_PATH) {
  throw new Error(
    `Refusing to update: expected ${LEGACY_ARCHITECTURE_PATH}, found ${before.architecture_path}`,
  );
}

const [updatedRows, afterRows] = await sql.transaction(
  (tx) => [
    tx<UpdatedRow[]>`
      WITH candidates AS (
        SELECT
          tr.id AS training_run_id,
          tr."architecturePath" AS architecture_path
        FROM model AS m
        INNER JOIN deployment AS d
          ON d."modelId" = m.id
        INNER JOIN model_training_run AS mtr
          ON mtr."modelId" = m.id
        INNER JOIN training_run AS tr
          ON tr.id = mtr."trainingRunId"
        WHERE m.id = ${GLOBAL_MODEL_ID}
          AND d.id = ${before.deployment_id}
          AND d."isAdmin" = true
          AND d.enabled = true
          AND d."targetUserId" IS NULL
          AND mtr."trainingRunId" = ${before.training_run_id}
      ),
      eligible AS (
        SELECT training_run_id
        FROM candidates
        WHERE (SELECT count(*) FROM candidates) = 1
          AND architecture_path = ${LEGACY_ARCHITECTURE_PATH}
      )
      UPDATE training_run AS tr
      SET "architecturePath" = ${CANONICAL_ARCHITECTURE_PATH}
      FROM eligible
      WHERE tr.id = eligible.training_run_id
        AND tr."architecturePath" = ${LEGACY_ARCHITECTURE_PATH}
      RETURNING
        tr.id AS training_run_id,
        tr."architecturePath" AS architecture_path
    `,
    tx<TargetRow[]>`
      SELECT
        m.id AS model_id,
        m.name AS model_name,
        d.id AS deployment_id,
        mtr."trainingRunId" AS training_run_id,
        tr."architecturePath" AS architecture_path
      FROM model AS m
      INNER JOIN deployment AS d
        ON d."modelId" = m.id
      INNER JOIN model_training_run AS mtr
        ON mtr."modelId" = m.id
      INNER JOIN training_run AS tr
        ON tr.id = mtr."trainingRunId"
      WHERE m.id = ${GLOBAL_MODEL_ID}
        AND d."isAdmin" = true
        AND d.enabled = true
        AND d."targetUserId" IS NULL
        AND tr."architecturePath" = ${CANONICAL_ARCHITECTURE_PATH}
    `,
  ],
  { isolationLevel: "Serializable" },
);

const updated = assertExactlyOne(
  updatedRows,
  "updated global Ashfall training run",
);
if (updated.training_run_id !== before.training_run_id) {
  throw new Error(
    "Update targeted a different training run than the inspection",
  );
}
if (updated.architecture_path !== CANONICAL_ARCHITECTURE_PATH) {
  throw new Error(
    `Update returned an unexpected path: ${updated.architecture_path}`,
  );
}

const after = assertExactlyOne(afterRows, "verified global Ashfall target");
logTarget("after", after);

if (after.training_run_id !== before.training_run_id) {
  throw new Error("Verification failed: the linked training run changed");
}
if (after.architecture_path !== CANONICAL_ARCHITECTURE_PATH) {
  throw new Error(
    `Verification failed: expected ${CANONICAL_ARCHITECTURE_PATH}, found ${after.architecture_path}`,
  );
}

console.log(
  JSON.stringify({
    modelId: after.model_id,
    trainingRunId: after.training_run_id,
    architecturePath: after.architecture_path,
    status: "verified",
  }),
);
