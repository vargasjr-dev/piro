import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_BASE_URL, resolveConfig } from "./client.js";

const originalCwd = process.cwd();
const originalApiKey = process.env.PIRO_API_KEY;
const originalBaseUrl = process.env.PIRO_BASE_URL;

const tempRoot = mkdtempSync(join(tmpdir(), "piro-cli-dotenv-"));
writeFileSync(
  join(tempRoot, ".env"),
  'PIRO_API_KEY="from-dotenv"\nPIRO_BASE_URL=https://dotenv.example/\n',
);
process.chdir(tempRoot);
delete process.env.PIRO_API_KEY;
delete process.env.PIRO_BASE_URL;

const fromDotenv = resolveConfig();
assert.deepEqual(fromDotenv, {
  apiKey: "from-dotenv",
  baseUrl: "https://dotenv.example",
});

process.env.PIRO_API_KEY = "from-process";
process.env.PIRO_BASE_URL = "https://process.example/";
const fromProcess = resolveConfig();
assert.deepEqual(fromProcess, {
  apiKey: "from-process",
  baseUrl: "https://process.example",
});

process.chdir(originalCwd);
if (originalApiKey === undefined) delete process.env.PIRO_API_KEY;
else process.env.PIRO_API_KEY = originalApiKey;
if (originalBaseUrl === undefined) delete process.env.PIRO_BASE_URL;
else process.env.PIRO_BASE_URL = originalBaseUrl;

assert.equal(DEFAULT_BASE_URL, "https://trainpiro.app");
console.log("client dotenv tests passed");
