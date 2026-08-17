#!/usr/bin/env node
/**
 * piro — CLI for the Piro personal intelligence platform.
 *
 * Usage:
 *   piro models deploy <model-id>
  piro models delete <model-id> --yes
 *
 * Auth:
 *   PIRO_API_KEY=<key>  (required)
 *   PIRO_BASE_URL=<url> (optional, defaults to https://trainpiro.app)
 */

import { datasetHead, datasetsGet, datasetsList } from "./commands/datasets.js";
import {
  sourcesGenerate,
  sourcesGet,
  sourcesList,
} from "./commands/sources.js";
import { architectureTrain } from "./commands/architectures.js";
import { benchmarksEval } from "./commands/benchmarks.js";
import { evalsGet, evalsList } from "./commands/evals.js";
import {
  trainingEstimate,
  trainingGet,
  trainingList,
  trainingResume,
} from "./commands/training.js";
import { modelsDelete, modelsDeploy, modelsUpload } from "./commands/models.js";

const [, , subject, verb, ...rest] = process.argv;

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
  console.error("  piro sources list");
  console.error("  piro sources get <name>");
  console.error("  piro sources generate <name>");
  console.error("  piro datasets list");
  console.error("  piro datasets get <id>");
  console.error("  piro dataset head <id>");
  console.error(
    "  piro architecture train <name> --dataset <id> [--max-steps <n>] [--name <model-name>] [--debug]",
  );
  console.error(
    "  piro benchmarks eval --dataset <id> --target <key-or-model-id> [--target <key-or-model-id>] [--episodes <n>]",
  );
  console.error("  piro evals list");
  console.error("  piro evals get <id>");
  console.error("  piro models deploy <model-id>");
  console.error("  piro models delete <model-id> --yes");
  console.error(
    "  piro models upload <huggingface-model> --revision <revision>",
  );
  console.error("  piro training list");
  console.error("  piro training get <id>");
  console.error("  piro training resume <id> [--debug]");
  console.error(
    "  piro training estimate [--max-steps <n>] [--seconds-per-step <n>] [--gpu <type>]",
  );
  process.exit(msg ? 1 : 0);
}

if (!subject || !verb) usage();

switch (subject) {
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
        const dataset = opt(rest, "dataset");
        const targets = rest
          .flatMap((value, index) =>
            value === "--target" && rest[index + 1] ? [rest[index + 1]!] : [],
          )
          .filter((value) => !value.startsWith("--"));
        const episodesValue = opt(rest, "episodes");
        const episodes = episodesValue
          ? Number.parseInt(episodesValue, 10)
          : undefined;
        if (!dataset) usage("--dataset is required");
        if (targets.length === 0) usage("at least one --target is required");
        if (episodesValue && (!Number.isInteger(episodes) || episodes! < 1))
          usage("--episodes must be a positive integer");
        await benchmarksEval({ dataset, targets, episodes });
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
      case "delete": {
        const modelId = arg(rest, 0);
        if (!modelId) usage("model id is required");
        if (!rest.includes("--yes"))
          usage("--yes is required to delete a model");
        await modelsDelete(modelId);
        break;
      }
      case "upload": {
        const model = arg(rest, 0);
        if (!model) usage("Hugging Face model is required");
        const revision = opt(rest, "revision");
        if (!revision) usage("--revision is required for upload");
        await modelsUpload(model, revision);
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
      case "resume": {
        const id = arg(rest, 0);
        if (!id) usage("training run id is required");
        await trainingResume(id, { debug: rest.includes("--debug") });
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
          debug: rest.includes("--debug"),
        });
        break;
      }
      default:
        usage(`unknown architecture verb: ${verb}`);
    }
    break;

  default:
    usage(`unknown subject: ${subject}`);
}
