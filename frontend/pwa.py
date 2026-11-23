"""
Installable web app (PWA): lets members "Add to Home Screen" from Safari or Chrome.
The icon opens full-screen (no browser bars) straight into the dashboard.
"""
import json

from django.http import HttpResponse
from django.shortcuts import render
from django.templatetags.static import static
from django.views.decorators.cache import cache_control

APP_VERSION = "1"  # bump to make every installed app refresh its offline cache


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


SERVICE_WORKER = """
/* Darlova service worker — offline page + fast static files. */
const CACHE = 'darlova-v__VERSION__';
const OFFLINE = '/offline/';
const PRECACHE = [OFFLINE, '__ICON__'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Pages: always try the network (fresh data), show the offline page if there's no connection.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
    return;
  }
  // CSS / JS / fonts / icons have a fingerprint in their name, so a cached copy is always right.
  if (url.pathname.startsWith('/static/')) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
        return res;
      }))
    );
  }
  // Everything else (API, photos) goes straight to the network.
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
