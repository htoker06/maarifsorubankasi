# Dip Kırılım ve Formasyon Tarayıcısı (Kripto Sinyal Motoru)

Uzun süre dipte akümüle olmuş, formasyonunu tamamlamış ve **hacimli, gövdeli bir mumla kırılım yapan**
coinleri bulan; sahte hacim, stop avı, kaldıraçlı tuzak ve spoofing gibi manipülasyonları eleyen
asenkron bir tarama motoru.

> ⚠️ **"Sıfır hata" mümkün değil.** Bu motor yanlış sinyal sayısını azaltmak için çok sıkı kurulmuştur, ama
> hiçbir filtre piyasanın geleceğini garanti edemez. Eşikleri gerçek parayla kullanmadan önce
> `backtest` komutuyla kendi coin listende doğrula. Yatırım tavsiyesi değildir.

---

## 1. İki promptun analizi: neler birleştirildi?

İki prompt büyük ölçüde aynı sistemi tarif ediyor. Tekrar eden ve çelişen maddeler tek bir kurala indirildi:

| Konu | Prompt 1 | Prompt 2 | Motorda |
|---|---|---|---|
| Makro filtre | BTC.D, USDT.D, BTC MA50/200, TOTAL/TOTAL3 | BTC.D, USDT.D, TOTAL2/3, Risk-Off'ta **Hard Stop** | Tek **Makro Rejim Motoru**: 0-100 skor + kilit |
| Akümülasyon | BB genişliği tarihsel en dar %15, 30-90 gün | BB Squeeze 3-6 ay + ATH'den ≥%70 düşüş | BBW yüzdeliği ≤ %15 + taban süresi ≥ 30 gün + ATH düşüşü ≥ %70 |
| Kırılım | Düşen tepe çizgisi / Supertrend / Donchian | TOBO, ikili/üçlü dip, çanak, kama, flama, MSS | Hepsi tek **Formasyon Motoru**'nda; Donchian en düşük öncelik |
| MA200 | Son 1-5 günde altından üstüne geçiş | Üstünde en az 1 kapanış | Kesişim ≤ 5 gün **ve** kapanış MA200 üstünde |
| RSI | 50-68 | 50-65 | **Çelişki** — bkz. aşağı |
| MACD | Skorda momentum | Sıfır hattını yukarı kesmeli | Son 10 günde sıfır kesişimi (şart) + skorda tazelik |
| Hacim | 20-30 gün ort. ≥ 2.5x, VWAP üstü | POC'yi 30G ort. 3-4x hacimle geçmeli | Kırılım mumu ≥ 2.5x (şart), VWAP ve POC üstü (şart), 3x POC geçişi (skor) |
| Fonlama | > %0.05 ise ele, OI artışı kontrol | Fonlama aşırıysa iptal, spot CVD teyidi | Tek **Türev Tuzağı** kontrolü + spot CVD/taker alış oranı |
| Emir defteri | %2 derinlik, slippage | Spoofing / asimetri | Tek emir defteri analizi: derinlik, spread, kayma, duvar kalıcılığı, asimetri |
| Puanlama | 5 bileşen (30/25/20/15/10) | Kesinlik skoru ≥ 85, eş zamanlı şartlar | **Önce tüm şartlar (veto), sonra 5 bileşenli skor ≥ 85** |

### Çözülen çelişkiler ve gerçekçi olmayan noktalar

1. **RSI 50-65 ile "2.5x hacimli, %75 gövdeli kırılım mumu" çoğu zaman çelişiyor.** Testlerde böyle bir mum, kırılım
   gününde RSI'ı genellikle 66-71'e itiyor. Çözüm: kırılım **günü** Prompt 1'in 68 sınırı, sonraki günlerde Prompt 2'nin
   65 sınırı geçerli; ayrıca kırılımdan önceki gün RSI ≤ 65 olmalı (`setup.rsi_breakout_day_max`).
2. **BTC.D / USDT.D / TOTAL3 geçmişi ücretsiz API'lerde yok.** Motor bunları, borsadaki en büyük 20 coinin günlük kapanışları ve
   CoinGecko piyasa değerleriyle **vekil endeks** olarak kuruyor. EMA eğimlerinin yönü doğru, mutlak değerler TradingView ile
   birebir aynı değil. CoinGecko erişilemezse hacim ağırlığına düşer.
3. **"Yükselen Kama" bir yükseliş formasyonu değil, ayı formasyonu.** Motor onu alım nedeni saymıyor; aşağı kırılmışsa sinyali **veto ediyor**.
4. **ATH, borsadaki işlem geçmişiyle sınırlı.** Binance'te listelenmeden önceki ATH görülmez (varsayılan 1000 gün geçmiş çekilir).
5. **Emir defteri, işlem kaydı ve fonlama oranının geçmişi yok.** Bu yüzden geriye dönük testte bu üç kontrol çalışmaz; mum tabanlı
   sahte hacim ve CVD kontrolleri çalışır.
6. **Kesinlik skoru ≥ 85 çok seçici.** Sentetik "ideal" kurulumlarda bile skor 80-87 arasında çıkıyor. Bu bilerek böyle bırakıldı;
   gerekirse `scoring.min_score` ile ayarlanır.

---

## 2. Mimari

```
breakout_engine/
  config.py        Tüm eşikler (JSON ile ezilebilir)
  models.py        Veri modelleri (Signal, Gate, PatternMatch, TradePlan, ...)
  exchange.py      CCXT async istemcisi (semafor, üstel geri çekilme), CoinGecko istemcisi (aiohttp)
  indicators.py    SMA/EMA/RSI/MACD/BB/ATR/OBV/CMF/VWAP (pandas; TA-Lib varsa otomatik kullanılır)
  macro.py         Piyasa rejimi + vekil BTC.D/USDT.D/TOTAL3 endeksleri + Hard Stop
  patterns.py      Pivot tabanlı formasyon motoru: TOBO, ikili/üçlü dip, çanak, düşen/yükselen kama,
                   flama/simetrik üçgen, düşen trend çizgisi, MSS (ChoCh), Donchian
  manipulation.py  Anti-Manipülasyon Kalkanı
  smart_money.py   OBV/CMF pozitif uyumsuzluğu, hacim profili (POC, değer alanı, HVN dirençleri)
  analyzer.py      Kesişim şartları + Kesinlik Skoru (tek sembol, ağ erişimi yok, deterministik)
  risk.py          Alım bölgesi, kademeli giriş, stop, R:R hedefleri
  scanner.py       İki aşamalı asenkron tarama orkestratörü
  report.py        Terminal tablosu (rich), JSON ve Telegram mesaj formatı
  notifier.py      Telegram bildirimi (aynı coin için 24 saat bekleme)
  backtest.py      Walk-forward geriye dönük test (canlıyla aynı analiz fonksiyonu)
  __main__.py      CLI
```

### Akış

1. **Makro kilit:** BTC'nin MA50/200 konumu + vekil USDT.D, TOTAL3, BTC.D EMA20/50 eğimleri → 0-100 skor.
   Kilit açılmazsa (skor < 40, **veya** BTC < SMA200 iken USDT.D yükseliyorsa, **veya** piyasa 24 saatte ≥ %8 düştüyse)
   **hiçbir sinyal üretilmez**.
2. **Aşama 1 (ucuz):** 24s hacmi ≥ 5M USD olan tüm spot USDT pariteleri için sadece günlük mumlar çekilir.
   Formasyon kırılımı, MA200, hacim ve mum anatomisi şartlarını geçemeyen elenir.
3. **Aşama 2 (pahalı):** Kalan adaylar için 3 emir defteri görüntüsü (2 sn arayla), son 1000 işlem ve vadeli verileri
   (fonlama, 7 günlük OI) çekilir; tam analiz yapılır.

### Kesişim şartları (hepsi geçmeli)

| # | Şart | Varsayılan |
|---|---|---|
| 1 | Makro kilit kapalı | — |
| 2 | 24s spot hacim | ≥ 5.000.000 USD |
| 3 | Emir defteri | ±%2 her iki tarafta ≥ 50k USD, spread ≤ %0.2, 10k USD alımda kayma ≤ %0.5 |
| 4 | Formasyon kırılımı | son 3 gün içinde, tutunmuş (o günden beri tüm kapanışlar seviyenin üstünde) |
| 5 | Ayı formasyonu yok | aşağı kırılmış yükselen kama yok |
| 6 | Konsolidasyon | ≥ 30 gün, bant ≤ %60 |
| 7 | Bollinger sıkışması | son 90 günde BBW yüzdeliği ≤ %15 |
| 8 | ATH'den düşüş | taban dibi ATH'nin ≥ %70 altında |
| 9 | MA200 kırılımı | SMA200 veya EMA200 son 5 günde yukarı kesilmiş, kapanış üstünde |
| 10 | Aşırı uzaklaşmamış | MA200'den en fazla %25 yukarıda |
| 11 | RSI | 50-65 (kırılım günü 68) |
| 12 | MACD | son 10 günde sıfır hattını yukarı kesmiş |
| 13 | Hacim anomalisi | kırılım mumu ≥ 2.5x (önceki 20 gün ort.) |
| 14 | VWAP ve POC | fiyat 20G VWAP'ın ve 180G hacim profili POC'sinin üstünde |
| 15 | Mum anatomisi | gövde ≥ %75, üst fitil ≤ %15, kapanış mumun üst %20'sinde, yeşil mum |
| 16 | Sahte hacim | risk ≤ %45 |
| 17 | Türev tuzağı yok | fonlama ≤ %0.05; OI > %25 artarken fonlama ısınmıyor |
| 18 | Spoofing yok | — |
| 19 | Birleşik tuzak riski | ≤ %40 |
| 20 | Risk/Ödül | stop mesafesi ≤ %15, en az bir hedef ≥ 2R |
| 21 | Kesinlik skoru | ≥ 85 |

Eksik veri (örn. emir defteri alınamadı) varsayılan olarak **ret** sebebidir (`manipulation.strict_missing_data`).

### Anti-Manipülasyon Kalkanı

- **Sahte hacim:** Binance mumlarındaki *işlem sayısı* ile hacim karşılaştırılır. Hacim 2.5x olurken işlem sayısı 1.5x artmıyorsa ya da
  ortalama işlem büyüklüğü medyanın 3 katını aşıyorsa hacim birkaç dev işlemden geliyordur. Son 1000 işlemde Herfindahl
  yoğunlaşması, en büyük %1 işlemin payı, tek bir miktarın tekrarı ve aynı miktarla art arda al-sat (**ping-pong**) ölçülür.
- **Mum anatomisi / stop avı:** uzun üst fitil → ret. Kırılımdan önceki 20 günde önceki dibin altına iğne atıp toparlanma
  (**liquidity sweep**) → pozitif teyit (tuzak riskini düşürür).
- **Kaldıraçlı tuzak:** fonlama > %0.05 → ret. Yükselişin spot alıcılardan geldiği taker alış oranı (≥ %52) ve
  **spot CVD** ile doğrulanır.
- **Spoofing:** kırılımın hemen üstündeki %2'lik bantta, çevresindeki medyan seviyenin 8 katı büyüklükte bir satış duvarı
  ve alış/satış derinlik oranı < 0.4 ise → ret. Duvar sonraki görüntülerde %70'ten fazla kaybolursa (belirip kaybolan duvar) → ret.
  Kaybolan **alış** duvarları (yalancı destek) da işaretlenir.

### Kesinlik Skoru (0-100)

| Bileşen | Ağırlık | İçerik |
|---|---|---|
| Hacim + akıllı para | %30 | hacim çarpanı, 3x hacimle POC geçişi, OBV/CMF pozitif uyumsuzluğu, spot alıcı baskısı |
| Akümülasyon + formasyon | %25 | BB sıkışma derinliği, taban süresi, ATH düşüşü, formasyon kalitesi (birden çok formasyon bonus) |
| MA200 | %20 | kesişim tazeliği + MA200'e yakınlık (≤ %8 ideal) |
| Momentum | %15 | RSI'ın bant ortasına yakınlığı, MACD sıfır kesişiminin tazeliği, histogram yönü |
| Makro | %10 | makro rejim skoru |

`Nihai skor = Taban × (1 − 0.5 × max(0, Tuzak Riski − 0.15))`

### İşlem planı

- **Alım bölgesi:** kırılım seviyesi − 0.25 ATR ile son kapanış arası.
- **Kademeli giriş:** %30 son kapanış, %40 kırılım seviyesinin yeniden testi, %30 derin test.
- **Stop:** kırılım mumunun dibi ile formasyonun geçersizlik seviyesinden (TOBO'da sağ omuz, ikili dipte dip) en yakını − 0.25 ATR.
- **Hedefler:** 1.5R, 3R, ölçülen hareket (formasyon yüksekliği) ve hacim profilindeki ilk yüksek hacim düğümü (HVN).

---

## 3. Kurulum ve kullanım

```bash
cd kripto-sinyal-motoru
pip install -r requirements.txt          # TA-Lib opsiyonel: pip install TA-Lib

python -m breakout_engine scan                              # tek tarama
python -m breakout_engine scan --show-rejected 10           # reddedilen adayları gerekçesiyle göster
python -m breakout_engine scan --symbols SOL/USDT,INJ/USDT --json sonuc.json
python -m breakout_engine watch --interval 60 --notify      # saatte bir tara, Telegram'a gönder
python -m breakout_engine backtest --symbol SOL/USDT --days 1000
python -m breakout_engine config > ayarlar.json             # ayarları dışa aktar, düzenle
python -m breakout_engine --config ayarlar.json scan
```

Ortam değişkenleri:

| Değişken | Açıklama |
|---|---|
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Telegram bildirimi için |
| `COINGECKO_API_KEY` | Opsiyonel (CoinGecko demo anahtarı, limitleri artırır) |

Sinyaller günlük **kapanmış** mumlarla üretilir; açık mum hiç kullanılmaz (repaint yok). En anlamlı tarama zamanı
günlük kapanışın hemen sonrasıdır (00:05 UTC). Başka borsa için `exchange.exchange_id` değiştirilebilir (`bybit`, `okx`);
Binance dışındaki borsalarda mum başına işlem sayısı ve taker alış verisi olmadığından bazı kontroller sadece işlem kaydıyla çalışır.

### Testler

```bash
pip install pytest
python -m pytest -q
```

Testler ağ erişimi gerektirmez; sentetik verilerle formasyonları, manipülasyon filtrelerini, makro kilidi, uçtan uca
taramayı (sahte borsa ile) ve geriye dönük testin canlı analizle aynı sonucu verdiğini doğrular.
