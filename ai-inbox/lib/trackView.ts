export function trackView(id: string) {
  // Fire-and-forget — a slow/failed view ping should never block the visitor.
  fetch(`/api/opportunities/${id}/view`, { method: 'POST' }).catch(() => {})
}
