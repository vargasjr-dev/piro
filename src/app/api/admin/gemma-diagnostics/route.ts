import { resolveRequestAuth } from "~/lib/request-auth";
import { r2ListObjects } from "~/lib/r2";

const DIAGNOSTICS_PREFIX = "diagnostics/gemma/";

export async function GET(request: Request) {
  const requestAuth = await resolveRequestAuth(request);
  if (!requestAuth)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!requestAuth.isAdmin)
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const objects = await r2ListObjects(DIAGNOSTICS_PREFIX);
  return Response.json({
    diagnostics: objects
      .sort(
        (a, b) =>
          (b.lastModified?.getTime() ?? 0) - (a.lastModified?.getTime() ?? 0),
      )
      .slice(0, 100)
      .map((object) => ({
        key: object.key,
        size: object.size,
        capturedAt: object.lastModified?.toISOString() ?? null,
        downloadUrl: `/api/admin/gemma-diagnostics/${object.key
          .split("/")
          .map((part) => encodeURIComponent(part))
          .join("/")}`,
      })),
  });
}
