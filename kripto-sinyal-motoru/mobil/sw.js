// Uygulama kabuğunu önbelleğe alır; uygulama dosyalarında önce ağ (güncellemeler hemen gelsin),
// ağ yoksa önbellek. Borsa/CoinGecko istekleri hiç önbelleğe alınmaz.
const CACHE = 'kirilim-v1';
const SHELL = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
  'js/app.js', 'js/data.js', 'js/scanner.js',
  'js/engine/analyzer.js', 'js/engine/config.js', 'js/engine/indicators.js', 'js/engine/macro.js',
  'js/engine/manipulation.js', 'js/engine/math.js', 'js/engine/patterns.js', 'js/engine/risk.js',
  'js/engine/smartmoney.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))),
  );
});
