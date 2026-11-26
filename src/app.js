import * as store from './store.js';
import * as library from './library.js';
import * as reader from './reader.js';

const app = () => document.getElementById('app');

function takeAuthHash() {
  const m = /^#(auth|auth-error)=(.*)$/.exec(location.hash);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  let val;
  try { val = decodeURIComponent(m[2]); } catch { val = null; }
  if (m[1] === 'auth' && val) store.setAuth(val).catch(() => {});
  else {
    const p = document.createElement('p');
    p.textContent = `Gagal masuk: ${val ?? 'data tidak valid'}`;
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
navigator.storage?.persist?.();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
window.addEventListener('hashchange', route);
route();
