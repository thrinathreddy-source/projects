"use client";

import { createAuthClient } from "better-auth/react";
import { adminClient, inferAdditionalFields } from "better-auth/client/plugins";
import type { Auth } from "@/lib/auth";

/**
 * Browser-side auth client. `inferAdditionalFields` carries the Arka columns
 * (credits, planCode, ...) through to `useSession()` with full typing.
 */
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<Auth>(), adminClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
