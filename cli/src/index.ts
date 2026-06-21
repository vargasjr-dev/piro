#!/usr/bin/env node
/**
 * piro — CLI for the Piro personal intelligence platform.
 *
 * Usage:
 *   piro classes serialize <id> [--bust]
 *
 * Auth:
 *   PIRO_API_KEY=<key>  (required)
 *   PIRO_BASE_URL=<url> (optional, defaults to https://trainpiro.app)
 */

import { classesSerialize } from "./commands/classes.js";

const [, , subject, verb, ...rest] = process.argv;

function flag(args: string[], name: string): boolean {
  return args.includes(`--${name}`);
}

function arg(args: string[], pos: number): string | undefined {
  return args.filter((a) => !a.startsWith("--"))[pos];
}

function usage(msg?: string): never {
  if (msg) console.error(`Error: ${msg}\n`);
  console.error("Usage:");
  console.error("  piro classes serialize <id> [--bust]");
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
      default:
        usage(`unknown classes verb: ${verb}`);
    }
    break;

  default:
    usage(`unknown subject: ${subject}`);
}
