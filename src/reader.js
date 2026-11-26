import * as store from './store.js';
import { openPdf, renderPage } from './pdf.js';
import { setProgress } from './state.js';
import { buildLayout, positionAt, scrollTopFor, visibleRange } from './layout.js';
import { load, h } from './library.js';

const GAP = 8;
const MAX_LIVE_PX = 48e6; // R9: batas total piksel kanvas hidup
let r = null; // sesi pembaca aktif
let gen = 0;

const app = () => document.getElementById('app');
const back = () => { location.hash = '#/'; };

function message(text) {
  app().replaceChildren(h('div', { className: 'reader-msg' }, h('p', {}, text), h('button', { onclick: back }, 'Kembali ke rak')));
}

export async function open(seriesId) {
  close();
  const my = ++gen;
  app().replaceChildren(h('p', { className: 'muted reader-msg' }, 'Memuat…'));
  const view = await load();
  const s = view.series.find((x) => x.id === seriesId);
  if (my !== gen) return;
  if (!s) return message('Seri tidak ditemukan.');
  if (!s.files.length) return message('Seri ini belum punya file.');
  const files = [];
  for (const f of s.files) {
    const meta = (await store.hasBlob(f.id)) ? await store.getMeta(f.id) : null;
    if (!meta?.sizes?.length) break;
    files.push({ id: f.id, sizes: meta.sizes });
  }
  if (my !== gen) return;
  const word = s.files.some((f) => /batch/i.test(f.name)) ? 'Batch' : 'Bagian';
  const missText = `${word} ${files.length + 1} belum ada di perangkat. Sambungkan internet untuk men-download.`;
  const progress = view.progress[seriesId];
  const pi = s.files.findIndex((f) => f.id === progress?.fileId);
  if (!files.length || pi >= files.length) return message(missText);

  const posEl = h('span', { className: 'rpos' });
  const spacer = h('div', { className: 'rpages' });
  const root = h('div', { className: 'reader' }, spacer,
    files.length < s.files.length ? h('p', { className: 'rmissing' }, missText) : null,
    h('header', { className: 'rbar rtop' },
      h('button', { 'aria-label': 'Kembali', onclick: back }, '←'),
      h('div', { className: 'rtitle' }, h('strong', {}, s.title), posEl)),
    h('nav', { className: 'rbar rbottom' }, ...[['toc', 'Daftar isi'], ['bookmark', 'Bookmark'], ['night', 'Malam'], ['zoom', 'Zoom']]
      .map(([k, t]) => h('button', { 'data-act': k, 'aria-label': t }, t))));
  const ses = r = {
    seriesId, word, files, multi: s.files.length > 1, root, spacer, posEl, zoom: 1,
    slots: new Map(), docs: new Map(), L: null, W: 0, y0: 0, dpr: 1, last: '', timer: 0, raf: 0, busy: false, lastScroll: 0, offs: [],
  };
  history.scrollRestoration = 'manual';
  app().replaceChildren(root);
  layoutPages(ses);
  window.scrollTo(0, progress && pi >= 0 ? ses.y0 + scrollTopFor(ses.L, progress) : 0);
  const p0 = currentPos(ses);
  ses.last = p0 ? key(p0) : '';
  listen(ses);
  update(ses);
}

export function close() {
  gen++;
  const s = r;
  if (!s) return;
  const pos = currentPos(s);
  r = null;
  for (const off of s.offs) off();
  clearTimeout(s.timer);
  cancelAnimationFrame(s.raf);
  for (const i of [...s.slots.keys()]) drop(s, i);
  for (const p of s.docs.values()) p.then((d) => d.destroy()).catch(() => {});
  s.docs.clear();
  s.root.remove();
  window.scrollTo(0, 0);
  if (pos) persist(s, pos);
}

function layoutPages(s) {
  s.W = Math.min(window.innerWidth, 900) * s.zoom;
  const pages = s.files.flatMap((f) => f.sizes.map((z, k) => ({ fileId: f.id, page: k + 1, height: (z.h / z.w) * s.W })));
  s.L = buildLayout(pages, GAP);
  s.spacer.style.width = `${s.W}px`;
  s.spacer.style.height = `${s.L.total}px`;
  for (const i of [...s.slots.keys()]) drop(s, i);
  s.y0 = s.spacer.getBoundingClientRect().top + window.scrollY;
}

const currentPos = (s) => positionAt(s.L, Math.max(0, window.scrollY - s.y0));
const key = (p) => `${p.fileId}|${p.page}|${p.offset.toFixed(4)}`;

async function persist(s, pos) {
  const k = key(pos);
  if (k === s.last) return;
  s.last = k;
  try {
    const own = await store.getOwn();
    await store.saveOwn(setProgress(own, s.seriesId, pos, Date.now()));
    window.dispatchEvent(new CustomEvent('rak:changed'));
  } catch (e) {
    s.last = '';
    console.error('Gagal menyimpan posisi baca', e);
  }
}

const saveNow = (s) => { clearTimeout(s.timer); const p = currentPos(s); if (p) persist(s, p); };

function listen(s) {
  const on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); s.offs.push(() => t.removeEventListener(ev, fn, opt)); };
  on(window, 'scroll', () => {
    s.lastScroll = performance.now();
    if (!s.raf) s.raf = requestAnimationFrame(() => update(s));
    clearTimeout(s.timer);
    s.timer = setTimeout(() => saveNow(s), 1000);
  }, { passive: true });
  on(window, 'resize', () => {
    if (Math.min(window.innerWidth, 900) * s.zoom === s.W) return;
    const pos = currentPos(s);
    layoutPages(s);
    if (pos) window.scrollTo(0, s.y0 + scrollTopFor(s.L, pos));
    update(s);
  });
  on(window, 'pagehide', () => saveNow(s));
  on(document, 'visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(s); });
  // Ketuk tunggal: tanpa geser > 10 px, < 300 ms, satu jari, bukan saat scroll/momentum.
  let tap = null, fingers = 0;
  on(s.root, 'pointerdown', (e) => {
    fingers++;
    const now = performance.now();
    tap = fingers === 1 && !e.target.closest('.rbar') && now - s.lastScroll > 150 ? { x: e.clientX, y: e.clientY, t: now, sy: window.scrollY } : null;
  });
  on(s.root, 'pointermove', (e) => { if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 10) tap = null; });
  on(s.root, 'pointerup', () => {
    fingers = Math.max(0, fingers - 1);
    if (tap && performance.now() - tap.t < 300 && Math.abs(window.scrollY - tap.sy) < 2) s.root.classList.toggle('bars');
    tap = null;
  });
  on(s.root, 'pointercancel', () => { fingers = Math.max(0, fingers - 1); tap = null; });
}

function update(s) {
  s.raf = 0;
  if (s !== r) return;
  const y = Math.max(0, window.scrollY - s.y0);
  const [a, b] = visibleRange(s.L, y, window.innerHeight, 2);
  for (const i of [...s.slots.keys()]) if (i < a || i > b) drop(s, i);
  let area = 0;
  for (let i = a; i <= b; i++) {
    area += s.W * s.L.heights[i];
    if (s.slots.has(i)) continue;
    const canvas = h('canvas', { 'aria-hidden': 'true' });
    const el = h('div', { className: 'rslot' }, canvas);
    el.style.top = `${s.L.tops[i]}px`;
    el.style.height = `${s.L.heights[i]}px`;
    s.spacer.append(el);
    s.slots.set(i, { el, canvas, dpr: 0, failed: false });
  }
  // dpr diturunkan seperempat-seperempat supaya tidak memicu render ulang untuk selisih kecil.
  const want = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(MAX_LIVE_PX / (area || 1)));
  s.dpr = Math.max(1, Math.floor(want * 4) / 4);
  showPos(s, y);
  pump(s);
}

function showPos(s, y) {
  const p = positionAt(s.L, y);
  if (!p) return;
  const fi = s.files.findIndex((f) => f.id === p.fileId);
  const text = `${s.multi ? `${s.word} ${fi + 1} · ` : ''}hal ${p.page} dari ${s.files[fi].sizes.length}`;
  if (s.posEl.textContent !== text) s.posEl.textContent = text;
}

function release(canvas) {
  canvas.width = canvas.height = 0;
  canvas.remove();
}

function drop(s, i) {
  const sl = s.slots.get(i);
  release(sl.canvas);
  sl.el.remove();
  s.slots.delete(i);
}

// Slot yang belum digambar atau dpr-nya di atas anggaran; terdekat ke tengah layar dulu.
function nextJob(s) {
  const mid = window.scrollY - s.y0 + window.innerHeight / 2;
  let best = -1, dist = Infinity;
  for (const [i, sl] of s.slots) {
    if (sl.failed || (sl.dpr && sl.dpr <= s.dpr)) continue;
    const d = Math.abs(s.L.tops[i] + s.L.heights[i] / 2 - mid);
    if (d < dist) { dist = d; best = i; }
  }
  return best < 0 ? null : best;
}

async function pump(s) {
  if (s.busy) return;
  s.busy = true;
  try {
    for (let i; s === r && (i = nextJob(s)) != null;) {
      const sl = s.slots.get(i), p = s.L.pages[i], dpr = s.dpr, W = s.W;
      try {
        const doc = await getDoc(s, p.fileId);
        if (s.slots.get(i) !== sl) continue;
        await renderPage(doc, p.page, sl.canvas, W, dpr);
        if (s.slots.get(i) !== sl) release(sl.canvas);
        else sl.dpr = dpr;
      } catch (e) {
        sl.failed = true;
        if (s === r) console.error('Gagal menggambar halaman', p.page, e);
      }
    }
  } finally {
    s.busy = false;
  }
}

// Maksimal 2 PDFDocumentProxy terbuka (LRU); yang tergusur di-destroy.
function getDoc(s, fileId) {
  let p = s.docs.get(fileId);
  if (p) { s.docs.delete(fileId); s.docs.set(fileId, p); return p; }
  p = store.getBlob(fileId).then((b) => {
    if (!b) throw new Error('File tidak ada di perangkat');
    return openPdf(b);
  });
  p.catch(() => { if (s.docs.get(fileId) === p) s.docs.delete(fileId); });
  s.docs.set(fileId, p);
  while (s.docs.size > 2) {
    const [k, old] = s.docs.entries().next().value;
    s.docs.delete(k);
    old.then((d) => d.destroy()).catch(() => {});
  }
  return p;
}
