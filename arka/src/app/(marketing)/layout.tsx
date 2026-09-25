import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { ButtonLink } from "@/components/ui/button-link";
import { getCurrentUser } from "@/lib/session";
import { isComingSoon } from "@/lib/launch";

const FOOTER_LINKS = [
  { href: "/pricing", label: "Pricing" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/refunds", label: "Refunds" },
  // Reachable from every public page, because a grievance route nobody can
  // find does not satisfy the rule that requires publishing one.
  { href: "/acceptable-use", label: "Acceptable use" },
  { href: "/grievance", label: "Report a problem" },
  { href: "/contact", label: "Contact" },
] as const;

export default async function MarketingLayout({ children }: LayoutProps<"/">) {
  /**
   * While the site is closed the marketing chrome is worse than nothing: it
   * offers Pricing, Sign in and Start free, and the proxy bounces all three
   * straight back here. The holding page carries its own wordmark and its own
   * footer, and the policy pages read perfectly well without a nav bar.
   */
  if (isComingSoon()) return <>{children}</>;

  const user = await getCurrentUser();

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <Wordmark />

          <nav className="flex items-center gap-1">
            <Link
              href="/pricing"
              className="px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Pricing
            </Link>

            {user ? (
              <ButtonLink href="/dashboard" size="lg">
                Dashboard
              </ButtonLink>
            ) : (
              <>
                <Link
                  href="/sign-in"
                  className="px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Sign in
                </Link>
                <ButtonLink href="/sign-up" size="lg">
                  Start free
                </ButtonLink>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8">
          <div className="space-y-1">
            <Wordmark />
            <p className="text-xs text-muted-foreground">
              Indian stories, anime style.
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-5 gap-y-2">
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
