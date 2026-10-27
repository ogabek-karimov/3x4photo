// Asl kiyim va yelkalarni olib tashlash: faqat bosh, bo'yin va (bo'lsa) uzun soch qoladi.
// Natija rasm bilan bir xil o'lchamdagi canvas — kiyim tanlanganda shu chiziladi.

export function stripClothes(cut, m) {
  const W = cut.width;
  const H = cut.height;
  const fw = m.fw;
  const cutY = Math.round(m.chinY + 0.06 * fw);

  const src = new OffscreenCanvas(W, H);
  const sctx = src.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(cut, 0, 0);
  const data = sctx.getImageData(0, 0, W, H).data;

  const out = new OffscreenCanvas(W, H);
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 1) Bo'yin: iyak ostidagi qatlam o'rtacha rangini pastga silliq davom ettiramiz
  const half = 0.42 * fw; // bo'yin kengligi (yon tomonlardagi asl kiyim olinmasin)
  const sx = Math.max(0, Math.round(m.cx - half));
  const sw = Math.min(W, Math.round(m.cx + half)) - sx;
  const slab = Math.max(3, Math.round(0.1 * fw));
  const neckLen = 1.4 * fw;
  if (sw > 0 && cutY + slab < H) {
    const row = new OffscreenCanvas(sw, 1);
    const rctx = row.getContext('2d');
    rctx.imageSmoothingQuality = 'high';
    rctx.drawImage(src, sx, cutY, sw, slab, 0, 0, sw, 1);
    ctx.save();
    ctx.filter = `blur(${Math.max(1, fw * 0.012)}px)`;
    ctx.drawImage(row, 0, 0, sw, 1, sx, cutY - 2, sw, neckLen);
    ctx.restore();

    // asl teridan o'rtacha rangga yumshoq o'tish (chok ko'rinmasligi uchun)
    const fade = Math.round(0.1 * fw);
    const strip = new OffscreenCanvas(sw, fade);
    const tctx = strip.getContext('2d');
    tctx.drawImage(src, sx, cutY, sw, fade, 0, 0, sw, fade);
    tctx.globalCompositeOperation = 'destination-in';
    const g = tctx.createLinearGradient(0, 0, 0, fade);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    tctx.fillStyle = g;
    tctx.fillRect(0, 0, sw, fade);
    ctx.drawImage(strip, sx, cutY);
  }

  // 2) Bosh: iyakdan yuqori qism o'zgarishsiz. Iyak darajasida esa faqat yuz atrofi
  // olinadi, aks holda baland ko'tarilgan asl yelkalar chetlarda ko'rinib qoladi.
  const sideY = Math.round(m.chinY - 0.3 * fw);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, sideY);
  ctx.rect(m.cx - 0.85 * fw, sideY, 1.7 * fw, cutY - sideY);
  ctx.clip();
  ctx.drawImage(cut, 0, 0);
  ctx.restore();

  // 3) Uzun soch: yuzning ikki yonida soch bo'lsa, uni pastga qarab kuzatamiz
  const hair = hairBelow(data, W, H, m, cutY, sideY);
  if (hair) ctx.drawImage(hair, 0, 0);

  return out;
}

function hairBelow(d, W, H, m, cutY, startY) {
  const fw = m.fw;
  const idx = (x, y) => (y * W + x) * 4;
  // namuna: yuzdan tashqarida, iyak darajasida
  const samples = [];
  let total = 0;
  const y0 = Math.max(0, Math.round(m.chinY - 0.35 * fw));
  for (let y = y0; y < cutY; y += 2) {
    for (const [a, b] of [
      [m.cx - 1.1 * fw, m.cx - 0.6 * fw],
      [m.cx + 0.6 * fw, m.cx + 1.1 * fw]
    ]) {
      for (let x = Math.max(0, Math.round(a)); x < Math.min(W, Math.round(b)); x += 2) {
        total++;
        const i = idx(x, y);
        if (d[i + 3] > 160) samples.push([d[i], d[i + 1], d[i + 2]]);
      }
    }
  }
  if (!total || samples.length / total < 0.2) return null; // uzun soch yo'q

  const median = (arr, k) => arr.map((s) => s[k]).sort((p, q) => p - q)[arr.length >> 1];
  const hc = [median(samples, 0), median(samples, 1), median(samples, 2)];

  // Yon tomondagi rang bosh tepasidagi soch (yoki ro'mol) rangiga mos bo'lishi kerak,
  // aks holda bu soch emas, asl kiyim yoki yelka
  const top = [];
  for (let y = m.headTop; y < m.headTop + 0.15 * fw && y < H; y += 2) {
    for (let x = Math.round(m.cx - 0.3 * fw); x < m.cx + 0.3 * fw; x += 2) {
      const i = idx(Math.max(0, Math.min(W - 1, x)), y);
      if (d[i + 3] > 160) top.push([d[i], d[i + 1], d[i + 2]]);
    }
  }
  if (!top.length) return null;
  const tc = [median(top, 0), median(top, 1), median(top, 2)];
  const diff = Math.hypot(hc[0] - tc[0], hc[1] - tc[1], hc[2] - tc[2]);
  if (diff > 60) return null;
  const isHair = (i) => {
    if (d[i + 3] < 60) return false;
    const dr = d[i] - hc[0];
    const dg = d[i + 1] - hc[1];
    const db = d[i + 2] - hc[2];
    return dr * dr + dg * dg + db * db < 55 * 55;
  };

  // iyak chizig'idagi soch piksellaridan pastga qarab to'ldirish (bo'yin qismi bundan mustasno)
  const neckL = m.cx - 0.45 * fw;
  const neckR = m.cx + 0.45 * fw;
  const keep = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) {
    if (x > neckL && x < neckR) continue;
    const p = (startY - 1) * W + x;
    if (isHair(p * 4)) {
      keep[p] = 1;
      stack.push(p);
    }
  }
  if (!stack.length) return null;
  const maxY = Math.min(H, Math.round(m.chinY + 2.5 * fw));
  while (stack.length) {
    const p = stack.pop();
    const x = p % W;
    const y = (p - x) / W;
    for (const q of [p + W, p - 1, p + 1]) {
      const qx = q % W;
      const qy = (q - qx) / W;
      if (qy >= maxY || qy < startY || Math.abs(qx - x) > 1 || keep[q]) continue;
      if (qx > neckL && qx < neckR) continue;
      if (!isHair(q * 4)) continue;
      keep[q] = 1;
      stack.push(q);
    }
  }

  const out = new OffscreenCanvas(W, H);
  const octx = out.getContext('2d');
  const img = octx.createImageData(W, H);
  const o = img.data;
  for (let p = startY * W; p < maxY * W; p++) {
    if (!keep[p]) continue;
    const i = p * 4;
    o[i] = d[i];
    o[i + 1] = d[i + 1];
    o[i + 2] = d[i + 2];
    o[i + 3] = d[i + 3];
  }
  octx.putImageData(img, 0, 0);
  // qirralarni yumshatish
  const soft = new OffscreenCanvas(W, H);
  const sctx = soft.getContext('2d');
  sctx.filter = 'blur(1px)';
  sctx.drawImage(out, 0, 0);
  return soft;
}
