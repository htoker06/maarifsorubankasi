# Hesap Makinesi (gizli sohbet)

Hesap makinesi gibi görünen, gizli bir kodla açılan kişisel sohbet uygulaması (PWA).
Bu klasör, ana depodan (soru bankası) bağımsız, kendi başına çalışan statik bir uygulamadır.

## Şu an ne var (1. adım)

- ✅ Gerçekten çalışan hesap makinesi (toplama/çıkarma/çarpma/bölme, %, parantez)
- ✅ Gizli açılış: ekrana belirli bir ifadeyi yazıp **=** tuşuna basınca sohbet açılır
- ✅ Sohbet ekranı + mesaj yazma
- ✅ Mesajlar yalnızca bu cihazda, **açılış kodundan türetilen anahtarla AES-GCM** ile şifreli saklanır
- ✅ Uygulamadan çıkınca / arka plana atınca **otomatik kilit** → hesap makinesine döner, kod tekrar istenir
- ✅ **Görünür bildirim yok** → telefonun bildirim geçmişinde iz oluşmaz
- ✅ Ayarlardan açılış kodu ve kişi adı değiştirilebilir (ayarlar yalnızca sohbet açıkken erişilebilir)

### Varsayılan açılış kodu

```
1+3+5
```

Yani hesap makinesine `1 + 3 + 5` yazıp `=` basınca sohbet açılır (9 sonucu yerine).
Kodu ilk fırsatta Ayarlar'dan (sohbet açıkken ⚙) değiştirin.

## Henüz yok (sonraki adımlar)

- ⏳ Gerçek, iki kişilik, **uçtan uca şifreli** gönderim (Firebase/Firestore + Web Push)
- ⏳ Mesaj gelince uygulama içi sembolik uyarı (ikonda rozet / köşede işaret), görünür bildirim olmadan
- ⏳ Kendini silen mesajlar (opsiyonel)

## Yerelde deneme

Statik sunucu yeterli:

```bash
cd hesap-pwa
python3 -m http.server 8080
# tarayıcıda: http://localhost:8080
```

> PWA kurulumu (ana ekrana ekleme) ve service worker yalnızca **HTTPS** veya `localhost` üzerinde çalışır.

## Telefona kurma (PWA)

- **Android / Chrome:** siteyi aç → menü → "Ana ekrana ekle". Ayrı bir "Hesap Makinesi" uygulaması gibi kurulur.
- **iPhone / Safari (iOS 16.4+):** paylaş → "Ana Ekrana Ekle".

## Gizlilik notları (dürüst sınırlar)

- Uygulama **görünür bildirim göndermez**; bu yüzden telefonun bildirim geçmişinde kayıt oluşmaz.
- Kullanım süresi (Dijital Denge / Ekran Süresi) telefonun işletim sistemi tarafından ölçülür;
  bunu hiçbir uygulama gizleyemez veya değiştiremez. Bu, cihaz ayarlarından yönetilecek bir konudur.
- Mesajlar cihazda düz metin değil, şifreli durur; anahtar yalnızca doğru kod girilince ve yalnızca
  sohbet açıkken bellekte oluşur.
