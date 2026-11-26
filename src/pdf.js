import * as pdfjsLib from '../vendor/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;

const MAX_PIXELS = 16777216; // batas kanvas iOS

export async function openPdf(blob) {
  const data = new Uint8Array(await blob.arrayBuffer());
  try {
    return await pdfjsLib.getDocument({ data }).promise;
  } catch (e) {
    const why = e?.name === 'PasswordException' ? 'dilindungi kata sandi' : 'rusak atau bukan PDF';
    throw new Error(`PDF tidak bisa dibuka: ${why}`, { cause: e });
  }
}

export async function pageSizes(doc, onProgress) {
  const sizes = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const v = page.getViewport({ scale: 1 });
    sizes.push({ w: v.width, h: v.height });
    page.cleanup();
    if (onProgress && (i % 100 === 0 || i === doc.numPages)) onProgress(i, doc.numPages);
  }
  return sizes;
}

const states = new WeakMap(); // canvas -> {seq, task}

// Resolves when drawn or superseded by a newer call on the same canvas.
export async function renderPage(doc, pageNo, canvas, cssWidth, dpr) {
  let st = states.get(canvas);
  if (!st) states.set(canvas, (st = { seq: 0, task: null }));
  const my = ++st.seq;
  const page = await doc.getPage(pageNo);
  if (my !== st.seq) return;
  if (st.task) {
    st.task.cancel();
    await st.task.promise.catch(() => {});
    if (my !== st.seq) return;
  }
  const base = page.getViewport({ scale: 1 });
  let scale = (cssWidth * dpr) / base.width;
  const px = base.width * base.height * scale * scale;
  if (px > MAX_PIXELS) scale *= Math.sqrt(MAX_PIXELS / px);
  const vp = page.getViewport({ scale });
  canvas.width = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  const task = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
  st.task = task;
  try {
    await task.promise;
  } catch (e) {
    if (e?.name !== 'RenderingCancelledException') throw e;
  }
}

export async function outlinePages(doc) {
  const outline = await doc.getOutline();
  if (!outline) return [];
  const out = [];
  for (const it of outline) {
    try {
      const dest = typeof it.dest === 'string' ? await doc.getDestination(it.dest) : it.dest;
      if (!dest) continue;
      const ref = dest[0];
      const idx = typeof ref === 'object' ? await doc.getPageIndex(ref) : ref;
      out.push({ title: it.title, page: idx + 1 });
    } catch { /* tujuan tidak valid, lewati */ }
  }
  return out;
}

export async function makeCover(doc) {
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: 160 / base.width });
  const c = document.createElement('canvas');
  c.width = Math.floor(vp.width);
  c.height = Math.floor(vp.height);
  await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  return c.toDataURL('image/jpeg', 0.7);
}
