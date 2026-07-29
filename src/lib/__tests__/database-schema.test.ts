import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, test } from "bun:test";

import { dataset, generationRun, trainingRun } from "../../../data/schema";
import {
  makeDestructiveStatementIdempotent,
  parseNotNullChange,
  TABLE_FILTERS,
  TEXT_LIKE_TYPES,
} from "../../../scripts/db-push-config";

const columnNames = (table: Parameters<typeof getTableConfig>[0]) =>
  Object.values(getTableConfig(table).columns).map((column) => column.name);

describe("production schema migration safety", () => {
  test("keeps retired ownership tables and columns out of the product schema", () => {
    expect(columnNames(dataset)).not.toContain("repositoryId");
    expect(columnNames(generationRun)).not.toContain("repositoryId");
    expect(columnNames(trainingRun)).not.toContain("repositoryId");
    expect(columnNames(dataset)).toContain("evaluationConfig");
  });

  test("excludes Drizzle's internal migration table from schema introspection", () => {
    expect(TABLE_FILTERS).toEqual(["*", "!_applied_migrations"]);
  });

  test("makes supported destructive statements idempotent without schema names", () => {
    expect(
      makeDestructiveStatementIdempotent(
        'ALTER TABLE "generation_run" DROP CONSTRAINT "legacy_fkey";',
      ),
    ).toBe(
      'ALTER TABLE "generation_run" DROP CONSTRAINT IF EXISTS "legacy_fkey";',
    );
    expect(
      makeDestructiveStatementIdempotent(
        'ALTER TABLE "training_run" DROP COLUMN "old_column";',
      ),
    ).toBe('ALTER TABLE "training_run" DROP COLUMN IF EXISTS "old_column";');
    expect(makeDestructiveStatementIdempotent('DROP INDEX "old_index";')).toBe(
      'DROP INDEX IF EXISTS "old_index";',
    );
    expect(makeDestructiveStatementIdempotent('DROP TABLE "old_table";')).toBe(
      'DROP TABLE IF EXISTS "old_table";',
    );
    const unrelatedStatement =
      '  CREATE INDEX  "new_index" ON "table" ("column");  ';
    expect(makeDestructiveStatementIdempotent(unrelatedStatement)).toBe(
      unrelatedStatement,
    );
  });

  test("parses nullable-to-not-null changes generically", () => {
    expect(
      parseNotNullChange(
        'ALTER TABLE "training_run" ALTER COLUMN "architecturePath" SET NOT NULL;',
      ),
    ).toEqual({
      schema: "public",
      table: "training_run",
      column: "architecturePath",
    });
    expect(TEXT_LIKE_TYPES.has("text")).toBe(true);
    expect(TEXT_LIKE_TYPES.has("integer")).toBe(false);
  });
});
