/**
 * Thin API client that wraps fetch calls to the Piro platform.
 *
 * Config is read from environment variables:
 *   PIRO_API_KEY   — required: Bearer token
 *   PIRO_BASE_URL  — optional: defaults to https://trainpiro.app
 */

export const DEFAULT_BASE_URL = "https://trainpiro.app";

export interface PiroClientConfig {
  apiKey: string;
  baseUrl?: string;
}

export function resolveConfig(): PiroClientConfig {
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
