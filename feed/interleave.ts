export type FeedSlot<A, B> = { kind: 'primary'; item: A } | { kind: 'secondary'; item: B }

/**
 * Interleaves a secondary list into a primary one at a fixed interval —
 * every N primary items, one secondary item, cycling through until the
 * secondary list runs out (never repeats, never pads with nothing real).
 * Used to fold Pulse digest cards into the opportunities feed instead of
 * giving Pulse its own tab or its own paginated section.
 */
export function interleave<A, B>(primary: A[], secondary: B[], every: number): FeedSlot<A, B>[] {
  if (secondary.length === 0) return primary.map(item => ({ kind: 'primary' as const, item }))

  const result: FeedSlot<A, B>[] = []
  let secondaryIndex = 0
  primary.forEach((item, i) => {
    result.push({ kind: 'primary', item })
    if ((i + 1) % every === 0 && secondaryIndex < secondary.length) {
      result.push({ kind: 'secondary', item: secondary[secondaryIndex] })
      secondaryIndex++
    }
  })
  return result
}

export type NamedFeedSlot<A> = { kind: 'primary'; item: A } | { kind: string; item: unknown }

/**
 * Same idea as `interleave`, generalized to N secondary sources each with
 * their own cadence — e.g. Pulse cards every 9 opportunities *and* Event
 * cards every 15, in one continuous scroll, rather than nesting `interleave`
 * calls (which would bury events inside the "primary" side of the pulse
 * interleave and throw off both cadences). `item` on non-primary slots is
 * `unknown` — the caller knows the shape for each `kind` it registered and
 * narrows with a cast at render time, same as a discriminated union it
 * defined itself would require.
 */
export function interleaveMulti<A>(
  primary: A[],
  sources: Array<{ kind: string; items: unknown[]; every: number }>,
): NamedFeedSlot<A>[] {
  const cursors = sources.map(() => 0)
  const result: NamedFeedSlot<A>[] = []
  primary.forEach((item, i) => {
    result.push({ kind: 'primary', item })
    sources.forEach((src, si) => {
      if ((i + 1) % src.every === 0 && cursors[si] < src.items.length) {
        result.push({ kind: src.kind, item: src.items[cursors[si]] })
        cursors[si]++
      }
    })
  })
  return result
}
