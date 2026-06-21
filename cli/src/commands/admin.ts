import { piroFetch, resolveConfig } from "../client.js";

export async function adminModalSecrets() {
  const config = resolveConfig();
  const { ok, status, body } = await piroFetch(config, "/api/admin/modal-secrets", {
    method: "POST",
  });

  if (!ok) {
    const err = body as Record<string, unknown> | null;
    console.error(`Error ${status}: ${err?.error ?? "request failed"}`);
    process.exit(1);
  }

  const { secrets, missing } = body as {
    secrets: Record<string, string | null>;
    missing: string[];
  };

  if (missing.length > 0) {
    console.error(`Warning: missing env vars in Vercel: ${missing.join(", ")}`);
  }

  // Print each key=value on its own line, ready to copy into `modal secret create`
  for (const [key, value] of Object.entries(secrets)) {
    if (value) console.log(`${key}=${value}`);
  }
}
