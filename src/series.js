import * as store from './store.js';
import { load, h, menu, CATS, percent, posText, localState, readUrl, ago, lastDevice } from './library.js';
import { setProgress, addHistory } from './state.js';
import { icon } from './icons.js';

// Halaman seri: sampul, Lanjut baca, Download semua batch, daftar batch/bagian dengan status baca dan letak file.
let view = null; // {id, root, list, dlBtn, filter, desc}

for (const ev of ['rak:changed', 'rak:refresh', 'rak:file-ready']) window.addEventListener(ev, () => { if (view) paint(); });

const wordOf = (s) => (s.files.some((f) => /batch/i.test(f.name)) ? 'Batch' : 'Bagian');

// Mulai dari file tertentu = posisi baca baru (ikut tersinkron, dan sync men-download file itu kalau belum ada).
async function startAt(s, fileId) {
  const pos = { fileId, page: 1, offset: 0 };
  const now = Date.now();
  try {
    await store.updateOwn((own) => addHistory(setProgress(own, s.id, pos, now), s.id, pos, now));
    try { localStorage.removeItem(`rak-pos:${s.id}`); } catch { /* storage diblokir */ }
    window.dispatchEvent(new CustomEvent('rak:changed'));
  } catch (e) { console.error('Gagal memindah posisi', e); }
  location.hash = readUrl(s);
}

async function paint() {
  const v = view;
  if (!v) return;
  const data = await load();
  const s = data.series.find((x) => x.id === v.id);
  if (v !== view) return;
  if (!s) { v.root.replaceChildren(h('p', { className: 'muted empty' }, 'Seri tidak ditemukan.')); return; }
  const p = data.progress[s.id];
  const cur = s.files.findIndex((f) => f.id === p?.fileId);
  const [pos, local, all, who] = await Promise.all([posText(s, p), localState(s), store.getKv('fetchAll'), lastDevice(s.id, p)]);
  const has = await Promise.all(s.files.map((f) => store.hasBlob(f.id)));
  if (v !== view) return;
  const fetching = (all ?? []).includes(s.id);
  const missing = has.filter((x) => !x).length;
  const word = wordOf(s);

  v.head.replaceChildren(
    h('div', { className: 'detail-cover cover' }, s.cover ? h('img', { src: s.cover, alt: '' }) : h('span', { className: 'cover-blank' }, s.title.slice(0, 1))),
    h('div', { className: 'detail-info' },
      h('h1', {}, s.title),
      h('p', { className: 'muted' }, `${CATS[s.category] ?? ''} · ${s.files.length > 1 ? `${s.files.length} ${word.toLowerCase()} · ` : ''}${local}`),
      h('p', { className: 'num' }, pos),
      p ? h('p', { className: 'muted' }, `${who ? `di ${who} · ` : ''}${ago(p.updatedAt)}`) : null,
      h('div', { className: 'thin' }, h('i', { style: `width:${percent(s, p)}%` }))));

  const dl = !missing ? h('p', { className: 'muted' }, icon('check'), ' Semua file sudah ada di perangkat ini.')
    : h('button', {
      className: fetching ? 'btn' : 'btn',
      'aria-pressed': String(fetching),
      onclick: async () => {
        await store.setFetchAll(s.id, !fetching);
        if (!fetching) window.dispatchEvent(new CustomEvent('rak:need'));
        paint();
      },
    }, icon('cloud'), fetching ? `Batalkan download semua (${missing} tersisa)` : `Download semua ${word.toLowerCase()} (${missing})`);
  v.actions.replaceChildren(...[
    h('a', { className: 'btn primary', href: readUrl(s) }, icon('book'), p ? 'Lanjut baca' : 'Mulai baca'),
    dl,
    fetching && missing ? h('p', { className: 'muted' }, 'Berjalan selama aplikasi terbuka. Lihat progresnya di Transfer.') : null].filter(Boolean));

  const q = v.filter.value.trim().toLowerCase();
  const order = s.files.map((f, i) => ({ f, i })).filter(({ f, i }) => !q || `${word} ${i + 1} ${f.name}`.toLowerCase().includes(q));
  if (v.desc) order.reverse();
  v.list.replaceChildren(...(order.length ? order.map(({ f, i }) => {
    const state = i < cur ? 'Selesai' : i === cur ? `Sedang dibaca · hal ${p.page}` : 'Belum dibaca';
    const where = has[i] ? 'Di perangkat' : f.driveId ? 'Di Drive' : 'Belum di-upload';
    return h('button', { className: `chap${i === cur ? ' on' : ''}${i < cur ? ' done' : ''}`, onclick: () => startAt(s, f.id) },
      h('span', { className: 'chap-n num' }, String(i + 1)),
      h('span', { className: 'chap-t' }, h('strong', {}, s.files.length > 1 ? `${word} ${i + 1}` : f.name), h('small', {}, `${f.pages} hal · ${state}`)),
      h('span', { className: `chip${has[i] ? ' ok' : ''}` }, icon(has[i] ? 'phone' : 'cloud'), where));
  }) : [h('p', { className: 'muted empty' }, 'Tidak ada yang cocok.')]));
}

export function show(id) {
  const head = h('div', { className: 'detail-head' });
  const actions = h('div', { className: 'detail-actions' });
  const list = h('div', { className: 'chap-list' });
  const filter = h('input', { type: 'search', placeholder: 'Cari batch…', 'aria-label': 'Cari batch', oninput: () => paint() });
  const sortBtn = h('button', { className: 'btn', onclick: () => { view.desc = !view.desc; sortBtn.lastChild.textContent = view.desc ? 'Terbaru dulu' : 'Terlama dulu'; paint(); } },
    icon('list'), h('span', {}, 'Terlama dulu'));
  const more = h('button', { className: 'icon-btn', 'aria-label': 'Menu seri', title: 'Menu seri', onclick: async () => {
    const s = (await load()).series.find((x) => x.id === id);
    if (s) menu(s);
  } }, icon('more'));
  const root = h('div', { className: 'page detail' },
    h('header', { className: 'top' },
      h('a', { className: 'icon-btn', href: '#/', 'aria-label': 'Kembali ke rak' }, icon('back')),
      h('span', { className: 'top-title' }), more),
    head, actions,
    h('div', { className: 'chap-tools' }, h('label', { className: 'search' }, icon('search'), filter), sortBtn),
    list);
  view = { id, root, head, actions, list, filter, desc: false };
  document.getElementById('app').replaceChildren(root);
  window.scrollTo(0, 0);
  paint();
}

export function hide() { view = null; }
