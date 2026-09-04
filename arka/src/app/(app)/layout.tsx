import { Wordmark } from "@/components/brand";
import { Nav } from "@/components/app-shell/nav";
import { UserMenu } from "@/components/app-shell/user-menu";
import { CreditsBadge } from "@/components/app-shell/credits-badge";
import { MobileNav } from "@/components/app-shell/mobile-nav";
import { VerifyBanner } from "@/components/app-shell/verify-banner";
import { FeedbackWidget } from "@/components/feedback-widget";
import { ButtonLink } from "@/components/ui/button-link";
import { requireUserPage } from "@/lib/session";
import { getBalance } from "@/lib/credits";
import { getSettings } from "@/lib/settings";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUserPage();
  const balance = await getBalance(user.id);
  const isAdmin = user.role === "admin";
  const grantCredits = (await getSettings())["signup.grantCredits"];

  return (
    <div className="flex min-h-svh">
      {/* Fixed rail, Linear-style: navigation never moves or animates. */}
      <aside className="fixed inset-y-0 left-0 hidden w-[228px] flex-col border-r border-border bg-sidebar px-3 py-4 md:flex">
        <div className="px-2 pb-5">
          <Wordmark href="/dashboard" />
        </div>

        <div className="px-2 pb-4">
          <ButtonLink href="/generate" className="w-full" size="lg">
            New video
          </ButtonLink>
        </div>

        <Nav isAdmin={isAdmin} />

        <div className="mt-auto space-y-3 pt-4">
          <div className="px-2">
            <CreditsBadge credits={balance.credits} held={balance.creditsHeld} />
          </div>
          <UserMenu
            user={{ name: user.name, email: user.email, image: user.image ?? null }}
          />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col md:pl-[228px]">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-background/80 px-4 py-2.5 backdrop-blur md:hidden">
          <MobileNav
            isAdmin={isAdmin}
            user={{ name: user.name, email: user.email, image: user.image ?? null }}
          />
          <Wordmark href="/dashboard" />
          <CreditsBadge credits={balance.credits} held={balance.creditsHeld} />
        </header>

        {!user.emailVerified && (
          <VerifyBanner email={user.email} credits={grantCredits} />
        )}

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <FeedbackWidget />
    </div>
  );
}
