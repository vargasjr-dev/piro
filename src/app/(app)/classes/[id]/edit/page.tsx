import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { eq, and } from "drizzle-orm";
import { db } from "../../../../../../data/db";
import { modelClass } from "../../../../../../data/schema";
import ClassEditor, { type ClassEditorInitial } from "../../ClassEditor";

export default async function EditClassPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const [cls] = await db
    .select()
    .from(modelClass)
    .where(and(eq(modelClass.id, id), eq(modelClass.userId, session.user.id)))
    .limit(1);

  if (!cls) notFound();

  // Parse configJson → hyperparams array
  let hyperparams: { key: string; value: string }[] = [];
  if (cls.configJson) {
    try {
      const obj = JSON.parse(cls.configJson) as Record<string, unknown>;
      hyperparams = Object.entries(obj).map(([key, val]) => ({
        key,
        value: String(val),
      }));
    } catch {
      // ignore malformed JSON
    }
  }

  const initial: ClassEditorInitial = {
    id: cls.id,
    name: cls.name,
    slug: cls.slug,
    description: cls.description ?? "",
    parameterCount: cls.parameterCount ?? null,
    hyperparams: hyperparams.length > 0 ? hyperparams : [{ key: "", value: "" }],
  };

  return <ClassEditor initial={initial} />;
}
