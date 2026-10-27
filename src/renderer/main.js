import { loadImageBitmap, cutOut } from './segment.js';
import { detectFace } from './face.js';
import { measure, render, renderSheet, encode, PHOTO, PAPERS, DPI } from './compose.js';
import { loadCatalog, importCloth, deleteCloth } from './clothes.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const DEFAULT_ADJUST = { brightness: 100, contrast: 100, saturation: 100 };

const state = {
  gender: null,
  cut: null,
  metrics: null,
  autoRotate: 0,
  bg: '#ffffff',
  zoom: 1,
  offX: 0,
  offY: 0,
  rotate: 0,
  adjust: { ...DEFAULT_ADJUST },
  cloth: null,
  clothAdj: { scale: 1, x: 0, y: 0 },
  catalog: { categories: [], items: [] },
  category: null,
  count: 1,
  paper: '10x15',
  format: 'jpg'
};

$('#year').textContent = new Date().getFullYear();

// ---------- Ekranlar ----------
const ORDER = ['gender', 'upload', 'editor'];
function show(screen) {
  $$('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + screen));
  const idx = ORDER.indexOf(screen);
  $$('#steps li').forEach((li, i) => {
    li.classList.toggle('current', i === idx);
    li.classList.toggle('done', i < idx);
  });
}
show('gender');

let toastTimer;
function toast(msg, opts = {}) {
  const el = $('#toast');
  el.className = 'toast show' + (opts.error ? ' error' : '');
  el.textContent = msg;
  if (opts.action) {
    const a = document.createElement('a');
    a.textContent = opts.action.label;
    a.onclick = opts.action.run;
    el.append(a);
  }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), opts.error ? 6000 : 3500);
}

// ---------- 1. Jins ----------
$$('.gender-card').forEach((card) =>
  card.addEventListener('click', async () => {
    state.gender = card.dataset.gender;
    state.cloth = null;
    show('upload');
    await refreshCatalog();
  })
);
$$('[data-goto]').forEach((b) => b.addEventListener('click', () => show(b.dataset.goto)));

// ---------- 2. Yuklash ----------
const dz = $('#dropzone');
$('#file-input').addEventListener('change', (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (f) processFile(f);
});
dz.addEventListener('dragover', (e) => {
  e.preventDefault();
  dz.classList.add('over');
});
dz.addEventListener('dragleave', () => dz.classList.remove('over'));
dz.addEventListener('drop', (e) => {
  e.preventDefault();
  dz.classList.remove('over');
  const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/'));
  if (f) processFile(f);
  else toast('Iltimos, rasm faylini tanlang', { error: true });
});
$('#new-photo').addEventListener('click', () => show('upload'));

function setBusy(text, frac) {
  const busy = $('#busy');
  if (text === false) {
    busy.classList.remove('show');
    return;
  }
  busy.classList.add('show');
  $('#busy-text').textContent = text;
  $('#busy-bar').style.width = Math.round((frac ?? 0) * 100) + '%';
}

async function processFile(file) {
  show('editor');
  state.cut = null;
  draw();
  setBusy('Rasm o\'qilmoqda…', 0.05);
  try {
    const bmp = await loadImageBitmap(file);
    setBusy('Yuz aniqlanmoqda…', 0.12);
    const face = await detectFace(bmp).catch((err) => {
      console.warn('Yuz aniqlash xatosi', err);
      return null;
    });
    setBusy('Orqa fon o\'chirilmoqda…', 0.2);
    const { bitmap, mask } = await cutOut(bmp, (key, f) => {
      if (key.startsWith('fetch')) setBusy('Model yuklanmoqda…', 0.2 + f * 0.3);
      else if (key.startsWith('compute')) setBusy('Orqa fon o\'chirilmoqda…', 0.5 + f * 0.45);
    });
    bmp.close();
    if (mask.top < 0) throw new Error('Rasmda odam topilmadi');
    state.cut = bitmap;
    state.metrics = measure(mask, face);
    state.autoRotate = face && Math.abs(face.tilt) > 0.012 ? -face.tilt : 0;
    if (!face) toast('Yuz aniq topilmadi — joylashuvni qo\'lda to\'g\'rilashingiz mumkin');
    autoFit();
    setBusy(false);
  } catch (err) {
    console.error(err);
    setBusy(false);
    show('upload');
    toast('Xatolik: ' + (err.message || err), { error: true });
  }
}

// ---------- Ko'rinish ----------
const preview = $('#preview');
const pctx = preview.getContext('2d');

function sizePreview() {
  const r = preview.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(r.width * dpr);
  const h = Math.round(r.height * dpr);
  if (w && (preview.width !== w || preview.height !== h)) {
    preview.width = w;
    preview.height = h;
  }
}

let raf = 0;
function draw() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    sizePreview();
    render(pctx, preview.width, preview.height, state);
    if ($('#tab-export').classList.contains('active')) drawSheetPreview();
  });
}
new ResizeObserver(draw).observe($('#canvas-wrap'));

function syncSliders() {
  $('#a-zoom').value = state.zoom;
  $('#a-x').value = state.offX;
  $('#a-y').value = state.offY;
  $('#a-rot').value = ((state.rotate * 180) / Math.PI).toFixed(1);
  $('#a-bri').value = state.adjust.brightness;
  $('#a-con').value = state.adjust.contrast;
  $('#a-sat').value = state.adjust.saturation;
  $('#c-scale').value = state.clothAdj.scale;
  $('#c-x').value = state.clothAdj.x;
  $('#c-y').value = state.clothAdj.y;
}

function autoFit() {
  state.zoom = 1;
  state.offX = 0;
  state.offY = 0;
  state.rotate = state.autoRotate;
  syncSliders();
  draw();
}
$('#auto-fit').addEventListener('click', autoFit);
$('#zoom-in').addEventListener('click', () => setZoom(state.zoom * 1.05));
$('#zoom-out').addEventListener('click', () => setZoom(state.zoom / 1.05));
function setZoom(z) {
  state.zoom = Math.min(1.6, Math.max(0.6, z));
  syncSliders();
  draw();
}

// Sichqoncha bilan surish va kattalashtirish
const wrap = $('#canvas-wrap');
let drag = null;
wrap.addEventListener('pointerdown', (e) => {
  if (!state.cut) return;
  wrap.setPointerCapture(e.pointerId);
  wrap.classList.add('dragging');
  drag = { x: e.clientX, y: e.clientY, offX: state.offX, offY: state.offY };
});
wrap.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const r = wrap.getBoundingClientRect();
  state.offX = drag.offX + (e.clientX - drag.x) / r.width;
  state.offY = drag.offY + (e.clientY - drag.y) / r.height;
  syncSliders();
  draw();
});
const endDrag = () => {
  drag = null;
  wrap.classList.remove('dragging');
};
wrap.addEventListener('pointerup', endDrag);
wrap.addEventListener('pointercancel', endDrag);
wrap.addEventListener(
  'wheel',
  (e) => {
    if (!state.cut) return;
    e.preventDefault();
    setZoom(state.zoom * (e.deltaY < 0 ? 1.03 : 1 / 1.03));
  },
  { passive: false }
);

// ---------- Tablar ----------
$$('.tab').forEach((t) =>
  t.addEventListener('click', () => {
    $$('.tab').forEach((x) => x.classList.toggle('active', x === t));
    $$('.tab-body').forEach((b) => b.classList.toggle('active', b.id === 'tab-' + t.dataset.tab));
    if (t.dataset.tab === 'export') drawSheetPreview();
  })
);

// ---------- Sozlash ----------
const bind = (id, fn) => $(id).addEventListener('input', (e) => {
  fn(parseFloat(e.target.value));
  draw();
});
bind('#a-zoom', (v) => (state.zoom = v));
bind('#a-x', (v) => (state.offX = v));
bind('#a-y', (v) => (state.offY = v));
bind('#a-rot', (v) => (state.rotate = (v * Math.PI) / 180));
bind('#a-bri', (v) => (state.adjust.brightness = v));
bind('#a-con', (v) => (state.adjust.contrast = v));
bind('#a-sat', (v) => (state.adjust.saturation = v));
bind('#c-scale', (v) => (state.clothAdj.scale = v));
bind('#c-x', (v) => (state.clothAdj.x = v));
bind('#c-y', (v) => (state.clothAdj.y = v));
$('#reset-adjust').addEventListener('click', () => {
  state.adjust = { ...DEFAULT_ADJUST };
  autoFit();
});

// ---------- Fon ----------
function setBg(color, el) {
  state.bg = color;
  $$('#swatches button, .custom-color').forEach((b) => b.classList.toggle('active', b === el));
  draw();
}
$$('#swatches button').forEach((b) => {
  b.style.background = b.dataset.color;
  b.addEventListener('click', () => setBg(b.dataset.color, b));
});
$('#custom-color').addEventListener('input', (e) => setBg(e.target.value, $('.custom-color')));

// ---------- Kiyimlar ----------
async function refreshCatalog() {
  try {
    state.catalog = await loadCatalog(state.gender);
  } catch (err) {
    console.error(err);
    state.catalog = { categories: [], items: [] };
  }
  if (!state.catalog.categories.some((c) => c.id === state.category)) {
    state.category = state.catalog.categories[0]?.id ?? null;
  }
  renderCatalog();
}

function renderCatalog() {
  const cats = $('#cloth-cats');
  cats.innerHTML = '';
  for (const c of state.catalog.categories) {
    const b = document.createElement('button');
    b.className = 'chip' + (c.id === state.category ? ' active' : '');
    b.textContent = c.name;
    b.onclick = () => {
      state.category = c.id;
      renderCatalog();
    };
    cats.append(b);
  }

  const grid = $('#cloth-grid');
  grid.innerHTML = '';
  const none = tile(null, 'Asl kiyim');
  grid.append(none);
  const items = state.catalog.items.filter((i) => i.category === state.category);
  for (const it of items) grid.append(tile(it, it.name));
  if (!items.length) {
    const e = document.createElement('div');
    e.className = 'empty';
    e.textContent =
      state.category === 'custom'
        ? 'Hali kiyim qo\'shilmagan. Pastdagi tugma orqali shaffof fonli PNG kiyim rasmini qo\'shing.'
        : 'Bu bo\'limda hozircha kiyim yo\'q.';
    grid.append(e);
  }
  $('#cloth-fit').classList.toggle('hidden', !state.cloth);
}

function tile(item, label) {
  const b = document.createElement('button');
  b.className = 'cloth' + ((state.cloth?.id ?? null) === (item?.id ?? null) ? ' active' : '');
  const thumb = document.createElement('div');
  thumb.className = 'thumb';
  if (item) {
    const img = document.createElement('img');
    img.src = item.src;
    img.alt = label;
    thumb.append(img);
  } else {
    thumb.innerHTML = '<div class="none-icon">⦸</div>';
  }
  const span = document.createElement('span');
  span.textContent = label;
  b.append(thumb, span);
  b.onclick = () => {
    state.cloth = item;
    state.clothAdj = { scale: 1, x: 0, y: 0 };
    syncSliders();
    renderCatalog();
    draw();
  };
  if (item && !item.builtin) {
    const del = document.createElement('button');
    del.className = 'del';
    del.title = 'O\'chirish';
    del.textContent = '×';
    del.onclick = async (e) => {
      e.stopPropagation();
      await deleteCloth(item.id);
      if (state.cloth?.id === item.id) state.cloth = null;
      await refreshCatalog();
      draw();
    };
    b.append(del);
  }
  return b;
}

$('#cloth-input').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const item = await importCloth(f, state.gender);
    state.category = 'custom';
    await refreshCatalog();
    state.cloth = state.catalog.items.find((i) => i.id === item.id) || null;
    renderCatalog();
    draw();
    toast('Kiyim qo\'shildi');
  } catch (err) {
    toast('Xatolik: ' + err.message, { error: true });
  }
});

// ---------- Yuklab olish ----------
const sheetCanvas = $('#sheet-preview');
function drawSheetPreview() {
  const paperRow = $('#paper-row');
  paperRow.classList.toggle('disabled', state.count === 1);
  const out = state.count === 1 ? PHOTO : PAPERS[state.paper];
  const scale = 340 / out.h;
  sheetCanvas.width = Math.round(out.w * scale);
  sheetCanvas.height = Math.round(out.h * scale);
  const ctx = sheetCanvas.getContext('2d');
  if (!state.cut) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, sheetCanvas.width, sheetCanvas.height);
  } else {
    const full = renderSheet(state, state.count, state.paper);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(full, 0, 0, sheetCanvas.width, sheetCanvas.height);
  }
  const cm = (px) => ((px / DPI) * 2.54).toFixed(0);
  $('#export-info').innerHTML =
    state.count === 1
      ? `Yuqori sifat: <b>${PHOTO.w}×${PHOTO.h} px</b>, ${DPI} DPI (3×4 sm).`
      : `<b>${state.count} dona</b> 3×4 rasm ${cm(out.w)}×${cm(out.h)} sm qog'ozga joylandi · ${DPI} DPI. ` +
        `Chop etishda “Haqiqiy o'lcham / 100%” ni tanlang.`;
}

$$('#count-options button').forEach((b) =>
  b.addEventListener('click', () => {
    state.count = Number(b.dataset.count);
    $$('#count-options button').forEach((x) => x.classList.toggle('active', x === b));
    drawSheetPreview();
  })
);
$('#paper').addEventListener('change', (e) => {
  state.paper = e.target.value;
  drawSheetPreview();
});
$('#format').addEventListener('change', (e) => (state.format = e.target.value));

$('#download').addEventListener('click', async () => {
  if (!state.cut) return toast('Avval rasm yuklang', { error: true });
  const btn = $('#download');
  btn.disabled = true;
  btn.textContent = 'Tayyorlanmoqda…';
  try {
    const canvas = renderSheet(state, state.count, state.paper);
    const bytes = await encode(canvas, state.format);
    const ext = state.format;
    const stamp = new Date().toISOString().slice(0, 10);
    const name = state.count === 1 ? `3x4_rasm_${stamp}.${ext}` : `3x4_${state.count}ta_${state.paper}_${stamp}.${ext}`;
    const res = await window.desktop.saveFile(bytes.buffer, name, [
      { name: ext.toUpperCase() + ' rasm', extensions: [ext] }
    ]);
    if (res.ok) {
      toast('Saqlandi', { action: { label: 'Papkani ochish', run: () => window.desktop.showInFolder(res.filePath) } });
    }
  } catch (err) {
    console.error(err);
    toast('Saqlashda xatolik: ' + err.message, { error: true });
  } finally {
    btn.disabled = false;
    btn.textContent = 'Yuklab olish';
  }
});
