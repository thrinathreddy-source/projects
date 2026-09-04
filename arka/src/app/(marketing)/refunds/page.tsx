import type { Metadata } from "next";
import { Fill, LegalPage } from "@/components/legal-page";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = { title: "Refund Policy" };

const UPDATED = "7 August 2026";

export default function RefundsPage() {
  return (
    <LegalPage title="Refund & Cancellation Policy" updated={UPDATED}>
      <p>
        We would rather you did not need this page, so here is the short version:
        failed renders are refunded automatically, and we will not argue with a
        reasonable request.
      </p>

      <h2>Failed generations</h2>
      <p>
        If a render fails or times out, the credits reserved for it are returned
        to your balance automatically, usually within seconds. You do not need to
        contact us, and you are never charged for a video you did not receive.
      </p>

      <h2>Cancelling a render</h2>
      <p>
        You can cancel a queued or in-progress render from the project page. The
        reserved credits are returned in full.
      </p>

      <h2>Credit packs</h2>
      <p>
        Credit packs are refundable within <strong>7 days</strong> of purchase,
        provided the credits are unused. Once credits have been spent on renders,
        that portion is not refundable — the compute has been paid for on your
        behalf.
      </p>

      <h2>Subscriptions</h2>
      <ul>
        <li>Cancel any time from <a href="/billing">Billing</a>. Your plan stays active until the end of the period you have already paid for.</li>
        <li>We do not pro-rate part-months. Credits already granted for the current period remain yours and do not expire.</li>
        <li>If you were charged after cancelling, or charged twice, write to us and we will refund it in full.</li>
      </ul>

      <h2>If something went wrong</h2>
      <p>
        If the service was unavailable, or a run of renders came back unusable
        because of a fault on our side, contact us. We will refund credits or
        money as appropriate. We would rather keep you than keep your ₹399.
      </p>

      <h2>How refunds are paid</h2>
      <p>
        Approved refunds go back to the original payment method through Razorpay,
        typically within 5&ndash;7 working days, though your bank may take longer.
      </p>

      <h2>Requesting a refund</h2>
      <p>
        Email <Fill value={COMPANY.email.support}>support@yourdomain.com</Fill> from the address on your account,
        with the payment date and amount. We reply within{" "}
        <Fill value={COMPANY.supportResponseTime}>response time, e.g. 2 working days</Fill>.
      </p>

      <p className="border-t border-border pt-6 text-xs">
        This is a starting template, not legal advice. Indian payment gateways
        require a published refund policy — check it matches what your entity can
        actually honour before you go live.
      </p>
    </LegalPage>
  );
}
