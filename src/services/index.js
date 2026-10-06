// Uygulamanın tek veri erişim noktası. Ekranlar veritabanına doğrudan değil, buradan erişir.
// Supabase ortam değişkenleri tanımlıysa gerçek veritabanı, değilse tarayıcıdaki demo deposu kullanılır.
import * as demoStore from './demo-store.js';
import * as supabaseStore from './supabase-store.js';
import { isDemo } from '../lib/config.js';

export const api = isDemo ? demoStore : supabaseStore;
export const { resetDemoData, setCurrentUser } = api;
