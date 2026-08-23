import { neon } from "@neondatabase/serverless";

const MODEL_ID = "bea4d410-42a6-4be9-83af-407f67bcb119";
const EXPECTED_ARCHITECTURE = "architectures/borealis/main.py";
const EXPECTED_OLD_PREFIX = "\nANSWER:";
const NEW_PREFIX = "";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const sql = neon(databaseUrl);
type ModelConfigRow = { model_id: string; architecture_path: string; config_json: string | null }
type ConfigRow = { config_json: string | null }

const before = (await sql`
  SELECT
    m.id AS model_id,
    tr."architecturePath" AS architecture_path,
    tr."configJson" AS config_json
  FROM model m
  JOIN model_training_run mtr ON mtr."modelId" = m.id
  JOIN training_run tr ON tr.id = mtr."trainingRunId"
  WHERE m.id = ${MODEL_ID}
`) as ModelConfigRow[];

if (before.length !== 1) {
  throw new Error(`expected exactly one target model row, found ${before.length}`);
}

const row = before[0]!;
if (row.architecture_path !== EXPECTED_ARCHITECTURE) {
  throw new Error(`unexpected architecture: ${row.architecture_path}`);
}
if (!row.config_json) throw new Error("target model has no configJson");

const config = JSON.parse(row.config_json) as Record<string, unknown>;
if (config.target_prefix !== EXPECTED_OLD_PREFIX) {
  throw new Error(
    `expected target_prefix ${JSON.stringify(EXPECTED_OLD_PREFIX)}, found ${JSON.stringify(config.target_prefix)}`,
  );
}
if (config.tokenizer_name !== "byte_bpe") {
  throw new Error(`unexpected tokenizer: ${JSON.stringify(config.tokenizer_name)}`);
}

console.log(JSON.stringify({ modelId: MODEL_ID, architecturePath: row.architecture_path, before: config }));

const nextConfig = { ...config, target_prefix: NEW_PREFIX };
const [updated, after] = await sql.transaction((tx) => [
  tx`
    UPDATE training_run tr
    SET "configJson" = ${JSON.stringify(nextConfig)}
    FROM model_training_run mtr
    WHERE mtr."trainingRunId" = tr.id
      AND mtr."modelId" = ${MODEL_ID}
      AND tr."architecturePath" = ${EXPECTED_ARCHITECTURE}
      AND tr."configJson" = ${row.config_json}
    RETURNING tr.id
  `,
  tx`
    SELECT tr."configJson" AS config_json
    FROM model_training_run mtr
    JOIN training_run tr ON tr.id = mtr."trainingRunId"
    WHERE mtr."modelId" = ${MODEL_ID}
  `,
]);

const updatedRows = updated as { id: string }[];
const afterRows = after as ConfigRow[];

if (updatedRows.length !== 1) {
  throw new Error(`expected exactly one config row to update, updated ${updatedRows.length}`);
}
if (afterRows.length !== 1 || !afterRows[0]?.config_json) {
  throw new Error("could not verify migrated config");
}

const verified = JSON.parse(afterRows[0].config_json) as Record<string, unknown>;
if (verified.target_prefix !== NEW_PREFIX) {
  throw new Error(`verification failed: target_prefix is ${JSON.stringify(verified.target_prefix)}`);
}
console.log(JSON.stringify({ modelId: MODEL_ID, after: verified }));
