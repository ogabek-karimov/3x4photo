import { removeBackground } from '@imgly/background-removal';

const MAX_SIDE = 2400;

// Katta rasmlarni ishlov berishdan oldin kichraytiramiz: 3x4 uchun 2400px yetarli
export async function loadImageBitmap(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  if (scale === 1) return bmp;
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const resized = await createImageBitmap(bmp, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' });
  bmp.close();
  return resized;
}

function bitmapToBlob(bmp) {
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  c.getContext('2d').drawImage(bmp, 0, 0);
  return c.convertToBlob({ type: 'image/png' });
}

export async function cutOut(bmp, onProgress) {
  const input = await bitmapToBlob(bmp);
  const result = await removeBackground(input, {
    publicPath: new URL('bg-data/', location.href).href,
    model: 'isnet_fp16',
    device: 'cpu',
    output: { format: 'image/png', quality: 1 },
    progress: (key, current, total) => {
      if (onProgress && total) onProgress(key, current / total);
    }
  });
  const cut = await createImageBitmap(result);
  return refineMask(cut);
}

// Niqobni tozalash: shaffof "tuman"ni olib tashlash va asosiy siymoga
// ulanmagan mayda bo'laklarni o'chirish
async function refineMask(bmp) {
  const { width: w, height: h } = bmp;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const n = w * h;

  // 1) Alfa egri chizig'i: juda kuchsiz piksellarni 0 ga, deyarli to'liqlarini 255 ga
  for (let i = 0; i < n; i++) {
    const a = d[i * 4 + 3] / 255;
    const v = Math.min(1, Math.max(0, (a - 0.08) / 0.84));
    d[i * 4 + 3] = Math.round(v * 255);
  }

  // 2) Eng katta bog'langan sohani topish (alfa > 128)
  const labels = new Int32Array(n);
  const stack = new Int32Array(n);
  let best = 0;
  let bestSize = 0;
  let label = 0;
  for (let start = 0; start < n; start++) {
    if (labels[start] || d[start * 4 + 3] < 128) continue;
    label++;
    let size = 0;
    let sp = 0;
    stack[sp++] = start;
    labels[start] = label;
    while (sp) {
      const p = stack[--sp];
      size++;
      const x = p % w;
      const neighbors = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w];
      for (const q of neighbors) {
        if (q < 0 || q >= n || labels[q] || d[q * 4 + 3] < 128) continue;
        labels[q] = label;
        stack[sp++] = q;
      }
    }
    if (size > bestSize) {
      bestSize = size;
      best = label;
    }
  }

  // 3) Asosiy sohadan uzoq bo'lgan (boshqa bo'lakka tegishli) piksellarni o'chirish.
  // Yarim shaffof chekkalar (sochlar) saqlanib qoladi, chunki ular 0-label'ga ega.
  if (best) {
    for (let i = 0; i < n; i++) {
      if (labels[i] && labels[i] !== best) d[i * 4 + 3] = 0;
    }
    // Asosiy sohaga yaqin bo'lmagan kuchsiz piksellar
    const near = new Uint8Array(n);
    const R = Math.max(2, Math.round(Math.max(w, h) / 300));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (labels[y * w + x] !== best) continue;
        // faqat chegaradagi piksellardan tarqatamiz
        const p = y * w + x;
        const edge =
          (x > 0 && labels[p - 1] !== best) ||
          (x < w - 1 && labels[p + 1] !== best) ||
          (y > 0 && labels[p - w] !== best) ||
          (y < h - 1 && labels[p + w] !== best);
        if (!edge) {
          near[p] = 1;
          continue;
        }
        for (let dy = -R; dy <= R; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -R; dx <= R; dx++) {
            const xx = x + dx;
            if (xx >= 0 && xx < w) near[yy * w + xx] = 1;
          }
        }
      }
    }
    for (let i = 0; i < n; i++) if (!near[i]) d[i * 4 + 3] = 0;
  }

  ctx.putImageData(img, 0, 0);
  return { bitmap: canvas.transferToImageBitmap(), mask: alphaStats(d, w, h) };
}

// Siymo chegaralari va har bir qatordagi kenglik (kadrlash uchun)
function alphaStats(d, w, h) {
  const left = new Int32Array(h).fill(-1);
  const right = new Int32Array(h).fill(-1);
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 128) {
        if (left[y] < 0) left[y] = x;
        right[y] = x;
      }
    }
    if (left[y] >= 0) {
      if (top < 0) top = y;
      bottom = y;
    }
  }
  return { width: w, height: h, top, bottom, left, right };
}
