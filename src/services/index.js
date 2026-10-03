// Uygulamanın tek veri erişim noktası. Ekranlar veritabanına doğrudan değil, buradan erişir.
// Adım 3'te Supabase sürümü eklendiğinde yalnızca bu dosyadaki seçim değişecek.
export * as api from './demo-store.js';
export { resetDemoData, setCurrentUser } from './demo-store.js';
