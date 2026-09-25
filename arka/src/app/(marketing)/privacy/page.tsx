import type { Metadata } from "next";
import { Fill, LegalPage } from "@/components/legal-page";
import { COMPANY, registeredAddressLine } from "@/lib/company";

export const metadata: Metadata = { title: "Privacy Policy" };

const UPDATED = "25 September 2026";

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated={UPDATED}>
      <p>
        This explains what <Fill value={COMPANY.legalName}>legal entity name</Fill> collects when you use
        Arka, why, and what control you have. We have tried to write it in plain
        language.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account</strong> — your name, email address and country. A password hash if you sign up with email; a Google account identifier if you use Google.</li>
        <li><strong>Content</strong> — the titles, prompts and settings you submit, and the videos generated from them.</li>
        <li><strong>Usage</strong> — which pages you visit and which features you use, through PostHog analytics.</li>
        <li><strong>Billing</strong> — payment records and invoices. Card details go directly to our payment provider; we never see or store them.</li>
        <li><strong>Technical</strong> — IP address and browser user agent, in server logs and session records.</li>
      </ul>

      <h2>Why we collect it</h2>
      <ul>
        <li>To run the service: generate your videos, store them, and show them back to you.</li>
        <li>To operate credits and billing, and to prevent abuse of free credits.</li>
        <li>To understand which features are used, so we build the right things.</li>
        <li>To meet legal and tax obligations.</li>
      </ul>

      <h2>Who we share it with</h2>
      <p>Only the processors we need to run Arka:</p>
      <ul>
        <li><strong>AI model providers</strong> (currently fal.ai) — receive your prompt in order to render the video.</li>
        <li><strong>OpenAI</strong> — when enabled, reads the title, prompt and narration you submit to check them against our content rules, before anything is generated.</li>
        <li><strong>Cloudflare R2</strong> — stores the generated files.</li>
        <li><strong>Razorpay</strong> — processes payments.</li>
        <li><strong>Vercel</strong> — hosts the application.</li>
        <li><strong>PostHog</strong> — product analytics.</li>
      </ul>
      <p>
        We do not sell your personal data, and we do not share your prompts or
        videos with advertisers.
      </p>

      <h2>Model training</h2>
      <p>
        We do not use your prompts or generated videos to train our own models —
        we do not train models. Third-party providers have their own policies on
        whether submitted prompts may be used for training; check the current
        policy of the provider handling your render if this matters to you.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li><strong>Videos</strong> — until you delete the project, or until your account is closed.</li>
        <li><strong>Project records</strong> — retained after deletion in reduced form, so our credit and cost history stays consistent. The video files themselves are deleted.</li>
        <li><strong>Billing records</strong> — retained as long as tax law requires, typically eight years in India.</li>
        <li><strong>Server logs</strong> — <Fill value={COMPANY.logRetention}>retention period</Fill>.</li>
        <li><strong>Complaints</strong> made through our <a href="/grievance">complaint form</a> — kept as the record that they were answered. If you close your account, your name, email and message are removed from complaints you filed while signed in, once they are closed.</li>
      </ul>

      <h2>Your rights</h2>
      <p>
        You can access and correct your details in <a href="/settings">Settings</a>,
        and delete any project from its page. To request a copy of your data or
        deletion of your account, write to <Fill value={COMPANY.email.privacy}>privacy@yourdomain.com</Fill>. We
        respond within 30 days. You can also make the request through our{" "}
        <a href="/grievance">complaint form</a>, which gives it a reference number.
      </p>
      <p>
        Depending on where you live, you may have additional rights under India&rsquo;s
        Digital Personal Data Protection Act, the GDPR, or similar laws.
      </p>

      <h2>Cookies</h2>
      <p>
        We use a session cookie to keep you signed in. That one is essential and
        cannot be turned off while you are logged in. Analytics cookies are used
        only if PostHog is enabled for your session.
      </p>

      <h2>Security</h2>
      <p>
        Passwords are hashed, API keys are stored only as hashes, and generated
        videos are served through short-lived signed links rather than public
        URLs. No system is perfectly secure; if we discover a breach affecting
        you we will notify you promptly.
      </p>

      <h2>Children</h2>
      <p>
        Arka is not intended for anyone under 18. We do not knowingly collect
        data from children.
      </p>

      <h2>Contact</h2>
      <p>
        Data protection contact: <Fill value={COMPANY.email.privacy}>privacy@yourdomain.com</Fill>, <Fill value={registeredAddressLine()}>registered address</Fill>.
      </p>

      <p className="border-t border-border pt-6 text-xs">
        This is a starting template, not legal advice. Have a lawyer review it
        against your actual data flows and jurisdiction before launch.
      </p>
    </LegalPage>
  );
}
