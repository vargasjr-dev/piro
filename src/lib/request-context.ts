import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "~/lib/auth.server";
import { getSubscription, type Subscription } from "~/lib/billing";

export const getRequestHeaders = cache(async () => headers());

export const getRequestSession = cache(async () => {
  return auth.api.getSession({ headers: await getRequestHeaders() });
});

export const getRequestSubscription = cache(
  async (): Promise<Subscription | null> => {
    const session = await getRequestSession();
    return session ? getSubscription(session.user.id) : null;
  },
);
