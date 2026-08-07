/* =============================================================
   sw.js  —  Service Worker for CF Weakness Tracker
   Responsibilities:
   1. Cache all static assets on install (cache-first).
   2. Serve the WASM compiler binary from cache on subsequent loads.
      First-load download with progress is handled by compiler-ui.js
      directly (SW cannot stream progress of its own intercepted fetches).
   3. Network-first for HTML pages so auth state stays fresh.
   ============================================================= */

'use strict';

const SW_VERSION      = 'v1';
const STATIC_CACHE    = 'cf-tracker-static-' + SW_VERSION;
const WASM_CACHE      = 'cf-tracker-wasm-'   + SW_VERSION;

// Static assets to pre-cache on install
const STATIC_ASSETS = [
  '/css/style.css',
  '/js/supabase-client.js',
  '/js/cf-api.js',
  '/js/weakness-engine.js',
  '/js/auth.js',
  '/js/compiler-worker.js',
  '/js/compiler-ui.js'
];

// ── Install: pre-cache static assets ─────────────────────────
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(STATIC_CACHE).then(function (cache) {
      return cache.addAll(STATIC_ASSETS);
    }).then(function () {
      return self.skipWaiting(); // activate immediately
    })
  );
});

// ── Activate: purge old caches ────────────────────────────────
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) {
          return key !== STATIC_CACHE && key !== WASM_CACHE;
        }).map(function (key) {
          return caches.delete(key);
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// ── Fetch: routing strategy ───────────────────────────────────
self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);

  // 1. WASM binary — Cache-First (aggressive)
  //    Once cached, NEVER re-fetch unless cache is cleared.
  if (url.pathname.endsWith('.wasm') || url.searchParams.get('wasm') === '1') {
    e.respondWith(_cacheFirst(e.request, WASM_CACHE));
    return;
  }

  // 2. HTML pages — Network-First (keeps auth state fresh)
  if (e.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/') {
    e.respondWith(_networkFirst(e.request, STATIC_CACHE));
    return;
  }

  // 3. Static assets (CSS/JS) — Cache-First with network fallback
  if (url.pathname.match(/\.(css|js|ico|png|svg|woff2?)$/)) {
    e.respondWith(_cacheFirst(e.request, STATIC_CACHE));
    return;
  }

  // 4. Everything else — network only (API calls, Supabase, CF API)
});

// ── Cache strategies ──────────────────────────────────────────
async function _cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    return new Response('Network error and no cache available.', { status: 503 });
  }
}

async function _networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

// ── Message handler ────────────────────────────────────────────
// Main thread can ask SW to cache the WASM binary after it
// downloads it directly (with progress tracking).
self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'CACHE_WASM') {
    var url     = e.data.url;
    var buffer  = e.data.buffer; // ArrayBuffer transferred from main thread

    caches.open(WASM_CACHE).then(function (cache) {
      var response = new Response(buffer, {
        headers: { 'Content-Type': 'application/wasm' }
      });
      cache.put(url, response);
    });
  }

  if (e.data && e.data.type === 'CHECK_WASM_CACHE') {
    var checkUrl = e.data.url;
    caches.match(checkUrl).then(function (cached) {
      e.source.postMessage({
        type: 'WASM_CACHE_STATUS',
        cached: !!cached,
        url: checkUrl
      });
    });
  }
});
