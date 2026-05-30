import { defineConfig } from "drizzle-kit";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// Needed for drizzle-kit to connect via WebSocket in Node.js environments
neonConfig.webSocketConstructor = ws;

export default defineConfig({
  dialect: "postgresql",
  schema: "./data/schema.ts",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
