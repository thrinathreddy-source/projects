import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { env } from "@/lib/env";
import { getCurrentUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignUpPage() {
  if (await getCurrentUser()) redirect("/dashboard");

  const settings = await getSettings().catch(() => null);

  if (settings && !settings["flags.signupsEnabled"]) {
    return (
      <Alert>
        <AlertDescription>
          New signups are paused right now. Check back shortly.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Suspense fallback={<AuthFormSkeleton />}>
      <AuthForm mode="sign-up" googleEnabled={env().hasGoogleOAuth} />
    </Suspense>
  );
}

function AuthFormSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-52" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
