import * as store from './store.js';
import * as library from './library.js';
import * as reader from './reader.js';
import * as auth from './auth.js';

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

takeAuthHash();
store.getKv('theme').then((t) => { if (t) document.documentElement.dataset.theme = t; }).catch(() => {});
navigator.storage?.persist?.();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
window.addEventListener('hashchange', route);
route();
