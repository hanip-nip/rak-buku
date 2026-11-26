import * as store from './store.js';
import * as library from './library.js';
import * as reader from './reader.js';
import * as auth from './auth.js';
import * as drive from './drive.js';
import * as pdf from './pdf.js';
import { createSync, activeSeries, syncOnChange } from './sync.js';

const sync = createSync({ drive, store, auth, pdf });

const app = () => document.getElementById('app');

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
  if (m) {
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
  window.addEventListener('pagehide', sync.stop);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') sync.run(); });
  setInterval(() => { if (activeSeries()) sync.run(); }, 30_000);
  sync.run();
}
boot();
