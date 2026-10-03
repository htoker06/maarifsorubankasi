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
| `kazanim_kodu` | ✔ | Öğretim programındaki öğrenme çıktısı kodu; tüm dosyada benzersiz olmalı | `FB.6.1.1.` |
| `kazanim` | ✔ | Öğrenme çıktısının tam metni | `Güneş sistemindeki gezegenleri…` |
| `surec_bilesenleri` | | Süreç bileşenleri; tek hücrede `\|` ile ayrılır | `a) …\|b) …` |

- **Her satır bir öğrenme çıktısıdır.** Aynı temadaki satırlarda sınıf, ders, tema no ve tema adı tekrarlanır.
- Ekran, farklı yazılmış başlıkları da tanır: `Sınıf`, `Ders Adı`, `Ünite No`, `Ünite Adı`, `Öğrenme Çıktısı Kodu`, `Öğrenme Çıktısı` gibi.
- Ayraç olarak `;`, `,` ya da sekme kullanılabilir. Türkçe karakterlerin bozulmaması için dosya **UTF-8** olmalıdır.

## Resmî programdan CSV hazırlama

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
- **Mevcut müfredatı indir** düğmesi sistemdeki tüm müfredatı aynı biçimde verir. Bu dosyayı düzenleyip geri yükleyebilirsiniz.
