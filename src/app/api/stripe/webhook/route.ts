import { stripe, PRO_TRAINING_RUN_LIMIT } from "~/lib/stripe";
import { db } from "../../../../../data/db";
import { subscription } from "../../../../../data/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";

// POST /api/stripe/webhook
// Handles Stripe lifecycle events to keep the subscription table in sync.
export async function POST(req: Request) {
  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return new Response("Missing signature", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch {
    return new Response("Webhook signature verification failed", { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const checkoutSession = event.data.object as Stripe.Checkout.Session;
      if (checkoutSession.mode !== "subscription") break;

      const userId = checkoutSession.metadata?.userId;
      if (!userId) break;

      const stripeSubscription = await stripe.subscriptions.retrieve(
        checkoutSession.subscription as string
      );

      await upsertSubscription(userId, stripeSubscription);
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const stripeSubscription = event.data.object as Stripe.Subscription;
      const userId = stripeSubscription.metadata?.userId;
      if (!userId) break;
      await upsertSubscription(userId, stripeSubscription);
      break;
    }

    // New billing period started — reset the training run counter
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const stripeSubscriptionId = (invoice as { subscription?: string }).subscription;
      if (!stripeSubscriptionId) break;

      // Only reset on renewal (billing_reason = 'subscription_cycle')
      if ((invoice as { billing_reason?: string }).billing_reason !== "subscription_cycle") break;

      await db
        .update(subscription)
        .set({ trainingRunsUsed: 0, updatedAt: new Date() })
        .where(eq(subscription.id, stripeSubscriptionId));
      break;
    }
  }

  return new Response("ok", { status: 200 });
}

async function upsertSubscription(
  userId: string,
  sub: Stripe.Subscription
) {
  const periodStart = new Date((sub.items.data[0].current_period_start ?? 0) * 1000);
  const periodEnd   = new Date((sub.items.data[0].current_period_end   ?? 0) * 1000);

  const [existing] = await db
    .select({ id: subscription.id })
    .from(subscription)
    .where(eq(subscription.userId, userId))
    .limit(1);

  if (existing) {
    await db
      .update(subscription)
      .set({
        id: sub.id,
        stripeCustomerId: sub.customer as string,
        status: sub.status,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        updatedAt: new Date(),
      })
      .where(eq(subscription.userId, userId));
  } else {
    await db.insert(subscription).values({
      id: sub.id,
      userId,
      stripeCustomerId: sub.customer as string,
      planId: "pro",
      status: sub.status,
      trainingRunsUsed: 0,
      trainingRunsLimit: PRO_TRAINING_RUN_LIMIT,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
