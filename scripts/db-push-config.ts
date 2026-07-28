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

/**
 * Production may already have some retired ownership constraints removed. Keep
 * only those generated drops idempotent; every other generated statement must
 * remain unchanged and fail normally if the database rejects it.
 */
export function makeLegacyConstraintDropIdempotent(statement: string): string {
  const normalized = statement.trim().replace(/\s+/g, " ");
  const match = normalized.match(
    /^ALTER TABLE ("(?:dataset|generation_run|training_run)"|(?:dataset|generation_run|training_run)) DROP CONSTRAINT ("[^"]+"|[^;\s]+);?$/i,
  );
  if (!match) return statement;

  const constraintName = match[2].replace(/^"|"$/g, "");
  if (!/(?:repositoryId|repo|integration)/i.test(constraintName)) {
    return statement;
  }

  return normalized.replace(
    / DROP CONSTRAINT /i,
    " DROP CONSTRAINT IF EXISTS ",
  );
}
