import { inArray } from "drizzle-orm";
import { db } from "../../../data/db";
import { model, modelTrainingRun } from "../../../data/schema";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Given an array of strings that may be model UUIDs or already-resolved names,
 * resolves UUIDs → model names and identifies stub models.
 *
 * A Piro-trained model is a stub only if it has no stored weights (weightsB64 is null) —
 * i.e., it was trained before weight persistence was added. Once a model has weights,
 * it's no longer a stub and will receive real inference via Modal.
 *
 * Returns:
 *  nameMap   — UUID → model.name for any UUIDs found in DB
 *  stubNames — set of model names that have no stored weights (results would be noise)
 */
export async function resolveModelTargets(rawTargets: string[]): Promise<{
  nameMap: Record<string, string>;
  stubNames: Set<string>;
}> {
  const uuids = [...new Set(rawTargets.filter((t) => UUID_PATTERN.test(t)))];
  if (uuids.length === 0) return { nameMap: {}, stubNames: new Set() };

  const [models, trainingLinks] = await Promise.all([
    db
      .select({
        id: model.id,
        name: model.name,
        weightsR2Key: model.weightsR2Key,
      })
      .from(model)
      .where(inArray(model.id, uuids)),
    db
      .select({ modelId: modelTrainingRun.modelId })
      .from(modelTrainingRun)
      .where(inArray(modelTrainingRun.modelId, uuids)),
  ]);

  const nameMap: Record<string, string> = {};
  const hasWeights = new Set<string>();

  for (const m of models) {
    nameMap[m.id] = m.name;
    if (m.weightsR2Key) hasWeights.add(m.id);
  }

  const trainingModelIds = new Set(trainingLinks.map((t) => t.modelId));

  const stubNames = new Set<string>();
  for (const m of models) {
    // Only mark as stub if it's Piro-trained but has no weights in R2
    // (i.e., trained before R2 weight storage was added — retrain to fix)
    if (trainingModelIds.has(m.id) && !hasWeights.has(m.id)) {
      stubNames.add(m.name);
    }
  }

  return { nameMap, stubNames };
}
