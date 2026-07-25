#!/usr/bin/env node
/**
 * piro — CLI for the Piro personal intelligence platform.
 *
 * Usage:
 *   piro classes serialize <id> [--bust]
 *   piro classes pull <id> [--out <file>]
 *   piro classes push <id> [--file <file>]
 *   piro models deploy <model-id>
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
import {
  sourcesList,
  sourcesGet,
  sourcesGenerate,
} from "./commands/sources.js";
import { datasetHead, datasetsList, datasetsGet } from "./commands/datasets.js";
import { architectureTrain } from "./commands/architectures.js";
import { benchmarksEval } from "./commands/benchmarks.js";
import { evalsGet, evalsList } from "./commands/evals.js";
import {
  trainingEstimate,
  trainingGet,
  trainingList,
} from "./commands/training.js";
import { modelsDeploy } from "./commands/models.js";

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
  console.error(
    "  piro architecture train <name> --dataset <id> [--max-steps <n>] [--name <model-name>]",
  );
  console.error("  piro benchmarks eval <name>");
  console.error("  piro evals list");
  console.error("  piro evals get <id>");
  console.error("  piro models deploy <model-id>");
  console.error("  piro training list");
  console.error("  piro training get <id>");
  console.error(
    "  piro training estimate [--max-steps <n>] [--seconds-per-step <n>] [--gpu <type>]",
  );
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

  case "benchmarks":
    switch (verb) {
      case "eval": {
        const name = arg(rest, 0);
        if (!name) usage("benchmark name is required");
        await benchmarksEval(name);
        break;
      }
      default:
        usage(`unknown benchmarks verb: ${verb}`);
    }
    break;

  case "evals":
    switch (verb) {
      case "list":
        await evalsList();
        break;
      case "get": {
        const id = arg(rest, 0);
        if (!id) usage("evaluation id is required");
        await evalsGet(id);
        break;
      }
      default:
        usage(`unknown evals verb: ${verb}`);
    }
    break;

  case "models":
    switch (verb) {
      case "deploy": {
        const modelId = arg(rest, 0);
        if (!modelId) usage("model id is required");
        await modelsDeploy(modelId);
        break;
      }
      default:
        usage(`unknown models verb: ${verb}`);
    }
    break;

  case "training":
    switch (verb) {
      case "list":
        await trainingList();
        break;
      case "get": {
        const id = arg(rest, 0);
        if (!id) usage("training run id is required");
        await trainingGet(id);
        break;
      }
      case "estimate":
        await trainingEstimate({
          maxSteps: opt(rest, "max-steps"),
          secondsPerStep: opt(rest, "seconds-per-step"),
          gpu: opt(rest, "gpu"),
        });
        break;
      default:
        usage(`unknown training verb: ${verb}`);
    }
    break;

  case "architecture":
    switch (verb) {
      case "train": {
        const name = arg(rest, 0);
        if (!name) usage("architecture name is required");
        const dataset = opt(rest, "dataset");
        if (!dataset) usage("--dataset is required for train");
        await architectureTrain(name, {
          dataset,
          maxSteps: opt(rest, "max-steps"),
          modelName: opt(rest, "name"),
        });
        break;
      }
      default:
        usage(`unknown architecture verb: ${verb}`);
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
