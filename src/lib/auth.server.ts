import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../../data/db";
import { user, session, account, verification } from "../../data/schema";
import { TRUSTED_ORIGINS } from "./domains";

const socialProviders = (() => {
  const providers: Record<string, { clientId: string; clientSecret: string }> = {};

  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    providers.github = {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    };
  }

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.google = {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    };
  }

  return Object.keys(providers).length > 0 ? providers : undefined;
})();

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    // Pass schema explicitly so better-auth doesn't need to introspect the Proxy
    schema: { user, session, account, verification },
  }),
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "user",
        input: false, // not settable via signup — admins are promoted manually
      },
    },
  },
  account: {
    // Skip the state cookie check on OAuth callbacks — the state is still
    // validated against the verification table in the database, so this is
    // secure. The cookie check fails because the state cookie set during the
    // link-social POST is sometimes not carried back across the GitHub
    // redirect, causing a state_security_mismatch error.
    skipStateCookieCheck: true,
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    requireEmailVerification: false,
  },
  socialProviders,
  trustedOrigins: [
    ...TRUSTED_ORIGINS,
    ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : []),
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
  ],
});
