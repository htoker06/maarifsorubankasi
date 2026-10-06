// Onay bekleyen öğretmen adayının ekranı
import { html, setHtml, onAction } from '../../lib/html.js';
import { api } from '../../services/index.js';
import { refreshProfile, signOut, homeFor } from '../../core/session.js';
import { navigate } from '../../core/router.js';
import { formatDate } from '../../lib/format.js';
import { toast } from '../../ui/toast.js';

export async function render(root, { user }) {
  const req = await api.admin.myTeacherRequest();
  const rejected = req?.status === 'rejected';
  setHtml(
    root,
    html`<div class="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
      <div class="card w-full max-w-lg p-8 text-center">
        <div class="text-5xl">${rejected ? '📭' : '⏳'}</div>
        <h1 class="mt-4 text-xl font-bold">${rejected ? 'Öğretmen başvurunuz onaylanmadı' : 'Öğretmen başvurunuz inceleniyor'}</h1>
        <p class="muted mt-2">Merhaba ${user.fullName}. ${rejected
          ? 'Yönetici başvurunuzu onaylamadı.'
          : 'Yönetici başvurunuzu onayladığında öğretmen paneline erişebileceksiniz.'}</p>
        ${req ? html`<div class="mt-5 rounded-lg bg-slate-50 p-4 text-left text-sm dark:bg-slate-800">
          <p><strong>Okul:</strong> ${req.schoolName || '—'}</p>
          <p><strong>Branş:</strong> ${req.branch || '—'}</p>
          <p><strong>Başvuru tarihi:</strong> ${formatDate(req.createdAt)}</p>
          ${rejected && req.reason ? html`<p class="mt-2 text-rose-700 dark:text-rose-300"><strong>Gerekçe:</strong> ${req.reason}</p>` : ''}
        </div>` : ''}
        <div class="mt-6 flex justify-center gap-2">
          <button class="btn-secondary" data-action="refresh">Durumu yenile</button>
          <button class="btn-ghost" data-action="logout">Çıkış yap</button>
        </div>
      </div>
    </div>`,
  );
  return onAction(root, {
    refresh: async () => {
      const u = await refreshProfile();
      if (u?.role === 'pending_teacher') toast('Başvurunuz henüz sonuçlanmadı.', 'info');
      else navigate(homeFor(u));
    },
    logout: async () => {
      await signOut();
      navigate('#/giris');
    },
  });
}
