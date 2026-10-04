export const config = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
};

/**
 * Supabase adresi ve anahtarı tanımlıysa gerçek veritabanı kullanılır.
 * Tanımlı değilse uygulama tarayıcıda örnek verilerle (Demo Modu) çalışır.
 */
export const isDemo = !(config.supabaseUrl && config.supabaseAnonKey);
