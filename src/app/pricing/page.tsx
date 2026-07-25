import { cookies } from "next/headers";
import { getLatestPiroModel } from "~/lib/latest-experiment";
import PricingClient from "./PricingClient";

export default async function PricingPage() {
  const latestModel = getLatestPiroModel();
  const cookieStore = await cookies();
  const isLoggedIn =
    cookieStore.has("better-auth.session_token") ||
    cookieStore.has("__Secure-better-auth.session_token");
  return <PricingClient latestModelLabel={latestModel.label} isLoggedIn={isLoggedIn} />;
}
