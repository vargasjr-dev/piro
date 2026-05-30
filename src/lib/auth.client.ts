"use client";
import { createAuthClient } from "better-auth/react";

// No baseURL — uses the current window origin (correct for Next.js same-domain auth)
export const authClient = createAuthClient();
