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

### 2.4 Veritabanı tablolarının oluşturulması
Tabloları **elle oluşturmayın.** Adım 3'te `supabase/migrations/` klasöründeki SQL dosyalarını hazırlayacağım. İki yolla uygulanabilir:

- **Kolay yol:** Supabase paneli → **SQL Editor** → dosyanın içeriğini yapıştır → *Run*. Dosyalar numara sırasıyla çalıştırılır.
- **Otomatik yol (önerilen):** Supabase paneli → **Project Settings → Integrations → GitHub** ile depoyu bağlayın. `main` dalına yeni bir migration dosyası geldiğinde Supabase onu otomatik uygular. Bu özelliğin hangi planlarda sunulduğu değişebilir; panelde görünmüyorsa kolay yolu kullanın.

---

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

> İlk yayın Adım 2'deki kod `main` dalına geldikten sonra başarılı olur. Şu an depoda yalnızca belgeler olduğu için Vercel'in hata vermesi normaldir.

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

`/api` fonksiyonlarını da yerelde denemek için: `npm i -g vercel` → `vercel link` → `vercel dev`.

---

## 6. Kontrol listesi

- [ ] GitHub deposu gizli (private)
- [ ] Supabase projesi Frankfurt bölgesinde oluşturuldu, veritabanı şifresi kaydedildi
- [ ] Supabase URL, anon key ve service_role key not edildi
- [ ] Claude API anahtarı oluşturuldu, harcama sınırı konuldu
- [ ] Vercel projesi GitHub deposuna bağlandı
- [ ] Altı ortam değişkeni Vercel'e girildi
- [ ] (Adım 2'den sonra) İlk yayın başarılı, Supabase Site URL güncellendi
- [ ] (Adım 3'ten sonra) Migration dosyaları Supabase'e uygulandı

## Güvenlik özeti

| ✅ Yapın | ❌ Yapmayın |
|---|---|
| Gizli anahtarları yalnızca Vercel'e girin | Anahtarları koda, GitHub'a, sohbete ya da e-postaya yazmayın |
| Supabase'de her tabloda RLS'i açık tutun | `service_role` anahtarını tarayıcı kodunda kullanmayın |
| Claude API için harcama sınırı koyun | Adı `VITE_` ile başlayan bir değişkene gizli anahtar koymayın |
| Bir anahtar sızarsa hemen panelden iptal edip yenisini üretin | |
