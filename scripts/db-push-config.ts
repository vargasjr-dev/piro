/**
 * Keep Drizzle's internal bookkeeping table out of declarative schema diffs.
 * It is managed by the tool rather than by data/schema.ts.
 */
export const TABLE_FILTERS = ["*", "!_applied_migrations"];

/**
 * Destructive schema convergence is disabled unless the production workflow
 * explicitly passes the manual approval input.
 */
export function isDestructiveSchemaApplyEnabled(
  value = process.env.ALLOW_DESTRUCTIVE_SCHEMA_CHANGES,
): boolean {
  return value === "true";
}
