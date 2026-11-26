// updatedAt terbesar menang; seimbang -> entri yang lebih dulu (perangkat sendiri).
const newest = (a, b) => (b.rec.updatedAt > a.rec.updatedAt ? b : a);

const pick = (map, key, entry) => map.set(key, map.has(key) ? newest(map.get(key), entry) : entry);

export function mergeStates(states, ownDeviceId) {
  // Perangkat sendiri diproses lebih dulu agar menang saat updatedAt sama.
  const ordered = [...states].sort((a, b) => (b.device.id === ownDeviceId) - (a.device.id === ownDeviceId));

  const seriesBest = new Map();
  const fileBest = new Map(); // seriesId -> Map(fileId -> {rec, own})
  const bmBest = new Map();

  for (const st of ordered) {
    const own = st.device.id === ownDeviceId;
    for (const s of st.series) {
      pick(seriesBest, s.id, { rec: s });
      if (!fileBest.has(s.id)) fileBest.set(s.id, new Map());
      for (const f of s.files) pick(fileBest.get(s.id), f.id, { rec: f, own });
    }
    for (const b of st.bookmarks) pick(bmBest, b.id, { rec: b });
  }

  const series = [];
  for (const [id, { rec }] of seriesBest) {
    if (rec.deleted) continue;
    const files = [...fileBest.get(id).values()]
      .filter(({ rec: f, own }) => !f.deleted && (f.driveId !== null || own))
      .map(({ rec: f }) => f)
      .sort((a, b) => a.order - b.order);
    series.push({ ...rec, files });
  }
  const alive = new Map(series.map((s) => [s.id, s]));
  const orderOf = (sid, fileId) => alive.get(sid).files.find((f) => f.id === fileId)?.order ?? -1;
  const pos = (sid, p) => [orderOf(sid, p.fileId), p.page, p.offset];

  // Progres: updatedAt terbaru; sama -> posisi lebih jauh.
  const progress = {};
  for (const st of ordered) {
    for (const [sid, p] of Object.entries(st.progress)) {
      if (!alive.has(sid)) continue;
      const cur = progress[sid];
      if (!cur || p.updatedAt > cur.updatedAt) { progress[sid] = p; continue; }
      if (p.updatedAt < cur.updatedAt) continue;
      const a = pos(sid, p), b = pos(sid, cur);
      const i = a.findIndex((v, k) => v !== b[k]);
      if (i >= 0 && a[i] > b[i]) progress[sid] = p;
    }
  }

  const bookmarks = [...bmBest.values()]
    .map(({ rec }) => rec)
    .filter((b) => !b.deleted && alive.has(b.seriesId));

  return { series, progress, bookmarks };
}
