# Firebase kurulumu (iki kişilik, uçtan uca şifreli mesajlaşma)

Bu adımları bir kez yaparsınız; ~5–10 dakika sürer. Ücretsiz (Spark) plan yeter.

Mantık: Sunucu (Firebase) yalnızca **şifreli** metni saklar. Şifre anahtarı iki
cihazda üretilir, birbirinizin açık anahtarıyla ortak bir anahtar türetilir. Yani
Firebase'e erişen biri bile mesajları okuyamaz.

---

## 1. Firebase projesi oluştur
1. https://console.firebase.google.com → **Add project** (Proje ekle).
2. İsim verin (örn. `hesap`). Google Analytics'i kapatabilirsiniz.

## 2. Web uygulaması ekle
1. Proje ana sayfasında **</>** (Web) simgesine tıklayın.
2. Bir takma ad verin, **Register app**.
3. Ekranda çıkan `firebaseConfig` değerlerini kopyalayın (apiKey, projectId, appId…).

## 3. Anonymous Auth'u aç
1. Sol menü **Build → Authentication → Get started**.
2. **Sign-in method** sekmesi → **Anonymous** → **Enable** → Save.

## 4. Firestore veritabanı oluştur
1. Sol menü **Build → Firestore Database → Create database**.
2. **Production mode** seçin, bölgeyi seçin, oluşturun.

## 5. Güvenlik kurallarını yapıştır
1. Firestore → **Rules** sekmesi.
2. Bu depodaki `firestore.rules` dosyasının **tüm içeriğini** yapıştırın.
3. **Publish**.

## 6. Kendi değerlerinizi girin
`firebase-config.js` dosyasını açıp şu iki yeri doldurun:

- `window.HC_FIREBASE_CONFIG` → 2. adımda kopyaladığınız değerler.
- `window.HC_ROOM_CODE` → **ikinizin de gireceği** ortak, gizli, rastgele bir metin
  (örn. `kır-çiçeği-8472-mavi`). Bu, hangi odada buluşacağınızı belirler.
  Tahmin edilmesi zor olsun.

> Her iki cihazdaki `firebase-config.js` **aynı** olmalı (aynı proje + aynı oda kodu).

## 7. Yayınla (host)
Uygulamanın HTTPS'te olması gerekir. Kolay ücretsiz yollar:

**Firebase Hosting (önerilir):**
```bash
npm i -g firebase-tools
firebase login
cd hesap-pwa
firebase init hosting   # public klasör olarak "." (bu klasör), SPA: No
firebase deploy
```

**veya Netlify / Vercel / GitHub Pages:** `hesap-pwa/` klasörünü statik site olarak
yayınlamanız yeterli.

## 8. İki telefona kur
- Her iki telefonda yayınladığınız adresi açın.
- **Android/Chrome:** menü → "Ana ekrana ekle".
- **iPhone/Safari (iOS 16.4+):** paylaş → "Ana Ekrana Ekle".
- Hesap makinesine gizli kodunuzu yazıp `=` → sohbet açılır. İlk açılışta iki cihaz
  anahtar değişir; durum "bağlı" olunca yazışabilirsiniz.

---

## Nasıl çalıştığını bilmek isterseniz
- **Kimlik:** Her cihaz anonim olarak oturum açar (e-posta/şifre yok).
- **Oda:** Oda kodunun SHA-256 özeti oda kimliği olur. Aynı kodu girenler aynı odaya düşer.
- **Anahtarlar:** Her cihaz bir ECDH (P-256) çifti üretir. Özel anahtar cihazda,
  **dışa aktarılamaz** biçimde (IndexedDB) kalır — koda ya da sunucuya hiç gitmez.
- **Şifreleme:** İki açık anahtardan ortak bir AES-GCM anahtarı türetilir; mesajlar
  bununla şifrelenir. Sunucuda yalnızca `iv` + şifreli metin (`ct`) durur.
- **Üye sınırı:** Güvenlik kuralları odayı en fazla 2 kişiyle sınırlar; üçüncü biri
  aynı kodu bilse bile odaya giremez ve hiçbir şey okuyamaz.

## Bildirim / gizlilik notu
- Uygulama **görünür bildirim göndermez**; telefonun bildirim geçmişinde iz oluşmaz.
- Mesaj geldiğini, uygulamayı açtığınızda hesap makinesi ekranındaki **"M" işaretinden**
  (okunmamış varsa turuncu yanar) anlarsınız. Bu, uygulama açıkken gerçek zamanlı güncellenir.
- Uygulama kapalıyken sessiz/gizli bir uyarı teknik olarak mümkün değildir (iOS ve Android
  her görünür bildirimi sisteme kaydeder). Bu yüzden uyarı yalnızca uygulama içindedir.
