import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Thin API client that wraps fetch calls to the Piro platform.
 *
 * Configuration is read from the process environment and, when present, the
 * nearest `.env` file in the current directory or one of its parents.
 * Explicit process environment variables always win over `.env` values.
 */

export const DEFAULT_BASE_URL = "https://trainpiro.app";

export interface PiroClientConfig {
  apiKey: string;
  baseUrl: string;
}

let dotenvLoaded = false;

function loadDotenv(): void {
  if (dotenvLoaded) return;
  dotenvLoaded = true;

  let directory = process.cwd();
  while (true) {
    const path = join(directory, ".env");
    if (existsSync(path)) {
      loadDotenvFile(path);
      return;
    }
    const parent = dirname(directory);
    if (parent === directory) return;
    directory = parent;
  }
}

function loadDotenvFile(path: string): void {
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const assignment = line.replace(/^export\s+/, "").match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!assignment) continue;

    const [, key, rawValue] = assignment;
    if (process.env[key] !== undefined) continue;
    process.env[key] = parseDotenvValue(rawValue);
  }
}

function parseDotenvValue(rawValue: string): string {
  if (rawValue.length >= 2) {
    const first = rawValue[0];
    const last = rawValue[rawValue.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return rawValue.slice(1, -1);
    }
  }
  return rawValue.replace(/\s+#.*$/, "").trim();
}

export function resolveConfig(): PiroClientConfig {
  loadDotenv();
  const apiKey = process.env.PIRO_API_KEY ?? "";
  if (!apiKey) {
    console.error("Error: PIRO_API_KEY environment variable is not set.");
    process.exit(1);
  }
  return {
    apiKey,
    baseUrl: (process.env.PIRO_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, ""),
  };
}

export async function piroFetch(
  config: PiroClientConfig,
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const url = `${config.baseUrl}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  let body: unknown;
  const ct = res.headers.get("content-type") ?? "";
  try {
    body = ct.includes("application/json")
      ? await res.json()
      : await res.text();
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body };
}
