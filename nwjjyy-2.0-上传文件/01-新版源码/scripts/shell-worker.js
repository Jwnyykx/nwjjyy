// This list is filled by the build. Only files bundled with the public app are cached.
const assets = __SHELL_ASSETS__
const version = __SHELL_VERSION__
const scope = new URL(self.registration.scope)
const home = new URL('index.html', scope).href
const names = assets.map(file => new URL(file, scope).href)
const cachePrefix = 'nwjjyy-public-shell:' + scope.pathname + ':'
const cacheName = cachePrefix + version

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(names)))
})
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(cachePrefix) && key !== cacheName) await caches.delete(key)
    }
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET' || request.headers.has('Authorization')) return
  const url = new URL(request.url)
  if (url.origin !== scope.origin) return
  if (request.mode === 'navigate' && (url.pathname === scope.pathname || url.href === home)) {
    event.respondWith(fetch(request).catch(async error => {
      const offline = await (await caches.open(cacheName)).match(home)
      if (offline) return offline
      throw error
    }))
    return
  }
  if (names.includes(url.href)) {
    event.respondWith(caches.open(cacheName).then(async cache => await cache.match(url.href) ?? fetch(request)))
  }
})
