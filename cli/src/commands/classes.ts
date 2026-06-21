import { piroFetch, resolveConfig } from "../client.js";

export async function classesSerialize(id: string, opts: { bust?: boolean }) {
  const config = resolveConfig();
  const qs = opts.bust ? "?bust=true" : "";
  const { ok, status, body } = await piroFetch(
    config,
    `/api/classes/${id}/serialize${qs}`,
  );

  if (ok) {
    console.log(JSON.stringify(body, null, 2));
    return;
  }

  // Surface the full detail from our proxy route
  const err = body as Record<string, unknown> | null;
  const detail = err?.detail ?? err?.error ?? body;
  console.error(`Error ${status}: ${err?.error ?? "serialize failed"}`);
  if (detail && detail !== err?.error) {
    console.error("\n" + String(detail));
  }
  process.exit(1);
}
