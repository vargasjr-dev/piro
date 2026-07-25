import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export type CurrentPiroArchitecture = {
  architecture: string;
  architecturePath: string;
  label: string;
};

const ARCHITECTURES_DIR = join(process.cwd(), "architectures");

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

/** Resolve the current model architecture from the checked-in top-level tree. */
export function getCurrentPiroArchitecture(): CurrentPiroArchitecture {
  const fallback = {
    architecture: "latest",
    architecturePath: "",
    label: "Current Piro architecture",
  };
  if (!existsSync(ARCHITECTURES_DIR)) return fallback;

  const architectures = readdirSync(ARCHITECTURES_DIR)
    .filter((entry) => !entry.startsWith(".") && entry !== "_common")
    .filter((entry) => statSync(join(ARCHITECTURES_DIR, entry)).isDirectory())
    .sort((a, b) => a.localeCompare(b));
  const architecture = architectures.at(-1);
  if (!architecture) return fallback;

  const modelName = architecture === "baseline_transformer" ? "baseline-transformer" : architecture;
  return {
    architecture: modelName,
    architecturePath: `architectures/${architecture}`,
    label: `Piro · ${architectureLabel(modelName)}`,
  };
}
