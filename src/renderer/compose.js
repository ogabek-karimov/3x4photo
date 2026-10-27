// 3x4 rasmni chizish, eksport va qog'ozga joylash

export const DPI = 600;
const CM = DPI / 2.54;
export const PHOTO = { w: Math.round(3 * CM), h: Math.round(4 * CM) };
export const PAPERS = {
  '10x15': { name: '10×15 sm (foto qog\'oz)', w: Math.round(10 * CM), h: Math.round(15 * CM), margin: 0 },
  a4: { name: 'A4', w: Math.round(21 * CM), h: Math.round(29.7 * CM), margin: Math.round(1 * CM) }
};
export const LAYOUTS = { 1: null, 4: { cols: 2, rows: 2 }, 6: { cols: 3, rows: 2 } };

const HEAD_RATIO = 0.62; // tepa (soch) dan iyakgacha — rasm balandligining ulushi
const TOP_MARGIN = 0.07;
// Kiyim joylash: shablondagi bo'yin ochig'i kengligi = yuz kengligi × NECK_PER_FACE,
// yoqa tepasi iyakdan NECK_BELOW_CHIN × yuz kengligi pastda
const NECK_PER_FACE = 0.9;
const NECK_BELOW_CHIN = -0.19;

// Yuz va siymo bo'yicha asosiy o'lchamlar (rasm piksellarida)
export function measure(mask, face) {
  let fw, cx, chinY;
  if (face) {
    fw = face.faceWidth;
    cx = face.centerX;
    chinY = face.chin.y;
  } else {
    // Yuz topilmasa: siymo konturidan taxminiy hisob
    const probe = Math.min(mask.bottom, mask.top + Math.round((mask.bottom - mask.top) * 0.18));
    fw = Math.max(10, (mask.right[probe] - mask.left[probe]) * 0.82);
    cx = (mask.right[probe] + mask.left[probe]) / 2;
    chinY = mask.top + fw * 1.45;
  }
  let headTop = mask.top;
  for (let y = mask.top; y <= mask.bottom; y++) {
    if (mask.left[y] >= 0 && mask.left[y] <= cx + fw / 2 && mask.right[y] >= cx - fw / 2) {
      headTop = y;
      break;
    }
  }
  const headH = Math.max(fw * 0.8, chinY - headTop);
  return { fw, cx, chinY, headTop, headH, fcY: (headTop + chinY) / 2 };
}

// Ko'rinishdagi 1 piksel nechta rasm pikseliga teng (sichqoncha bilan surish uchun)
export function imageScale(H, s) {
  return (HEAD_RATIO * H * s.zoom) / s.metrics.headH;
}

function buildFilter(adj) {
  return `brightness(${adj.brightness}%) contrast(${adj.contrast}%) saturate(${adj.saturation}%)`;
}

export function render(ctx, W, H, s) {
  const m = s.metrics;
  ctx.save();
  ctx.fillStyle = s.bg;
  ctx.fillRect(0, 0, W, H);
  if (!s.cut) {
    ctx.restore();
    return;
  }
  const k = imageScale(H, s);
  const tx = W / 2 + s.offX * W;
  const ty = TOP_MARGIN * H + s.offY * H + k * (m.fcY - m.headTop);
  ctx.translate(tx, ty);
  ctx.rotate(s.rotate);
  ctx.scale(k, k);
  ctx.translate(-m.cx, -m.fcY);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const c = s.cloth;
  let place = null;
  if (c && c.image) {
    // fit — shablonga xos tuzatish (kalibrlash), clothAdj — foydalanuvchi sozlamasi
    const fit = c.fit || {};
    const cs = (NECK_PER_FACE * m.fw * (fit.scale ?? 1) * s.clothAdj.scale) / c.neck;
    const nx = m.cx + ((fit.dx ?? 0) + s.clothAdj.x) * m.fw;
    const ny = m.chinY + (NECK_BELOW_CHIN + (fit.dy ?? 0) + s.clothAdj.y) * m.fw;
    place = [nx - c.anchor.x * cs, ny - c.anchor.y * cs, c.image.width * cs, c.image.height * cs];
    // yoqaning ichki tomoni — bo'yin orqasida turadi
    if (c.inner) ctx.drawImage(c.inner, ...place);
  }

  ctx.filter = buildFilter(s.adjust);
  // kiyim tanlangan bo'lsa — asl kiyimi olib tashlangan nusxa (bosh, bo'yin, soch)
  ctx.drawImage(place && s.stripOwn && s.stripped ? s.stripped : s.cut, 0, 0);
  ctx.filter = 'none';

  if (place) ctx.drawImage(c.image, ...place);
  ctx.restore();
}

export function renderPhoto(s) {
  const canvas = document.createElement('canvas');
  canvas.width = PHOTO.w;
  canvas.height = PHOTO.h;
  render(canvas.getContext('2d'), PHOTO.w, PHOTO.h, s);
  return canvas;
}

export function renderSheet(s, count, paperKey) {
  const photo = renderPhoto(s);
  if (count === 1) return photo;
  const paper = PAPERS[paperKey];
  const { cols, rows } = LAYOUTS[count];
  const gap = Math.round(0.3 * CM);
  const gridW = cols * PHOTO.w + (cols - 1) * gap;
  const gridH = rows * PHOTO.h + (rows - 1) * gap;
  const canvas = document.createElement('canvas');
  canvas.width = paper.w;
  canvas.height = paper.h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, paper.w, paper.h);
  const x0 = Math.round((paper.w - gridW) / 2);
  const y0 = paper.margin ? paper.margin : Math.round((paper.h - gridH) / 2);
  ctx.strokeStyle = '#c8c8c8';
  ctx.lineWidth = 2;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const x = x0 + col * (PHOTO.w + gap);
      const y = y0 + r * (PHOTO.h + gap);
      ctx.drawImage(photo, x, y);
      ctx.strokeRect(x - 1, y - 1, PHOTO.w + 2, PHOTO.h + 2);
    }
  }
  return canvas;
}

// --- Fayl formatlari (chop etishda to'g'ri o'lcham chiqishi uchun DPI yoziladi) ---

function setJpegDpi(buf, dpi) {
  const b = new Uint8Array(buf);
  // APP0 JFIF: FF D8 FF E0 .. 'JFIF\0'
  if (b[2] === 0xff && b[3] === 0xe0 && String.fromCharCode(...b.slice(6, 10)) === 'JFIF') {
    b[13] = 1;
    b[14] = dpi >> 8;
    b[15] = dpi & 0xff;
    b[16] = dpi >> 8;
    b[17] = dpi & 0xff;
  }
  return b;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (const x of bytes) c = CRC_TABLE[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function setPngDpi(buf, dpi) {
  const src = new Uint8Array(buf);
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // 'pHYs'
  dv.setUint32(8, ppm);
  dv.setUint32(12, ppm);
  chunk[16] = 1;
  dv.setUint32(17, crc32(chunk.subarray(4, 17)));
  const ihdrEnd = 8 + 25; // imzo + IHDR
  const out = new Uint8Array(src.length + chunk.length);
  out.set(src.subarray(0, ihdrEnd), 0);
  out.set(chunk, ihdrEnd);
  out.set(src.subarray(ihdrEnd), ihdrEnd + chunk.length);
  return out;
}

export async function encode(canvas, format) {
  const type = format === 'png' ? 'image/png' : 'image/jpeg';
  const blob = await new Promise((res) => canvas.toBlob(res, type, 0.95));
  const buf = await blob.arrayBuffer();
  return format === 'png' ? setPngDpi(buf, DPI) : setJpegDpi(buf, DPI);
}
