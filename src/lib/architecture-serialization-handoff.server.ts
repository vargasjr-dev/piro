import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const HANDOFF_TTL_MS = 5 * 60 * 1000;

type HandoffPayload = {
  username: string;
  repository: string;
  architecture: string;
  sourceHash: string;
  expiresAt: number;
};

function secret() {
  const value = process.env.BETTER_AUTH_SECRET;
  if (!value) throw new Error("BETTER_AUTH_SECRET is not configured");
  return value;
}

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signature(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function createArchitectureSerializationHandoff({
  username,
  repository,
  architecture,
  source,
}: Omit<HandoffPayload, "sourceHash" | "expiresAt"> & { source: string }) {
  const payload: HandoffPayload = {
    username,
    repository,
    architecture,
    sourceHash: createHash("sha256").update(source).digest("hex"),
    expiresAt: Date.now() + HANDOFF_TTL_MS,
  };
  const encoded = encode(JSON.stringify(payload));
  return `${encoded}.${signature(encoded)}`;
}

export function verifyArchitectureSerializationHandoff({
  token,
  username,
  repository,
  architecture,
  source,
}: {
  token: string;
  username: string;
  repository: string;
  architecture: string;
  source: string;
}) {
  const [encoded, providedSignature] = token.split(".");
  if (!encoded || !providedSignature) return false;

  const expectedSignature = signature(encoded);
  const expectedBytes = Buffer.from(expectedSignature);
  const providedBytes = Buffer.from(providedSignature);
  if (
    expectedBytes.length !== providedBytes.length ||
    !timingSafeEqual(expectedBytes, providedBytes)
  ) {
    return false;
  }

  let payload: HandoffPayload;
  try {
    payload = JSON.parse(decode(encoded)) as HandoffPayload;
  } catch {
    return false;
  }

  return (
    payload.username === username &&
    payload.repository === repository &&
    payload.architecture === architecture &&
    payload.expiresAt > Date.now() &&
    payload.sourceHash === createHash("sha256").update(source).digest("hex")
  );
}
