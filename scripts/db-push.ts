import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../data/schema";
import {
  makeDestructiveStatementIdempotent,
  parseNotNullChange,
  TABLE_FILTERS,
  TEXT_LIKE_TYPES,
} from "./db-push-config";

type PushResult = {
  hasDataLoss: boolean;
  warnings: string[];
  statementsToExecute: string[];
  apply: () => Promise<void>;
};

type PushSchema = (typeof import("drizzle-kit/api"))["pushSchema"];

type StdinWithTTY = typeof process.stdin & {
  isTTY?: boolean;
  setRawMode?: (mode: boolean) => typeof process.stdin;
};

/**
 * Drizzle Kit asks interactive rename/create questions when a declarative
 * schema diff is ambiguous. CI has no TTY, so the prompt otherwise throws
 * before applying anything. The first option is Drizzle's non-destructive
 * "create" choice; emit Enter until the API finishes to select it.
 *
 * The generated declarative plan is applied as-is after Drizzle's prompts
 * are answered non-destructively; supported drift operations are made
 * idempotent in the statement loop below.
 *
 * Related upstream issues:
 * - https://github.com/drizzle-team/drizzle-orm/issues/4921
 * - https://github.com/drizzle-team/drizzle-orm/issues/4531
 */
async function pushSchemaNoPrompt(
  imports: Record<string, unknown>,
  drizzleInstance: Parameters<PushSchema>[1],
  tablesFilter: string[],
): Promise<PushResult> {
  const stdin = process.stdin as StdinWithTTY;
  const originalStdinTTY = stdin.isTTY;
  const originalStdoutTTY = process.stdout.isTTY;
  const originalSetRawMode = stdin.setRawMode;

  Object.defineProperty(stdin, "isTTY", { value: true, configurable: true });
  Object.defineProperty(process.stdout, "isTTY", {
    value: true,
    configurable: true,
  });
  if (!originalSetRawMode) {
    stdin.setRawMode = () => stdin;
  }

  const { pushSchema } = await import("drizzle-kit/api");
  const enterInterval = setInterval(() => {
    stdin.emit("keypress", "\r", { name: "return" });
  }, 50);

  try {
    return await pushSchema(imports, drizzleInstance, undefined, tablesFilter);
  } finally {
    clearInterval(enterInterval);
    Object.defineProperty(stdin, "isTTY", {
      value: originalStdinTTY,
      configurable: true,
    });
    Object.defineProperty(process.stdout, "isTTY", {
      value: originalStdoutTTY,
      configurable: true,
    });
    if (!originalSetRawMode) {
      stdin.setRawMode = undefined;
    }
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL must be configured");
}

const db = drizzle(neon(url), { schema });
const result = await pushSchemaNoPrompt(
  schema,
  db as unknown as Parameters<PushSchema>[1],
  TABLE_FILTERS,
);

if (result.statementsToExecute.length === 0) {
  console.log("No schema changes detected.");
} else {
  if (result.hasDataLoss) {
    console.warn("Applying destructive schema changes.");
    for (const warning of result.warnings) {
      console.warn(`- ${warning}`);
    }
  }
  console.log(
    `Applying ${result.statementsToExecute.length} schema statement(s).`,
  );
  for (const rawStatement of result.statementsToExecute) {
    const notNullChange = parseNotNullChange(rawStatement);
    if (notNullChange) {
      const metadata = await db.execute<{ data_type: string }>(sql`
        select data_type
        from information_schema.columns
        where table_schema = ${notNullChange.schema}
          and table_name = ${notNullChange.table}
          and column_name = ${notNullChange.column}
      `);
      const dataType = metadata.rows[0]?.data_type;
      if (dataType && TEXT_LIKE_TYPES.has(dataType)) {
        await db.execute(sql`
          UPDATE ${sql.identifier(notNullChange.schema)}.${sql.identifier(notNullChange.table)}
          SET ${sql.identifier(notNullChange.column)} = ''
          WHERE ${sql.identifier(notNullChange.column)} IS NULL
        `);
      }
    }

    await db.execute(sql.raw(makeDestructiveStatementIdempotent(rawStatement)));
  }
  console.log("Schema changes applied.");
}
