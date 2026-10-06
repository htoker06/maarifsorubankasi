// Oturum yönetimi: Supabase Auth (gerçek hesaplar) ya da Demo Modu (hızlı giriş).
import { api, setCurrentUser } from '../services/index.js';
import { DEMO_ADMIN_ID, DEMO_STUDENT_ID, DEMO_TEACHER_ID } from '../data/demo-seed.js';
import { readJson, writeJson, removeKey } from '../lib/storage.js';
import { isDemo } from '../lib/config.js';
import { supabase } from '../lib/supabase.js';

const KEY = 'sbm-session-v1';
let current = null;
const listeners = new Set();

export const getUser = () => current;
export const onSessionChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = () => listeners.forEach((fn) => fn(current));

async function loadProfile(userId, email) {
  setCurrentUser(userId);
  const profile = await api.profiles.get(userId);
  current = profile ? { ...profile, email } : null;
  if (!current) setCurrentUser(null);
  return current;
}

export async function restoreSession() {
  if (isDemo) {
    const saved = readJson(KEY);
    if (saved?.userId) await loadProfile(saved.userId);
    return current;
  }
  const { data } = await supabase.auth.getSession();
  if (data.session) await loadProfile(data.session.user.id, data.session.user.email).catch(() => null);
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      current = null;
      setCurrentUser(null);
      emit();
    }
    if (event === 'PASSWORD_RECOVERY') location.hash = '#/sifre-yenile';
    if (event === 'SIGNED_IN' && session && session.user.id !== current?.id) {
      loadProfile(session.user.id, session.user.email).then(emit).catch(() => null);
    }
  });
  return current;
}

/** Profil değiştiğinde (ör. yönetici öğretmen başvurusunu onayladığında) yeniden yükler. */
export async function refreshProfile() {
  if (!current) return null;
  await loadProfile(current.id, current.email);
  emit();
  return current;
}

/** Demo Modu girişi. */
export async function signInDemo(role) {
  const id = { teacher: DEMO_TEACHER_ID, student: DEMO_STUDENT_ID, admin: DEMO_ADMIN_ID }[role];
  await loadProfile(id);
  writeJson(KEY, { userId: id });
  emit();
  return current;
}

const AUTH_ERRORS = [
  [/Invalid login credentials/i, 'E-posta adresi ya da şifre hatalı.'],
  [/Email not confirmed/i, 'E-posta adresiniz henüz doğrulanmamış. Gelen kutunuzdaki bağlantıya tıklayın.'],
  [/User already registered/i, 'Bu e-posta adresiyle zaten bir hesap var. Giriş yapmayı deneyin.'],
  [/Password should be at least/i, 'Şifre en az 6 karakter olmalıdır.'],
  [/rate limit|too many/i, 'Çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar deneyin.'],
  [/valid email|invalid format/i, 'Geçerli bir e-posta adresi girin.'],
  [/Failed to fetch|NetworkError/i, 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.'],
];
const authError = (error) => new Error(AUTH_ERRORS.find(([re]) => re.test(error?.message ?? ''))?.[1] ?? error?.message ?? 'Beklenmeyen bir hata oluştu.');

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw authError(error);
  await loadProfile(data.user.id, data.user.email);
  if (!current) throw new Error('Hesap profili bulunamadı. Yöneticiye başvurun.');
  emit();
  return current;
}

/**
 * Kayıt. Bilgiler kullanıcı meta verisi olarak gönderilir; veritabanındaki tetikleyici profili
 * (ve öğretmen başvurusunu) oluşturur. Rol buradan belirlenemez: öğretmenler onay bekler.
 * @returns {{ needsConfirmation: boolean }}
 */
export async function signUp({ email, password, fullName, requestedRole, schoolName, branch, note, grade }) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      emailRedirectTo: `${location.origin}/`,
      data: { full_name: fullName.trim(), requested_role: requestedRole, school_name: schoolName?.trim() || null, branch: branch?.trim() || null, note: note?.trim() || null, grade: grade ? String(grade) : null },
    },
  });
  if (error) throw authError(error);
  if (!data.session) return { needsConfirmation: true };
  await loadProfile(data.user.id, data.user.email);
  emit();
  return { needsConfirmation: false };
}

export async function sendPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/` });
  if (error) throw authError(error);
}

export async function updatePassword(password) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw authError(error);
}

export async function signOut() {
  if (!isDemo) await supabase.auth.signOut().catch(() => null);
  current = null;
  setCurrentUser(null);
  removeKey(KEY);
  emit();
}

export const homeFor = (user) =>
  ({ student: '#/ogrenci', admin: '#/yonetici', pending_teacher: '#/basvuru' })[user?.role] ?? (user ? '#/ogretmen' : '#/giris');
