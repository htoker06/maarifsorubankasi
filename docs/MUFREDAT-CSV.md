# Müfredat CSV Rehberi

Resmî öğretim programlarındaki temalar ve öğrenme çıktıları (kazanımlar) sisteme CSV dosyasıyla aktarılır.
Yükleme ekranı: **Yönetici paneli → Müfredat**.

Şablon: [`data/curriculum/mufredat_sablonu.csv`](../data/curriculum/mufredat_sablonu.csv). Aynı şablonu ekrandaki **Boş şablon** düğmesiyle de indirebilirsiniz.

## Sütunlar

| Sütun | Zorunlu | Açıklama | Örnek |
|---|---|---|---|
| `sinif` | ✔ | 1–12 arası sınıf düzeyi | `6` |
| `ders` | ✔ | Ders adı (aynı ders için her satırda aynı yazılmalı) | `Fen Bilimleri` |
| `program_yili` | | Öğretim programının yılı | `2024` |
| `tema_sira` | ✔ | Tema / ünite sıra numarası | `1` |
| `tema` | ✔ | Tema / ünite adı | `Güneş Sistemi ve Tutulmalar` |
| `kazanim_kodu` | ✔ | Öğretim programındaki öğrenme çıktısı kodu; aynı temada benzersiz olmalı | `FB.6.1.1` |
| `kazanim` | ✔ | Öğrenme çıktısının tam metni | `Güneş sistemindeki gezegenleri…` |
| `surec_bilesenleri` | | Süreç bileşenleri; tek hücrede `\|` ile ayrılır | `a) …\|b) …` |

- **Her satır bir öğrenme çıktısıdır.** Aynı temadaki satırlarda sınıf, ders, tema no ve tema adı tekrarlanır.
- Ekran, farklı yazılmış başlıkları da tanır: `Sınıf`, `Ders Adı`, `Ünite No`, `Ünite Adı`, `Öğrenme Çıktısı Kodu`, `Öğrenme Çıktısı` gibi.
- Ayraç olarak `;`, `,` ya da sekme kullanılabilir. Türkçe karakterlerin bozulmaması için dosya **UTF-8** olmalıdır.

## Hazır resmî müfredat dosyası

`data/curriculum/meb_tymm_tum_siniflar.csv` dosyası, MEB'in Türkiye Yüzyılı Maarif Modeli sitesinden (tymm.meb.gov.tr) **otomatik olarak çekilmiştir** (3 Ekim 2026): **153 ders, 808 tema/ünite, 7.369 öğrenme çıktısı**. 1–12. sınıfların öğretim programlarındaki tema/ünite adlarını, öğrenme çıktısı kodlarını ve metinlerini, süreç bileşenlerini içerir. Doğrudan Müfredat ekranından yüklenebilir. İçe aktarma ekranında hangi derslerin aktarılacağını seçebilirsiniz.

Aynı klasördeki `.json` dosyası her ünitenin ek bilgilerini de içerir: alan becerileri, kavramsal beceriler, eğilimler, sosyal-duygusal öğrenme becerileri, değerler, okuryazarlık becerileri, içerik çerçevesi, anahtar kavramlar ve ders saati. Bu bilgiler yapay zekanın soru üretirken kullanacağı bağlamdır (Adım 3).

**Güncelleme:** MEB programları güncellediğinde dosyayı yeniden üretmek için:

```bash
node scripts/fetch-meb-curriculum.mjs                # tüm sınıflar
node scripts/fetch-meb-curriculum.mjs --grades 5,6   # belirli sınıflar
node scripts/fetch-meb-curriculum.mjs --no-cache     # önbelleği yok sayıp yeniden indir
```

**Kaynaktaki düzensizlikler ve yapılan işlemler:**
- Sitede boşluklu yazılmış birkaç kod standart biçime çevrildi (`MAT. 1.3.3.` → `MAT.1.3.3`, `TT 7.9.1.` → `TT.7.9.1`).
- Aynı temada birebir tekrar eden satırlar (Almanca programında 4 adet) tek kayda indirildi.
- Sitede başka yazım hataları olduğu gibi korundu (ör. 4. sınıf Türkçe 1. temada `T.Y4.2`).
- Bazı derslerde süreç bileşeni yoktur (ör. Hayat Bilgisi, lise Türk Dili ve Edebiyatı); bu kaynaktaki durumdur.
- Sitede içeriği boş olan 1 ünite (7. sınıf İngilizce) dosyada yer almaz.

> **Demo Modu notu:** Tarayıcı depolama alanı sınırlı olduğu için tüm dosya demoda tek seferde aktarılamaz; birkaç ders seçin. Supabase bağlandığında bu sınır kalkar.

> Kodlar hakkında: Resmî programlarda **aynı öğrenme çıktısı kodu birden fazla temada geçebilir.** Örneğin Türkçe'de dinleme, okuma, konuşma ve yazma becerileri temalar boyunca tekrarlanır; İngilizce programlarında da aynı kodlar birden çok ünitede kullanılır. Sistem bu yüzden öğrenme çıktısını **tema + kod** ikilisiyle tanır.

## Resmî programdan elle CSV hazırlama

1. Türkiye Yüzyılı Maarif Modeli öğretim programlarını MEB'in resmî sitesinden indirin (tymm.meb.gov.tr). Her ders ve sınıf için ayrı bir PDF vardır.
2. Şablonu Excel'de ya da Google E-Tablolar'da açın.
3. Programdaki her tema için öğrenme çıktılarını kodlarıyla birlikte satırlara kopyalayın.
4. Kaydedin:
   - Excel: **Dosya → Farklı Kaydet → "CSV UTF-8 (virgülle ayrılmış)"**
   - Google E-Tablolar: **Dosya → İndir → Virgülle ayrılmış değerler (.csv)**
5. Yönetici paneli → Müfredat ekranında dosyayı yükleyin. Hatalar satır numarasıyla gösterilir; düzeltip yeniden yükleyin.

Bir dosyada birden çok ders ve sınıf bulunabilir. Tek tek dosyalar da yükleyebilirsiniz.

## İçe aktarma kuralları

- İçe aktarma **ekler ve günceller, hiçbir kaydı silmez.**
  - Kazanım kodu sistemde varsa metni ve süreç bileşenleri güncellenir.
  - Kod yoksa yeni kazanım eklenir.
- Ders kimliği sınıf ve ders adından üretilir (`6` + `Fen Bilimleri` → `g6-fen-bilimleri`). Tema kimliği bunun sonuna tema numarası eklenerek oluşur (`g6-fen-bilimleri-t1`). Bu yüzden ders adını her dosyada aynı yazın.
- `ÖRN.` ile başlayan kodlar örnektir; yüklenirse uyarı verilir.
- Tema içinde öğrenme çıktısının kimliği **tema + kod** ikilisidir. Aynı kod farklı temalarda ayrı kayıtlar olarak tutulur.
- **Mevcut müfredatı indir** düğmesi sistemdeki tüm müfredatı aynı biçimde verir. Bu dosyayı düzenleyip geri yükleyebilirsiniz.
