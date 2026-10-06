import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

// PKCE akışı: e-posta doğrulama ve şifre sıfırlama bağlantıları ?code=... ile döner,
// böylece uygulamanın #/... yönlendirmesiyle çakışmaz.
export const supabase = config.supabaseUrl
  ? createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;
