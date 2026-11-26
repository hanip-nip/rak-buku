import { naturalCompare } from './natsort.js';

export const newDeviceState = (id, name) => ({ device: { id, name }, series: [], progress: {}, bookmarks: [] });

const upsertById = (list, rec) => (list.some((x) => x.id === rec.id)
  ? list.map((x) => (x.id === rec.id ? rec : x))
  : [...list, rec]);

export const upsertSeries = (own, series, now) =>
  ({ ...own, series: upsertById(own.series, { ...series, updatedAt: now }) });

export const addFiles = (series, newFiles, now) => {
  const start = series.files.reduce((m, f) => Math.max(m, f.order), -1) + 1;
  const added = [...newFiles].sort((a, b) => naturalCompare(a.name, b.name)).map((f, i) => ({
    id: f.id, driveId: null, name: f.name, size: f.size, pages: f.pages,
    order: start + i, updatedAt: now, deleted: false,
  }));
  return { ...series, files: [...series.files, ...added], updatedAt: now };
};

// File yang tidak ada di orderedIds tidak diubah.
export const reorderFiles = (series, orderedIds, now) => ({
  ...series,
  files: series.files.map((f) => {
    const order = orderedIds.indexOf(f.id);
    return order < 0 || order === f.order ? f : { ...f, order, updatedAt: now };
  }),
  updatedAt: now,
});

export const setDriveId = (own, seriesId, fileId, driveId, now) => ({
  ...own,
  series: own.series.map((s) => (s.id !== seriesId ? s : {
    ...s,
    files: s.files.map((f) => (f.id === fileId ? { ...f, driveId, updatedAt: now } : f)),
  })),
});

export const setProgress = (own, seriesId, pos, now) => ({
  ...own,
  progress: { ...own.progress, [seriesId]: { fileId: pos.fileId, page: pos.page, offset: pos.offset, updatedAt: now } },
});

export const upsertBookmark = (own, bm, now) =>
  ({ ...own, bookmarks: upsertById(own.bookmarks, { ...bm, updatedAt: now }) });
