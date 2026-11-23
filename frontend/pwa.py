"""
Installable web app (PWA): lets members "Add to Home Screen" from Safari or Chrome.
The icon opens full-screen (no browser bars) straight into the dashboard.
"""
import json

from django.http import HttpResponse
from django.shortcuts import render
from django.templatetags.static import static
from django.views.decorators.cache import cache_control

APP_VERSION = "3"  # bump to make every installed app refresh its offline cache


@cache_control(max_age=3600)
def manifest(request):
    data = {
        "id": "/discover/",
        "name": "Darlova",
        "short_name": "Darlova",
        "description": "Meet someone who gets you.",
        "start_url": "/discover/?source=app",  # opens the dashboard, not the landing page
        "scope": "/",
        "display": "standalone",
        "orientation": "portrait",
        "background_color": "#1a0d22",
        "theme_color": "#D81B60",
        "icons": [
            {"src": static("images/app/icon-192.png"), "sizes": "192x192", "type": "image/png", "purpose": "any"},
            {"src": static("images/app/icon-512.png"), "sizes": "512x512", "type": "image/png", "purpose": "any"},
            {"src": static("images/app/icon-maskable-192.png"), "sizes": "192x192", "type": "image/png", "purpose": "maskable"},
            {"src": static("images/app/icon-maskable-512.png"), "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
        ],
        "shortcuts": [
            {"name": "Messages", "url": "/messages/?source=app",
             "icons": [{"src": static("images/app/icon-192.png"), "sizes": "192x192"}]},
            {"name": "Matches", "url": "/matches/?source=app",
             "icons": [{"src": static("images/app/icon-192.png"), "sizes": "192x192"}]},
        ],
    }
    return HttpResponse(json.dumps(data), content_type="application/manifest+json")


SERVICE_WORKER = r"""
/* Darlova service worker
   - Dashboard tabs open instantly from the phone's cache, then refresh in the background
     (stale-while-revalidate), so the app feels like a native one even on slow networks.
   - Anything you change (likes, messages, profile, settings, login/logout) clears that cache,
     so you never see your own old data.
   - CSS/JS/fonts are fingerprinted, so a cached copy is always right.
   - No connection: a branded offline page. */
const VERSION = '__VERSION__';
const STATIC_CACHE = 'darlova-static-' + VERSION;
const PAGE_CACHE = 'darlova-pages-' + VERSION;
const OFFLINE = '/offline/';
const APP_PAGES = ['/discover/', '/matches/', '/messages/', '/my-profile/', '/settings/', '/notifications/'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll([OFFLINE, '__ICON__'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![STATIC_CACHE, PAGE_CACHE].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const pageKey = (url) => new Request(url.origin + url.pathname);  // ?id=, ?tab= are read by the page script

function savePage(key, res) {
  // Only real dashboard pages: not redirects to the login page, not errors.
  if (res.ok && !res.redirected && (res.headers.get('content-type') || '').includes('text/html')) {
    const copy = res.clone();
    caches.open(PAGE_CACHE).then((c) => c.put(key, copy));
  }
  return res;
}

function warm() {
  // Load the dashboard tabs in the background so every tap is instant.
  return caches.open(PAGE_CACHE).then((c) => Promise.all(APP_PAGES.map((p) =>
    c.match(p).then((hit) => hit || fetch(p, { credentials: 'same-origin' })
      .then((res) => savePage(new Request(self.location.origin + p), res)).catch(() => {}))
  )));
}

let rewarmTimer = null;
function clearPages(rewarm) {
  clearTimeout(rewarmTimer);
  return caches.delete(PAGE_CACHE).then(() => {
    if (rewarm) rewarmTimer = setTimeout(warm, 2500);
  });
}

self.addEventListener('message', (e) => {
  if (e.data === 'warm') e.waitUntil(warm());
  if (e.data === 'clear') e.waitUntil(clearPages(false));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // A change (POST) makes the cached pages out of date: clear, then quietly reload them.
  // Chat traffic (typing, sending) doesn't change any page, so it's ignored.
  if (req.method !== 'GET') {
    if (!/^\/api\/(chats|messages)\//.test(url.pathname)) e.waitUntil(clearPages(true));
    return;
  }

  if (req.mode === 'navigate') {
    if (url.pathname === '/login/' || url.pathname === '/register/' || url.pathname === '/logout/') {
      e.waitUntil(clearPages(false));  // a different person may use the phone next
    }
    if (APP_PAGES.includes(url.pathname)) {
      const key = pageKey(url);
      e.respondWith(
        caches.open(PAGE_CACHE).then((c) => c.match(key)).then((cached) => {
          const fresh = fetch(req).then((res) => savePage(key, res));
          if (cached) {
            e.waitUntil(fresh.catch(() => {}));  // refresh quietly for next time
            return cached;                       // show instantly
          }
          return fresh.catch(() => caches.match(OFFLINE));
        })
      );
      return;
    }
    e.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
    return;
  }

  if (url.pathname.startsWith('/static/')) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(STATIC_CACHE).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
  }
  // Everything else (API, photos) goes straight to the network.
});

/* ---------- Push notifications (new messages, matches, likes, announcements) ---------- */
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data && e.data.text() }; }
  const title = d.title || 'Darlova';
  e.waitUntil(Promise.all([
    self.registration.showNotification(title, {
      body: d.body || '',
      icon: d.icon,
      badge: d.badge,
      tag: d.tag || undefined,          // a new message from the same chat replaces the old alert
      renotify: !!d.tag,
      data: { url: d.url || '/discover/' },
    }),
    // red number on the app icon (where the phone supports it)
    (d.count != null && self.navigator && 'setAppBadge' in self.navigator)
      ? (d.count ? self.navigator.setAppBadge(d.count) : self.navigator.clearAppBadge()).catch(() => {})
      : Promise.resolve(),
  ]));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/discover/', self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.startsWith(self.location.origin) && 'focus' in w) {
          return w.focus().then((f) => (f && 'navigate' in f ? f.navigate(url) : null));
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
"""


def service_worker(request):
    js = SERVICE_WORKER.replace("__VERSION__", APP_VERSION).replace("__ICON__", static("images/app/icon-192.png"))
    resp = HttpResponse(js, content_type="application/javascript")
    resp["Cache-Control"] = "no-cache"  # browsers check for a new worker on every visit
    resp["Service-Worker-Allowed"] = "/"
    return resp


def offline(request):
    return render(request, "frontend/offline.html")


def healthz(request):
    """Tiny page for a cron job to call every few minutes, so the app never 'falls asleep'."""
    resp = HttpResponse("ok", content_type="text/plain")
    resp["Cache-Control"] = "no-store"
    return resp
