#!/usr/bin/env node
/**
 * piro — CLI for the Piro personal intelligence platform.
 *
 * Usage:
 *   piro classes serialize <id> [--bust]
 *   piro classes pull <id> [--out <file>]
 *   piro classes push <id> [--file <file>]
 *   piro sources pull <id> [--out <file>]
 *   piro sources push <id> [--file <file>]
 *
 * Auth:
 *   PIRO_API_KEY=<key>  (required)
 *   PIRO_BASE_URL=<url> (optional, defaults to https://trainpiro.app)
 */

import { classesSerialize, classesPull, classesPush } from "./commands/classes.js";
import { sourcesList, sourcesCreate, sourcesPull, sourcesPush } from "./commands/sources.js";

const [, , subject, verb, ...rest] = process.argv;

function flag(args: string[], name: string): boolean {
  return args.includes(`--${name}`);
}

function arg(args: string[], pos: number): string | undefined {
  return args.filter((a) => !a.startsWith("--"))[pos];
}

function opt(args: string[], name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  const val = args[idx + 1];
  return val && !val.startsWith("--") ? val : undefined;
}

function usage(msg?: string): never {
  if (msg) console.error(`Error: ${msg}\n`);
  console.error("Usage:");
  console.error("  piro classes serialize <id> [--bust]");
  console.error("  piro classes pull <id> [--out <file>]");
  console.error("  piro classes push <id> [--file <file>]");
  console.error("  piro sources list");
  console.error("  piro sources create <id> --name <name> [--description <desc>] [--sample-count <n>]");
  console.error("  piro sources pull <id> [--out <file>]");
  console.error("  piro sources push <id> [--file <file>]");
  process.exit(msg ? 1 : 0);
}

if (!subject || !verb) usage();

switch (subject) {
  case "classes":
    switch (verb) {
      case "serialize": {
        const id = arg(rest, 0);
        if (!id) usage("class id is required");
        await classesSerialize(id, { bust: flag(rest, "bust") });
        break;
      }
      case "pull": {
        const id = arg(rest, 0);
        if (!id) usage("class id is required");
        await classesPull(id, { out: opt(rest, "out") });
        break;
      }
      case "push": {
        const id = arg(rest, 0);
        if (!id) usage("class id is required");
        await classesPush(id, { file: opt(rest, "file") });
        break;
      }
      default:
        usage(`unknown classes verb: ${verb}`);
    }
    break;

  case "sources":
    switch (verb) {
      case "list": {
        await sourcesList();
        break;
      }
      case "create": {
        const id = arg(rest, 0);
        if (!id) usage("source id is required");
        const name = opt(rest, "name");
        if (!name) usage("--name is required for create");
        const sampleCountStr = opt(rest, "sample-count");
        const sampleCount = sampleCountStr ? parseInt(sampleCountStr, 10) : undefined;
        await sourcesCreate(id, {
          name,
          description: opt(rest, "description"),
          sampleCount,
        });
        break;
      }
      case "pull": {
        const id = arg(rest, 0);
        if (!id) usage("source id is required");
        await sourcesPull(id, { out: opt(rest, "out") });
        break;
      }
      case "push": {
        const id = arg(rest, 0);
        if (!id) usage("source id is required");
        await sourcesPush(id, { file: opt(rest, "file") });
        break;
      }
      default:
        usage(`unknown sources verb: ${verb}`);
    }
    break;

  default:
    usage(`unknown subject: ${subject}`);
}
