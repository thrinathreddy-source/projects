import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { Skeleton } from "@/components/ui/skeleton";
import { env } from "@/lib/env";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage() {
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <Suspense fallback={<AuthFormSkeleton />}>
      <AuthForm mode="sign-in" googleEnabled={env().hasGoogleOAuth} />
    </Suspense>
  );
}

function AuthFormSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
