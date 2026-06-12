import { eq, sql } from "drizzle-orm";
import { getDb } from "./db-helper";
import { integration, fileIndex } from "../../../data/schema";
import { r2Put, r2Key } from "../r2";
import type { ProgressFn } from "./types";

const ROAM_API = "https://api.roamresearch.com/api/graph";

interface RoamPage {
  "node/title": string;
  "create/time"?: number;
  "edit/time"?: number;
}

interface RoamBlock {
  "block/string"?: string;
  "block/order"?: number;
  "block/children"?: RoamBlock[];
}

interface RoamPageDetail {
  "block/children"?: RoamBlock[];
}

function renderBlocks(blocks: RoamBlock[], depth = 0): string {
  return blocks
    .slice()
    .sort((a, b) => (a["block/order"] ?? 0) - (b["block/order"] ?? 0))
    .map((b) => {
      const indent = "  ".repeat(depth);
      const text = (b["block/string"] ?? "").trim();
      const line = text ? `${indent}- ${text}` : "";
      const children = b["block/children"]?.length
        ? renderBlocks(b["block/children"], depth + 1)
        : "";
      return [line, children].filter(Boolean).join("\n");
    })
    .filter(Boolean)
    .join("\n");
}

function titleToSlug(title: string): string {
  return (
    title
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase()
      .slice(0, 100) || "untitled"
  );
}

export async function syncRoam(
  integrationId: string,
  userId: string,
  apiToken: string,
  graphName: string,
  onProgress?: ProgressFn,
): Promise<{ inserted: number; total: number }> {
  const db = getDb();
  const base = `${ROAM_API}/${graphName}`;
  const headers = {
    "X-Authorization": `Bearer ${apiToken}`,
    "Content-Type": "application/json",
  };

  // Fetch all page titles + timestamps
  const listRes = await fetch(`${base}/q`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query:
        "[:find (pull ?e [:node/title :create/time :edit/time]) :where [?e :node/title]]",
    }),
  });

  if (!listRes.ok) {
    const text = await listRes.text().catch(() => String(listRes.status));
    if (listRes.status === 401 || listRes.status === 403) {
      throw new Error(`Bad credentials: ${text}`);
    }
    throw new Error(`Roam API ${listRes.status}: ${text}`);
  }

  const listJson = (await listRes.json()) as { result?: [RoamPage][] };
  const pages = (listJson.result ?? [])
    .map(([p]) => p)
    .filter((p) => !!p?.["node/title"]);
  const total = pages.length;

  await onProgress?.({ step: "Discovered pages", done: 0, total });

  let inserted = 0;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const title = page["node/title"];

    await onProgress?.({ step: "Syncing pages", current: title, done: i, total });

    try {
      // Pull full page content (3 levels deep)
      const escapedTitle = title.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const pullRes = await fetch(`${base}/pull`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          eid: `[:node/title "${escapedTitle}"]`,
          selector:
            "[{:block/children [:block/string :block/order {:block/children [:block/string :block/order {:block/children [:block/string :block/order]}]}]}]",
        }),
      });

      let content = `# ${title}\n\n`;
      if (pullRes.ok) {
        const detail = (await pullRes.json()) as RoamPageDetail;
        if (detail?.["block/children"]?.length) {
          content += renderBlocks(detail["block/children"]);
        }
      }

      const slug = titleToSlug(title);
      const key = r2Key(userId, "roam", `${slug}.md`);

      await r2Put(key, content.trimEnd());

      await db
        .insert(fileIndex)
        .values({
          id: crypto.randomUUID(),
          userId,
          integrationId,
          provider: "roam",
          itemType: "page",
          r2Key: key,
          title,
          itemCreatedAt: page["create/time"] ? new Date(page["create/time"]) : null,
        })
        .onConflictDoNothing();

      inserted++;
    } catch {
      // skip individual page failures — don't abort the whole sync
    }
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(fileIndex)
    .where(eq(fileIndex.integrationId, integrationId));

  await db
    .update(integration)
    .set({
      lastSyncAt: new Date(),
      itemCount: count,
      status: "active",
      updatedAt: new Date(),
    })
    .where(eq(integration.id, integrationId));

  return { inserted, total: count };
}
