/**
 * A card-shaped placeholder for a page of listings that is still in
 * flight. Deliberately the same silhouette and roughly the same height as
 * a real OpportunityCard so the Load more button below doesn't jump when
 * the real ones land.
 *
 * Not animated with framer-motion — it's a CSS shimmer (see `.sk` in
 * globals.css), so the loading state costs nothing on a bundle that just
 * had the animation library taken out of it.
 */
export function SkeletonCard() {
  return (
    <div className="card-box skeleton-card" aria-hidden>
      <div className="sk sk-media" />
      <div className="sk-body">
        <div className="sk sk-line w-40" />
        <div className="sk sk-title" />
        <div className="sk sk-line w-60" />
        <div className="sk sk-line w-90" />
        <div className="sk sk-line w-75" />
      </div>
    </div>
  )
}

/** `count` placeholders in a row, for a grid that's loading its next page. */
export function SkeletonCards({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => <SkeletonCard key={i} />)}
    </>
  )
}
