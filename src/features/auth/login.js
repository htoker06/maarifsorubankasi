import { html, setHtml, onAction } from '../../lib/html.js';
import { signInDemo, homeFor } from '../../core/session.js';
import { navigate } from '../../core/router.js';
import { resetDemoData } from '../../services/index.js';
import { toast } from '../../ui/toast.js';

export function renderLogin(root) {
  setHtml(
    root,
    html`
      <div class="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-600 via-indigo-500 to-violet-500 p-4">
        <div class="w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl md:grid md:grid-cols-2 dark:bg-slate-900">
          <section class="hidden flex-col justify-between bg-indigo-700 p-8 text-indigo-50 md:flex">
            <div>
              <div class="flex items-center gap-2">
                <img src="/favicon.svg" alt="" class="h-10 w-10" />
                <span class="text-xl font-extrabold text-white">SoruBankasıMatik</span>
              </div>
              <p class="mt-6 text-2xl font-bold leading-snug text-white">Maarif Modeli uyumlu soru bankası, yazılı ve online test platformu</p>
            </div>
            <ul class="space-y-3 text-sm">
              <li>✨ Kazanıma göre yapay zeka ile özgün soru üretimi</li>
              <li>📝 Sürükle-bırak yazılı oluşturucu, otomatik cevap anahtarı</li>
              <li>⚠️ "Bu soruyu daha önce kullandınız!" uyarı sistemi</li>
              <li>📊 Kazanım bazlı eksik analizi</li>
            </ul>
          </section>
          <section class="p-8">
            <h1 class="text-2xl font-bold">Giriş yap</h1>
            <p class="muted mt-1">Hangi panelle devam etmek istiyorsunuz?</p>

            <div class="mt-6 grid gap-3">
              <button class="card group flex items-center gap-4 p-4 text-left transition hover:border-indigo-400 hover:shadow-md" data-action="teacher">
                <span class="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 text-2xl dark:bg-indigo-950">👩‍🏫</span>
                <span><span class="block font-semibold">Öğretmen Paneli</span><span class="muted text-xs">Soru üret, havuzu yönet, yazılı hazırla, test ata</span></span>
              </button>
              <button class="card group flex items-center gap-4 p-4 text-left transition hover:border-indigo-400 hover:shadow-md" data-action="student">
                <span class="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-2xl dark:bg-emerald-950">🧑‍🎓</span>
                <span><span class="block font-semibold">Öğrenci Paneli</span><span class="muted text-xs">Atanan testleri çöz, sonuçlarını ve karneni gör</span></span>
              </button>
              <button class="btn-ghost btn-sm justify-start" data-action="admin">🛡️ Yönetici olarak gir (öğretmen onayı, müfredat)</button>
            </div>

            <div class="mt-6 rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              <strong>Demo Modu:</strong> Şu an e-posta/şifre gerekmez; örnek verilerle çalışır.
              Gerçek hesaplar (Supabase Auth) Adım 3'te etkinleşecek.
              <button class="ml-1 underline" data-action="reset">Demo verilerini sıfırla</button>
            </div>
          </section>
        </div>
      </div>`,
  );

  return onAction(root, {
    teacher: async () => navigate(homeFor(await signInDemo('teacher'))),
    student: async () => navigate(homeFor(await signInDemo('student'))),
    admin: async () => navigate(homeFor(await signInDemo('admin'))),
    reset: () => {
      resetDemoData();
      toast('Demo verileri ilk haline döndürüldü.', 'success');
    },
  });
}
