const child = Bun.spawn(
  [process.execPath, "scripts/data-migrations/report-bucket-usage.ts"],
  { stdout: "inherit", stderr: "inherit" },
);

const exitCode = await child.exited;
if (exitCode !== 0) {
  throw new Error(`Bucket usage report exited with status ${exitCode}`);
}
