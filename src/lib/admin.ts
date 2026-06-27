/**
 * Admin utilities — role checking and session helpers.
 *
 * The `role` field lives on the user table (data/schema.ts) and is
 * exposed in the session via BetterAuth's additionalFields config.
 * Values: "user" (default) | "admin".
 *
 * Admins are routed through Stripe test mode for billing flows so they
 * can exercise the full payment flow without touching live billing.
 */

import type { auth } from "./auth.server";

type Session = Awaited<ReturnType<typeof auth.api.getSession>>;
type User = NonNullable<Session>["user"];

export function isAdmin(session: Session): boolean {
  if (!session?.user) return false;
  return (session.user as User & { role?: string }).role === "admin";
}

export function requireAdmin(session: Session): asserts session is NonNullable<Session> {
  if (!isAdmin(session)) {
    throw new Error("Forbidden: admin access required");
  }
}

/** True if the given session should use Stripe test mode. Admins only. */
export function useStripeTestMode(session: Session): boolean {
  return isAdmin(session);
}