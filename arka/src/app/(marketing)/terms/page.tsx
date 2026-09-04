import type { Metadata } from "next";
import { Fill, LegalPage } from "@/components/legal-page";
import { COMPANY, registeredAddressLine } from "@/lib/company";

export const metadata: Metadata = { title: "Terms of Service" };

const UPDATED = "7 August 2026";

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated={UPDATED}>
      <p>
        These terms govern your use of Arka, operated by <Fill value={COMPANY.legalName}>legal entity name</Fill>,
        registered at <Fill value={registeredAddressLine()}>registered address</Fill> (&ldquo;we&rdquo;, &ldquo;us&rdquo;).
        By creating an account you agree to them.
      </p>

      <h2>1. The service</h2>
      <p>
        Arka generates short videos from text prompts using third-party AI models.
        Output is produced by machine and will vary in quality. We do not
        guarantee that any particular render will match what you had in mind.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>You must be at least 18, or have a guardian&rsquo;s consent.</li>
        <li>Keep your password and API keys secret. Activity under your account is your responsibility.</li>
        <li>One person or organisation per account. Do not share logins to bypass plan limits.</li>
      </ul>

      <h2>3. Credits and payment</h2>
      <ul>
        <li>Generations consume credits. The cost is shown before you confirm.</li>
        <li>Credits do not expire and have no cash value. They are not transferable and cannot be exchanged for money.</li>
        <li>If a generation fails, the credits reserved for it are returned automatically.</li>
        <li>Subscriptions renew monthly until cancelled. Cancelling stops future charges; it does not refund the current period. See our <a href="/refunds">refund policy</a>.</li>
        <li>We may change pricing with 30 days&rsquo; notice. Credits you already hold are unaffected.</li>
      </ul>

      <h2>4. Acceptable use</h2>
      <p>You may not use Arka to generate:</p>
      <ul>
        <li>Sexual content involving minors, or any content that sexualises a real person without consent.</li>
        <li>Realistic depictions of identifiable real people presented as genuine — including political deepfakes and fabricated news.</li>
        <li>Content that incites violence or hatred against a group, or that promotes self-harm.</li>
        <li>Material that infringes someone else&rsquo;s copyright, trademark or personality rights.</li>
        <li>Anything unlawful under the laws of India or of your own country.</li>
      </ul>
      <p>
        We may suspend an account for violations, and we cooperate with lawful
        requests from authorities. Suspension for a violation does not entitle
        you to a refund of unused credits.
      </p>

      <h2>5. Ownership of output</h2>
      <p>
        You own the videos you generate, and on paid plans you may use them
        commercially. Free-plan output is licensed for personal,
        non-commercial use only.
      </p>
      <p>
        We do not claim ownership of your prompts or output. We may retain them
        as needed to operate the service — see our <a href="/privacy">privacy policy</a>.
      </p>
      <p>
        Note that AI-generated output may not be copyrightable in every
        jurisdiction, and that identical prompts can produce similar results for
        different users. We cannot promise your output is unique.
      </p>

      <h2>6. Availability</h2>
      <p>
        Arka is provided &ldquo;as is&rdquo;. We depend on third-party model
        providers and do not guarantee uninterrupted service. We may pause
        generation for maintenance, or when a provider is unavailable.
      </p>

      <h2>7. Limitation of liability</h2>
      <p>
        To the extent permitted by law, our total liability to you for any claim
        is limited to the greater of the amount you paid us in the twelve months
        before the claim, or <Fill value={COMPANY.minimumLiability}>minimum liability figure</Fill>. We are not
        liable for indirect or consequential losses, including lost profits or
        lost content.
      </p>

      <h2>8. Termination</h2>
      <p>
        You may close your account at any time. We may terminate an account that
        breaches these terms. On termination your projects and stored videos may
        be deleted — download anything you want to keep first.
      </p>

      <h2>9. Changes</h2>
      <p>
        We may update these terms. Material changes will be notified by email or
        in-product at least 14 days before they take effect.
      </p>

      <h2>10. Governing law</h2>
      <p>
        These terms are governed by the laws of India, with exclusive
        jurisdiction in the courts of <Fill value={COMPANY.jurisdictionCity}>city</Fill>.
      </p>

      <h2>11. Contact</h2>
      <p>
        Questions about these terms: <Fill value={COMPANY.email.legal}>legal@yourdomain.com</Fill>. See also
        our <a href="/contact">contact page</a>.
      </p>

      <p className="border-t border-border pt-6 text-xs">
        This is a starting template, not legal advice. Have a lawyer review it
        against your actual entity, jurisdiction and insurance before you take
        payments.
      </p>
    </LegalPage>
  );
}
