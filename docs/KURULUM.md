# SoruBankasıMatik: Kurulum Rehberi (GitHub + Supabase + Vercel)

Bu rehber üç servisi birbirine bağlamak içindir. Hesap açma ve ayar işlemlerini sizin yapmanız gerekir; kodları ben yazıp GitHub'a göndereceğim.

**Sıra önemli:** GitHub → Supabase → Claude API anahtarı → Vercel.

---

## 1. GitHub (kodun saklandığı yer)

Depo zaten hazır: **`htoker06/maarifsorubankasi`**.

- Ben her adımın kodunu `claude/...` adlı bir dalda (branch) hazırlayıp gönderiyorum.
- Siz inceleyip onayladıktan sonra bir Pull Request ile ana dala (`main`) birleştiririz.
- Vercel, `main` dalını canlı site olarak yayınlar. Diğer dallar için ayrı bir **önizleme adresi** üretir; böylece değişiklikleri canlıya almadan deneyebilirsiniz.

Yapmanız gereken bir şey yok. Yalnızca deponun **gizli (private)** olduğundan emin olun: GitHub → depo → *Settings* → *General* → en altta *Danger Zone* → *Change visibility*.

> ⚠️ Hiçbir anahtarı (API key, şifre) GitHub'a yüklemeyin. Anahtarlar yalnızca Vercel ve Supabase panellerine girilir. Projede `.env` dosyaları `.gitignore` ile dışarıda tutulacak.

---

## 2. Supabase (veritabanı ve giriş sistemi)

### 2.1 Proje oluşturma
1. <https://supabase.com> → **Start your project** → GitHub hesabınızla giriş yapın.
2. **New project**:
   - *Name:* `sorubankasimatik`
   - *Database Password:* güçlü bir şifre üretin ve **bir yere kaydedin** (sonradan gerekebilir).
   - *Region:* **Central EU (Frankfurt)**. Türkiye'ye en yakın bölge olduğu için hızlıdır.
3. Projenin hazırlanmasını bekleyin (1–2 dakika).

### 2.2 Anahtarları not etme
**Project Settings → API** (yeni panelde *API Keys*) bölümünden şu üç değeri bir kenara not edin:

| Panelde görünen ad | Bizim kullanacağımız ad | Gizli mi? |
|---|---|---|
| Project URL | `VITE_SUPABASE_URL` | Hayır |
| `anon` `public` key (ya da *Publishable key*) | `VITE_SUPABASE_ANON_KEY` | Hayır (RLS ile korunur) |
| `service_role` key (ya da *Secret key*) | `SUPABASE_SERVICE_ROLE_KEY` | **EVET, kimseyle paylaşmayın** |

### 2.3 Giriş (Auth) ayarları
**Authentication → Providers → Email**: açık olsun.
- Geliştirme sırasında *Confirm email* kapatılabilir (kayıt sonrası e-posta onayı beklenmez). Canlıya geçmeden önce yeniden açılmalıdır.
- İsteğe bağlı: Google ile giriş (**Authentication → Providers → Google**). Bunu sonra birlikte ayarlarız.

**Authentication → URL Configuration**:
- *Site URL:* Vercel adresiniz (4. adımdan sonra gelecek, örn. `https://sorubankasimatik.vercel.app`)
- *Redirect URLs:* aynı adres ve geliştirme için `http://localhost:5173`

### 2.4 Veritabanı tablolarının oluşturulması (tek seferlik)
1. GitHub'da depodaki **`supabase/migrations/20261004000001_init.sql`** dosyasını açın → sağ üstteki **Copy raw file** (kopyala) düğmesine basın.
2. Supabase paneli → sol menü **SQL Editor** → **New query** → kopyaladığınız metni yapıştırın → **Run**.
3. Alt kısımda **Success. No rows returned** görmelisiniz. Sol menüdeki **Table Editor**'de `profiles`, `questions`, `exams` vb. tablolar görünür.

> Bu dosya tabloları, güvenlik kurallarını (RLS) ve sunucu fonksiyonlarını tek seferde kurar. **İkinci kez çalıştırmayın**; "already exists" hatası verir. Sonraki güncellemeler yeni numaralı dosyalar olarak gelecek.

### 2.5 İlk yönetici hesabı
1. Vercel'de yayına aldığınız sitede kendi e-posta adresinizle **Öğrenci kaydı** yapın.
2. Supabase → **SQL Editor** → depodaki **`supabase/ilk-yonetici.sql`** içeriğini yapıştırın, içindeki e-posta adresini kendi adresinizle değiştirin → **Run**.
3. Siteden çıkış yapıp yeniden girin: **Yönetici paneli** açılır.

### 2.6 Resmî müfredatı yükleme
Yönetici paneli → **Müfredat** → **Resmî müfredatı yükle** → dersler seçili gelir → **İçe aktar**. 7.369 öğrenme çıktısının aktarılması yaklaşık bir dakika sürer.

## 3. Claude API anahtarı (yapay zeka)

1. <https://console.anthropic.com> → hesap açın.
2. **Billing** → kredi yükleyin. Başlangıç için küçük bir miktar yeterlidir; harcamayı panelden izleyebilirsiniz.
3. **API Keys → Create Key** → adı `sorubankasimatik-vercel` → anahtarı kopyalayın. Anahtar yalnızca bir kez gösterilir.
4. Önerilen: **Limits** bölümünden aylık harcama üst sınırı koyun.

Bu anahtar `ANTHROPIC_API_KEY` adıyla **yalnızca Vercel'e** girilecek.

---

## 4. Vercel (web sitesine dönüştürme)

### 4.1 Projeyi bağlama
1. <https://vercel.com> → **Sign Up** → **Continue with GitHub**.
2. **Add New… → Project** → `maarifsorubankasi` deposunu seçin → **Import**.
   Depo listede görünmüyorsa: *Adjust GitHub App Permissions* → depoya erişim izni verin.
3. Ayarlar:
   - *Framework Preset:* **Vite** (otomatik algılanır)
   - *Build Command:* `npm run build`
   - *Output Directory:* `dist`

> Uygulama ortam değişkenleri olmadan da **Demo Modu**'nda çalışır; yani Vercel'e bağlar bağlamaz siteyi görebilirsiniz. Vercel `main` dalını canlı adreste, diğer dalları (ör. `claude/...`) ayrı önizleme adreslerinde yayınlar.

### 4.2 Ortam değişkenleri
**Project → Settings → Environment Variables** bölümüne ekleyin. *Production*, *Preview* ve *Development* kutularının üçü de işaretli olsun.

| Ad | Değer |
|---|---|
| `VITE_SUPABASE_URL` | Supabase Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role / secret key |
| `ANTHROPIC_API_KEY` | Claude API anahtarı |
| `AI_MODEL` | `claude-opus-5-5` |
| `AI_DAILY_LIMIT` | `100` (öğretmen başına günlük soru üretim sınırı) |
| `AI_EFFORT` | `high` (isteğe bağlı; `medium` daha hızlı ve ucuz, `high` daha özenli) |

Değişken ekledikten ya da değiştirdikten sonra **Deployments → son yayın → ⋯ → Redeploy** yapın. Değişkenler yeni yayınla birlikte etkinleşir.

### 4.3 Adres
- Varsayılan adres: `https://<proje-adı>.vercel.app`
- Kendi alan adınız varsa: **Settings → Domains** → alan adını ekleyip DNS kayıtlarını Vercel'in gösterdiği gibi ayarlayın.
- Adres belli olunca Supabase'deki **Site URL** ve **Redirect URLs** değerlerini güncelleyin (2.3).

---

## 5. Kendi bilgisayarınızda çalıştırmak (isteğe bağlı)

Gerekenler: [Node.js](https://nodejs.org) (LTS sürümü) ve Git.

```bash
git clone https://github.com/htoker06/maarifsorubankasi.git
cd maarifsorubankasi
npm install
cp .env.example .env.local     # içine kendi anahtarlarınızı yazın
npm run dev                    # http://localhost:5173
```

`npm run dev` yapay zeka fonksiyonunu (`/api/generate-questions`) çalıştırmaz; onu da yerelde denemek için: `npm i -g vercel` → `vercel link` → `vercel dev`.

Testler: `npm test` (birim testleri), `npm run test:db` (yerel PostgreSQL ile veritabanı kuralları).

---

## 6. Kontrol listesi

- [ ] GitHub deposu gizli (private)
- [ ] Supabase projesi Frankfurt bölgesinde oluşturuldu, veritabanı şifresi kaydedildi
- [ ] Supabase URL, anon key ve service_role key not edildi
- [ ] Claude API anahtarı oluşturuldu, harcama sınırı konuldu
- [ ] Vercel projesi GitHub deposuna bağlandı
- [ ] Altı ortam değişkeni Vercel'e girildi
- [ ] (Adım 2'den sonra) İlk yayın başarılı, Supabase Site URL güncellendi
- [ ] `20261004000001_init.sql` Supabase SQL Editor'de çalıştırıldı
- [ ] İlk yönetici hesabı atandı (`supabase/ilk-yonetici.sql`)
- [ ] Resmî müfredat yönetici panelinden yüklendi
- [ ] Bir öğretmen hesabı açılıp onaylandı ve AI ile deneme sorusu üretildi

## Güvenlik özeti

| ✅ Yapın | ❌ Yapmayın |
|---|---|
| Gizli anahtarları yalnızca Vercel'e girin | Anahtarları koda, GitHub'a, sohbete ya da e-postaya yazmayın |
| Supabase'de her tabloda RLS'i açık tutun | `service_role` anahtarını tarayıcı kodunda kullanmayın |
| Claude API için harcama sınırı koyun | Adı `VITE_` ile başlayan bir değişkene gizli anahtar koymayın |
| Bir anahtar sızarsa hemen panelden iptal edip yenisini üretin | |
