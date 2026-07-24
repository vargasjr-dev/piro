import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export type LatestPiroModel = {
  experiment: string;
  experimentSlug: string;
  architecture: string;
  architecturePath: string;
  label: string;
};

const EXPERIMENTS_DIR = join(process.cwd(), "experiments");

function titleCase(value: string) {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

function architectureLabel(value: string) {
  return value
    .split("-")
    .map((part) => (part.toLowerCase() === "ctm" ? "CTM" : part))
    .join(" ")
    .replace(/\b10x\b/i, "10×");
}

/**
 * Experiments are intentionally named in alphabetic sequence (see
 * experiments/README.md). The last experiment and its last architecture are
 * therefore the current research frontier without a second release registry
 * that can drift from the checked-in experiment tree.
 */
export function getLatestPiroModel(): LatestPiroModel {
  if (!existsSync(EXPERIMENTS_DIR)) {
    return {
      experiment: "Latest Piro",
      experimentSlug: "latest",
      architecture: "piro",
      architecturePath: "",
      label: "Latest Piro model",
    };
  }

  const experiments = readdirSync(EXPERIMENTS_DIR)
    .filter((entry) => !entry.startsWith("."))
    .filter((entry) => statSync(join(EXPERIMENTS_DIR, entry)).isDirectory())
    .sort((a, b) => a.localeCompare(b));

  const experimentSlug = experiments.at(-1);
  if (!experimentSlug) {
    return {
      experiment: "Latest Piro",
      experimentSlug: "latest",
      architecture: "piro",
      architecturePath: "",
      label: "Latest Piro model",
    };
  }

  const architectureDir = join(EXPERIMENTS_DIR, experimentSlug, "architectures");
  const architectures = existsSync(architectureDir)
    ? readdirSync(architectureDir)
        .filter((entry) => !entry.startsWith("."))
        .filter((entry) => statSync(join(architectureDir, entry)).isDirectory())
        .sort((a, b) => a.localeCompare(b))
    : [];
  const architecture = architectures.at(-1) ?? "piro";
  const architecturePath = architectures.length
    ? `experiments/${experimentSlug}/architectures/${architecture}`
    : "";

  // Keep the source tree useful as a lightweight release manifest when an
  // architecture declares a friendlier model template name.
  const entrypoint = join(architectureDir, architecture, "main.py");
  const source = existsSync(entrypoint) ? readFileSync(entrypoint, "utf8") : "";
  const template = source.match(/MODEL_TEMPLATE\s*=\s*["']([^"']+)["']/)?.[1];
  const modelName = template ?? architecture;

  return {
    experiment: titleCase(experimentSlug),
    experimentSlug,
    architecture: modelName,
    architecturePath,
    label: `${titleCase(experimentSlug)} · ${architectureLabel(modelName)}`,
  };
}
