import { neon } from "@neondatabase/serverless";

const modelName = "borealis-color-memory-v1";
const staleEndpoint = "https://dvargasfuertes--piro-infer.modal.run";
const currentEndpoint =
  "https://dvargasfuertes--piro-inference-infer.modal.run";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL must be configured");
}

const sql = neon(databaseUrl);
const before = await sql`
  SELECT id, name, "inferenceEndpoint"
  FROM model
  WHERE name = ${modelName}
`;

if (before.length !== 1) {
  throw new Error(
    `Expected exactly one ${modelName} model row, found ${before.length}`,
  );
}

const row = before[0];
console.log(
  JSON.stringify(
    {
      modelId: row.id,
      modelName: row.name,
      inferenceEndpointBefore: row["inferenceEndpoint"],
    },
    null,
    2,
  ),
);

const current = row["inferenceEndpoint"];
if (current === currentEndpoint) {
  console.log(
    "Borealis inference endpoint is already current; no update needed.",
  );
} else if (current !== staleEndpoint) {
  throw new Error(
    `Borealis endpoint does not match the expected stale value: ${String(current)}`,
  );
} else {
  const updated = await sql`
    UPDATE model
    SET "inferenceEndpoint" = ${currentEndpoint}
    WHERE id = ${row.id}
      AND "inferenceEndpoint" = ${staleEndpoint}
    RETURNING id, name, "inferenceEndpoint"
  `;

  if (updated.length !== 1) {
    throw new Error(
      `Expected exactly one endpoint update, changed ${updated.length}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        modelId: updated[0].id,
        modelName: updated[0].name,
        inferenceEndpointAfter: updated[0]["inferenceEndpoint"],
      },
      null,
      2,
    ),
  );
}

const after = await sql`
  SELECT id, name, "inferenceEndpoint"
  FROM model
  WHERE name = ${modelName}
`;

if (after.length !== 1 || after[0]["inferenceEndpoint"] !== currentEndpoint) {
  throw new Error("Borealis inference endpoint verification failed");
}

console.log("Borealis inference endpoint verified.");
