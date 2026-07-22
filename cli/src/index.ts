#!/usr/bin/env node
/**
 * piro — CLI for the Piro personal intelligence platform.
 *
 * Usage:
 *   piro classes serialize <id> [--bust]
 *   piro classes pull <id> [--out <file>]
 *   piro classes push <id> [--file <file>]
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
  reposList,
  reposCreate,
  reposLink,
  reposUse,
} from "./commands/repos.js";
import { sourcesList, sourcesGet, sourcesGenerate } from "./commands/sources.js";
import { datasetHead, datasetsList, datasetsGet } from "./commands/datasets.js";

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
  console.error("  piro repos list");
  console.error(
    "  piro repos create <id> --name <name> --github-repository <owner/repo> [--description <desc>]",
  );
  console.error("  piro repos link <id> --github-repository <owner/repo>");
  console.error("  piro repos use <id>");
  console.error("  piro sources list");
  console.error("  piro sources get <name>");
  console.error("  piro sources generate <name>");
  console.error("  piro datasets list");
  console.error("  piro datasets get <id>");
  console.error("  piro dataset head <id>");
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
      case "list":
        await sourcesList();
        break;
      case "get": {
        const name = arg(rest, 0);
        if (!name) usage("source name is required");
        await sourcesGet(name);
        break;
      }
      case "generate": {
        const name = arg(rest, 0);
        if (!name) usage("source name is required");
        await sourcesGenerate(name);
        break;
      }
      default:
        usage(`unknown sources verb: ${verb}`);
    }
    break;

  case "dataset":
    switch (verb) {
      case "head": {
        const id = arg(rest, 0);
        if (!id) usage("dataset id is required");
        await datasetHead(id);
        break;
      }
      default:
        usage(`unknown dataset verb: ${verb}`);
    }
    break;

  case "datasets":
    switch (verb) {
      case "list":
        await datasetsList();
        break;
      case "get": {
        const id = arg(rest, 0);
        if (!id) usage("dataset id is required");
        await datasetsGet(id);
        break;
      }
      default:
        usage(`unknown datasets verb: ${verb}`);
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
