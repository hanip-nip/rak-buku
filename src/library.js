import * as store from './store.js';
import { openPdf, pageSizes, outlinePages, makeCover } from './pdf.js';
import { upsertSeries, addFiles, reorderFiles } from './state.js';
import { mergeStates } from './merge.js';
import { naturalCompare } from './natsort.js';

const CATS = { komik: 'Komik', novel: 'Novel', lain: 'Buku lain' };
const ui = { tab: 'semua', q: '' };
let els = null; // {list, tabs, foot}; null kalau rak belum pernah tampil
let seq = 0;

function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k in e) e[k] = v;
    else e.setAttribute(k, v);
  }
  e.append(...kids.flat().filter((x) => x != null));
  return e;
}

// Sheet sederhana; mengembalikan fungsi tutup.
function sheet(title, ...body) {
  const close = () => back.remove();
  const back = h('div', { className: 'sheet-back', onclick: (e) => { if (e.target === back) close(); } },
    h('div', { className: 'sheet', role: 'dialog' }, h('h2', {}, title), ...body));
  document.body.append(back);
  return close;
}
const note = (msg) => {
  const c = sheet('Info', h('p', { className: 'pre' }, msg), h('button', { onclick: () => c() }, 'Tutup'));
};
const changed = () => window.dispatchEvent(new CustomEvent('rak:changed'));

export const guessTitle = (name) => {
  const bare = name.replace(/\.pdf$/i, '').trim();
  let s = bare;
  for (let p = ''; p !== s;) {
    p = s;
    s = s.replace(/[\s_.-]*\d+\s*$/, '').replace(/(^|[\s_.-])(?:batch|chapter|ch|vol|volume|bagian)\s*$/i, '').trim();
  }
  return s || bare;
};

async function load() {
  const own = await store.getOwn();
  const remote = Object.values(await store.getRemote());
  return mergeStates([own, ...remote.map((r) => r.state)], await store.deviceId());
}

async function mutate(fn, quiet) {
  await store.saveOwn(fn(await store.getOwn()));
  if (!quiet) changed();
}

const fresh = async (id) => (await load()).series.find((x) => x.id === id);
const save = (series, quiet) => { const now = Date.now(); return mutate((own) => upsertSeries(own, series, now), quiet); };

function percent(s, p) {
  const i = s.files.findIndex((f) => f.id === p?.fileId);
  if (i < 0) return 0;
  const done = s.files.slice(0, i).reduce((n, f) => n + f.pages, 0) + p.page;
  const total = s.files.reduce((n, f) => n + f.pages, 0) || 1;
  return Math.min(100, Math.round((done / total) * 100));
}

async function posText(s, p) {
  const i = s.files.findIndex((f) => f.id === p?.fileId);
  if (i < 0) return 'Belum dibaca';
  if (s.files.length > 1) {
    const word = s.files.some((x) => /batch/i.test(x.name)) ? 'Batch' : 'Bagian';
    return `${word} ${i + 1}/${s.files.length} · hal ${p.page}`;
  }
  const outline = (await store.getMeta(s.files[0].id))?.outline ?? [];
  const ch = outline.filter((o) => o.page <= p.page).pop();
  return `${ch ? `${ch.title} · ` : ''}hal ${p.page}/${s.files[0].pages}`;
}

async function localState(s) {
  const has = await Promise.all(s.files.map((f) => store.hasBlob(f.id)));
  const n = has.filter(Boolean).length;
  return n === has.length ? 'Ada di HP' : n === 0 ? 'Hanya di Drive' : 'Sebagian di HP';
}

async function card(s, view) {
  const p = view.progress[s.id];
  const [pos, local] = await Promise.all([posText(s, p), localState(s)]);
  const open = () => { location.hash = `#/baca/${encodeURIComponent(s.id)}`; };
  return h('article', { className: 'card' },
    h('div', { className: 'cover', onclick: open }, s.cover ? h('img', { src: s.cover, alt: '' }) : null),
    h('div', { className: 'info' },
      h('h3', { onclick: open }, s.title),
      h('p', { className: 'muted' }, `${CATS[s.category] ?? ''} · ${local}`),
      h('p', {}, pos),
      h('div', { className: 'bar' }, h('i', { style: `width:${percent(s, p)}%` })),
      h('div', { className: 'row' },
        h('button', { className: 'primary', onclick: open }, 'Lanjut baca'),
        h('button', { 'aria-label': 'Menu', onclick: () => menu(s) }, '⋯'))));
}

async function refresh() {
  if (!els || !document.contains(els.list)) return;
  const my = ++seq;
  const view = await load();
  const q = ui.q.trim().toLowerCase();
  const rank = (s) => view.progress[s.id]?.updatedAt ?? 0;
  const shown = view.series
    .filter((s) => (ui.tab === 'semua' || s.category === ui.tab) && s.title.toLowerCase().includes(q))
    .sort((a, b) => rank(b) - rank(a) || naturalCompare(a.title, b.title));
  const cards = await Promise.all(shown.map((s) => card(s, view)));
  const bytes = await store.blobBytes();
  if (my !== seq) return;
  els.tabs.replaceChildren(...['semua', ...Object.keys(CATS)].map((k) =>
    h('button', { className: k === ui.tab ? 'tab on' : 'tab', onclick: () => { ui.tab = k; refresh(); } },
      k === 'semua' ? 'Semua' : CATS[k])));
  const empty = view.series.length ? 'Tidak ada yang cocok.' : 'Rak masih kosong. Tekan + untuk menambah PDF.';
  els.list.replaceChildren(...(cards.length ? cards : [h('p', { className: 'muted' }, empty)]));
  els.foot.textContent = `Ruang terpakai di HP: ${(bytes / 1048576).toFixed(1)} MB`;
}
window.addEventListener('rak:changed', refresh);

export function show() {
  const input = h('input', {
    type: 'search', 'aria-label': 'Cari judul', placeholder: 'Cari judul…', value: ui.q,
    oninput: (e) => { ui.q = e.target.value; refresh(); },
  });
  const picker = h('input', { type: 'file', accept: 'application/pdf', multiple: true, hidden: true });
  picker.addEventListener('change', () => {
    const f = [...picker.files];
    picker.value = '';
    if (f.length) addDialog(f);
  });
  els = { tabs: h('nav', { className: 'tabs' }), list: h('section', { className: 'list' }), foot: h('footer', { className: 'muted' }) };
  document.getElementById('app').replaceChildren(
    h('header', { className: 'top' }, h('h1', {}, 'Rak Buku'), input), els.tabs, els.list, els.foot, picker,
    h('button', { className: 'fab', 'aria-label': 'Tambah PDF', onclick: () => picker.click() }, '+'));
  refresh();
}

const catSelect = (val) => h('select', {}, ...Object.entries(CATS).map(([k, v]) => h('option', { value: k, selected: k === val }, v)));

async function addDialog(files) {
  files.sort((a, b) => naturalCompare(a.name, b.name));
  const view = await load();
  const title = h('input', { type: 'text', value: guessTitle(files[0].name) });
  const cat = catSelect('komik');
  const target = h('select', {}, h('option', { value: '' }, 'Seri baru'),
    ...view.series.map((s) => h('option', { value: s.id }, s.title)));
  target.addEventListener('change', () => { title.disabled = cat.disabled = !!target.value; });
  const status = h('p', { className: 'muted' });
  const go = h('button', { className: 'primary' }, 'Tambah');
  const close = sheet(`Tambah ${files.length} file`,
    h('label', {}, 'Judul', title), h('label', {}, 'Kategori', cat), h('label', {}, 'Masuk ke', target), status,
    h('div', { className: 'row' }, h('button', { onclick: () => close() }, 'Batal'), go));
  go.addEventListener('click', async () => {
    go.disabled = true;
    const base = view.series.find((s) => s.id === target.value) ?? {
      id: crypto.randomUUID(), title: title.value.trim() || guessTitle(files[0].name), category: cat.value,
      cover: '', files: [], deleted: false,
    };
    const ok = [], bad = [];
    let cover = '', full = '';
    const undo = (id) => Promise.allSettled([store.deleteBlob(id), store.deleteMeta(id)]);
    for (const [i, file] of files.entries()) { // berurutan, hemat memori iPhone
      const label = `Memproses ${i + 1}/${files.length}`;
      status.textContent = `${label}…`;
      let doc;
      try { doc = await openPdf(file); } catch { bad.push(file.name); continue; }
      const id = crypto.randomUUID();
      try {
        let meta;
        try {
          meta = { sizes: await pageSizes(doc, (d, t) => { status.textContent = `${label} · mengukur halaman ${d}/${t}`; }), outline: await outlinePages(doc).catch(() => []) };
        } catch { bad.push(file.name); continue; }
        try { await store.putMeta(id, meta); await store.putBlob(id, file); } catch {
          await undo(id);
          full = file.name;
          break;
        }
        if (!cover) cover = await makeCover(doc).catch(() => '');
        ok.push({ id, name: file.name, size: file.size, pages: doc.numPages });
      } finally { doc.destroy?.(); }
    }
    close();
    let failed = '';
    if (ok.length) {
      // Ambil ulang: sync bisa mengubah seri selama pemrosesan.
      const cur = target.value ? await fresh(base.id) : base;
      if (!cur) {
        await Promise.all(ok.map((f) => undo(f.id)));
        failed = 'Seri ini sudah dihapus. File tidak ditambahkan.';
      } else {
        let saved = false;
        try {
          await save(addFiles({ ...cur, cover: cur.cover || cover }, ok, Date.now()), true);
          saved = true;
        } catch {
          await Promise.all(ok.map((f) => undo(f.id)));
          failed = 'Gagal menyimpan ke rak. Tidak ada file yang ditambahkan.';
        }
        if (saved) {
          try {
            for (const f of ok) await store.outboxPut({ id: crypto.randomUUID(), type: 'upload', seriesId: base.id, fileId: f.id });
          } catch { failed = 'File tersimpan di HP, tapi antrean upload gagal. Coba buka ulang aplikasi.'; }
          changed(); // setelah job antre, supaya sync melihatnya
        }
      }
    }
    const msgs = bad.map((n) => `${n} tidak bisa dibuka`);
    if (full) msgs.push(`Penyimpanan HP penuh atau gagal menyimpan ${full}`);
    if (failed) msgs.push(failed);
    else if (!ok.length && bad.length) msgs.push('Tidak ada file yang ditambahkan.');
    if (msgs.length) note(msgs.join('\n'));
  });
}

function menu(s) {
  const blocked = s.files.some((f) => f.driveId === null);
  const close = sheet(s.title,
    h('button', { onclick: () => { close(); editDialog(s); } }, 'Ubah judul / kategori'),
    h('button', { disabled: s.files.length < 2, onclick: () => { close(); orderDialog(s.id); } }, 'Atur urutan file'),
    h('button', {
      disabled: blocked,
      onclick: async () => { close(); for (const f of s.files) await store.deleteBlob(f.id); changed(); },
    }, 'Hapus dari perangkat'),
    blocked ? h('p', { className: 'muted' }, 'Ada file yang belum ter-upload ke Drive; kalau dihapus dari perangkat, datanya hilang.') : null,
    h('button', { className: 'danger', onclick: () => delSeries(s, close) }, 'Hapus seri'),
    h('button', { onclick: () => close() }, 'Tutup'));
}

function editDialog(s) {
  const title = h('input', { type: 'text', value: s.title });
  const cat = catSelect(s.category);
  const close = sheet('Ubah seri', h('label', {}, 'Judul', title), h('label', {}, 'Kategori', cat),
    h('div', { className: 'row' }, h('button', { onclick: () => close() }, 'Batal'),
      h('button', {
        className: 'primary',
        onclick: async () => {
          close();
          const cur = await fresh(s.id);
          if (cur) await save({ ...cur, title: title.value.trim() || cur.title, category: cat.value });
        },
      }, 'Simpan')));
}

async function orderDialog(seriesId) {
  const s = (await load()).series.find((x) => x.id === seriesId);
  if (!s) return;
  const move = async (id, d) => {
    close();
    const cur = await fresh(seriesId);
    const o = cur?.files.map((f) => f.id) ?? [];
    const i = o.indexOf(id);
    if (i >= 0 && o[i + d]) {
      [o[i], o[i + d]] = [o[i + d], o[i]];
      const now = Date.now();
      await mutate((own) => upsertSeries(own, reorderFiles(cur, o, now), now));
    }
    orderDialog(seriesId);
  };
  const last = s.files.length - 1;
  const close = sheet('Urutan file', ...s.files.map((f, i) => h('div', { className: 'row item' },
    h('span', {}, f.name),
    h('button', { disabled: i === 0, 'aria-label': 'Naik', onclick: () => move(f.id, -1) }, '↑'),
    h('button', { disabled: i === last, 'aria-label': 'Turun', onclick: () => move(f.id, 1) }, '↓'))),
  h('button', { onclick: () => close() }, 'Selesai'));
}

async function delSeries(s, close) {
  if (!confirm(`Hapus seri "${s.title}"? File di perangkat dan di Drive ikut dihapus.`)) return;
  close();
  const cur = await fresh(s.id);
  if (!cur) return;
  // Urutan: tombstone dulu, baru job trash, baru blob; kalau terhenti di tengah, tidak ada data hilang diam-diam.
  await save({ ...cur, deleted: true });
  await store.outboxPut({
    id: crypto.randomUUID(), type: 'trash', seriesId: s.id,
    driveIds: cur.files.map((f) => f.driveId).filter((d) => d !== null),
  });
  for (const f of cur.files) await store.deleteBlob(f.id);
}
