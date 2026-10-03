export const config = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
};

/**
 * Adım 2: Uygulama tamamen tarayıcıda, örnek verilerle (Demo Modu) çalışır.
 * Adım 3'te Supabase arka ucu bağlandığında, ortam değişkenleri doluysa gerçek veritabanı kullanılacak.
 */
export const isDemo = true;
