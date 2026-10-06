import { html, setHtml, $, onAction } from '../../lib/html.js';
import { signInDemo, signIn, signUp, sendPasswordReset, homeFor } from '../../core/session.js';
import { navigate } from '../../core/router.js';
import { resetDemoData } from '../../services/index.js';
import { toast } from '../../ui/toast.js';
import { isDemo } from '../../lib/config.js';
import { selectOptions } from '../../ui/components.js';

const BRAND = html`
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
      <li>📚 1–12. sınıf resmî öğretim programları</li>
      <li>📝 Sürükle-bırak yazılı oluşturucu, otomatik cevap anahtarı</li>
      <li>⚠️ "Bu soruyu daha önce kullandınız!" uyarı sistemi</li>
    </ul>
  </section>`;

const field = (id, label, input) => html`<div><label class="label" for="${id}">${label}</label>${input}</div>`;

const TABS = [
  ['giris', 'Giriş yap'],
  ['ogrenci', 'Öğrenci kaydı'],
  ['ogretmen', 'Öğretmen başvurusu'],
];

function formFor(tab) {
  if (tab === 'sifre') {
    return html`<form class="mt-5 grid gap-3" data-form="reset">
      <p class="muted text-sm">Hesabınızın e-posta adresini girin; şifre yenileme bağlantısı gönderelim.</p>
      ${field('f-email', 'E-posta', html`<input id="f-email" name="email" type="email" class="input" autocomplete="email" required />`)}
      <button class="btn-primary" type="submit">Bağlantı gönder</button>
      <button class="text-sm text-indigo-600 hover:underline" type="button" data-action="tab" data-tab="giris">← Girişe dön</button>
    </form>`;
  }
  if (tab === 'giris') {
    return html`<form class="mt-5 grid gap-3" data-form="login">
      ${field('f-email', 'E-posta', html`<input id="f-email" name="email" type="email" class="input" autocomplete="email" required />`)}
      ${field('f-pass', 'Şifre', html`<input id="f-pass" name="password" type="password" class="input" autocomplete="current-password" required />`)}
      <button class="btn-primary" type="submit">Giriş yap</button>
      <button class="text-sm text-indigo-600 hover:underline" type="button" data-action="tab" data-tab="sifre">Şifremi unuttum</button>
    </form>`;
  }
  const teacher = tab === 'ogretmen';
  return html`<form class="mt-5 grid gap-3" data-form="signup" data-role="${teacher ? 'teacher' : 'student'}">
    ${field('f-name', 'Ad soyad', html`<input id="f-name" name="fullName" class="input" autocomplete="name" required maxlength="120" />`)}
    ${field('f-email', 'E-posta', html`<input id="f-email" name="email" type="email" class="input" autocomplete="email" required />`)}
    ${field('f-pass', 'Şifre (en az 8 karakter)', html`<input id="f-pass" name="password" type="password" class="input" autocomplete="new-password" required minlength="8" />`)}
    ${field('f-school', 'Okul', html`<input id="f-school" name="schoolName" class="input" maxlength="200" ${teacher ? 'required' : ''} />`)}
    ${teacher
      ? html`${field('f-branch', 'Branş', html`<input id="f-branch" name="branch" class="input" placeholder="Örn. Matematik" required maxlength="100" />`)}
          ${field('f-note', 'Yöneticiye not (isteğe bağlı)', html`<textarea id="f-note" name="note" class="input" rows="2" maxlength="1000" placeholder="Örn. görev yaptığınız okul ve kademe"></textarea>`)}
          <p class="rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">Öğretmen hesapları yönetici onayından sonra etkinleşir.</p>`
      : field('f-grade', 'Sınıf', html`<select id="f-grade" name="grade" class="input" required>${selectOptions(Array.from({ length: 12 }, (_, i) => [i + 1, `${i + 1}. sınıf`]), '', 'Seçiniz')}</select>`)}
    <label class="flex items-start gap-2 text-xs"><input type="checkbox" required class="mt-0.5" />
      <span>Kişisel verilerimin (ad soyad, e-posta, okul${teacher ? ', branş' : ', sınıf'}) yalnızca bu platformun eğitim amaçlı işleyişi için kullanılmasını kabul ediyorum.</span></label>
    <button class="btn-primary" type="submit">${teacher ? 'Başvuruyu gönder' : 'Kayıt ol'}</button>
  </form>`;
}

export function renderLogin(root) {
  let tab = 'giris';

  const paint = () => {
    setHtml(
      root,
      html`<div class="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-600 via-indigo-500 to-violet-500 p-4">
        <div class="w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl md:grid md:grid-cols-2 dark:bg-slate-900">
          ${BRAND}
          <section class="p-6 sm:p-8">
            ${isDemo ? demoPanel() : html`
              <h1 class="text-2xl font-bold">${tab === 'sifre' ? 'Şifre yenileme' : 'Hoş geldiniz'}</h1>
              ${tab !== 'sifre'
                ? html`<div class="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 text-xs font-semibold dark:bg-slate-800" role="tablist">
                    ${TABS.map(([id, label]) => html`<button role="tab" aria-selected="${tab === id}" class="rounded-lg px-2 py-2 ${tab === id ? 'bg-white text-indigo-700 shadow dark:bg-slate-900 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-300'}" data-action="tab" data-tab="${id}">${label}</button>`)}
                  </div>`
                : ''}
              <div id="auth-msg" class="mt-4 hidden rounded-lg p-3 text-sm"></div>
              ${formFor(tab)}`}
          </section>
        </div>
      </div>`,
    );
  };

  const demoPanel = () => html`
    <h1 class="text-2xl font-bold">Giriş yap</h1>
    <p class="muted mt-1">Hangi panelle devam etmek istiyorsunuz?</p>
    <div class="mt-6 grid gap-3">
      <button class="card group flex items-center gap-4 p-4 text-left transition hover:border-indigo-400 hover:shadow-md" data-action="demo" data-role="teacher">
        <span class="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 text-2xl dark:bg-indigo-950">👩‍🏫</span>
        <span><span class="block font-semibold">Öğretmen Paneli</span><span class="muted text-xs">Soru üret, havuzu yönet, yazılı hazırla, test ata</span></span>
      </button>
      <button class="card group flex items-center gap-4 p-4 text-left transition hover:border-indigo-400 hover:shadow-md" data-action="demo" data-role="student">
        <span class="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-2xl dark:bg-emerald-950">🧑‍🎓</span>
        <span><span class="block font-semibold">Öğrenci Paneli</span><span class="muted text-xs">Atanan testleri çöz, sonuçlarını ve karneni gör</span></span>
      </button>
      <button class="btn-ghost btn-sm justify-start" data-action="demo" data-role="admin">🛡️ Yönetici olarak gir (öğretmen onayı, müfredat)</button>
    </div>
    <div class="mt-6 rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <strong>Demo Modu:</strong> E-posta/şifre gerekmez; örnek verilerle çalışır. Gerçek hesaplar Supabase bağlandığında etkinleşir.
      <button class="ml-1 underline" data-action="reset">Demo verilerini sıfırla</button>
    </div>`;

  const message = (text, tone = 'error') => {
    const el = $('#auth-msg', root);
    el.className = `mt-4 rounded-lg p-3 text-sm ${tone === 'error' ? 'bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200' : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'}`;
    el.textContent = text;
  };

  const onSubmit = async (e) => {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      if (form.dataset.form === 'login') {
        const user = await signIn(data.email, data.password);
        navigate(homeFor(user));
      } else if (form.dataset.form === 'reset') {
        await sendPasswordReset(data.email);
        message('Şifre yenileme bağlantısı e-posta adresinize gönderildi (gelmezse istenmeyen e-posta klasörüne bakın).', 'success');
      } else {
        const result = await signUp({ ...data, requestedRole: form.dataset.role });
        if (result.needsConfirmation) {
          message('Kaydınız alındı. E-posta adresinize gelen doğrulama bağlantısına tıklayıp giriş yapın.', 'success');
          form.reset();
        } else {
          const { getUser } = await import('../../core/session.js');
          navigate(homeFor(getUser()));
        }
      }
    } catch (err) {
      message(err.message);
    } finally {
      button.disabled = false;
    }
  };

  paint();
  root.addEventListener('submit', onSubmit);
  const off = onAction(root, {
    tab: (el) => ((tab = el.dataset.tab), paint()),
    demo: async (el) => navigate(homeFor(await signInDemo(el.dataset.role))),
    reset: () => {
      resetDemoData();
      toast('Demo verileri ilk haline döndürüldü.', 'success');
    },
  });
  return () => {
    off();
    root.removeEventListener('submit', onSubmit);
  };
}
