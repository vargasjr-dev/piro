import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../data/schema";

type PushResult = {
  hasDataLoss: boolean;
  warnings: string[];
  statementsToExecute: string[];
  apply: () => Promise<void>;
};

type PushSchema = typeof import("drizzle-kit/api")["pushSchema"];

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
 * Data-loss suggestions are still rejected below. This wrapper only resolves
 * ambiguity; it never approves truncation, drops, or other destructive SQL.
 *
 * Related upstream issues:
 * - https://github.com/drizzle-team/drizzle-orm/issues/4921
 * - https://github.com/drizzle-team/drizzle-orm/issues/4531
 */
async function pushSchemaNoPrompt(
  imports: Record<string, unknown>,
  drizzleInstance: Parameters<PushSchema>[1],
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
    return await pushSchema(imports, drizzleInstance);
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

const url = process.env.PIRO_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error("PIRO_DATABASE_URL or DATABASE_URL must be configured");
}

const db = drizzle(neon(url), { schema });
const result = await pushSchemaNoPrompt(
  schema,
  db as unknown as Parameters<PushSchema>[1],
);

if (result.hasDataLoss) {
  console.error("Refusing to apply destructive schema changes:");
  for (const warning of result.warnings) {
    console.error(`- ${warning}`);
  }
  process.exitCode = 1;
} else if (result.statementsToExecute.length === 0) {
  console.log("No schema changes detected.");
} else {
  console.log(`Applying ${result.statementsToExecute.length} schema statement(s).`);
  await result.apply();
  console.log("Schema changes applied.");
}
