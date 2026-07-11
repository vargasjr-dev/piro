"use client";

import { useState } from "react";
import { authClient } from "~/lib/auth.client";

export default function SignOutButton({ className }: { className: string }) {
  const [pending, setPending] = useState(false);

  const handleSignOut = async () => {
    if (pending) return;
    setPending(true);
    try {
      // Use the auth client so the request sets Content-Type: application/json
      // (better-auth's /sign-out endpoint rejects urlencoded bodies with a 415).
      await authClient.signOut();
    } catch {
      // Swallow errors: the user clicked sign out and should be treated as
      // logged out regardless. We never want to surface a raw API response here.
    } finally {
      // Force a full reload so server components re-evaluate the (now cleared) session
      // and the user lands on a logged-out view of /login.
      window.location.href = "/login";
    }
  };

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={pending}
      className={className}
    >
      {pending ? "Signing out..." : "Sign out"}
    </button>
  );
}
