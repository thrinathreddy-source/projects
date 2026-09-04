/**
 * Maps the ids Resend returns from a permissive batch send back onto the
 * recipients that were sent in, without assuming which of two shapes the
 * response used.
 *
 * Why this is worth being careful about: the returned id is the only link
 * between a subscriber and their delivery events. app/api/webhooks/resend
 * looks a bounce or complaint up by `resendId`, then suppresses
 * `log.subscriberId` permanently. Attach an id to the wrong recipient and a
 * bounce silently kills email for someone whose address was fine, while the
 * address that actually bounced keeps being mailed.
 *
 * The previous code indexed `data.data[i]` with the *input* position. That is
 * right only if Resend returns one entry per submitted email including the
 * failures. `batchValidation: 'permissive'` exists precisely to let some
 * entries fail, and the SDK's types (node_modules/resend, CreateBatchSuccess-
 * Response) document `errors[].index` as an index into the batch but say
 * nothing about whether `data` keeps failed slots or omits them. Rather than
 * guess at a third-party response shape, this handles both and refuses to
 * attach anything when it recognises neither.
 */
export function alignBatchIds(
  recipientCount: number,
  returnedIds: Array<{ id: string }>,
  failedIndices: Iterable<number>,
): Array<string | null> {
  const failed = new Set(failedIndices)
  const out: Array<string | null> = new Array(recipientCount).fill(null)

  // One entry per submitted email, failures included: input position is the id
  // position.
  if (returnedIds.length === recipientCount) {
    for (let i = 0; i < recipientCount; i++) {
      out[i] = failed.has(i) ? null : returnedIds[i]?.id ?? null
    }
    return out
  }

  // Successes only, in submission order: walk the non-failed positions and
  // consume the ids in the same order.
  const okIndices: number[] = []
  for (let i = 0; i < recipientCount; i++) if (!failed.has(i)) okIndices.push(i)

  if (returnedIds.length === okIndices.length) {
    okIndices.forEach((inputIndex, k) => { out[inputIndex] = returnedIds[k]?.id ?? null })
    return out
  }

  // Neither shape. Leaving every id null costs delivery-event tracking for
  // this chunk; guessing costs somebody else's subscription.
  console.error(
    `[email] unrecognised Resend batch response: ${recipientCount} recipients, ` +
    `${returnedIds.length} ids, ${failed.size} errors — not attaching ids.`,
  )
  return out
}
