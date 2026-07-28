import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Find every canonical architecture entrypoint under an architectures directory. */
export function discoverArchitectureEntrypoints(
  architecturesDir: string,
): string[] {
  return readdirSync(architecturesDir)
    .map((name) => join(architecturesDir, name))
    .filter((path) => statSync(path).isDirectory())
    .map((directory) => join(directory, "main.py"))
    .filter((path) => {
      try {
        return statSync(path).isFile();
      } catch {
        return false;
      }
    })
    .sort();
}
