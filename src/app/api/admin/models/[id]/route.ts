import { eq } from "drizzle-orm";
import { db } from "../../../../../../data/db";
import { model } from "../../../../../../data/schema";
import { resolveRequestAuth } from "~/lib/request-auth";
import { r2DeletePrefix } from "~/lib/r2";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestAuth = await resolveRequestAuth(request);
  if (!requestAuth)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!requestAuth.isAdmin)
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const [found] = await db
    .select({
      id: model.id,
      name: model.name,
      weightsR2Key: model.weightsR2Key,
    })
    .from(model)
    .where(eq(model.id, id))
    .limit(1);

  if (!found)
    return Response.json({ error: "Model not found" }, { status: 404 });

  if (found.weightsR2Key) await r2DeletePrefix(found.weightsR2Key);
  await db.delete(model).where(eq(model.id, id));

  return Response.json({ deleted: { id: found.id, name: found.name } });
}
