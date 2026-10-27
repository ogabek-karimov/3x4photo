"""Kiyim shablonlarini dastur uchun tayyorlaydi.

Manba rasmlar (pngimg.com, CC BY-NC 4.0) sources.json da ko'rsatilgan.
Har bir shablon uchun:
  - shaffof chetlar kesiladi, o'lcham kichraytiriladi
  - bo'yin ochig'i (yoqa) markazi va kengligi aniqlanadi -> yuzga moslab joylash uchun
  - rang almashtirish uchun niqob (jaket yoki ko'ylak) yaratiladi

Ishlatish:  python3 scripts/clothes/process.py <yuklab olingan rasmlar papkasi>
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'app' / 'clothes'
MAX_W = 1200


def luminance(rgb):
    return (0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]) / 255.0


def otsu(values):
    hist, edges = np.histogram(values, bins=128, range=(0, 1))
    p = hist / max(1, hist.sum())
    w = np.cumsum(p)
    mu = np.cumsum(p * np.arange(128))
    mu_t = mu[-1]
    with np.errstate(divide='ignore', invalid='ignore'):
        sb = (mu_t * w - mu) ** 2 / (w * (1 - w))
    return edges[int(np.nanargmax(sb))]


def neck_geometry(alpha):
    """Yoqa tepasi (ikki tomonda mato bor, markazda bo'shliq) va bo'yin ochig'i kengligi."""
    h, w = alpha.shape
    cols = np.where(alpha.any(axis=0))[0]
    cx = (cols[0] + cols[-1]) / 2
    for y in range(h):
        row = alpha[y]
        if not row.any():
            continue
        left = np.where(row[: int(cx)])[0]
        right = np.where(row[int(cx):])[0]
        if len(left) and len(right):
            # bo'yin ochig'ini bir oz pastroqda o'lchaymiz
            yy = min(h - 1, y + int(w * 0.03))
            r2 = alpha[yy]
            c = int(cx)
            if r2[c]:
                return {'x': float(cx), 'y': float(y)}, float(w * 0.15)
            l = c
            while l > 0 and not r2[l]:
                l -= 1
            r = c
            while r < w - 1 and not r2[r]:
                r += 1
            return {'x': float((l + r) / 2), 'y': float(y)}, float(r - l)
    raise ValueError('yoqa topilmadi')


def v_opening(alpha, lum):
    """Jaket lackanlari orasidagi V-qism (ko'ylak + galstuk) — har bir qatorda ko'ylak piksellari oralig'i."""
    h, w = alpha.shape
    thr = max(0.45, otsu(lum[alpha]))
    light = alpha & (lum > thr)
    lab, n = ndimage.label(light)
    region = np.zeros_like(alpha)
    if n == 0:
        return region
    cols = np.where(alpha.any(axis=0))[0]
    cx = (cols[0] + cols[-1]) / 2
    W = cols[-1] - cols[0]
    keep = []
    for i, sl in enumerate(ndimage.find_objects(lab), start=1):
        ys, xs = sl
        mid = (xs.start + xs.stop) / 2
        if abs(mid - cx) < W * 0.25 and ys.start < h * 0.35 and (lab[sl] == i).sum() > alpha.sum() * 0.002:
            keep.append(i)
    shirt = np.isin(lab, keep)
    spans = []
    for y in range(h):
        xs = np.where(shirt[y])[0]
        spans.append((xs[0], xs[-1]) if len(xs) else None)
    # bo'shliqlarni to'ldirish uchun qo'shni qatorlar bilan birlashtirish
    for y in range(h):
        near = [spans[j] for j in range(max(0, y - 3), min(h, y + 4)) if spans[j]]
        if near and spans[y] is not None:
            region[y, min(a for a, _ in near): max(b for _, b in near) + 1] = True
    # Ko'ylak tugagan joydan pastda galstuk lackanlar orasida davom etadi:
    # V ning chap va o'ng chegaralarini to'g'ri chiziq bilan uchrashgan nuqtagacha davom ettiramiz
    # faqat yuqoridan boshlangan uzluksiz qatorlar (pastdagi tugma/cho'ntak yorug'liklari hisobga olinmaydi)
    rows = []
    for y in range(h):
        if spans[y] is not None:
            if rows and y - rows[-1] > 6:
                break
            rows.append(y)
    # bir tomondagina ko'ylak ko'rinadigan ingichka qatorlar chiziqni buzmasin
    if rows:
        widths = {y: spans[y][1] - spans[y][0] for y in rows}
        wmax = max(widths.values())
        rows = [y for y in rows if widths[y] > wmax * 0.3]
    if len(rows) > 10:
        lower = rows[len(rows) // 2:]
        ls = np.polyfit(lower, [spans[y][0] for y in lower], 1)
        rs = np.polyfit(lower, [spans[y][1] for y in lower], 1)
        for y in range(rows[-1] + 1, h):
            l = np.polyval(ls, y)
            r = np.polyval(rs, y)
            if r - l < 2:
                break
            region[y, int(l): int(r) + 1] = True
    return ndimage.binary_dilation(region, iterations=2)


def jacket_mask(alpha, lum, thr):
    dark = alpha & (lum < thr)
    lab, n = ndimage.label(dark)
    h, w = alpha.shape
    keep = set()
    for y in range(int(h * 0.15), h, 2):
        xs = np.where(alpha[y])[0]
        if len(xs):
            keep.add(int(lab[y, xs[0]]))
            keep.add(int(lab[y, xs[-1]]))
    keep.discard(0)
    m = np.isin(lab, list(keep))
    m = ndimage.binary_closing(m, iterations=3)
    m = ndimage.binary_fill_holes(m) & alpha
    return m & ~v_opening(alpha, lum)


def shirt_mask(rgb, alpha, lum, thr, tie_expected=True):
    """Butun ko'ylak, galstukdan tashqari. Galstuk = markaziy ustunga tegib turgan qorong'i soha."""
    h, w = alpha.shape
    if not tie_expected:
        return alpha.copy()
    # galstuk = ko'ylakdan ancha qorong'i yoki rang tusi boshqacha piksellar.
    # Rang tusi (xromatiklik) solishtiriladi, shunda ko'ylak soyalari galstuk deb olinmaydi.
    chroma = rgb / np.maximum(1.0, rgb.sum(axis=-1, keepdims=True))
    shirt_chroma = np.median(chroma[alpha & (lum >= thr)], axis=0)
    cdist = np.sqrt(((chroma - shirt_chroma) ** 2).sum(axis=-1))
    diff = ndimage.uniform_filter(((cdist > 0.035) & alpha).astype(np.float32), size=5) > 0.5
    dark = alpha & (diff | (lum < thr * 0.75))
    lab, n = ndimage.label(dark)
    cols = np.where(alpha.any(axis=0))[0]
    cx = int((cols[0] + cols[-1]) / 2)
    ids = set(np.unique(lab[int(h * 0.1):, cx - 2: cx + 3]).tolist()) - {0}
    tie = np.isin(lab, list(ids))
    # galstuk har bir qatorda yaxlit: qo'shni qatorlardagi eng chap va eng o'ng chetlar orasini to'ldiramiz
    # (galstukdagi och naqshlar ko'ylakka o'xshab qolmasligi uchun)
    left = np.full(h, np.inf)
    right = np.full(h, -np.inf)
    for y in range(h):
        xs = np.where(tie[y])[0]
        if len(xs):
            left[y], right[y] = xs[0], xs[-1]
    win = max(6, int(w * 0.02))
    filled = np.zeros_like(tie)
    for y in range(h):
        if not np.isfinite(left[y]):
            continue
        lo, hi = max(0, y - win), min(h, y + win + 1)
        l = max(np.min(left[lo:hi]), cx - w * 0.06)
        r = min(np.max(right[lo:hi]), cx + w * 0.06)
        filled[y, int(l): int(r) + 1] = True
    tie = filled
    return alpha & ~ndimage.binary_dilation(tie, iterations=2)


def soft(mask, alpha, radius=1.0):
    # 1 px kengaytirish: chegarada eski rangdan ingichka chiziq qolmasin
    mask = ndimage.binary_dilation(mask, iterations=1) & alpha
    img = np.array(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius)))
    # tashqi chetda (fon bilan chegarada) niqob yumshamasin, aks holda qora chiziq qoladi
    outer = alpha & ~ndimage.binary_erosion(alpha, iterations=3)
    img[outer & ndimage.binary_dilation(mask, iterations=3)] = 255
    return Image.fromarray(img)


def process(src_dir, item):
    im = Image.open(src_dir / item['file']).convert('RGBA')
    bbox = im.getchannel('A').point(lambda v: 255 if v > 40 else 0).getbbox()
    im = im.crop(bbox)
    if im.width > MAX_W:
        im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
    arr = np.array(im)
    rgb = arr[..., :3].astype(np.float32)
    alpha = arr[..., 3] > 100
    lum = luminance(rgb)
    anchor, neck = neck_geometry(alpha)

    out_id = item['id']
    im.save(OUT / f'{out_id}.png', optimize=True)
    thumb = im.copy()
    thumb.thumbnail((220, 220), Image.LANCZOS)
    thumb.save(OUT / f'{out_id}.thumb.png', optimize=True)
    entry = {
        'id': out_id,
        'types': item['type'],
        'name': item['name'],
        'file': f'{out_id}.png',
        'thumb': f'{out_id}.thumb.png',
        'anchor': anchor,
        'neck': neck,
        'source': item['url'],
    }
    part = item.get('recolor')
    if part:
        thr = item.get('threshold') or otsu(lum[alpha])
        m = jacket_mask(alpha, lum, thr) if part == 'jacket' else shirt_mask(rgb, alpha, lum, thr, item.get('tie', True))
        soft(m, alpha).save(OUT / f'{out_id}.{part}.png', optimize=True)
        entry['mask'] = {'part': part, 'file': f'{out_id}.{part}.png', 'lref': float(np.median(lum[m]))}
    return entry


def main():
    src_dir = Path(sys.argv[1])
    cfg = json.loads((Path(__file__).parent / 'sources.json').read_text(encoding='utf-8'))
    OUT.mkdir(parents=True, exist_ok=True)
    for f in OUT.glob('*.png'):
        f.unlink()
    items = []
    for item in cfg['items']:
        items.append(process(src_dir, item))
        print('ok', item['id'])
    manifest = {
        'credits': cfg['credits'],
        'categories': cfg['categories'],
        'types': cfg['types'],
        'items': items,
    }
    (OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
