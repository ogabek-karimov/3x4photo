// Kiyim shablonlari: dastur bilan keladigan (app/clothes) va foydalanuvchi qo'shganlari (IndexedDB)

const DB_NAME = 'foto3x4';
const STORE = 'clothes';
export const CUSTOM_CATEGORY = { id: 'custom', name: "Qo'shilganlar" };

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

// Shaffof PNG'dan yoqa nuqtasi va yelka kengligini avtomatik aniqlash
function analyze(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const { data, width: w, height: h } = ctx.getImageData(0, 0, c.width, c.height);
  let top = -1;
  let bottom = 0;
  const rows = [];
  for (let y = 0; y < h; y++) {
    let l = -1;
    let r = -1;
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 100) {
        if (l < 0) l = x;
        r = x;
      }
    }
    rows.push([l, r]);
    if (l >= 0) {
      if (top < 0) top = y;
      bottom = y;
    }
  }
  if (top < 0) throw new Error('PNG fayl shaffof emas yoki bo\'sh');
  let shoulder = 0;
  let left = w;
  let right = 0;
  const limit = top + Math.round((bottom - top) * 0.5);
  for (let y = top; y <= limit; y++) {
    const [l, r] = rows[y];
    if (l >= 0 && r - l > shoulder) shoulder = r - l;
    if (l >= 0) {
      left = Math.min(left, l);
      right = Math.max(right, r);
    }
  }
  return { anchor: { x: (left + right) / 2, y: top }, shoulder: Math.max(1, shoulder) };
}

export async function loadCatalog(gender) {
  const res = await fetch('clothes/manifest.json');
  const manifest = await res.json();
  const items = [];
  for (const it of manifest.items.filter((i) => i.gender === gender)) {
    const image = await loadImage('clothes/' + it.file);
    const auto = it.anchor && it.shoulder ? null : analyze(image);
    items.push({
      id: it.id,
      name: it.name,
      category: it.category,
      src: image.src,
      image,
      anchor: it.anchor || auto.anchor,
      shoulder: it.shoulder || auto.shoulder,
      builtin: true
    });
  }
  const custom = await tx('readonly', (s) => s.getAll());
  for (const it of custom.filter((i) => i.gender === gender)) {
    const src = URL.createObjectURL(it.blob);
    const image = await loadImage(src);
    items.push({ ...it, src, image, category: CUSTOM_CATEGORY.id });
  }
  return { categories: [...manifest.categories, CUSTOM_CATEGORY], items };
}

export async function importCloth(file, gender) {
  const src = URL.createObjectURL(file);
  const image = await loadImage(src);
  const { anchor, shoulder } = analyze(image);
  const record = {
    id: 'c' + Date.now().toString(36),
    gender,
    name: file.name.replace(/\.[^.]+$/, ''),
    blob: file,
    anchor,
    shoulder
  };
  await tx('readwrite', (s) => s.put(record));
  return { ...record, src, image, category: CUSTOM_CATEGORY.id };
}

export function deleteCloth(id) {
  return tx('readwrite', (s) => s.delete(id));
}
