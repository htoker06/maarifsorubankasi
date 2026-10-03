import { html, setHtml } from '../../lib/html.js';
import { api } from '../../services/index.js';
import { statCard, examStatusBadge, examKindBadge } from '../../ui/components.js';
import { formatDate } from '../../lib/format.js';

export async function render(root, { user }) {
  const [stats, exams, usageMap] = await Promise.all([api.questions.stats(), api.exams.listMine(), api.usages.mySummary()]);
  const firstName = user.fullName.split(' ')[0];

  setHtml(
    root,
    html`
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="page-title">Hoş geldiniz, ${firstName} 👋</h1>
          <p class="muted mt-1">Soru havuzunuzun ve sınavlarınızın özeti</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <a href="#/ogretmen/uret" class="btn-secondary">✨ AI ile soru üret</a>
          <a href="#/ogretmen/sinavlar?yeni=written" class="btn-primary">+ Yeni yazılı</a>
        </div>
      </div>

      <section class="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        ${statCard('Toplam soru', stats.total)}
        ${statCard('Aktif', stats.active, 'Sınavda kullanılabilir', 'emerald')}
        ${statCard('Taslak', stats.draft, 'Onay bekliyor', 'slate')}
        ${statCard('Karantinada', stats.quarantined, 'Revizyon gerekli', 'rose')}
        ${statCard('Kullanılmış soru', usageMap.size, 'En az bir sınavda', 'amber')}
      </section>

      <section class="mt-8">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="font-bold">Son sınavlar</h2>
          <a href="#/ogretmen/sinavlar" class="text-sm font-medium text-indigo-600 hover:underline">Tümü →</a>
        </div>
        <div class="card divide-y divide-slate-100 dark:divide-slate-800">
          ${exams.slice(0, 5).map(
            (e) => html`<a href="#/ogretmen/sinav/${e.id}" class="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <div>
                <p class="font-medium">${e.title}</p>
                <p class="muted text-xs">${formatDate(e.examDate)} · ${e.sections.reduce((a, s) => a + s.items.length, 0)} soru</p>
              </div>
              <div class="flex gap-1.5">${examKindBadge(e.kind)} ${examStatusBadge(e.status)}</div>
            </a>`,
          )}
          ${exams.length ? '' : html`<p class="muted px-4 py-6 text-center">Henüz sınav yok.</p>`}
        </div>
      </section>`,
  );
}
