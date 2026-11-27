import * as store from './store.js';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const CHUNK = 8 * 1024 * 1024; // kelipatan 256 KiB
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export const deps = { getKv: store.getKv, setKv: store.setKv };

const auth = (token, extra = {}) => ({ Authorization: `Bearer ${token}`, ...extra });
const fail = (res, what) => Object.assign(new Error(`${what} ${res.status}`), { status: res.status });

async function call(url, token, init = {}, headers = {}) {
  const res = await fetch(url, { ...init, headers: auth(token, headers) });
  if (!res.ok) throw fail(res, 'drive');
  return res;
}
const qs = (o) => new URLSearchParams(o).toString();

export async function ensureFolder(token) {
  const cached = await deps.getKv('driveFolder');
  if (cached) return cached;
  const q = `name='Rak Buku' and mimeType='${FOLDER_MIME}' and trashed=false`;
  let id = (await (await call(`${API}/files?${qs({ q, fields: 'files(id)' })}`, token)).json()).files?.[0]?.id;
  if (!id) {
    const res = await call(`${API}/files?fields=id`, token,
      { method: 'POST', body: JSON.stringify({ name: 'Rak Buku', mimeType: FOLDER_MIME }) },
      { 'Content-Type': 'application/json' });
    id = (await res.json()).id;
  }
  await deps.setKv('driveFolder', id);
  return id;
}
export const forgetFolder = () => deps.setKv('driveFolder', null);

// Subfolder (kategori / judul seri) di bawah parent; dicari dulu supaya perangkat lain memakai folder yang sama.
const childKey = (parent, name) => `dfolder:${parent}/${name}`;
export async function ensureChild(token, parentId, name) {
  const cached = await deps.getKv(childKey(parentId, name));
  if (cached) return cached;
  const esc = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'"); // kueri Drive: \ dan ' diloloskan dengan \
  const q = `name='${esc}' and '${parentId}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`;
  let id = (await (await call(`${API}/files?${qs({ q, fields: 'files(id)' })}`, token)).json()).files?.[0]?.id;
  if (!id) {
    const res = await call(`${API}/files?fields=id`, token,
      { method: 'POST', body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }) },
      { 'Content-Type': 'application/json' });
    id = (await res.json()).id;
  }
  await deps.setKv(childKey(parentId, name), id);
  return id;
}
export const forgetChild = (parentId, name) => deps.setKv(childKey(parentId, name), null);

export const parentsOf = async (token, id) => (await (await call(`${API}/files/${id}?fields=parents`, token)).json()).parents ?? [];

export const move = (token, id, to, from) => call(`${API}/files/${id}?${qs({ addParents: to, removeParents: from.join(','), fields: 'id' })}`, token,
  { method: 'PATCH', body: '{}' }, { 'Content-Type': 'application/json' });

export async function listStatus(token, folderId) {
  const q = `'${folderId}' in parents and name contains 'status-' and trashed=false`;
  const res = await call(`${API}/files?${qs({ q, fields: 'files(id,name,modifiedTime)', pageSize: '100' })}`, token);
  return (await res.json()).files ?? [];
}

export const readJson = async (token, id) => (await call(`${API}/files/${id}?alt=media`, token)).json();

export async function writeJson(token, folderId, name, obj, existingId) {
  const body = JSON.stringify(obj);
  if (existingId) {
    await call(`${UPLOAD}/files/${existingId}?uploadType=media`, token,
      { method: 'PATCH', body }, { 'Content-Type': 'application/json' });
    return existingId;
  }
  const b = 'rakbuku-boundary';
  const meta = JSON.stringify({ name, parents: [folderId], mimeType: 'application/json' });
  const multipart = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`
    + `--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--`;
  const res = await call(`${UPLOAD}/files?uploadType=multipart&fields=id`, token,
    { method: 'POST', body: multipart }, { 'Content-Type': `multipart/related; boundary=${b}` });
  return (await res.json()).id;
}

export async function startUpload(token, folderId, name, size) {
  if (!size) throw new Error('File kosong');
  const res = await call(`${UPLOAD}/files?uploadType=resumable`, token, {
    method: 'POST',
    body: JSON.stringify({ name, parents: [folderId], mimeType: 'application/pdf' }),
  }, {
    'Content-Type': 'application/json; charset=UTF-8',
    'X-Upload-Content-Type': 'application/pdf',
    'X-Upload-Content-Length': String(size),
  });
  const loc = res.headers.get('Location');
  if (!loc) throw new Error('upload session: Location hilang');
  return loc;
}

async function sessionResult(res) {
  if (res.status === 308) {
    const m = /bytes=0-(\d+)/.exec(res.headers.get('Range') ?? '');
    return { done: false, next: m ? Number(m[1]) + 1 : 0 };
  }
  if (res.status === 200 || res.status === 201) return { done: true, driveId: (await res.json()).id };
  throw fail(res, 'upload');
}

export async function uploadChunk(sessionUrl, blob, start) {
  // URL sesi sudah membawa otorisasi: tanpa Bearer.
  const end = Math.min(start + CHUNK, blob.size) - 1;
  const res = await fetch(sessionUrl, {
    method: 'PUT',
    headers: { 'Content-Range': `bytes ${start}-${end}/${blob.size}` },
    body: blob.slice(start, end + 1),
  });
  return sessionResult(res);
}

// 404/410 = sesi kedaluwarsa; sessionResult melempar dengan status, sync memulai ulang.
export async function uploadOffset(sessionUrl, size) {
  const res = await fetch(sessionUrl, { method: 'PUT', headers: { 'Content-Range': `bytes */${size}` } });
  return sessionResult(res);
}

export const download = async (token, driveId) => (await call(`${API}/files/${driveId}?alt=media`, token)).blob();

// R15: per rentang, supaya file besar tidak menjadi satu Response raksasa di memori.
// onBytes(n): byte yang sudah masuk di rentang ini (progres di dalam satu rentang 8 MB).
// Tanpa byte baru selama idleMs -> dibatalkan (AbortError), supaya koneksi yang macet di HP tidak menggantung selamanya.
export async function downloadRange(token, driveId, start, end, onBytes, idleMs = 30_000) {
  const ac = new AbortController();
  let timer = setTimeout(() => ac.abort(), idleMs);
  const poke = () => { clearTimeout(timer); timer = setTimeout(() => ac.abort(), idleMs); };
  try {
    const res = await call(`${API}/files/${driveId}?alt=media`, token, { signal: ac.signal }, { Range: `bytes=${start}-${end}` });
    if (res.status !== 206 && !(res.status === 200 && start === 0)) throw fail(res, 'range'); // 200 = seluruh file (kecil)
    if (!onBytes || !res.body) return await res.blob();
    const reader = res.body.getReader();
    const parts = [];
    for (let got = 0; ;) {
      poke();
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      got += value.byteLength;
      onBytes(got);
    }
    return new Blob(parts);
  } finally {
    clearTimeout(timer);
  }
}

export const trash = (token, driveId) => call(`${API}/files/${driveId}`, token,
  { method: 'PATCH', body: JSON.stringify({ trashed: true }) }, { 'Content-Type': 'application/json' });
