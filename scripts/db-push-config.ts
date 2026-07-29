/**
 * Keep Drizzle's internal bookkeeping table out of declarative schema diffs.
 * It is managed by the tool rather than by data/schema.ts.
 */
export const TABLE_FILTERS = ["*", "!_applied_migrations"];

/**
 * PostgreSQL accepts IF EXISTS for these generated destructive operations.
 * Keep this transformation entirely independent of product table names.
 */
export function makeDestructiveStatementIdempotent(statement: string): string {
  const normalized = statement.trim().replace(/\s+/g, " ");
  if (/\bIF EXISTS\b/i.test(normalized)) return statement;

  const rewritten = normalized
    .replace(/^(ALTER TABLE .+ DROP CONSTRAINT) /i, "$1 IF EXISTS ")
    .replace(/^(ALTER TABLE .+ DROP COLUMN) /i, "$1 IF EXISTS ")
    .replace(/^(DROP INDEX) /i, "$1 IF EXISTS ")
    .replace(/^(DROP TABLE) /i, "$1 IF EXISTS ");

  return rewritten === normalized ? statement : rewritten;
}

export type NotNullChange = {
  schema: string;
  table: string;
  column: string;
};

/**
 * Extract a generated PostgreSQL ALTER COLUMN ... SET NOT NULL operation.
 * The runner uses the parsed identifiers only for generic metadata lookup and
 * parameterized identifier quoting; it never names a product table or column.
 */
export function parseNotNullChange(statement: string): NotNullChange | null {
  const normalized = statement.trim().replace(/\s+/g, " ");
  const match = normalized.match(
    /^ALTER TABLE (?:("[^"]+"|[^\s.]+)\.)?("[^"]+"|[^\s]+) ALTER COLUMN ("[^"]+"|[^\s]+) SET NOT NULL;?$/i,
  );
  if (!match) return null;

  const unquote = (value: string) => value.replace(/^"|"$/g, "");
  return {
    schema: match[1] ? unquote(match[1]) : "public",
    table: unquote(match[2]),
    column: unquote(match[3]),
  };
}

export const TEXT_LIKE_TYPES = new Set([
  "text",
  "character varying",
  "character",
]);
