export function filesToFetch(series, progress, isLocal, ahead = 2) {
  const files = series.files;
  const at = progress ? files.findIndex((f) => f.id === progress.fileId) : -1;
  const start = Math.max(0, at);
  return files.slice(start, start + ahead + 1).map((f) => f.id).filter((id) => !isLocal(id));
}
