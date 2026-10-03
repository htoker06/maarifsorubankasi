# SoruBankasıMatik

Türkiye Yüzyılı Maarif Modeli'ne uygun, yapay zeka destekli soru bankası, yazılı oluşturucu ve online test platformu.

**Altyapı:** GitHub (kod) · Supabase (veritabanı, giriş) · Vercel (yayın)

## Durum

| Adım | Kapsam | Durum |
|---|---|---|
| 1 | Mimari ve veritabanı tasarımı ([docs/MIMARI.md](docs/MIMARI.md)) | ✅ |
| 2 | Arayüz: paneller, soru havuzu, yazılı oluşturucu, kullanılmış soru uyarısı, PDF/Word | ✅ (Demo Modu) |
| 3 | Supabase (veritabanı + giriş) ve yapay zeka ile soru üretimi | ⏳ |
| 4 | Online test, kazanım analizi, hatalı soru bildirimi | ⏳ |

Uygulama şu an **Demo Modu**'nda çalışır: örnek veriler tarayıcıda saklanır, hesap gerekmez.
Örnek müfredattaki kazanım kodları (`ÖRN.` ile başlar) resmî kodlar değildir.

## Çalıştırma

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # birim testleri
npm run build    # dist/ klasörüne üretim derlemesi
```

Kurulum (GitHub, Supabase, Claude API, Vercel): [docs/KURULUM.md](docs/KURULUM.md)

## Klasörler

```
src/
  core/        yönlendirme ve oturum
  services/    veri erişim katmanı (Demo deposu; Adım 3'te Supabase)
  data/        sabitler ve demo verisi
  features/    ekranlar (bank, exam-builder, export, generator, ...)
  ui/          modal, bildirim ve ortak bileşenler
tests/         Vitest birim testleri
docs/          mimari ve kurulum belgeleri
```
