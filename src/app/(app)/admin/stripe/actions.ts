"use server";

import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { requireAdmin } from "~/lib/admin";
import { getStripe, getProPriceId } from "~/lib/stripe";
import type Stripe from "stripe";

// ── Constants ─────────────────────────────────────────────────────────────────

const PRO_PRODUCT_NAME = "Piro Pro";
const PRO_PRODUCT_DESCRIPTION =
  "Train your own tiny ML model on your data. 2 training runs/month, unlimited inference, Architecture Copilot (GLM 5.2), benchmark suite, model versioning.";
const PRO_PRICE_AMOUNT = 10000; // $100.00 in cents
const PRO_PRICE_CURRENCY = "usd";
const PRO_PRICE_LOOKUP_KEY = "piro_pro_monthly";

// ── Types ────────────────────────────────────────────────────────────────────

export type StripeConfigStatus = {
  connected: boolean;
  mode: "live" | "test";
  product: {
    exists: boolean;
    id?: string;
    name?: string;
    active?: boolean;
  };
  price: {
    exists: boolean;
    id?: string;
    amount?: number;
    currency?: string;
    interval?: string;
    lookupKey?: string;
    active?: boolean;
  };
  error?: string;
};

// ── Verify Config ─────────────────────────────────────────────────────────────

export async function verifyStripeConfig(useTestMode = false): Promise<StripeConfigStatus> {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  requireAdmin(session);

  const result: StripeConfigStatus = {
    connected: false,
    mode: useTestMode ? "test" : "live",
    product: { exists: false },
    price: { exists: false },
  };

  try {
    const stripe = getStripe(useTestMode);

    // Verify connection by listing products (will throw if key is invalid)
    const products = await stripe.products.list({ active: true, limit: 100 });
    result.connected = true;

    // Check for Piro Pro product
    const product = products.data.find((p: Stripe.Product) => p.name === PRO_PRODUCT_NAME);
    if (product) {
      result.product = {
        exists: true,
        id: product.id,
        name: product.name,
        active: product.active,
      };

      const prices = await stripe.prices.list({
        product: product.id,
        active: true,
        type: "recurring",
        limit: 10,
      });

      const monthlyPrice = prices.data.find(
        (p: Stripe.Price) =>
          p.recurring?.interval === "month" &&
          p.unit_amount === PRO_PRICE_AMOUNT &&
          p.currency === PRO_PRICE_CURRENCY
      );

      if (monthlyPrice) {
        result.price = {
          exists: true,
          id: monthlyPrice.id,
          amount: monthlyPrice.unit_amount ?? undefined,
          currency: monthlyPrice.currency,
          interval: monthlyPrice.recurring?.interval,
          lookupKey: monthlyPrice.lookup_key ?? undefined,
          active: monthlyPrice.active,
        };
      }
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : "Unknown error";
  }

  return result;
}

// ── Bootstrap Products ────────────────────────────────────────────────────────

export async function bootstrapStripeProducts(useTestMode = false): Promise<{
  success: boolean;
  message: string;
  priceId?: string;
}> {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  requireAdmin(session);

  try {
    const stripe = getStripe(useTestMode);

    // Find or create product
    const products = await stripe.products.list({ active: true, limit: 100 });
    let product = products.data.find((p: Stripe.Product) => p.name === PRO_PRODUCT_NAME);

    if (!product) {
      product = await stripe.products.create({
        name: PRO_PRODUCT_NAME,
        description: PRO_PRODUCT_DESCRIPTION,
      });
    }

    // Find or create price
    const prices = await stripe.prices.list({
      product: product.id,
      active: true,
      type: "recurring",
      limit: 10,
    });

    let price = prices.data.find(
      (p: Stripe.Price) =>
        p.recurring?.interval === "month" &&
        p.unit_amount === PRO_PRICE_AMOUNT &&
        p.currency === PRO_PRICE_CURRENCY
    );

    if (!price) {
      price = await stripe.prices.create({
        product: product.id,
        unit_amount: PRO_PRICE_AMOUNT,
        currency: PRO_PRICE_CURRENCY,
        recurring: { interval: "month" },
        lookup_key: PRO_PRICE_LOOKUP_KEY,
      });
    }

    // Verify the lookup works end-to-end
    const resolvedId = await getProPriceId(useTestMode);

    return {
      success: true,
      message: `Product "${product.name}" (${product.id}) with price $${PRO_PRICE_AMOUNT / 100}/mo (${price.id}) ready. Lookup resolves to: ${resolvedId}`,
      priceId: resolvedId,
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}