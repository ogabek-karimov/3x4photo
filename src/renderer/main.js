import { loadImageBitmap, cutOut } from './segment.js';
import { detectFace } from './face.js';
import { stripClothes } from './strip.js';
import { measure, render, renderSheet, encode, imageScale, PHOTO, PAPERS, DPI } from './compose.js';
import { loadCatalog, importCloth, deleteCloth, clothImage, PALETTES } from './clothes.js';

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
  stripOwn: true,
  catalog: { categories: [], types: [], items: [] },
  category: null,
  pick: null,
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
    state.pick = null;
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
  state.stripped = null;
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
    state.stripped = stripClothes(bitmap, state.metrics);
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
  $('#c-scale-val').textContent = Math.round(state.clothAdj.scale * 100) + '%';
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

// Sichqoncha bilan surish va kattalashtirish: "Rasm" yoki "Kiyim" rejimi
const wrap = $('#canvas-wrap');
let dragMode = 'photo';
function setDragMode(mode) {
  dragMode = mode;
  $$('#drag-mode button').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
}
$$('#drag-mode button').forEach((b) => b.addEventListener('click', () => setDragMode(b.dataset.mode)));
const movingCloth = () => dragMode === 'cloth' && state.cloth;

let drag = null;
wrap.addEventListener('pointerdown', (e) => {
  if (!state.cut) return;
  wrap.setPointerCapture(e.pointerId);
  wrap.classList.add('dragging');
  drag = { x: e.clientX, y: e.clientY, offX: state.offX, offY: state.offY, cx: state.clothAdj.x, cy: state.clothAdj.y };
});
wrap.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const r = wrap.getBoundingClientRect();
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  if (movingCloth()) {
    // ekran pikselini yuz kengligi birligiga o'tkazamiz
    const unit = state.metrics.fw * imageScale(r.height, state);
    state.clothAdj.x = clamp(drag.cx + dx / unit, -0.5, 0.5);
    state.clothAdj.y = clamp(drag.cy + dy / unit, -0.8, 0.8);
  } else {
    state.offX = drag.offX + dx / r.width;
    state.offY = drag.offY + dy / r.height;
  }
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
    const f = e.deltaY < 0 ? 1.03 : 1 / 1.03;
    if (movingCloth()) setClothScale(state.clothAdj.scale * f);
    else setZoom(state.zoom * f);
  },
  { passive: false }
);

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
function setClothScale(v) {
  state.clothAdj.scale = clamp(v, 0.6, 1.6);
  syncSliders();
  draw();
}
$('#c-scale-dec').addEventListener('click', () => setClothScale(state.clothAdj.scale - 0.02));
$('#c-scale-inc').addEventListener('click', () => setClothScale(state.clothAdj.scale + 0.02));
$('#strip-own').addEventListener('change', (e) => {
  state.stripOwn = e.target.checked;
  draw();
});
$('#cloth-auto').addEventListener('click', () => {
  state.clothAdj = { scale: 1, x: 0, y: 0 };
  syncSliders();
  draw();
});

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
bind('#c-scale', (v) => {
  state.clothAdj.scale = v;
  $('#c-scale-val').textContent = Math.round(v * 100) + '%';
});
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

// ---------- Kiyimlar: Bo'lim → Tur → Variant → Rang ----------
// state.pick = { typeId, itemId, color } — tanlov; state.cloth — chizish uchun tayyor rasm
async function refreshCatalog() {
  try {
    state.catalog = await loadCatalog(state.gender);
  } catch (err) {
    console.error(err);
    state.catalog = { categories: [], types: [], items: [] };
  }
  if (!state.catalog.categories.some((c) => c.id === state.category)) {
    state.category = state.catalog.categories[0]?.id ?? null;
  }
  $('#cloth-credits').textContent = state.catalog.credits || '';
  renderCatalog();
}

const typeItems = (typeId) => state.catalog.items.filter((i) => i.types.includes(typeId));

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

  // Turlar
  const grid = $('#cloth-types');
  grid.innerHTML = '';
  grid.append(typeCard(null));
  const types = state.catalog.types.filter((t) => t.category === state.category);
  let shown = 0;
  for (const t of types) {
    if (!typeItems(t.id).length) continue;
    grid.append(typeCard(t));
    shown++;
  }
  if (!shown) {
    const e = document.createElement('div');
    e.className = 'empty';
    e.textContent =
      state.category === 'custom'
        ? "Hali kiyim qo'shilmagan. Pastdagi tugma orqali shaffof fonli PNG kiyim rasmini qo'shing."
        : "Bu bo'limda hozircha kiyim yo'q.";
    grid.append(e);
  }
  $('#cloth-import').classList.toggle('hidden', state.category !== 'custom');

  // Variantlar va ranglar — tanlangan tur uchun
  const pick = state.pick;
  const type = pick && state.catalog.types.find((t) => t.id === pick.typeId);
  const variants = type ? typeItems(type.id) : [];
  const vwrap = $('#variants-wrap');
  vwrap.classList.toggle('hidden', variants.length < 2);
  const vrow = $('#cloth-variants');
  vrow.innerHTML = '';
  for (const it of variants) {
    const b = document.createElement('button');
    b.className = 'variant' + (it.id === pick.itemId ? ' active' : '');
    b.title = it.name;
    const img = document.createElement('img');
    img.src = it.thumbSrc;
    img.alt = it.name;
    b.append(img);
    b.onclick = () => choose(type.id, it.id, pick.color);
    vrow.append(b);
  }

  const item = variants.find((i) => i.id === pick?.itemId);
  const palette = type?.palette && item?.mask ? PALETTES[type.palette] : null;
  $('#colors-wrap').classList.toggle('hidden', !palette);
  const crow = $('#cloth-colors');
  crow.innerHTML = '';
  if (palette) {
    const orig = document.createElement('button');
    orig.className = 'orig' + (!pick.color ? ' active' : '');
    orig.title = 'Asl rangi';
    orig.onclick = () => choose(type.id, item.id, null);
    crow.append(orig);
    for (const p of palette) {
      const b = document.createElement('button');
      b.style.background = p.color;
      b.title = p.name;
      b.className = pick.color === p.color ? 'active' : '';
      b.onclick = () => choose(type.id, item.id, p.color);
      crow.append(b);
    }
  }
  $('#cloth-fit').classList.toggle('hidden', !state.cloth);
  $('#drag-mode').classList.toggle('hidden', !state.cloth);
  if (!state.cloth && dragMode === 'cloth') setDragMode('photo');
}

function typeCard(type) {
  const b = document.createElement('button');
  const active = (state.pick?.typeId ?? null) === (type?.id ?? null);
  b.className = 'cloth' + (active ? ' active' : '');
  const thumb = document.createElement('div');
  thumb.className = 'thumb';
  const label = document.createElement('span');
  if (type) {
    const items = typeItems(type.id);
    const shownItem = (active && items.find((i) => i.id === state.pick.itemId)) || items[0];
    const img = document.createElement('img');
    img.src = shownItem.thumbSrc;
    img.alt = type.name;
    thumb.append(img);
    label.textContent = type.id === 'custom' ? shownItem.name : type.name;
    if (items.length > 1) {
      const count = document.createElement('i');
      count.className = 'count';
      count.textContent = items.length;
      b.append(count);
    }
    if (type.id === 'custom' && active) {
      const del = document.createElement('button');
      del.className = 'del';
      del.title = "O'chirish";
      del.textContent = '×';
      del.onclick = async (e) => {
        e.stopPropagation();
        await deleteCloth(state.pick.itemId);
        state.pick = null;
        state.cloth = null;
        await refreshCatalog();
        draw();
      };
      b.append(del);
    }
    b.onclick = () => {
      if (active) return;
      choose(type.id, items[0].id, null);
    };
  } else {
    thumb.innerHTML = '<div class="none-icon">⦸</div>';
    label.textContent = 'Asl kiyim';
    b.onclick = () => {
      state.pick = null;
      state.cloth = null;
      renderCatalog();
      draw();
    };
  }
  b.append(thumb, label);
  return b;
}

let chooseSeq = 0;
async function choose(typeId, itemId, color) {
  const prevItem = state.pick?.itemId;
  state.pick = { typeId, itemId, color };
  if (prevItem !== itemId) {
    state.clothAdj = { scale: 1, x: 0, y: 0 };
    syncSliders();
  }
  renderCatalog();
  const item = state.catalog.items.find((i) => i.id === itemId);
  const seq = ++chooseSeq;
  try {
    const { image, inner } = await clothImage(item, color);
    if (seq !== chooseSeq) return;
    state.cloth = { image, inner, anchor: item.anchor, neck: item.neck, fit: item.fit };
  } catch (err) {
    console.error(err);
    toast('Kiyimni yuklashda xatolik', { error: true });
    state.cloth = null;
  }
  renderCatalog();
  draw();
}

$('#cloth-input').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const record = await importCloth(f, state.gender);
    state.category = 'custom';
    await refreshCatalog();
    await choose('custom', record.id, null);
    toast("Kiyim qo'shildi");
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
