// Tiap deploy yang mengubah file aplikasi mana pun WAJIB menaikkan VERSION, kalau tidak perangkat tetap memakai cache lama.
const VERSION = 'v9';
const CACHE = `rak-buku-${VERSION}`;
const FILES = [
  './', 'index.html', 'app.css', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  'src/app.js', 'src/library.js', 'src/reader.js', 'src/reader-panels.js', 'src/store.js', 'src/pdf.js',
  'src/natsort.js', 'src/state.js', 'src/merge.js', 'src/layout.js', 'src/prefetch.js',
  'src/config.js', 'src/auth.js', 'src/drive.js', 'src/sync.js', 'src/transfers.js', 'src/series.js', 'src/icons.js',
  'vendor/pdf.min.mjs', 'vendor/pdf.worker.min.mjs',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req)).catch(() => (
      req.mode === 'navigate' ? caches.match('index.html') : Response.error()
    )),
  );
});
