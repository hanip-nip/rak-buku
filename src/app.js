import * as store from './store.js';
import * as library from './library.js';
import * as reader from './reader.js';
import * as transfers from './transfers.js';
import * as series from './series.js';
import * as auth from './auth.js';
import * as drive from './drive.js';
import * as pdf from './pdf.js';
import { createSync, syncOnChange } from './sync.js';

const sync = createSync({ drive, store, auth, pdf });

const app = () => document.getElementById('app');
let pauseUntil = 0;

async function takeAuthHash() {
  const { error } = await auth.takeAuthFromHash().catch(() => ({}));
  if (error) {
    const p = document.createElement('p');
    p.textContent = `Gagal masuk: ${error}`;
    app().before(p);
  }
}

function route() {
  const m = /^#\/baca\/(.+)$/.exec(location.hash);
  transfers.hide();
  series.hide();
  const sm = /^#\/seri\/(.+)$/.exec(location.hash);
  if (sm) {
    reader.close();
    let id;
    try { id = decodeURIComponent(sm[1]); } catch { id = sm[1]; }
    series.show(id);
  } else if (location.hash === '#/transfer') {
    reader.close();
    transfers.show();
  } else if (m) {
    let id;
    try { id = decodeURIComponent(m[1]); } catch { id = m[1]; }
    reader.open(id);
  } else {
    reader.close();
    library.show();
  }
}

async function boot() {
  await takeAuthHash(); // auth harus tersimpan sebelum sync/route membacanya
  store.getKv('theme').then((t) => { if (t) document.documentElement.dataset.theme = t; }).catch(() => {});
  navigator.storage?.persist?.();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  window.addEventListener('hashchange', route);
  route();
  // Pemicu sync. 'rak:refresh' sengaja tidak memicu, supaya tidak berputar.
  window.addEventListener('rak:changed', () => { if (syncOnChange()) sync.schedule(); });
  window.addEventListener('online', () => sync.run());
  window.addEventListener('rak:need', () => { pauseUntil = 0; sync.run(); }); // pembaca butuh file / tombol sinkron
  window.addEventListener('pagehide', sync.stop);
  // Sync tiap 1 dtk selama aplikasi terlihat (cukup 1 permintaan daftar status kalau tidak ada yang berubah); juga saat disembunyikan/ditampilkan.
  document.addEventListener('visibilitychange', () => sync.run());
  // Gagal -> jeda 30 dtk, supaya error Drive tidak diulang tiap detik.
  setInterval(async () => {
    if (document.visibilityState !== 'visible' || !navigator.onLine || Date.now() < pauseUntil) return;
    const r = await sync.run();
    if (r === 'error' || r === 'relogin') pauseUntil = Date.now() + 30_000;
  }, 1000);
  sync.run();
}
boot();
