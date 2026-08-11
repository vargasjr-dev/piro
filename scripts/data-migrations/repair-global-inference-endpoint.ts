import { neon } from "@neondatabase/serverless";

const modelId = "b675fccf-1a4a-4b91-8f92-d1453abdff55";
const staleEndpoint = "https://dvargasfuertes--piro-infer.modal.run";
const currentEndpoint =
  "https://dvargasfuertes--piro-inference-infer.modal.run";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL must be configured");
}

const sql = neon(databaseUrl);
const before = await sql`
  SELECT id, "inferenceEndpoint"
  FROM model
  WHERE id = ${modelId}
`;

if (before.length !== 1) {
  throw new Error(
    `Expected exactly one global model row, found ${before.length}`,
  );
}

const current = before[0]["inferenceEndpoint"];
console.log(
  JSON.stringify({ modelId, inferenceEndpointBefore: current }, null, 2),
);

if (current === currentEndpoint) {
  console.log("Global model endpoint is already current; no update needed.");
} else if (current !== staleEndpoint) {
  throw new Error(
    `Global model endpoint does not match the expected stale value: ${String(current)}`,
  );
} else {
  const updated = await sql`
    UPDATE model
    SET "inferenceEndpoint" = ${currentEndpoint}
    WHERE id = ${modelId}
      AND "inferenceEndpoint" = ${staleEndpoint}
    RETURNING id, "inferenceEndpoint"
  `;

  if (updated.length !== 1) {
    throw new Error(
      `Expected exactly one endpoint update, changed ${updated.length}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        modelId,
        inferenceEndpointAfter: updated[0]["inferenceEndpoint"],
      },
      null,
      2,
    ),
  );
}

const after = await sql`
  SELECT id, "inferenceEndpoint"
  FROM model
  WHERE id = ${modelId}
`;

if (after.length !== 1 || after[0]["inferenceEndpoint"] !== currentEndpoint) {
  throw new Error("Global model endpoint verification failed");
}

console.log("Global model inference endpoint verified.");
