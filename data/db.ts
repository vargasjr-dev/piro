import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

// Lazy so Next.js build-time static analysis doesn't throw on missing DATABASE_URL
function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return drizzle(neon(url));
}

export const db = new Proxy({} as ReturnType<typeof getDb>, {
  get(_, prop) {
    return getDb()[prop as keyof ReturnType<typeof getDb>];
  },
});
