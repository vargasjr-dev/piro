import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { stripe, PRO_PRICE_ID } from "~/lib/stripe";
import { db } from "../../../../../data/db";
import { subscription } from "../../../../../data/schema";
import { eq } from "drizzle-orm";

// POST /api/stripe/checkout
// Creates a Stripe Checkout session for the Pro plan.
// If the user already has an active subscription, returns the Stripe
// customer portal URL instead so they can manage billing.
export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { user } = session;
  const origin = (await headers()).get("origin") ?? "https://trainpiro.app";

  // Check for existing subscription
  const [existing] = await db
    .select()
    .from(subscription)
    .where(eq(subscription.userId, user.id))
    .limit(1);

  if (existing?.status === "active" || existing?.status === "trialing") {
    // Already subscribed — send to customer portal to manage/cancel
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: existing.stripeCustomerId,
      return_url: `${origin}/dashboard`,
    });
    return Response.json({ url: portalSession.url });
  }

  // Create new checkout session
  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: PRO_PRICE_ID, quantity: 1 }],
    customer_email: user.email,
    metadata: { userId: user.id },
    success_url: `${origin}/dashboard?upgraded=1`,
    cancel_url: `${origin}/dashboard`,
    subscription_data: {
      metadata: { userId: user.id },
    },
  });

  return Response.json({ url: checkoutSession.url });
}
