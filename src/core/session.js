import { api, setCurrentUser } from '../services/index.js';
import { DEMO_STUDENT_ID, DEMO_TEACHER_ID } from '../data/demo-seed.js';
import { readJson, writeJson, removeKey } from '../lib/storage.js';

const KEY = 'sbm-session-v1';
let current = null;
const listeners = new Set();

export const getUser = () => current;
export const onSessionChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = () => listeners.forEach((fn) => fn(current));

export async function restoreSession() {
  const saved = readJson(KEY);
  if (saved?.userId) {
    const profile = await api.profiles.get(saved.userId);
    if (profile) {
      current = profile;
      setCurrentUser(profile.id);
    }
  }
  return current;
}

/** Demo Modu girişi. Adım 3'te Supabase Auth (e-posta/şifre) ile değiştirilecek. */
export async function signInDemo(role) {
  const id = role === 'teacher' ? DEMO_TEACHER_ID : DEMO_STUDENT_ID;
  current = await api.profiles.get(id);
  setCurrentUser(id);
  writeJson(KEY, { userId: id });
  emit();
  return current;
}

export function signOut() {
  current = null;
  setCurrentUser(null);
  removeKey(KEY);
  emit();
}

export const homeFor = (user) => (user?.role === 'student' ? '#/ogrenci' : '#/ogretmen');
