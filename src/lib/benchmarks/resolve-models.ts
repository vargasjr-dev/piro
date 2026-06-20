import { inArray } from "drizzle-orm";
import { db } from "../../../data/db";
import { model, modelTrainingRun } from "../../../data/schema";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Given an array of strings that may be model UUIDs or already-resolved names,
 * resolves UUIDs → model names and identifies Piro-trained (stub) models.
 *
 * Returns:
 *  nameMap   — UUID → model.name for any UUIDs found in DB
 *  stubNames — set of model names that are Piro-trained (isStub)
 */
export async function resolveModelTargets(rawTargets: string[]): Promise<{
  nameMap: Record<string, string>;
  stubNames: Set<string>;
}> {
  const uuids = [...new Set(rawTargets.filter((t) => UUID_PATTERN.test(t)))];
  if (uuids.length === 0) return { nameMap: {}, stubNames: new Set() };

  const [models, trainingLinks] = await Promise.all([
    db
      .select({ id: model.id, name: model.name })
      .from(model)
      .where(inArray(model.id, uuids)),
    db
      .select({ modelId: modelTrainingRun.modelId })
      .from(modelTrainingRun)
      .where(inArray(modelTrainingRun.modelId, uuids)),
  ]);

  const nameMap: Record<string, string> = {};
  for (const m of models) nameMap[m.id] = m.name;

  const stubNames = new Set<string>();
  for (const t of trainingLinks) {
    const name = nameMap[t.modelId];
    if (name) stubNames.add(name);
  }

  return { nameMap, stubNames };
}
