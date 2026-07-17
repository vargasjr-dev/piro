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

import {
  classesSerialize,
  classesPull,
  classesPush,
} from "./commands/classes.js";
import {
  sourcesList,
  sourcesCreate,
  sourcesGenerate,
  sourcesPull,
  sourcesPush,
} from "./commands/sources.js";
import {
  benchmarksList,
  benchmarksCreate,
  benchmarksRun,
  benchmarksPull,
  benchmarksPush,
} from "./commands/benchmarks.js";
import {
  reposList,
  reposCreate,
  reposLink,
  reposUse,
} from "./commands/repos.js";

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
  console.error(
    "  piro sources create <id> --name <name> [--description <desc>] [--sample-count <n>]",
  );
  console.error("  piro sources generate <id>");
  console.error("  piro sources pull <id> [--out <file>]");
  console.error("  piro sources push <id> [--file <file>]");
  console.error("  piro benchmarks list");
  console.error(
    "  piro benchmarks create <id> --name <name> [--source <source-id>] [--description <desc>]",
  );
  console.error("  piro benchmarks run <id> [--model <model-id>]");
  console.error("  piro benchmarks pull <id> [--out <file>]");
  console.error("  piro benchmarks push <id> [--file <file>]");
  console.error("  piro repos list");
  console.error(
    "  piro repos create <id> --name <name> --github-repository <owner/repo> [--description <desc>]",
  );
  console.error("  piro repos link <id> --github-repository <owner/repo>");
  console.error("  piro repos use <id>");
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
        const sampleCount = sampleCountStr
          ? parseInt(sampleCountStr, 10)
          : undefined;
        await sourcesCreate(id, {
          name,
          description: opt(rest, "description"),
          sampleCount,
        });
        break;
      }
      case "generate": {
        const id = arg(rest, 0);
        if (!id) usage("source id is required");
        await sourcesGenerate(id);
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

  case "benchmarks":
    switch (verb) {
      case "list": {
        await benchmarksList();
        break;
      }
      case "create": {
        const id = arg(rest, 0);
        if (!id) usage("benchmark id is required");
        const name = opt(rest, "name");
        if (!name) usage("--name is required for create");
        await benchmarksCreate(id, {
          name,
          source: opt(rest, "source"),
          description: opt(rest, "description"),
        });
        break;
      }
      case "run": {
        const id = arg(rest, 0);
        if (!id) usage("benchmark id is required");
        await benchmarksRun(id, { model: opt(rest, "model") });
        break;
      }
      case "pull": {
        const id = arg(rest, 0);
        if (!id) usage("benchmark id is required");
        await benchmarksPull(id, { out: opt(rest, "out") });
        break;
      }
      case "push": {
        const id = arg(rest, 0);
        if (!id) usage("benchmark id is required");
        await benchmarksPush(id, { file: opt(rest, "file") });
        break;
      }
      default:
        usage(`unknown benchmarks verb: ${verb}`);
    }
    break;

  case "repos":
  case "repositories":
    switch (verb) {
      case "list": {
        await reposList();
        break;
      }
      case "create": {
        const id = arg(rest, 0);
        if (!id) usage("repo id is required");
        const name = opt(rest, "name");
        if (!name) usage("--name is required for create");
        const githubRepository = opt(rest, "github-repository");
        if (!githubRepository)
          usage("--github-repository is required for create");
        await reposCreate(id, {
          name,
          githubRepository,
          description: opt(rest, "description"),
        });
        break;
      }
      case "link": {
        const id = arg(rest, 0);
        if (!id) usage("repo id is required");
        const githubRepository = opt(rest, "github-repository");
        if (!githubRepository)
          usage("--github-repository is required for link");
        await reposLink(id, githubRepository);
        break;
      }
      case "use": {
        const id = arg(rest, 0);
        if (!id) usage("repo id is required");
        await reposUse(id);
        break;
      }
      default:
        usage(`unknown repos verb: ${verb}`);
    }
    break;

  default:
    usage(`unknown subject: ${subject}`);
}
