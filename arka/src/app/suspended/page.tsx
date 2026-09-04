import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/brand";
import { ButtonLink } from "@/components/ui/button-link";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Account suspended" };

export default async function SuspendedPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!user.banned) redirect("/dashboard");

  return (
    <div className="bg-grid flex min-h-svh flex-col">
      <header className="px-6 py-5">
        <Wordmark />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-20">
        <div className="max-w-md space-y-4 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Account suspended</h1>
          <p className="text-sm text-muted-foreground">
            {user.banReason
              ? `Reason given: ${user.banReason}`
              : "This account has been suspended for violating our terms."}
          </p>
          <p className="text-sm text-muted-foreground">
            If you think this is a mistake, reply to your signup email or write to
            support and we will take another look.
          </p>
          <ButtonLink href="/" variant="outline">
            Back to site
          </ButtonLink>
        </div>
      </main>
    </div>
  );
}
