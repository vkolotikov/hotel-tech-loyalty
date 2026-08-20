/**
 * Service worker for the installed admin app.
 *
 * Its job is narrow on purpose. A service worker sits in front of every
 * request the app makes and outlives the page that installed it, so an
 * over-eager one can serve a stale shell to a signed-in user for days with no
 * obvious way out. This one therefore caches exactly one class of thing:
 * build assets under /spa/assets/, whose filenames contain a content hash and
 * are immutable by construction. A hashed file can never be stale — if the
 * contents change, so does the name.
 *
 * Everything else, the HTML shell included, goes straight to the network. That
 * means no offline mode, which is the honest outcome: this console reads and
 * writes live tenant data over /api, so an offline copy of it could only ever
 * show a broken screen. Better to let the browser say the connection is gone.
 *
 * Two things follow from caching hashed assets:
 *
 *  - Deploys stop breaking open tabs. The frontend is rebuilt on every deploy
 *    and old chunks disappear from the server, so a tab left open across a
 *    release used to hit 404s when React lazily fetched a route it had not
 *    visited yet. Those chunks now come from cache.
 *
 *  - Cold starts are quick, because the shell's JS and CSS are already local.
 */

const VERSION = 'v1';
const ASSET_CACHE = 'hexatech-assets-' + VERSION;

// A worker that waits for every tab to close before activating would leave
// users on the old one indefinitely, since an installed app window is rarely
// closed. Take over immediately instead.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('hexatech-assets-') && k !== ASSET_CACHE)
            .map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only ever GET. A cached POST would be a data-loss bug, not a speedup.
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }

  // Never touch another origin, and never touch the API: those responses are
  // tenant-scoped and carry the signed-in user's data.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Hashed build output only.
  if (!url.pathname.startsWith('/spa/assets/')) return;

  event.respondWith(
    caches.open(ASSET_CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit) return hit;

      const res = await fetch(req);
      // Only store a clean, complete response. Caching an opaque or error
      // response would pin the failure until the cache is cleared by hand.
      if (res && res.status === 200 && res.type === 'basic') {
        cache.put(req, res.clone());
      }
      return res;
    }),
  );
});

/**
 * Escape hatch. If this worker ever needs to be switched off in a hurry, the
 * page can post it a message and it will uninstall itself and drop its cache,
 * without waiting for a deploy.
 */
self.addEventListener('message', (event) => {
  if (event.data === 'hexatech:unregister') {
    event.waitUntil(
      caches.keys()
        .then((keys) => Promise.all(keys.filter((k) => k.startsWith('hexatech-assets-')).map((k) => caches.delete(k))))
        .then(() => self.registration.unregister()),
    );
  }
});
