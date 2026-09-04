import { Suspense } from "react";
import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Set a new password" };

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <Skeleton className="h-8 w-52" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
