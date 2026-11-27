import * as store from './store.js';
import { upsertBookmark } from './state.js';
import { load, h, sheet } from './library.js';

// Panel pembaca. s = sesi pembaca; api = { here(): posisi sekarang, jump(pos) }. Tiap fungsi mengembalikan fungsi tutup.
const MISSING = 'belum di perangkat';
const changed = () => window.dispatchEvent(new CustomEvent('rak:changed'));

export function toc(s, api) {
  const local = new Map(s.run.map((f) => [f.id, f]));
  const go = (pos) => () => { close(); api.jump(pos); };
  const entries = (f) => f.outline.map((o) => h('button', { className: 'item', onclick: go({ fileId: f.id, page: o.page, offset: 0 }) }, o.title));
  let body;
  if (!s.multi) {
    const f = s.run[0]; // seri satu file selalu sudah di-layout (kalau tidak, pembaca tidak terbuka)
    body = f.outline.length ? entries(f) : [h('p', { className: 'muted' }, 'PDF ini tidak punya daftar isi')];
  } else {
    body = s.all.map((meta, i) => {
      const label = `${s.word} ${i + 1} · ${meta.name}`;
      const f = local.get(meta.id);
      if (!f) return h('button', { className: 'item', disabled: true }, label, h('small', {}, MISSING));
      if (!f.outline.length) return h('button', { className: 'item', onclick: go({ fileId: f.id, page: 1, offset: 0 }) }, label);
      return h('details', {}, h('summary', {}, label),
        h('button', { className: 'item', onclick: go({ fileId: f.id, page: 1, offset: 0 }) }, 'Dari awal'), ...entries(f));
    });
  }
  const close = sheet('Daftar isi', ...body, h('button', { onclick: () => close() }, 'Tutup'));
  return close;
}

export function bookmarks(s, api) {
  const note = h('input', { type: 'text', placeholder: 'Catatan (boleh kosong)', maxLength: 200 });
  const list = h('div', { className: 'bm-list' });
  const err = h('p', { className: 'muted' });
  const order = (id) => s.all.findIndex((f) => f.id === id);
  const local = new Set(s.run.map((f) => f.id));

  async function refresh() {
    const bms = (await load()).bookmarks
      .filter((b) => b.seriesId === s.seriesId && order(b.fileId) >= 0)
      .sort((a, b) => order(a.fileId) - order(b.fileId) || a.page - b.page || a.offset - b.offset);
    list.replaceChildren(...(bms.length ? bms.map((b) => {
      const ok = local.has(b.fileId);
      const label = `${s.multi ? `${s.word} ${order(b.fileId) + 1} · ` : ''}hal ${b.page}`;
      return h('div', { className: 'row' },
        h('button', { className: 'item', disabled: !ok, onclick: () => { close(); api.jump(b); } },
          label, ok && !b.note ? null : h('small', {}, ok ? b.note : MISSING)),
        h('button', { className: 'danger', 'aria-label': `Hapus bookmark ${label}`, onclick: () => write({ ...b, deleted: true }) }, 'Hapus'));
    }) : [h('p', { className: 'muted' }, 'Belum ada bookmark.')]));
  }

  async function write(bm) {
    const now = Date.now();
    err.textContent = '';
    try {
      await store.updateOwn((own) => upsertBookmark(own, bm, now));
      changed();
      await refresh();
    } catch (e) {
      console.error('Gagal menyimpan bookmark', e);
      err.textContent = 'Gagal menyimpan bookmark.';
    }
  }

  const add = () => {
    const p = api.here();
    if (!p) return;
    const now = Date.now();
    write({ id: crypto.randomUUID(), seriesId: s.seriesId, fileId: p.fileId, page: p.page, offset: p.offset,
      note: note.value.trim(), createdAt: now, updatedAt: now, deleted: false });
    note.value = '';
  };

  const close = sheet('Bookmark', note, h('button', { className: 'primary', onclick: add }, 'Tandai di sini'), err, list,
    h('button', { onclick: () => close() }, 'Tutup'));
  refresh().catch((e) => { console.error('Gagal memuat bookmark', e); err.textContent = 'Gagal memuat bookmark.'; });
  return close;
}

export function night(s) {
  const html = document.documentElement;
  const save = (k, v) => store.setKv(k, v).catch((e) => console.error('Gagal menyimpan pengaturan', e));
  const dark = h('input', { type: 'checkbox', checked: html.dataset.theme === 'dark', onchange: () => {
    html.dataset.theme = dark.checked ? 'dark' : 'light';
    save('theme', html.dataset.theme);
  } });
  const inv = h('input', { type: 'checkbox', checked: s.root.classList.contains('invert'), onchange: () => {
    s.root.classList.toggle('invert', inv.checked);
    save(`invert:${s.seriesId}`, inv.checked);
  } });
  const close = sheet('Mode malam', h('label', { className: 'toggle' }, dark, 'Tema gelap'),
    h('label', { className: 'toggle' }, inv, 'Balik warna halaman'), h('button', { onclick: () => close() }, 'Tutup'));
  return close;
}

const ago = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'baru saja';
  if (m < 60) return `${m} menit lalu`;
  const j = Math.round(m / 60);
  return j < 24 ? `${j} jam lalu` : new Date(t).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

// Riwayat halaman dari semua perangkat (posisi terakhir + lompatan sebelumnya), terbaru dulu.
export function history(s, api) {
  const list = h('div', { className: 'bm-list' }, h('p', { className: 'muted' }, 'Memuat…'));
  const order = (id) => s.all.findIndex((f) => f.id === id);
  const local = new Set(s.run.map((f) => f.id));
  api.devices().then((devs) => {
    const rows = devs.flatMap(({ me, state }) => {
      const name = me ? `${state.device.name} ini` : state.device.name;
      const hist = state.history?.[s.seriesId] ?? [];
      const last = state.progress?.[s.seriesId];
      const all = hist.length ? hist : last ? [{ ...last, at: last.updatedAt }] : [];
      return all.filter((e) => order(e.fileId) >= 0).map((e) => ({ ...e, name }));
    }).sort((a, b) => b.at - a.at).slice(0, 30);
    list.replaceChildren(...(rows.length ? rows.map((e) => {
      const ok = local.has(e.fileId);
      const label = `${s.multi ? `${s.word} ${order(e.fileId) + 1} · ` : ''}hal ${e.page}`;
      return h('button', { className: 'item', disabled: !ok, onclick: () => { close(); api.jump(e); } },
        label, h('small', {}, `${e.name} · ${ago(e.at)}${ok ? '' : ` · ${MISSING}`}`));
    }) : [h('p', { className: 'muted' }, 'Belum ada riwayat.')]));
  }).catch((e) => { console.error('Gagal memuat riwayat', e); list.replaceChildren(h('p', { className: 'muted' }, 'Gagal memuat riwayat.')); });
  const close = sheet('Riwayat baca', h('p', { className: 'muted' }, 'Posisi dari semua perangkat yang login dengan akun yang sama.'), list,
    h('button', { onclick: () => close() }, 'Tutup'));
  return close;
}
