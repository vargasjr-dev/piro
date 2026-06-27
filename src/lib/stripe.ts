import Stripe from "stripe";

// ── Stripe singletons (lazy + dual mode) ──────────────────────────────────────
// Same pattern as vellymon — two clients, lazy-initialized, keyed by useTestMode.
// Admins use the test client so they can exercise the full payment flow
// without touching live billing.
let _stripe:     Stripe | null = null;
let _stripeTest: Stripe | null = null;

export function getStripe(useTestMode = false): Stripe {
  if (useTestMode) {
    if (!_stripeTest) {
      const key = process.env.STRIPE_TEST_SECRET_KEY;
      if (!key) throw new Error("STRIPE_TEST_SECRET_KEY environment variable is required");
      _stripeTest = new Stripe(key, { apiVersion: "2026-06-24.dahlia" });
    }
    return _stripeTest;
  }

  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY environment variable is required");
    _stripe = new Stripe(key, { apiVersion: "2026-06-24.dahlia" });
  }
  return _stripe;
}

// ── Price lookup ──────────────────────────────────────────────────────────────
// We don't hardcode price IDs in env vars — we look them up by `lookup_key`.
// This works across test/live without config changes, and lets us rotate
// prices without redeploying code.

const PRO_PRODUCT_NAME      = "Piro Pro";
const PRO_PRICE_LOOKUP_KEY  = "piro_pro_monthly";

let cachedPriceId:     string | null = null;
let cachedTestPriceId: string | null = null;

async function lookupProPriceId(stripe: Stripe): Promise<string> {
  // Fast path — lookup_key is deterministic
  const byKey = await stripe.prices.list({
    lookup_keys: [PRO_PRICE_LOOKUP_KEY],
    active: true,
    limit: 1,
  });
  if (byKey.data.length > 0) return byKey.data[0].id;

  // Fallback — search by product name
  const products = await stripe.products.list({ active: true, limit: 100 });
  const product = products.data.find((p) => p.name === PRO_PRODUCT_NAME);
  if (!product) {
    throw new Error(
      `Stripe product "${PRO_PRODUCT_NAME}" not found. ` +
      `Create it with lookup_key "${PRO_PRICE_LOOKUP_KEY}" in the Stripe dashboard.`
    );
  }

  const prices = await stripe.prices.list({
    product: product.id,
    active: true,
    type: "recurring",
    limit: 1,
  });
  if (prices.data.length === 0) {
    throw new Error(`No active recurring price found for "${PRO_PRODUCT_NAME}".`);
  }
  return prices.data[0].id;
}

/**
 * Resolve the Piro Pro monthly price ID from the given Stripe client.
 * Cached per mode for the lifetime of the server process.
 */
export async function getProPriceId(useTestMode = false): Promise<string> {
  if (useTestMode) {
    if (!cachedTestPriceId) cachedTestPriceId = await lookupProPriceId(getStripe(true));
    return cachedTestPriceId;
  }
  if (!cachedPriceId) cachedPriceId = await lookupProPriceId(getStripe(false));
  return cachedPriceId;
}

// ── Plan limits ───────────────────────────────────────────────────────────────

/** How many training runs the Pro plan includes per billing period. */
export const PRO_TRAINING_RUN_LIMIT = 2;