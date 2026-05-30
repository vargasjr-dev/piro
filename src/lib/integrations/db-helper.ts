import { db } from "../../../data/db";

// Return the singleton db proxy — called as getDb() so integrations
// don't depend on the Proxy import directly
export function getDb() {
  return db;
}
