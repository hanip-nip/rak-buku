import * as store from './store.js';
import { load, h } from './library.js';
import { filesToFetch } from './prefetch.js';
import { icon } from './icons.js';

// Halaman Transfer: upload ke Drive dan download ke perangkat ini, dengan progres langsung dari rak:sync.
let last = null; // detail rak:sync terakhir: {state, detail}
let view = null; // {root, list, now}
let raf = 0;

window.addEventListener('rak:sync', (e) => {
  last = e.detail;
  if (view && !raf) raf = requestAnimationFrame(() => { raf = 0; paint(); });
});
window.addEventListener('rak:refresh', () => { if (view) paint(); });

const pct = (a, b) => Math.min(100, Math.floor((a / (b || 1)) * 100));
const mb = (n) => `${(n / 1048576).toFixed(n < 10 * 1048576 ? 1 : 0)} MB`;

function row(title, sub, value, max) {
  return h('div', { className: 'xfer' },
    h('div', { className: 'xfer-text' }, h('strong', {}, title), h('small', {}, sub)),
    max ? h('div', { className: 'thin', role: 'progressbar', 'aria-valuenow': pct(value, max), 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': `${title}: ${pct(value, max)}%` }, h('i', { style: `width:${pct(value, max)}%` })) : null);
}

async function paint() {
  const v = view;
  if (!v) return;
  const [merged, jobs, wanted, all] = await Promise.all([load(), store.outboxAll(), store.getKv('wanted'), store.getKv('fetchAll')]);
  const queued = [];
  for (const sid of new Set([...(all ?? []), ...(wanted ?? [])])) {
    const s = merged.series.find((x) => x.id === sid);
    if (!s) continue;
    const local = new Set();
    for (const f of s.files) if (await store.hasBlob(f.id)) local.add(f.id);
    const ids = (all ?? []).includes(sid) ? s.files.map((f) => f.id).filter((x) => !local.has(x)) : filesToFetch(s, merged.progress[sid], (x) => local.has(x));
    for (const id of ids) if (!queued.includes(id)) queued.push(id);
  }
  if (v !== view) return;
  const names = new Map();
  for (const s of merged.series) for (const f of s.files) names.set(f.id, { file: f.name, series: s.title });
  const nameOf = (id) => names.get(id) ?? { file: 'File', series: '' };
  const d = last?.state === 'syncing' ? last.detail ?? {} : {};

  const ups = jobs.filter((j) => j.type === 'upload');
  const upRows = ups.map((j) => {
    const n = nameOf(j.fileId);
    const live = d.kind === 'up' && d.fileId === j.fileId;
    const size = live ? d.size : j.size ?? 0;
    const sent = live ? d.sent : 0;
    return row(n.file, `${n.series} · ${live ? `${mb(sent)} / ${mb(size)} · ${pct(sent, size)}%` : 'Menunggu giliran'}`, sent, live ? size : 0);
  });
  const down = d.kind === 'down' ? (() => {
    const n = nameOf(d.fileId);
    return row(n.file, `${n.series} · ${mb(d.got)} / ${mb(d.size)} · ${pct(d.got, d.size)}%`, d.got, d.size);
  })() : null;

  const state = last?.state;
  v.now.textContent = state === 'syncing' ? 'Sedang berjalan'
    : state === 'offline' ? 'Offline: transfer berlanjut saat internet tersambung'
      : state === 'login' || state === 'relogin' ? 'Masuk ke Google dulu untuk upload dan download'
        : state === 'error' ? 'Sinkron gagal, dicoba lagi otomatis'
          : ups.length || queued.length ? [ups.length ? `${ups.length} upload` : '', queued.length ? `${queued.length} download` : ''].filter(Boolean).join(', ') + ' menunggu'
            : 'Semua tersinkron';
  v.list.replaceChildren(...[
    h('h2', {}, 'Download ke perangkat ini'),
    down,
    ...queued.filter((id) => !(d.kind === 'down' && d.fileId === id)).map((id) => {
      const n = nameOf(id);
      return row(n.file, `${n.series} · Menunggu giliran`, 0, 0);
    }),
    !down && !queued.length ? h('p', { className: 'muted' }, 'Tidak ada download. Buku yang Anda buka di perangkat ini di-download otomatis, termasuk 2 batch berikutnya.') : null,
    h('h2', {}, `Upload ke Drive${ups.length ? ` (${ups.length})` : ''}`),
    ...(upRows.length ? upRows : [h('p', { className: 'muted' }, 'Tidak ada antrean upload.')])].filter(Boolean));
}

export function show() {
  const list = h('section', { className: 'xfer-list' });
  const now = h('p', { className: 'muted' });
  const refresh = h('button', { className: 'icon-btn', 'aria-label': 'Sinkronkan sekarang', title: 'Sinkronkan sekarang',
    onclick: () => window.dispatchEvent(new CustomEvent('rak:need')) }, icon('sync'));
  const root = h('div', { className: 'page' },
    h('header', { className: 'top' },
      h('a', { className: 'icon-btn', href: '#/', 'aria-label': 'Kembali ke rak' }, icon('back')),
      h('h1', {}, 'Transfer'), refresh),
    now, list);
  view = { root, list, now };
  document.getElementById('app').replaceChildren(root);
  paint();
}

export function hide() { view = null; }
