import type { Metadata } from "next";
import { Fill, LegalPage } from "@/components/legal-page";
import { GrievanceForm } from "@/components/grievance-form";
import { COMPANY } from "@/lib/company";
import {
  ACKNOWLEDGE_WITHIN_HOURS,
  describeDeadline,
  GRIEVANCE_CATEGORIES,
} from "@/lib/grievance-catalog";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Report a problem",
  description:
    "File a complaint about a video made with Arka, or a request about your data. Every complaint gets a reference number and a deadline.",
};

const UPDATED = "25 September 2026";

/**
 * The grievance route the IT Rules 2021 require, as a form rather than just an
 * address.
 *
 * An inbox satisfies the letter of the rule and none of its point: nothing
 * counts the 24 hours, and nothing shows afterwards that a complaint was
 * answered. Here every complaint gets a reference, an automatic
 * acknowledgement, and a deadline the alert sweep watches.
 */
export default async function GrievancePage() {
  const user = await getCurrentUser();

  // One line per deadline, shortest first, built from the categories so the
  // page cannot promise something the code does not enforce.
  const tiers = [...new Set(GRIEVANCE_CATEGORIES.map((c) => c.resolveWithinHours))]
    .sort((a, b) => a - b)
    .map((hours) => ({
      hours,
      labels: GRIEVANCE_CATEGORIES.filter((c) => c.resolveWithinHours === hours).map(
        (c) => c.label.toLowerCase(),
      ),
    }));

  return (
    <LegalPage title="Report a problem" updated={UPDATED}>
      <p>
        Found a video made with Arka that should not exist? Have a question or
        a request about your personal data? Tell us here. You do not need an
        account.
      </p>

      <h2>What happens next</h2>
      <ul>
        <li>
          You get a reference number straight away, and an email confirming it
          within {describeDeadline(ACKNOWLEDGE_WITHIN_HOURS)}.
        </li>
        {tiers.map((tier) => (
          <li key={tier.hours}>
            <strong>Within {describeDeadline(tier.hours)}:</strong> {tier.labels.join("; ")}.
          </li>
        ))}
        <li>
          Every decision comes with a reason, and you can ask for it to be
          reviewed.
        </li>
      </ul>

      <h2>File a complaint</h2>
      <GrievanceForm defaultEmail={user?.email ?? ""} />

      <h2>Grievance Officer</h2>
      <p>
        Complaints go to our Grievance Officer,{" "}
        <Fill value={COMPANY.grievanceOfficer.name}>officer name</Fill>
        {" ("}
        <Fill value={COMPANY.grievanceOfficer.email}>officer email</Fill>
        {"), "}
        who can also be reached by post at{" "}
        <Fill value={COMPANY.registeredAddress.street}>street address</Fill>,{" "}
        <Fill value={COMPANY.registeredAddress.cityStatePin}>city, state and PIN</Fill>.
        What Arka will and will not generate is set out in the{" "}
        <a href="/acceptable-use">Acceptable Use Policy</a>.
      </p>
    </LegalPage>
  );
}
