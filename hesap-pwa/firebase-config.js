/* =========================================================================
   FIREBASE YAPILANDIRMASI
   -------------------------------------------------------------------------
   Buradaki değerleri KENDİ Firebase projenizdeki değerlerle değiştirin.
   Adımlar için: SETUP-FIREBASE.md

   Değerleri doldurmadığınız sürece uygulama "yerel mod"da çalışır
   (mesajlar yalnızca cihazda; başka cihaza gitmez).
   ========================================================================= */
window.HC_FIREBASE_CONFIG = {
  apiKey: "BURAYA_API_KEY",
  authDomain: "PROJE.firebaseapp.com",
  projectId: "PROJE",
  storageBucket: "PROJE.appspot.com",
  messagingSenderId: "BURAYA_SENDER_ID",
  appId: "BURAYA_APP_ID",
};

/* Eşleşme kodu: iki cihazın aynı değeri kullanması gerekir.
   Bu, hangi "odada" buluşacağınızı belirler. İkiniz de aynı kodu girin.
   Rastgele, tahmin edilmesi zor bir şey seçin. */
window.HC_ROOM_CODE = "BURAYA_ORTAK_GIZLI_KOD";
