import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-06-24.dahlia",
});

/** The price ID for the $100/mo Pro plan — set in Stripe dashboard, stored in env. */
export const PRO_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID!;

/** How many training runs the Pro plan includes per billing period. */
export const PRO_TRAINING_RUN_LIMIT = 2;
