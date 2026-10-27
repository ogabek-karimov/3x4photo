// Kiyim katalogi: Bo'lim → Tur → Variant → Rang.
// Dastur bilan keladigan shablonlar app/clothes da (manifest.json), foydalanuvchi qo'shganlari IndexedDB da.

const DB_NAME = 'foto3x4';
const STORE = 'clothes';
export const CUSTOM_CATEGORY = { id: 'custom', name: "Qo'shilganlar" };
const CUSTOM_TYPE = { id: 'custom', category: 'custom', name: "Mening kiyimlarim", palette: null };

export const PALETTES = {
  suit: [
    { name: 'Qora', color: '#17181c' },
    { name: "To'q ko'k", color: '#1d2740' },
    { name: "Ko'k", color: '#2b4a7e' },
    { name: 'Kulrang', color: '#55595f' },
    { name: 'Och kulrang', color: '#a3a6ab' },
    { name: 'Jigarrang', color: '#4e3426' },
    { name: 'Bej', color: '#c9b596' },
    { name: 'Bordo', color: '#571a26' },
    { name: "To'q yashil", color: '#1f3a2e' },
    { name: 'Oq', color: '#ecebe7' }
  ],
  shirt: [
    { name: 'Oq', color: '#f6f7f9' },
    { name: 'Havorang', color: '#bcd4f0' },
    { name: 'Pushti', color: '#f2cdd6' },
    { name: 'Bej', color: '#e8dcc6' },
    { name: 'Kulrang', color: '#cfd2d6' },
    { name: "Ko'k", color: '#7d9fd0' },
    { name: 'Qora', color: '#36373a' }
  ]
};

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(result.result ?? result);
    t.onerror = () => reject(t.error);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Rasm yuklanmadi: ' + src));
    img.src = src;
  });
}

// Foydalanuvchi qo'shgan PNG uchun yoqa nuqtasi va bo'yin kengligini taxminiy aniqlash
function analyze(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const { data, width: w, height: h } = ctx.getImageData(0, 0, c.width, c.height);
  const opaque = (x, y) => data[(y * w + x) * 4 + 3] > 100;
  let minX = w;
  let maxX = 0;
  let any = false;
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      if (opaque(x, y)) {
        any = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }
  if (!any) throw new Error("PNG fayl shaffof emas yoki bo'sh");
  const cx = Math.round((minX + maxX) / 2);
  const W = maxX - minX;
  for (let y = 0; y < h; y++) {
    let left = false;
    let right = false;
    for (let x = 0; x < cx; x++) if (opaque(x, y)) { left = true; break; }
    for (let x = cx; x < w; x++) if (opaque(x, y)) { right = true; break; }
    if (left && right) {
      const yy = Math.min(h - 1, y + Math.round(W * 0.03));
      if (opaque(cx, yy)) return { anchor: { x: cx, y }, neck: W * 0.15 };
      let l = cx;
      let r = cx;
      while (l > 0 && !opaque(l, yy)) l--;
      while (r < w - 1 && !opaque(r, yy)) r++;
      return { anchor: { x: (l + r) / 2, y }, neck: Math.max(W * 0.08, r - l) };
    }
  }
  return { anchor: { x: cx, y: 0 }, neck: W * 0.15 };
}

export async function loadCatalog(gender) {
  const res = await fetch('clothes/manifest.json');
  const manifest = await res.json();
  const types = manifest.types.filter((t) => t.gender.includes(gender));
  const typeIds = new Set(types.map((t) => t.id));
  const items = manifest.items
    .filter((it) => it.types.some((t) => typeIds.has(t)))
    .map((it) => ({
      ...it,
      src: 'clothes/' + it.file,
      thumbSrc: 'clothes/' + it.thumb,
      maskSrc: it.mask ? 'clothes/' + it.mask.file : null,
      builtin: true
    }));

  const custom = await tx('readonly', (s) => s.getAll());
  const customItems = custom
    .filter((i) => i.gender === gender)
    .map((it) => {
      const src = URL.createObjectURL(it.blob);
      return { ...it, types: [CUSTOM_TYPE.id], src, thumbSrc: src, maskSrc: null };
    });

  const categories = manifest.categories.filter((c) => types.some((t) => t.category === c.id));
  return {
    credits: manifest.credits,
    categories: [...categories, CUSTOM_CATEGORY],
    types: [...types, CUSTOM_TYPE],
    items: [...items, ...customItems]
  };
}

export async function importCloth(file, gender) {
  const src = URL.createObjectURL(file);
  const image = await loadImage(src);
  URL.revokeObjectURL(src);
  const { anchor, neck } = analyze(image);
  const record = {
    id: 'c' + Date.now().toString(36),
    gender,
    name: file.name.replace(/\.[^.]+$/, ''),
    blob: file,
    anchor,
    neck
  };
  await tx('readwrite', (s) => s.put(record));
  return record;
}

export function deleteCloth(id) {
  return tx('readwrite', (s) => s.delete(id));
}

// --- Rang almashtirish ---

const imageCache = new Map();
function cachedImage(src) {
  if (!imageCache.has(src)) imageCache.set(src, loadImage(src));
  return imageCache.get(src);
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const renderCache = new Map();

// Tanlangan variant va rang uchun tayyor kiyim rasmi (canvas yoki img)
export async function clothImage(item, color) {
  const key = item.id + '|' + (color || '');
  if (renderCache.has(key)) return renderCache.get(key);
  const base = await cachedImage(item.src);
  if (!color || !item.maskSrc) {
    renderCache.set(key, base);
    return base;
  }
  const mask = await cachedImage(item.maskSrc);
  const w = base.naturalWidth;
  const h = base.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(mask, 0, 0, w, h);
  const m = ctx.getImageData(0, 0, w, h).data;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(base, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const [tr, tg, tb] = hexToRgb(color);
  const lref = item.mask.lref;
  const jacket = item.mask.part === 'jacket';
  for (let i = 0; i < d.length; i += 4) {
    const k = m[i] / 255; // niqob kulrang: R kanal yetarli
    if (k === 0) continue;
    const L = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    let r, g, b;
    if (jacket) {
      // qorong'i matoda: soyalarni qo'shish orqali saqlash
      const s = (L - lref) * 255 * 1.25;
      r = tr + s;
      g = tg + s;
      b = tb + s;
    } else {
      // och matoda (ko'ylak): yorug'lik nisbati bo'yicha
      const s = Math.min(1.6, L / lref);
      r = tr * s;
      g = tg * s;
      b = tb * s;
    }
    d[i] = d[i] * (1 - k) + Math.max(0, Math.min(255, r)) * k;
    d[i + 1] = d[i + 1] * (1 - k) + Math.max(0, Math.min(255, g)) * k;
    d[i + 2] = d[i + 2] * (1 - k) + Math.max(0, Math.min(255, b)) * k;
  }
  ctx.putImageData(img, 0, 0);
  renderCache.set(key, canvas);
  return canvas;
}
