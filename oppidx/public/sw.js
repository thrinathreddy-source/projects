// Minimal service worker — only handles push display and notification
// clicks. Not a full offline/caching service worker, deliberately: this
// site doesn't need offline support, just Web Push.

self.addEventListener('push', event => {
  let data = { title: 'OppIDX', body: 'New opportunities are up.', url: '/' }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch {
    // Non-JSON payload — fall back to the defaults above.
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/logo.png',
      data: { url: data.url },
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clientList => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
