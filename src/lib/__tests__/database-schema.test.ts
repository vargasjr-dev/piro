import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, test } from "bun:test";

import { dataset, generationRun, trainingRun } from "../../../data/schema";
import {
  isDestructiveSchemaApplyEnabled,
  makeLegacyConstraintDropIdempotent,
  TABLE_FILTERS,
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

  test("requires explicit approval before applying destructive schema changes", () => {
    expect(isDestructiveSchemaApplyEnabled("true")).toBe(true);
    expect(isDestructiveSchemaApplyEnabled("false")).toBe(false);
    expect(isDestructiveSchemaApplyEnabled(undefined)).toBe(false);
    expect(isDestructiveSchemaApplyEnabled("TRUE")).toBe(false);
  });

  test("makes only retired ownership constraint drops idempotent", () => {
    expect(
      makeLegacyConstraintDropIdempotent(
        'ALTER TABLE "generation_run" DROP CONSTRAINT "generation_run_repositoryId_fkey";',
      ),
    ).toBe(
      'ALTER TABLE "generation_run" DROP CONSTRAINT IF EXISTS "generation_run_repositoryId_fkey";',
    );
    expect(
      makeLegacyConstraintDropIdempotent(
        'ALTER TABLE "user" DROP CONSTRAINT "user_email_unique";',
      ),
    ).toBe('ALTER TABLE "user" DROP CONSTRAINT "user_email_unique";');
    expect(
      makeLegacyConstraintDropIdempotent('DROP TABLE "repository" CASCADE;'),
    ).toBe('DROP TABLE "repository" CASCADE;');
  });
});
