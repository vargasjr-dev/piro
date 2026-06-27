import { getStripe, PRO_TRAINING_RUN_LIMIT } from "~/lib/stripe";
import { db } from "../../../../../data/db";
import { subscription } from "../../../../../data/schema";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";

const liveWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const testWebhookSecret = process.env.STRIPE_TEST_WEBHOOK_SECRET;

// POST /api/stripe/webhook
// Same endpoint handles BOTH live and test webhooks (try live first,
// fall back to test). This lets admins exercise the full payment flow
// in test mode using the same URL.
export async function POST(req: Request) {
  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) return new Response("Missing stripe-signature header", { status: 400 });
  if (!liveWebhookSecret && !testWebhookSecret) {
    console.error("No Stripe webhook secret configured");
    return new Response("Webhook not configured", { status: 500 });
  }

  let event: Stripe.Event;

  if (liveWebhookSecret) {
    try {
      event = getStripe(false).webhooks.constructEvent(rawBody, sig, liveWebhookSecret);
    } catch {
      if (!testWebhookSecret) {
        console.error("Webhook signature verification failed (live)");
        return new Response("Invalid signature", { status: 400 });
      }
      try {
        event = getStripe(true).webhooks.constructEvent(rawBody, sig, testWebhookSecret);
      } catch (err) {
        console.error("Webhook signature verification failed (live + test):", err);
        return new Response("Invalid signature", { status: 400 });
      }
    }
  } else {
    try {
      event = getStripe(true).webhooks.constructEvent(rawBody, sig, testWebhookSecret!);
    } catch (err) {
      console.error("Webhook signature verification failed (test only):", err);
      return new Response("Invalid signature", { status: 400 });
    }
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const checkoutSession = event.data.object as Stripe.Checkout.Session;
      if (checkoutSession.mode !== "subscription") break;

      const userId = checkoutSession.metadata?.userId;
      if (!userId) break;

      // Use the same Stripe client that produced this event (test or live)
      const isTestEvent = checkoutSession.metadata?.testMode === "1";
      const stripeSubscription = await getStripe(isTestEvent).subscriptions.retrieve(
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

async function upsertSubscription(userId: string, sub: Stripe.Subscription) {
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