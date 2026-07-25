import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { getStripe, getProPriceId } from "~/lib/stripe";
import { useStripeTestMode } from "~/lib/admin";
import { db } from "../../../../../data/db";
import { subscription } from "../../../../../data/schema";
import { eq } from "drizzle-orm";

// POST /api/stripe/checkout
// Creates a Stripe Checkout session for the Piro Pro plan.
// Admins route through the test Stripe account.
// If the user already has an active subscription, returns the Stripe
// customer portal URL instead so they can manage billing.
export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { user } = session;
  const origin = (await headers()).get("origin") ?? "https://trainpiro.app";
  const useTestMode = useStripeTestMode(session);
  const stripe = getStripe(useTestMode);

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
      return_url: `${origin}/models`,
    });
    return Response.json({ url: portalSession.url });
  }

  // Resolve the Pro price ID from Stripe (cached, by lookup_key)
  const priceId = await getProPriceId(useTestMode);

  // Create new checkout session
  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: user.email,
    metadata: { userId: user.id, testMode: useTestMode ? "1" : "0" },
    success_url: `${origin}/models?upgraded=1`,
    cancel_url: `${origin}/upgrade`,
    subscription_data: {
      metadata: { userId: user.id, testMode: useTestMode ? "1" : "0" },
    },
  });

  return Response.json({ url: checkoutSession.url });
}