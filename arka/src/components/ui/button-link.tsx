import Link from "next/link";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";

/**
 * A button that navigates.
 *
 * This shadcn style is built on Base UI, which composes through a `render`
 * prop rather than `asChild`. Wrapping it once keeps every call site reading
 * as plain JSX instead of a nested element literal.
 */
export function ButtonLink({
  href,
  prefetch,
  target,
  rel,
  children,
  ...props
}: ComponentProps<typeof Button> & {
  href: string;
  prefetch?: boolean;
  target?: string;
  rel?: string;
}) {
  return (
    <Button
      {...props}
      // Base UI asserts a native <button> unless told otherwise; this renders
      // an <a>, which is correct for navigation and keeps middle-click working.
      nativeButton={false}
      render={<Link href={href} prefetch={prefetch} target={target} rel={rel} />}
    >
      {children}
    </Button>
  );
}
