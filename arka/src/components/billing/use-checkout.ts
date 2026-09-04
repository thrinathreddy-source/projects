"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api, messageFor } from "@/lib/client-api";
import { track } from "@/components/analytics-provider";
import type { CheckoutIntent } from "@/lib/payments/types";

/**
 * Opens Razorpay Checkout.
 *
 * The browser handoff is only a convenience — credits are granted by the
 * webhook, so a user who closes this sheet mid-payment still gets what they
 * paid for. The success callback here just refreshes the page.
 */

type CheckoutResponse = {
  provider: string;
  orderId: string;
  kind: "order" | "subscription";
  amountMinor: number;
  currency: string;
  keyId: string;
  description: string;
  transactionId: string;
};

type RazorpayOptions = {
  key: string;
  amount?: number;
  currency?: string;
  name: string;
  description: string;
  order_id?: string;
  subscription_id?: string;
  prefill?: { name?: string; email?: string };
  theme?: { color?: string };
  handler: () => void;
  modal?: { ondismiss?: () => void };
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open: () => void };
  }
}

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

function loadScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);

  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(true));
      existing.addEventListener("error", () => resolve(false));
      return;
    }

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function useCheckout(user: { name: string; email: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  const start = useCallback(
    async (intent: CheckoutIntent, label: string) => {
      const key = intent.kind === "pack" ? intent.packId : intent.planCode;
      setPending(key);

      try {
        const checkout = await api.post<CheckoutResponse>(
          "/api/billing/checkout",
          intent,
        );

        const ready = await loadScript();
        if (!ready || !window.Razorpay) {
          throw new Error("Could not load the payment window. Check your connection.");
        }

        track("checkout_started", { kind: intent.kind, item: key });

        const razorpay = new window.Razorpay({
          key: checkout.keyId,
          name: "Arka",
          description: checkout.description,
          ...(checkout.kind === "subscription"
            ? { subscription_id: checkout.orderId }
            : {
                order_id: checkout.orderId,
                amount: checkout.amountMinor,
                currency: checkout.currency,
              }),
          prefill: { name: user.name, email: user.email },
          theme: { color: "#e08a3c" },
          handler: () => {
            toast.success(`${label} confirmed. Credits land in a few seconds.`);
            // The webhook does the granting; give it a moment, then re-read.
            setTimeout(() => router.refresh(), 2500);
          },
          modal: {
            ondismiss: () => setPending(null),
          },
        });

        razorpay.open();
      } catch (error) {
        toast.error(messageFor(error));
      } finally {
        setPending(null);
      }
    },
    [router, user.email, user.name],
  );

  return { start, pending };
}
