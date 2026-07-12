import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Singleton — created once at first use, not at module load time
// (defers neon() call so Next.js build doesn't throw on missing DATABASE_URL)
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function getInstance() {
  if (!_db) {
    const url = process.env.PIRO_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!url) throw new Error("PIRO_DATABASE_URL is not set");

    const parsed = new URL(url);
    if (parsed.hostname.includes("-pooler.")) {
      throw new Error(
        "PIRO_DATABASE_URL must use a direct Neon endpoint when using neon-http",
      );
    }

    _db = drizzle(neon(url), { schema });
  }
  return _db;
}

export const db = new Proxy({} as ReturnType<typeof getInstance>, {
  get(_t, prop) {
    return Reflect.get(getInstance(), prop);
  },
});
