# 3x4 Foto Studio

Hujjatlar uchun 3×4 sm rasm tayyorlovchi Windows dasturi.

- **Jins tanlash** — erkak yoki ayol; kiyimlar katalogi shunga mos ochiladi.
- **Orqa fonni avtomatik o'chirish** — sun'iy intellekt modeli (ISNet) kompyuterning o'zida ishlaydi.
- **Avtomatik 3×4 kadrlash** — yuz aniqlanadi, bosh to'g'rilanadi va standart nisbatda joylanadi.
- **Kiyim kiydirish** — Bo'lim → Tur → Variant → Rang:
  - erkaklar: kostyum va galstuk (11 variant), galstuksiz kostyum, smoking, ko'ylak va galstuk, ko'ylak;
  - ayollar: jaket va oq ko'ylak, ko'ylak;
  - jaket uchun 10 ta, ko'ylak uchun 7 ta rang (galstuk o'z rangida qoladi);
  - kiyim tanlanganda asl kiyim va yelkalar olib tashlanadi, bosh, bo'yin va soch saqlanadi;
  - kiyim yuzga qarab avtomatik joylanadi, kerak bo'lsa kattalik/joylashuvni qo'lda moslash yoki rasm ustida
    sichqoncha bilan surish mumkin;
  - o'z kiyimingizni (shaffof PNG) qo'shish imkoni.
- **Fon rangi** — oq, kulrang, havorang, ko'k, qizil yoki istalgan rang.
- **Yuqori sifatda yuklab olish** — 600 DPI:
  - 1 dona (709×945 px, 3×4 sm)
  - 4 yoki 6 dona — 10×15 sm foto qog'ozga yoki A4 ga avtomatik joylanadi, printerda darhol chiqarish mumkin.
- **Maxfiylik** — dastur to'liq oflayn ishlaydi, hech qanday tarmoq so'rovi yubormaydi (internet so'rovlari dastur ichida bloklangan). Rasmlar faqat siz tanlagan papkaga saqlanadi.

## Yuklab olish

[Releases](https://github.com/ogabek-karimov/3x4photo/releases) bo'limida ikki xil fayl bor:

| Fayl | Tavsif |
| --- | --- |
| `3x4-Foto-Studio-Setup-x.y.z.exe` | O'rnatuvchi (ish stoli va Start menyusiga yorliq yaratadi) |
| `3x4-Foto-Studio-Portable-x.y.z.exe` | Portable — o'rnatmasdan, fleshkadan ham ishlaydi |

## Dasturchilar uchun

```bash
npm install          # paketlar + modellarni app/ ichiga yig'ish (prepare)
npm start            # dasturni ishga tushirish
npm run dist         # Windows: installer + portable exe (release/ papkasida)
```

Windows exe fayllari GitHub Actions orqali yig'iladi: `v1.0.0` kabi teg push qilinganda
yoki **Actions → Windows build → Run workflow** orqali.

### Kiyim shablonlari

Dastur bilan keladigan kiyimlar `app/clothes/` papkasida. Ular `scripts/clothes/process.py` skripti bilan
`scripts/clothes/sources.json` dagi manba rasmlardan tayyorlanadi:

```bash
pip install numpy pillow scipy
python3 scripts/clothes/process.py <manba rasmlar papkasi>
```

Skript har bir shablon uchun quyidagilarni bajaradi:
- shaffof chetlarni kesadi va kichraytiradi;
- yoqa markazi va bo'yin ochig'i kengligini aniqlaydi (yuzga moslab joylash uchun);
- rang almashtirish uchun jaket yoki ko'ylak niqobini yaratadi, galstukni chiqarib tashlaydi;
- yoqaning ichki qatlamini yaratadi;
- `app/clothes/manifest.json` ni yozadi.

Shablonga xos masshtab tuzatishi `sources.json` da `"fit": { "scale": 0.8 }` ko'rinishida beriladi.

### Litsenziyalar

Kiyim rasmlari [pngimg.com](https://pngimg.com) saytidan olingan va
[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) litsenziyasi ostida tarqatiladi
(faqat notijorat maqsadda, manba ko'rsatilgan holda). Har bir rasmning manbasi `sources.json` da.
Orqa fonni o'chirish: [@imgly/background-removal](https://github.com/imgly/background-removal-js),
yuzni aniqlash: [@vladmandic/face-api](https://github.com/vladmandic/face-api) (MIT).

---

© Ishlab chiqaruvchi: **Karimov Og'abek**
