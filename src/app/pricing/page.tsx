import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { getSubscription, isActive } from "~/lib/billing";
import { getCurrentPiroArchitecture } from "~/lib/latest-architecture";
import PricingClient from "./PricingClient";

export type PricingPlan = "free" | "pro";

export default async function PricingPage() {
  const latestModel = getCurrentPiroArchitecture();
  const session = await auth.api.getSession({ headers: await headers() });
  const subscription = session ? await getSubscription(session.user.id) : null;
  const currentPlan: PricingPlan | null = session
    ? isActive(subscription) && subscription?.planId === "pro"
      ? "pro"
      : "free"
    : null;

  return (
    <PricingClient
      latestModelLabel={latestModel.label}
      currentPlan={currentPlan}
    />
  );
}
