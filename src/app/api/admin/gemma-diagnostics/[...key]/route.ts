import { resolveRequestAuth } from "~/lib/request-auth";
import { r2Get } from "~/lib/r2";

const DIAGNOSTICS_PREFIX = "diagnostics/gemma/";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const requestAuth = await resolveRequestAuth(request);
  if (!requestAuth)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!requestAuth.isAdmin)
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { key: keyParts } = await params;
  const key = keyParts.join("/");
  if (
    !key.startsWith(DIAGNOSTICS_PREFIX) ||
    keyParts.some((part) => part === "..")
  ) {
    return Response.json({ error: "Invalid diagnostics key" }, { status: 400 });
  }

  const content = await r2Get(key);
  if (content === null)
    return Response.json({ error: "Diagnostics not found" }, { status: 404 });

  return new Response(content, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${key.split("/").at(-1) ?? "gemma-diagnostics.json"}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
