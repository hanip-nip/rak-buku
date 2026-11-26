import * as store from './store.js';
import { openPdf, renderPage } from './pdf.js';
import { setProgress } from './state.js';
import { buildLayout, positionAt, scrollTopFor, visibleRange } from './layout.js';
import { load, h } from './library.js';
import * as panels from './reader-panels.js';
import { setActiveSeries } from './sync.js';

const GAP = 8;
const MAX_LIVE_PX = 48e6; // R9: batas total piksel kanvas hidup
let r = null; // sesi pembaca aktif
let gen = 0;
let wanted = null; // seri yang diminta dibuka (juga saat hanya pesan "belum ada di perangkat" yang tampil)
const missText = (word, n) => `${word} ${n} belum ada di perangkat. Sambungkan internet untuk men-download.`;

const BACKUP = 'rak-pos:';

// R11: cadangan sinkron di localStorage, karena tulisan IndexedDB bisa hilang saat halaman langsung ditutup.
function readBackup(seriesId) {
  try {
    const raw = localStorage.getItem(BACKUP + seriesId);
    const b = JSON.parse(raw);
    const ok = typeof b?.fileId === 'string' && Number.isFinite(b.page) && Number.isFinite(b.offset) && Number.isFinite(b.updatedAt);
    return { b: ok ? b : null, raw };
  } catch { return { b: null, raw: null }; }
}
function dropBackup(seriesId, raw) {
  try { if (localStorage.getItem(BACKUP + seriesId) === raw) localStorage.removeItem(BACKUP + seriesId); } catch { /* storage diblokir */ }
}

const app = () => document.getElementById('app');
const back = () => { location.hash = '#/'; };

function message(text) {
  app().replaceChildren(h('div', { className: 'reader-msg' }, h('p', {}, text), h('button', { onclick: back }, 'Kembali ke rak')));
}

export async function open(seriesId) {
  close();
  setActiveSeries(wanted = seriesId);
  const my = ++gen;
  app().replaceChildren(h('p', { className: 'muted reader-msg' }, 'Memuat…'));
  await store.deviceId(); // supaya updateOwn saat pagehide tidak menunggu IDB untuk deviceId
  const view = await load();
  const s = view.series.find((x) => x.id === seriesId);
  if (my !== gen) return;
  let progress = view.progress[seriesId];
  const { b: backup, raw } = readBackup(seriesId);
  if (backup && s && backup.updatedAt > (progress?.updatedAt ?? -1)) {
    progress = backup;
    store.updateOwn((own) => setProgress(own, seriesId, backup, backup.updatedAt))
      .then(() => { dropBackup(seriesId, raw); window.dispatchEvent(new CustomEvent('rak:changed')); })
      .catch((e) => console.error('Gagal menerapkan cadangan posisi', e));
  } else if (raw != null) dropBackup(seriesId, raw);
  if (!s) return message('Seri tidak ditemukan.');
  if (!s.files.length) return message('Seri ini belum punya file.');
  const pi = s.files.findIndex((f) => f.id === progress?.fileId);
  const run = await localRun(s.files, Math.max(0, pi));
  const invert = await store.getKv(`invert:${seriesId}`).catch(() => false);
  if (my !== gen) return;
  const word = s.files.some((f) => /batch/i.test(f.name)) ? 'Batch' : 'Bagian';
  if (!run) return message(missText(word, Math.max(0, pi) + 1));
  const { lo, files } = run;

  const posEl = h('span', { className: 'rpos' });
  const spacer = h('div', { className: 'rpages' });
  const acts = {
    toc: () => panel(ses, panels.toc), bookmark: () => panel(ses, panels.bookmarks),
    night: () => panel(ses, panels.night), zoom: () => { if (ses.zoom !== 1) setZoom(ses, 1); },
  };
  const topMiss = h('p', { className: 'rmissing' }), botMiss = h('p', { className: 'rmissing' });
  const root = h('div', { className: `reader${invert ? ' invert' : ''}` }, topMiss, spacer, botMiss,
    h('header', { className: 'rbar rtop' },
      h('button', { 'aria-label': 'Kembali', onclick: back }, '←'),
      h('div', { className: 'rtitle' }, h('strong', {}, s.title), posEl)),
    h('nav', { className: 'rbar rbottom' }, ...[['toc', 'Daftar isi'], ['bookmark', 'Bookmark'], ['night', 'Malam'], ['zoom', 'Zoom']]
      .map(([k, t]) => h('button', { 'data-act': k, onclick: acts[k] }, t))));
  const ses = r = {
    seriesId, word, lo, files, topMiss, botMiss, all: s.files, multi: s.files.length > 1, root, spacer, posEl, zoom: 1,
    zoomBtn: root.querySelector('[data-act="zoom"]'), panel: null,
    slots: new Map(), docs: new Map(), L: null, W: 0, y0: 0, last: '', timer: 0, raf: 0, busy: false, lastScroll: 0, offs: [],
  };
  setMiss(ses);
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
  setActiveSeries(wanted = null);
  const s = r;
  if (!s) return;
  const pos = currentPos(s);
  r = null;
  s.panel?.();
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

// R16: file hasil prefetch. Tanpa sesi (pesan "belum ada") → buka ulang; dengan sesi → sambung layout, posisi dijaga.
window.addEventListener('rak:file-ready', async (e) => {
  const s = r;
  if (!s) { if (wanted && document.querySelector('.reader-msg')) open(wanted); return; }
  const id = e.detail?.fileId;
  if (!s.all.some((f) => f.id === id) || s.files.some((f) => f.id === id)) return;
  const { lo, files: { length: n } } = s;
  const run = await localRun(s.all, lo);
  if (s !== r || s.lo !== lo || s.files.length !== n || !run || run.files.length === n) return;
  const pos = currentPos(s);
  s.lo = run.lo;
  s.files = run.files;
  setMiss(s);
  layoutPages(s);
  if (pos) window.scrollTo(window.scrollX, s.y0 + scrollTopFor(s.L, pos));
  update(s);
});

// Rentang file lokal berurutan terpanjang yang memuat all[at] (file dari perangkat lain bisa di tengah seri); null kalau all[at] tidak lokal.
async function localRun(all, at) {
  const local = async (f) => {
    const m = (await store.hasBlob(f.id)) ? await store.getMeta(f.id) : null;
    return m?.sizes?.length ? { id: f.id, sizes: m.sizes, outline: m.outline ?? [] } : null;
  };
  const mid = await local(all[at]);
  if (!mid) return null;
  const files = [mid];
  let lo = at;
  for (let m; lo > 0 && (m = await local(all[lo - 1]));) { files.unshift(m); lo--; }
  for (let m, i = at + 1; i < all.length && (m = await local(all[i])); i++) files.push(m);
  return { lo, files };
}

function setMiss(s) {
  const hi = s.lo + s.files.length;
  s.topMiss.hidden = s.lo === 0;
  s.topMiss.textContent = missText(s.word, s.lo);
  s.botMiss.hidden = hi === s.all.length;
  s.botMiss.textContent = missText(s.word, hi + 1);
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

// Panel (bottom sheet) menempel di body; satu yang terbuka per sesi.
function panel(s, fn) {
  s.panel?.();
  s.panel = fn(s, { here: () => currentPos(s), jump: (pos) => window.scrollTo(window.scrollX, s.y0 + scrollTopFor(s.L, pos)) });
}

// Bangun ulang layout di zoom z lalu pulihkan pos; dengan `at` = {cx, mx, my}, pos adalah posisi di titik tengah cubitan (tetap di bawah jari).
function setZoom(s, z, pos = currentPos(s), at = null) {
  const k = z / s.zoom;
  s.zoom = z;
  s.spacer.style.transform = '';
  layoutPages(s);
  const left = s.spacer.getBoundingClientRect().left + window.scrollX;
  window.scrollTo(at ? left + at.cx * k - at.mx : 0, s.y0 + (pos ? scrollTopFor(s.L, pos) : 0) - (at ? at.my : 0));
  s.zoomBtn.textContent = z === 1 ? 'Zoom' : `Zoom ${Math.round(z * 100)}%`;
  update(s);
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const two = (ptrs) => { const [a, b] = ptrs.values(); return { a, b, d: Math.hypot(a.x - b.x, a.y - b.y) }; };

function startPinch(s, ptrs) {
  const { a, b, d } = two(ptrs);
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const rect = s.spacer.getBoundingClientRect();
  s.spacer.style.transformOrigin = `${mx - rect.left}px ${my - rect.top}px`;
  return { d0: d || 1, k: 1, pos: positionAt(s.L, Math.max(0, window.scrollY - s.y0 + my)), cx: mx - rect.left, mx, my };
}

function movePinch(s, p, ptrs) {
  p.k = clamp(two(ptrs).d / p.d0, 1 / s.zoom, 4 / s.zoom);
  s.spacer.style.transform = `scale(${p.k})`;
}

function endPinch(s, p) {
  const z = clamp(s.zoom * p.k, 1, 4);
  if (Math.abs(z - s.zoom) < 0.01) s.spacer.style.transform = '';
  else setZoom(s, z, p.pos, p);
}

const currentPos = (s) => positionAt(s.L, Math.max(0, window.scrollY - s.y0));
const key = (p) => `${p.fileId}|${p.page}|${p.offset.toFixed(4)}`;

async function persist(s, pos) {
  const k = key(pos);
  if (k === s.last) return;
  s.last = k;
  const now = Date.now();
  let raw = null;
  try {
    raw = JSON.stringify({ fileId: pos.fileId, page: pos.page, offset: pos.offset, updatedAt: now });
    localStorage.setItem(BACKUP + s.seriesId, raw);
  } catch { /* storage diblokir; IDB tetap dicoba */ }
  try {
    await store.updateOwn((own) => setProgress(own, s.seriesId, pos, now));
    dropBackup(s.seriesId, raw);
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
  // Pointer dilacak per pointerId (up/cancel di window, supaya slot yang dibuang tidak meninggalkan entri basi).
  // Ketuk tunggal: tanpa geser > 10 px, < 300 ms, satu jari, bukan saat scroll/momentum.
  const ptrs = new Map();
  let tap = null, pinch = null, lastTap = null, tapTimer = 0;
  const toggle = () => s.root.classList.toggle('bars');
  s.offs.push(() => clearTimeout(tapTimer));
  on(s.root, 'pointerdown', (e) => {
    if (e.target.closest('.rbar')) return;
    if (e.isPrimary) ptrs.clear();
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const now = performance.now();
    tap = ptrs.size === 1 && now - s.lastScroll > 150 ? { x: e.clientX, y: e.clientY, t: now, sx: window.scrollX, sy: window.scrollY } : null;
    if (ptrs.size === 2) pinch = startPinch(s, ptrs);
  });
  on(window, 'pointermove', (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (tap && Math.hypot(p.x - tap.x, p.y - tap.y) > 10) tap = null;
    if (pinch && ptrs.size >= 2) movePinch(s, pinch, ptrs);
  });
  const end = (e, up) => {
    if (!ptrs.delete(e.pointerId)) return;
    if (pinch) {
      if (ptrs.size < 2) { endPinch(s, pinch); pinch = null; }
    } else if (up && tap && performance.now() - tap.t < 300 && Math.abs(window.scrollY - tap.sy) < 2 && Math.abs(window.scrollX - tap.sx) < 2) {
      // Ketuk dua kali (< 300 ms, < 25 px) = zoom 1. Saat zoom > 1 ketuk tunggal ditunda agar tidak berkedip.
      const now = performance.now();
      if (lastTap && now - lastTap.t < 300 && Math.hypot(tap.x - lastTap.x, tap.y - lastTap.y) < 25) {
        lastTap = null;
        clearTimeout(tapTimer);
        if (s.zoom !== 1) setZoom(s, 1);
      } else {
        lastTap = { x: tap.x, y: tap.y, t: now };
        if (s.zoom === 1) toggle(); else tapTimer = setTimeout(toggle, 300);
      }
    }
    tap = null;
  };
  on(window, 'pointerup', (e) => end(e, true));
  on(window, 'pointercancel', (e) => end(e, false));
  // Cegah zoom/geser bawaan browser saat dua jari; cubit ditangani sendiri.
  on(s.root, 'touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  on(document, 'gesturestart', (e) => e.preventDefault());
}

function update(s) {
  s.raf = 0;
  if (s !== r) return;
  const y = Math.max(0, window.scrollY - s.y0);
  const H = window.innerHeight;
  const [a, b] = visibleRange(s.L, y, H, s.zoom > 1 ? 1 : 2);
  for (const i of [...s.slots.keys()]) if (i < a || i > b) drop(s, i);
  // R13: halaman yang terlihat selalu di dpr target (hanya dibatasi 16,7 Mpx per kanvas di renderPage);
  // anggaran 48 Mpx hanya menurunkan dpr tetangga di luar layar.
  const T = Math.min(window.devicePixelRatio || 1, 2);
  const vis = (i) => s.L.tops[i] < y + H && s.L.tops[i] + s.L.heights[i] > y;
  let used = 0, off = 0;
  for (let i = a; i <= b; i++) {
    const area = s.W * s.L.heights[i];
    if (vis(i)) used += Math.min(area * T * T, 16777216); else off += area;
    if (s.slots.has(i)) continue;
    const canvas = h('canvas', { 'aria-hidden': 'true', width: 0, height: 0 }); // 0 sampai digambar, bukan 300x150 bawaan
    const el = h('div', { className: 'rslot' }, canvas);
    el.style.top = `${s.L.tops[i]}px`;
    el.style.height = `${s.L.heights[i]}px`;
    s.spacer.append(el);
    s.slots.set(i, { el, canvas, dpr: 0, target: 0, vis: false, failed: false });
  }
  // dpr tetangga diturunkan seperempat-seperempat supaya tidak memicu render ulang untuk selisih kecil; 0.25 = jaring pengaman memori.
  const want = Math.min(T, Math.sqrt(Math.max(0, MAX_LIVE_PX - used) / (off || 1)));
  const offDpr = Math.max(0.25, Math.floor(want * 4) / 4);
  for (const [i, sl] of s.slots) { sl.vis = vis(i); sl.target = sl.vis ? T : offDpr; }
  showPos(s, y);
  pump(s);
}

function showPos(s, y) {
  const p = positionAt(s.L, y);
  if (!p) return;
  const f = s.files.find((x) => x.id === p.fileId);
  const text = `${s.multi ? `${s.word} ${s.all.findIndex((x) => x.id === p.fileId) + 1} · ` : ''}hal ${p.page} dari ${f.sizes.length}`;
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

// Slot yang belum digambar, di atas target (turunkan), atau terlihat di bawah target (naikkan); terdekat ke tengah dulu.
function nextJob(s) {
  const mid = window.scrollY - s.y0 + window.innerHeight / 2;
  let best = -1, dist = Infinity;
  for (const [i, sl] of s.slots) {
    if (sl.failed || (sl.dpr && sl.dpr <= sl.target && !(sl.vis && sl.dpr < sl.target))) continue;
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
      const sl = s.slots.get(i), p = s.L.pages[i], dpr = sl.target, W = s.W;
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
