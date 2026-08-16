/* Service Worker — Netz zuerst, Cache als Rückfall.
 *
 * Warum nicht Cache zuerst: Dann müsstest du nach jeder Änderung eine
 * Versionsnummer hochzählen. Netz zuerst heißt: neue Fassung sofort, sobald
 * Empfang da ist — und beim Laufen ohne Netz greift der Cache.
 */
const CACHE = "intervall";
const SHELL = [
  "./", "./index.html", "./styles.css", "./app.js",
  "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png"
];
const TIMEOUT = 3500;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function fromNetwork(req) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), TIMEOUT);
    fetch(req).then(res => {
      clearTimeout(t);
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      resolve(res);
    }, err => { clearTimeout(t); reject(err); });
  });
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const own = url.origin === location.origin;
  const leaflet = url.hostname === "unpkg.com";
  const tiles = url.hostname.endsWith("tile.openstreetmap.org");

  if (tiles) return;                       // Kacheln nicht zwischenspeichern

  if (leaflet) {                           // Bibliothek: Cache zuerst, das reicht
    e.respondWith(caches.match(req).then(hit => hit || fromNetwork(req).catch(() => hit)));
    return;
  }
  if (!own) return;

  e.respondWith(
    fromNetwork(req).catch(() =>
      caches.match(req).then(hit => hit || caches.match("./index.html"))
    )
  );
});
