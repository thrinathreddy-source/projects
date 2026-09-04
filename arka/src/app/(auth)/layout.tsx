import Link from "next/link";
import { Wordmark } from "@/components/brand";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="bg-grid flex min-h-svh flex-col">
      <header className="flex items-center justify-between px-6 py-5">
        <Wordmark />
        <Link
          href="/"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Back to site
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-20">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
