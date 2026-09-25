import type { Metadata } from "next";
import { Fill, LegalPage } from "@/components/legal-page";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = { title: "Contact" };

const UPDATED = "25 September 2026";

export default function ContactPage() {
  return (
    <LegalPage title="Contact" updated={UPDATED}>
      <p>
        Arka is operated by <Fill value={COMPANY.legalName}>legal entity name</Fill>. There is no support
        queue and no ticket robot — messages go to a person.
      </p>

      <h2>Get in touch</h2>
      <ul>
        <li><strong>Support</strong> — <Fill value={COMPANY.email.support}>support@yourdomain.com</Fill></li>
        <li><strong>Billing and refunds</strong> — <Fill value={COMPANY.email.billing}>billing@yourdomain.com</Fill></li>
        <li><strong>Privacy requests</strong> — <Fill value={COMPANY.email.privacy}>privacy@yourdomain.com</Fill></li>
        <li><strong>Abuse reports</strong> — <Fill value={COMPANY.email.abuse}>abuse@yourdomain.com</Fill></li>
      </ul>

      <h2>Complaints and data requests</h2>
      <p>
        To report a video, or to ask about your personal data, use the{" "}
        <a href="/grievance">complaint form</a>. It gives you a reference number
        and tells you when to expect a decision.
      </p>

      <h2>Registered address</h2>
      <p>
        <Fill value={COMPANY.registeredAddress.street}>street address</Fill>
        <br />
        <Fill value={COMPANY.registeredAddress.cityStatePin}>city, state, PIN</Fill>
        <br />
        India
      </p>

      <h2>Response times</h2>
      <p>
        We aim to reply within <Fill value={COMPANY.supportResponseTime}>e.g. 2 working days</Fill>. Paid plans are
        answered first.
      </p>

      <h2>Faster than email</h2>
      <p>
        If you are signed in, the Feedback button in the bottom-right corner of
        every page goes straight to us, with the page you were on attached. For a
        bug, that is the quickest route.
      </p>
    </LegalPage>
  );
}
