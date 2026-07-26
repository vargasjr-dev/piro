import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./data/schema.ts",
  dbCredentials: {
    url: (process.env.PIRO_DATABASE_URL ?? process.env.DATABASE_URL)!,
  },
});
