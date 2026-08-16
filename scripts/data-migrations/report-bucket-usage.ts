import { appendFileSync } from "node:fs";

import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

const BUCKET = "piro-kb";
const MAX_SUMMARY_ROWS = 100;

type Usage = { objects: number; bytes: number };
type ObjectRecord = { key: string; size: number };

function createClient(): S3Client {
  const endpoint = process.env.BUCKET_ENDPOINT_URL;
  const accessKeyId = process.env.BUCKET_KEY_ID;
  const secretAccessKey = process.env.BUCKET_APPLICATION_SECRET;
  const missing = [
    !endpoint && "BUCKET_ENDPOINT_URL",
    !accessKeyId && "BUCKET_KEY_ID",
    !secretAccessKey && "BUCKET_APPLICATION_SECRET",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Storage credentials missing: ${missing.join(", ")}`);
  }

  return new S3Client({
    region: "auto",
    endpoint: endpoint!.startsWith("http") ? endpoint : `https://${endpoint}`,
    credentials: {
      accessKeyId: accessKeyId!,
      secretAccessKey: secretAccessKey!,
    },
    forcePathStyle: true,
  });
}

function directoryForKey(key: string): string {
  const parts = key.split("/").filter(Boolean);
  if (parts.length === 0) return "<root>";

  if (parts[0] === "users" && parts[2] === "datasets") {
    return parts.slice(0, 3).join("/");
  }
  if (parts[0] === "models" && parts.length >= 3) {
    return parts.slice(0, 3).join("/");
  }
  return parts.slice(0, 2).join("/");
}

function formatBytes(bytes: number): string {
  const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
  let amount = bytes;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return unit === 0
    ? `${bytes.toLocaleString("en-US")} B`
    : `${amount.toFixed(2)} ${units[unit]}`;
}

async function listObjects(client: S3Client): Promise<ObjectRecord[]> {
  const objects: ObjectRecord[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        ContinuationToken: continuationToken,
      }),
    );
    for (const object of response.Contents ?? []) {
      if (object.Key) objects.push({ key: object.Key, size: object.Size ?? 0 });
    }
    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return objects;
}

function aggregate(objects: ObjectRecord[]): {
  total: Usage;
  directories: Map<string, Usage>;
} {
  const total: Usage = { objects: 0, bytes: 0 };
  const directories = new Map<string, Usage>();

  for (const object of objects) {
    total.objects += 1;
    total.bytes += object.size;
    const directory = directoryForKey(object.key);
    const usage = directories.get(directory) ?? { objects: 0, bytes: 0 };
    usage.objects += 1;
    usage.bytes += object.size;
    directories.set(directory, usage);
  }

  return { total, directories };
}

function sortedDirectories(
  directories: Map<string, Usage>,
): Array<[string, Usage]> {
  return [...directories.entries()].sort(
    ([leftName, left], [rightName, right]) =>
      right.bytes - left.bytes || leftName.localeCompare(rightName),
  );
}

function render(total: Usage, directories: Map<string, Usage>): string {
  const lines = [
    `Bucket usage: ${BUCKET}`,
    `Objects: ${total.objects.toLocaleString("en-US")}    Storage: ${formatBytes(total.bytes)}`,
    "",
    `${"Directory".padEnd(52)} ${"Objects".padStart(10)} ${"Storage".padStart(16)}`,
    `${"-".repeat(52)} ${"-".repeat(10)} ${"-".repeat(16)}`,
  ];

  for (const [directory, usage] of sortedDirectories(directories)) {
    lines.push(
      `${directory.padEnd(52)} ${usage.objects.toLocaleString("en-US").padStart(10)} ${formatBytes(usage.bytes).padStart(16)}`,
    );
  }
  return lines.join("\n");
}

function writeStepSummary(total: Usage, directories: Map<string, Usage>): void {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;

  const rows = sortedDirectories(directories).slice(0, MAX_SUMMARY_ROWS);
  const lines = [
    "## Piro bucket usage",
    "",
    `Bucket: \`${BUCKET}\`  `,
    `Total: **${total.objects.toLocaleString("en-US")} objects**, **${formatBytes(total.bytes)}**`,
    "",
    "| Directory | Objects | Storage |",
    "| --- | ---: | ---: |",
    ...rows.map(
      ([directory, usage]) =>
        `| \`${directory}\` | ${usage.objects.toLocaleString("en-US")} | ${formatBytes(usage.bytes)} |`,
    ),
  ];
  if (directories.size > MAX_SUMMARY_ROWS) {
    lines.push(
      `\nShowing the ${MAX_SUMMARY_ROWS} largest directories by storage.`,
    );
  }
  appendFileSync(summaryPath, `${lines.join("\n")}\n`);
}

const objects = await listObjects(createClient());
const { total, directories } = aggregate(objects);
const report = {
  bucket: BUCKET,
  total,
  directories: sortedDirectories(directories).map(([directory, usage]) => ({
    directory,
    ...usage,
  })),
};

console.log(render(total, directories));
console.log("\nJSON:");
console.log(JSON.stringify(report, null, 2));
writeStepSummary(total, directories);
