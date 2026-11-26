export function buildLayout(pages, gap) {
  const tops = [], heights = [];
  let y = 0;
  for (const p of pages) { tops.push(y); heights.push(p.height); y += p.height + gap; }
  return { tops, heights, total: y, pages };
}

// index terbesar dengan tops[i] <= y, dijepit ke 0
function floorIdx(tops, y) {
  let lo = 0, hi = tops.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (tops[mid] <= y) lo = mid; else hi = mid - 1; }
  return lo;
}

export function positionAt(layout, scrollTop) {
  const n = layout.pages.length;
  if (!n) return null;
  let i = floorIdx(layout.tops, scrollTop);
  if (i < n - 1 && scrollTop >= layout.tops[i] + layout.heights[i]) i++; // celah → halaman berikutnya
  const offset = Math.min(1, Math.max(0, (scrollTop - layout.tops[i]) / layout.heights[i]));
  return { fileId: layout.pages[i].fileId, page: layout.pages[i].page, offset };
}

export function scrollTopFor(layout, pos) {
  let idx = -1;
  for (let i = 0; i < layout.pages.length; i++) {
    const p = layout.pages[i];
    if (p.fileId !== pos.fileId) continue;
    idx = i;
    if (p.page === pos.page) break;
  }
  if (idx < 0) return 0;
  return layout.tops[idx] + Math.min(1, Math.max(0, pos.offset)) * layout.heights[idx];
}

export function visibleRange(layout, scrollTop, viewportH, extra = 2) {
  const n = layout.pages.length;
  if (!n) return [0, -1];
  let s = floorIdx(layout.tops, scrollTop);
  if (s < n - 1 && scrollTop >= layout.tops[s] + layout.heights[s]) s++;
  const e = floorIdx(layout.tops, scrollTop + viewportH);
  return [Math.max(0, s - extra), Math.min(n - 1, e + extra)];
}
