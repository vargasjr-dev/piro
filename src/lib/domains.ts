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

/**
 * Every origin that better-auth and Next.js server actions should accept.
 * The first entry is the primary domain — used as the BETTER_AUTH_URL fallback.
 * Add new domains here; remove old ones once traffic has fully migrated.
 *
 * To promote a new primary (e.g. piro.app):
 *   1. Move it to index 0
 *   2. Keep trainpiro.app in the list until traffic has migrated
 */
export const TRUSTED_ORIGINS = [
  "https://trainpiro.app",
  "http://localhost:3000",
  "https://piro.vargasjr.dev",
  "https://piro-henna.vercel.app",
] as const;

/** The canonical public URL — always the first entry in TRUSTED_ORIGINS. */
export const PRIMARY_DOMAIN = TRUSTED_ORIGINS[0];
