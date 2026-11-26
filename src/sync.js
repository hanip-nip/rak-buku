import { mergeStates } from './merge.js';
import { setDriveId } from './state.js';
import { filesToFetch } from './prefetch.js';

const RANGE = 8 * 1024 * 1024;
const FAIL_WAIT = 30 * 60_000; // prefetch yang gagal dilewati selama ini
const OWN_EVERY = 30_000; // tulis ulang status sendiri di tengah upload panjang
let active = null; // seri yang sedang dibuka di pembaca
export const setActiveSeries = (id) => { active = id; };
export const activeSeries = () => active;
// Saat membaca, rak:changed (tiap simpan posisi) tidak memicu sync; interval 30 dtk dan 'hidden' yang menanganinya.
export const syncOnChange = () => active === null;

const emit = (type, detail) => {
  if (globalThis.dispatchEvent) globalThis.dispatchEvent(new CustomEvent(type, { detail }));
};
const relogin = () => Object.assign(new Error('relogin'), { name: 'ReloginError' });
const validState = (s) => typeof s?.device?.id === 'string' && Array.isArray(s.series)
  && Array.isArray(s.bookmarks) && s.progress && typeof s.progress === 'object';

class Stopped extends Error {}

export function createSync({ drive, store, auth, pdf, now = Date.now, online = () => navigator.onLine }) {
  let running = false, again = false, stopped = false, timer = 0;
  const status = (state, detail = {}) => emit('rak:sync', { state, detail });

  async function run() {
    if (running) { again = true; return 'busy'; }
    running = true; again = false; stopped = false;
    try {
      return await body();
    } catch (e) {
      if (e?.name === 'ReloginError') { status('relogin'); return 'relogin'; }
      if (e instanceof TypeError) console.error('Sinkronisasi: jaringan', e);
      if (e instanceof Stopped || e instanceof TypeError || !online()) { status('offline'); return 'offline'; }
      console.error('Sinkronisasi gagal', e);
      status('error');
      return 'error';
    } finally {
      running = false;
      if (again && !stopped) schedule();
    }
  }

  async function body() {
    if (!online()) throw new Stopped();
    if (!(await auth.isLoggedIn())) { status('login'); return 'offline'; }
    status('syncing');
    let token = await auth.getToken(now());
    // 401 → token baru lalu ulangi sekali; 401 kedua = perlu login ulang.
    const api = async (fn) => {
      try { return await fn(token); } catch (e) {
        if (e?.status !== 401) throw e;
        auth._reset();
        token = await auth.getToken(now());
        try { return await fn(token); } catch (e2) { throw e2?.status === 401 ? relogin() : e2; }
      }
    };
    let folder = await api((t) => drive.ensureFolder(t));
    // Folder 404 (dihapus di Drive) → lupakan, buat/cari lagi, ulangi sekali.
    const inFolder = async (fn) => {
      try { return await api((t) => fn(t, folder)); } catch (e) {
        if (e?.status !== 404) throw e;
        await drive.forgetFolder();
        folder = await api((t) => drive.ensureFolder(t));
        return api((t) => fn(t, folder));
      }
    };
    const me = await store.deviceId();

    // 1. Status perangkat lain: hanya yang modifiedTime-nya berubah.
    const listed = await inFolder((t, f) => drive.listStatus(t, f));
    const cache = await store.getRemote();
    const remote = {};
    let ownId = await store.getKv('ownStatusId');
    for (const f of listed) {
      const m = /^status-(.+)\.json$/.exec(f.name);
      if (!m) continue;
      const dev = m[1];
      if (dev === me) { ownId ??= f.id; continue; }
      if (remote[dev] && remote[dev].modifiedTime >= f.modifiedTime) continue;
      if (cache[dev]?.modifiedTime === f.modifiedTime) { remote[dev] = cache[dev]; continue; }
      const state = await api((t) => drive.readJson(t, f.id));
      if (validState(state)) remote[dev] = { modifiedTime: f.modifiedTime, state, fileId: f.id };
    }
    await store.saveRemote(remote);

    // 2. Status sendiri, sebelum upload panjang (progres baca tidak boleh menunggu).
    let lastOwn = 0;
    const writeOwn = async () => {
      lastOwn = now();
      const own = await store.getOwn();
      const name = `status-${me}.json`;
      try {
        ownId = await inFolder((t, f) => drive.writeJson(t, f, name, own, ownId));
      } catch (e) {
        if (e?.status !== 404 || !ownId) throw e;
        ownId = await inFolder((t, f) => drive.writeJson(t, f, name, own));
      }
      await store.setKv('ownStatusId', ownId);
      return own;
    };
    const own = await writeOwn();
    const merged = mergeStates([own, ...Object.values(remote).map((r) => r.state)], me);
    await store.saveMerged(merged);
    emit('rak:refresh');

    // 3. Antrean, berurutan.
    const jobs = await store.outboxAll();
    const total = jobs.filter((j) => j.type === 'upload').length;
    let done = 0;
    for (const job of jobs) {
      if (stopped || !online()) throw new Stopped();
      if (job.type === 'trash') {
        for (const id of job.driveIds ?? []) {
          try { await api((t) => drive.trash(t, id)); } catch (e) { if (e?.status !== 404) throw e; }
        }
        await store.outboxDelete(job.id);
      } else if (job.type === 'upload') {
        status('syncing', { done, total });
        if (await upload(job, { inFolder, api, writeOwn, due: () => now() - lastOwn >= OWN_EVERY, remote })) await writeOwn();
        done++;
      }
    }

    // 4. Prefetch.
    await prefetch(merged, api);
    const at = now();
    await store.setKv('lastSync', at);
    status('ok', { at });
    return 'ok';
  }

  // true kalau selesai ter-upload.
  async function upload(job, { inFolder, api, writeOwn, due, remote }) {
    const blob = await store.getBlob(job.fileId);
    if (!blob) { await store.outboxDelete(job.id); return false; } // sudah dihapus dari perangkat
    let r = null;
    if (job.sessionUrl) {
      try { r = await drive.uploadOffset(job.sessionUrl, blob.size); } catch (e) {
        if (e?.status !== 404 && e?.status !== 410) throw e;
      }
    }
    if (!r) {
      const own = await store.getOwn();
      const name = own.series.find((s) => s.id === job.seriesId)?.files.find((f) => f.id === job.fileId)?.name ?? `${job.fileId}.pdf`;
      const sessionUrl = await inFolder((t, f) => drive.startUpload(t, f, name, blob.size));
      job = { ...job, sessionUrl, size: blob.size };
      await store.outboxPut(job);
      r = { done: false, next: 0 };
    }
    while (!r.done) {
      if (stopped || !online()) throw new Stopped(); // job tetap di antrean
      if (due()) await writeOwn(); // progres baca tidak menunggu upload multi-GB
      r = await drive.uploadChunk(job.sessionUrl, blob, r.next);
    }
    const driveId = r.driveId;
    const own = await store.updateOwn((o) => setDriveId(o, job.seriesId, job.fileId, driveId, now()));
    // Seri/file dihapus (di sini atau perangkat lain) selama upload → jangan tinggalkan yatim di Drive.
    const view = mergeStates([own, ...Object.values(remote).map((x) => x.state)], own.device.id);
    if (!view.series.find((x) => x.id === job.seriesId)?.files.some((f) => f.id === job.fileId)) {
      try { await api((t) => drive.trash(t, driveId)); } catch (e) { if (e?.status !== 404) throw e; }
    }
    await store.outboxDelete(job.id);
    return true;
  }

  async function prefetch(merged, api) {
    const newest = Object.entries(merged.progress).sort((a, b) => b[1].updatedAt - a[1].updatedAt)[0]?.[0];
    const s = merged.series.find((x) => x.id === (active ?? newest));
    if (!s || !pdf) return;
    const local = new Set();
    for (const f of s.files) if (await store.hasBlob(f.id)) local.add(f.id);
    for (const id of filesToFetch(s, merged.progress[s.id], (x) => local.has(x))) {
      const f = s.files.find((x) => x.id === id);
      if (!f.driveId || !f.size) continue;
      const failKey = `prefetchFail:${id}`;
      if (now() - ((await store.getKv(failKey)) ?? -Infinity) < FAIL_WAIT) continue;
      try {
        await fetchFile(f, api);
      } catch (e) {
        // Gangguan jaringan/login/berhenti: coba lagi di run berikut, tanpa menandai gagal.
        if (e instanceof Stopped || e instanceof TypeError || e?.name === 'ReloginError' || !online()) return;
        console.error('Prefetch gagal', f.name, e);
        await store.setKv(failKey, now());
      }
    }
  }

  async function fetchFile(f, api) {
    const parts = [];
    for (let a = 0; a < f.size;) {
      if (stopped || !online()) throw new Stopped();
      const b = Math.min(a + RANGE, f.size) - 1;
      const part = await api((t) => drive.downloadRange(t, f.driveId, a, b));
      if (!part.size) throw new Error('rentang kosong');
      parts.push(part);
      a += part.size; // 200 berisi seluruh file kecil → langsung lengkap
    }
    const blob = new Blob(parts, { type: 'application/pdf' });
    const doc = await pdf.openPdf(blob);
    let meta;
    try {
      meta = { sizes: await pdf.pageSizes(doc), outline: await pdf.outlinePages(doc).catch(() => []) };
    } finally { doc.destroy?.(); }
    await store.putMeta(f.id, meta);
    await store.putBlob(f.id, blob);
    emit('rak:file-ready', { fileId: f.id });
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(run, 3000);
  }
  const stop = () => { stopped = true; clearTimeout(timer); };

  return { run, schedule, stop };
}
