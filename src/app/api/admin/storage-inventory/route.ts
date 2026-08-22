import { resolveRequestAuth } from "~/lib/request-auth";
import { db } from "../../../../../data/db";
import { dataset, model, trainingRun } from "../../../../../data/schema";
import { r2ListObjects, type R2ObjectInfo } from "~/lib/r2";

export const runtime = "nodejs";
export const maxDuration = 300;

const CHECKPOINTS_PREFIX = "checkpoints/";
const DIAGNOSTICS_PREFIX = "diagnostics/";
const TOP_OBJECT_LIMIT = 25;

function sumBytes(objects: Array<{ size: number }>): number {
  return objects.reduce((total, object) => total + object.size, 0);
}

function sortBySize(objects: R2ObjectInfo[]): R2ObjectInfo[] {
  return [...objects].sort((a, b) => b.size - a.size);
}

function sortByDate(objects: R2ObjectInfo[]): R2ObjectInfo[] {
  return [...objects].sort(
    (a, b) =>
      (a.lastModified?.getTime() ?? Number.POSITIVE_INFINITY) -
      (b.lastModified?.getTime() ?? Number.POSITIVE_INFINITY),
  );
}

function objectMatchesPrefix(key: string, prefix: string): boolean {
  const normalizedPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
  return key === prefix || key.startsWith(normalizedPrefix);
}

export async function GET(request: Request) {
  const requestAuth = await resolveRequestAuth(request);
  if (!requestAuth)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!requestAuth.isAdmin)
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const [objects, models, datasets, runs] = await Promise.all([
    r2ListObjects(""),
    db
      .select({
        id: model.id,
        name: model.name,
        weightsR2Key: model.weightsR2Key,
      })
      .from(model),
    db
      .select({
        id: dataset.id,
        name: dataset.name,
        r2Prefix: dataset.r2Prefix,
      })
      .from(dataset),
    db
      .select({
        id: trainingRun.id,
        modelName: trainingRun.modelName,
        status: trainingRun.status,
        checkpointR2Key: trainingRun.checkpointR2Key,
        checkpointStep: trainingRun.checkpointStep,
      })
      .from(trainingRun),
  ]);

  const byTopLevelPrefix = new Map<string, typeof objects>();
  for (const object of objects) {
    const prefix = object.key.split("/", 1)[0] || "(root)";
    const grouped = byTopLevelPrefix.get(prefix) ?? [];
    grouped.push(object);
    byTopLevelPrefix.set(prefix, grouped);
  }

  const prefixes = [...byTopLevelPrefix.entries()]
    .map(([prefix, grouped]) => ({
      prefix,
      objectCount: grouped.length,
      bytes: sumBytes(grouped),
      oldest: sortByDate(grouped)[0]?.lastModified?.toISOString() ?? null,
      newest: sortByDate(grouped).at(-1)?.lastModified?.toISOString() ?? null,
    }))
    .sort((a, b) => b.bytes - a.bytes);

  const modelReferences = models
    .filter((item) => item.weightsR2Key)
    .map((item) => {
      const prefix = item.weightsR2Key!;
      const matching = objects.filter((object) =>
        objectMatchesPrefix(object.key, prefix),
      );
      return {
        id: item.id,
        name: item.name,
        prefix,
        objectCount: matching.length,
        bytes: sumBytes(matching),
        missing: matching.length === 0,
      };
    });

  const datasetReferences = datasets.map((item) => {
    const matching = objects.filter((object) =>
      objectMatchesPrefix(object.key, item.r2Prefix),
    );
    return {
      id: item.id,
      name: item.name,
      prefix: item.r2Prefix,
      objectCount: matching.length,
      bytes: sumBytes(matching),
      missing: matching.length === 0,
    };
  });

  const checkpointObjects = objects.filter((object) =>
    object.key.startsWith(CHECKPOINTS_PREFIX),
  );
  const checkpointRunIds = [
    ...new Set(
      checkpointObjects
        .map(
          (object) =>
            object.key.slice(CHECKPOINTS_PREFIX.length).split("/", 1)[0],
        )
        .filter(Boolean),
    ),
  ];
  const knownRunIds = new Set(runs.map((run) => run.id));
  const orphanCheckpointRunIds = checkpointRunIds.filter(
    (id) => !knownRunIds.has(id),
  );

  const diagnostics = objects.filter((object) =>
    object.key.startsWith(DIAGNOSTICS_PREFIX),
  );
  const referencedTopLevelPrefixes = new Set([
    "checkpoints",
    "diagnostics",
    ...modelReferences.map((item) => item.prefix.split("/", 1)[0]),
    ...datasetReferences.map((item) => item.prefix.split("/", 1)[0]),
  ]);

  return Response.json({
    generatedAt: new Date().toISOString(),
    bucket: "piro-kb",
    totals: {
      objectCount: objects.length,
      bytes: sumBytes(objects),
    },
    prefixes,
    largestObjects: sortBySize(objects)
      .slice(0, TOP_OBJECT_LIMIT)
      .map((object) => ({
        key: object.key,
        size: object.size,
        lastModified: object.lastModified?.toISOString() ?? null,
      })),
    oldestObjects: sortByDate(objects)
      .slice(0, TOP_OBJECT_LIMIT)
      .map((object) => ({
        key: object.key,
        size: object.size,
        lastModified: object.lastModified?.toISOString() ?? null,
      })),
    references: {
      models: modelReferences,
      datasets: datasetReferences,
      trainingRuns: runs,
    },
    checkpoints: {
      objectCount: checkpointObjects.length,
      bytes: sumBytes(checkpointObjects),
      runIds: checkpointRunIds,
      orphanRunIds: orphanCheckpointRunIds,
    },
    diagnostics: {
      objectCount: diagnostics.length,
      bytes: sumBytes(diagnostics),
    },
    review: {
      unknownTopLevelPrefixes: prefixes
        .map((item) => item.prefix)
        .filter((prefix) => !referencedTopLevelPrefixes.has(prefix)),
      missingModelPrefixes: modelReferences
        .filter((item) => item.missing)
        .map((item) => item.prefix),
      missingDatasetPrefixes: datasetReferences
        .filter((item) => item.missing)
        .map((item) => item.prefix),
    },
  });
}
