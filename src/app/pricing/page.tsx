import { getLatestPiroModel } from "~/lib/latest-experiment";
import PricingClient from "./PricingClient";

export default function PricingPage() {
  const latestModel = getLatestPiroModel();
  return <PricingClient latestModelLabel={latestModel.label} />;
}
