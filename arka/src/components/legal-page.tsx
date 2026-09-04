/**
 * Shared shell for the legal pages.
 *
 * Razorpay (like most Indian payment gateways) will not activate a live account
 * without reachable terms, privacy, refund and contact pages, so these are a
 * launch dependency rather than an afterthought.
 */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <article className="mx-auto max-w-[68ch] px-5 py-16 md:py-20">
      <h1 className="page-title text-4xl md:text-5xl">{title}</h1>
      <p className="annotation mt-3 text-muted-foreground">Last updated {updated}</p>

      <div
        className="mt-12 space-y-5 text-[0.9375rem] leading-[1.75] text-muted-foreground
          [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4
          [&_h2]:mt-11 [&_h2]:mb-2.5 [&_h2]:font-[family-name:var(--font-display)]
          [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:tracking-[0.005em] [&_h2]:text-foreground
          [&_li]:mb-1.5 [&_strong]:text-foreground
          [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5"
      >
        {children}
      </div>
    </article>
  );
}

/**
 * A company detail, with the description of what belongs there as a fallback.
 *
 * Every value comes from `src/lib/company.ts`. Until one is filled it renders
 * highlighted and bracketed, so an unfinished policy is obvious in review
 * instead of shipping as a confident-looking blank.
 */
export function Fill({ value, children }: { value?: string; children: React.ReactNode }) {
  if (value && value.trim() !== "") return <>{value}</>;

  return (
    <mark className="rounded bg-primary/15 px-1 py-0.5 text-primary">[{children}]</mark>
  );
}
