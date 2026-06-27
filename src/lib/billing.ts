import { db } from "../../data/db";
import { subscription } from "../../data/schema";
import { eq } from "drizzle-orm";

export type Subscription = typeof subscription.$inferSelect;

/** Returns the user's subscription row, or null if they have never subscribed. */
export async function getSubscription(userId: string): Promise<Subscription | null> {
  const [row] = await db
    .select()
    .from(subscription)
    .where(eq(subscription.userId, userId))
    .limit(1);
  return row ?? null;
}

/** True if the subscription is in a state that allows full feature access. */
export function isActive(sub: Subscription | null): boolean {
  return sub?.status === "active" || sub?.status === "trialing";
}

/** True if the user has training runs remaining in their current billing period. */
export function hasTrainingRunsRemaining(sub: Subscription | null): boolean {
  if (!isActive(sub)) return false;
  return (sub!.trainingRunsUsed ?? 0) < (sub!.trainingRunsLimit ?? 0);
}

/** Human-readable training run quota string, e.g. "1 of 2 used". */
export function trainingRunQuota(sub: Subscription | null): string {
  if (!sub) return "0 of 0 used";
  return `${sub.trainingRunsUsed} of ${sub.trainingRunsLimit} used this period`;
}
