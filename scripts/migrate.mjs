import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

console.log("Running migrations...");

await sql`
  CREATE TABLE IF NOT EXISTS "user" (
    "id" text PRIMARY KEY,
    "name" text NOT NULL,
    "email" text NOT NULL UNIQUE,
    "emailVerified" boolean NOT NULL DEFAULT false,
    "image" text,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now()
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS "session" (
    "id" text PRIMARY KEY,
    "expiresAt" timestamp NOT NULL,
    "token" text NOT NULL UNIQUE,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now(),
    "ipAddress" text,
    "userAgent" text,
    "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS "account" (
    "id" text PRIMARY KEY,
    "accountId" text NOT NULL,
    "providerId" text NOT NULL,
    "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "accessToken" text,
    "refreshToken" text,
    "idToken" text,
    "accessTokenExpiresAt" timestamp,
    "refreshTokenExpiresAt" timestamp,
    "scope" text,
    "password" text,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now()
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS "verification" (
    "id" text PRIMARY KEY,
    "identifier" text NOT NULL,
    "value" text NOT NULL,
    "expiresAt" timestamp NOT NULL,
    "createdAt" timestamp DEFAULT now(),
    "updatedAt" timestamp DEFAULT now()
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS "integration" (
    "id" text PRIMARY KEY,
    "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "provider" text NOT NULL,
    "accessToken" text,
    "refreshToken" text,
    "expiresAt" timestamp,
    "providerUserId" text,
    "providerUsername" text,
    "status" text NOT NULL DEFAULT 'active',
    "lastSyncAt" timestamp,
    "itemCount" integer NOT NULL DEFAULT 0,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now()
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS "knowledge_item" (
    "id" text PRIMARY KEY,
    "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "integrationId" text NOT NULL REFERENCES "integration"("id") ON DELETE CASCADE,
    "provider" text NOT NULL,
    "itemType" text NOT NULL,
    "externalId" text NOT NULL,
    "content" text NOT NULL,
    "contentMeta" text,
    "itemCreatedAt" timestamp,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    CONSTRAINT "ki_integration_external" UNIQUE ("integrationId", "externalId")
  )
`;

console.log("Done — all tables created.");
