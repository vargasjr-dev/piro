import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export type CurrentPiroArchitecture = {
  architecture: string;
  architecturePath: string;
  label: string;
};

const ARCHITECTURES_DIR = join(process.cwd(), "architectures");

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

  const tracks = readdirSync(ARCHITECTURES_DIR)
    .filter((entry) => !entry.startsWith(".") && entry !== "_common")
    .filter((entry) => statSync(join(ARCHITECTURES_DIR, entry)).isDirectory())
    .sort((a, b) => a.localeCompare(b));
  const track = tracks.at(-1);
  if (!track) return fallback;

  const files = readdirSync(join(ARCHITECTURES_DIR, track))
    .filter((entry) => entry.endsWith(".py") && entry !== "__init__.py")
    .sort((a, b) => a.localeCompare(b));
  const file = files.at(-1);
  if (!file) return fallback;

  const modelName = file.replace(/\.py$/, "").replace(/_/g, "-");
  return {
    architecture: modelName,
    architecturePath: `architectures/${track}/${file}`,
    label: `Piro · ${architectureLabel(modelName)}`,
  };
}
