import type { Metadata } from 'next'
import SavedClient from './SavedClient'

// Personal, per-browser saved-items list — the same URL renders different
// content for every visitor (whatever they've saved locally), so there's
// no single canonical piece of content here for a search result to point
// at. Indexing it risks Google treating it as thin/duplicate content.
export const metadata: Metadata = {
  title: 'Saved Opportunities — OppIDX',
  description: 'The opportunities you’ve saved to chase later.',
  robots: { index: false, follow: true },
}

export default function Page() {
  return <SavedClient />
}
