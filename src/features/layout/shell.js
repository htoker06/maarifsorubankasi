import { html, setHtml } from '../../lib/html.js';
import { signOut } from '../../core/session.js';
import { navigate } from '../../core/router.js';
import { isDemo } from '../../lib/config.js';

const ROLE_LABELS = { teacher: 'Öğretmen', student: 'Öğrenci', admin: 'Yönetici' };

const NAV = {
  teacher: [
    { href: '#/ogretmen', label: 'Panom', icon: '🏠' },
    { href: '#/ogretmen/havuz', label: 'Soru Havuzu', icon: '🗂️' },
    { href: '#/ogretmen/uret', label: 'AI ile Soru Üret', icon: '✨' },
    { href: '#/ogretmen/sinavlar', label: 'Yazılı ve Testler', icon: '📝' },
    { href: '#/ogretmen/siniflar', label: 'Sınıflarım', icon: '👥' },
    { href: '#/ogretmen/analiz', label: 'Kazanım Analizi', icon: '📊' },
    { href: '#/ogretmen/bildirimler', label: 'Hatalı Soru Bildirimleri', icon: '🚩' },
  ],
  admin: [
    { href: '#/yonetici', label: 'Öğretmen Başvuruları', icon: '✅' },
    { href: '#/yonetici/mufredat', label: 'Müfredat', icon: '📚' },
    { href: '#/ogretmen', label: 'Öğretmen paneli', icon: '👩‍🏫' },
  ],
  student: [
    { href: '#/ogrenci', label: 'Panom', icon: '🏠' },
    { href: '#/ogrenci/testler', label: 'Testlerim', icon: '📝' },
    { href: '#/ogrenci/karne', label: 'Kazanım Karnem', icon: '📊' },
  ],
};

export function renderShell(root, user) {
  const items = NAV[user.role] ?? [];
  const current = location.hash.split('?')[0];
  const isActive = (href) => current === href || (href.split('/').length > 2 && current.startsWith(`${href}/`));
  const navLinks = items.map(
    (i) => html`<a href="${i.href}" class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition
      ${isActive(i.href) ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}">
      <span aria-hidden="true">${i.icon}</span>${i.label}</a>`,
  );

  setHtml(
    root,
    html`
      ${isDemo
        ? html`<div class="no-print bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            Demo Modu — veriler yalnızca bu tarayıcıda saklanır. Gerçek veritabanı için Supabase ortam değişkenlerini tanımlayın.
          </div>`
        : ''}
      <div class="flex min-h-screen">
        <aside id="sidebar" class="no-print fixed inset-y-0 left-0 z-40 w-64 -translate-x-full border-r border-slate-200 bg-white p-4 transition-transform lg:static lg:translate-x-0 dark:border-slate-800 dark:bg-slate-900">
          <a href="#/" class="mb-6 flex items-center gap-2 px-2">
            <img src="/favicon.svg" alt="" class="h-8 w-8" />
            <span class="text-lg font-extrabold tracking-tight">SoruBankası<span class="text-indigo-600">Matik</span></span>
          </a>
          <nav class="flex flex-col gap-1">${navLinks}</nav>
          <div class="mt-8 rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-800">
            <p class="font-semibold">${user.fullName}</p>
            <p class="muted text-xs">${ROLE_LABELS[user.role] ?? ''} · ${user.schoolName ?? ''}</p>
            <button class="btn-ghost btn-sm mt-2 w-full" data-logout>Çıkış yap</button>
          </div>
        </aside>
        <div id="backdrop" class="no-print fixed inset-0 z-30 hidden bg-slate-900/40 lg:hidden"></div>
        <div class="flex min-w-0 flex-1 flex-col">
          <header class="no-print sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur lg:hidden dark:border-slate-800 dark:bg-slate-900/80">
            <button class="btn-icon btn-ghost" data-menu aria-label="Menüyü aç">☰</button>
            <span class="font-bold">SoruBankası<span class="text-indigo-600">Matik</span></span>
          </header>
          <main id="page" class="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6"></main>
        </div>
      </div>`,
  );

  const sidebar = root.querySelector('#sidebar');
  const backdrop = root.querySelector('#backdrop');
  const toggle = (open) => {
    sidebar.classList.toggle('-translate-x-full', !open);
    backdrop.classList.toggle('hidden', !open);
  };
  root.querySelector('[data-menu]').addEventListener('click', () => toggle(true));
  backdrop.addEventListener('click', () => toggle(false));
  root.querySelector('[data-logout]').addEventListener('click', async () => {
    await signOut();
    navigate('#/giris');
  });
  return root.querySelector('#page');
}
