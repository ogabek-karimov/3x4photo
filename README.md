# 3x4 Foto Studio

Hujjatlar uchun 3×4 sm rasm tayyorlovchi Windows dasturi.

- **Jins tanlash** — erkak yoki ayol; kiyimlar katalogi shunga mos ochiladi.
- **Orqa fonni avtomatik o'chirish** — sun'iy intellekt modeli (ISNet) kompyuterning o'zida ishlaydi.
- **Avtomatik 3×4 kadrlash** — yuz aniqlanadi, bosh to'g'rilanadi va standart nisbatda joylanadi.
- **Kiyim almashtirish** — rasmiy / yarim rasmiy / kundalik bo'limlar, o'z PNG kiyimingizni qo'shish imkoni.
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

Dastur bilan keladigan kiyimlar `app/clothes/` papkasida, ro'yxati `app/clothes/manifest.json` da:

```json
{
  "id": "erkak-qora-kostyum",
  "gender": "erkak",
  "category": "rasmiy",
  "name": "Qora kostyum, galstuk",
  "file": "erkak/qora-kostyum.png"
}
```

Har bir kiyim — shaffof fonli PNG (oldidan ko'rinish, bo'yin qismi ochiq). Yoqa nuqtasi va
yelka kengligi avtomatik aniqlanadi; kerak bo'lsa `"anchor": {"x":..,"y":..}` va `"shoulder": ..`
(piksellarda) qo'lda ko'rsatish mumkin.

---

© Ishlab chiqaruvchi: **Karimov Og'abek**
