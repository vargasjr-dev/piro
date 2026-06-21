/**
 * src/lib/domains.ts
 *
 * Single source of truth for every domain Piro is served from.
 *
 * Primary domain history:
 *   piro-henna.vercel.app  — original Vercel preview URL
 *   piro.vargasjr.dev      — first custom domain
 *   trainpiro.app          — current primary (acquired June 2026)
 *   piro.app               — future primary (acquire when available)
 */

/** The canonical public URL — used as the default for BETTER_AUTH_URL fallbacks. */
export const PRIMARY_DOMAIN = "https://trainpiro.app";

/**
 * Every origin that better-auth and Next.js server actions should accept.
 * Add new domains here; remove old ones once traffic has fully migrated.
 */
export const TRUSTED_ORIGINS = [
  "http://localhost:3000",
  "https://trainpiro.app",
  "https://piro.vargasjr.dev",
  "https://piro-henna.vercel.app",
] as const;
