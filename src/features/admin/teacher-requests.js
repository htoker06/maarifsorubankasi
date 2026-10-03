// Yönetici: öğretmen başvurularını onaylama / reddetme.
import { html, setHtml, $, onAction } from '../../lib/html.js';
import { api } from '../../services/index.js';
import { openModal } from '../../ui/modal.js';
import { toast } from '../../ui/toast.js';
import { badge, emptyState } from '../../ui/components.js';
import { formatDate } from '../../lib/format.js';

const STATUS = {
  pending: ['Bekliyor', 'amber'],
  approved: ['Onaylandı', 'emerald'],
  rejected: ['Reddedildi', 'rose'],
};

export async function render(root) {
  let filter = 'pending';

  async function paint() {
    const [all, pending] = await Promise.all([api.admin.teacherRequests(), api.admin.teacherRequests({ status: 'pending' })]);
    const list = filter ? all.filter((r) => r.status === filter) : all;
    setHtml(
      root,
      html`
        <h1 class="page-title">Öğretmen Başvuruları</h1>
        <p class="muted mt-1">"Öğretmenim" seçeneğiyle kaydolan kullanıcılar, siz onaylayana kadar öğretmen paneline erişemez.</p>
        <div class="mt-5 flex flex-wrap gap-2">
          ${[['pending', `Bekleyen (${pending.length})`], ['approved', 'Onaylanan'], ['rejected', 'Reddedilen'], ['', 'Tümü']].map(
            ([v, l]) => html`<button class="${filter === v ? 'btn-primary' : 'btn-secondary'} btn-sm" data-action="filter" data-value="${v}">${l}</button>`,
          )}
        </div>
        <div class="mt-4 grid gap-3">
          ${list.length
            ? list.map(
                (r) => html`<article class="card flex flex-wrap items-start justify-between gap-3 p-4">
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2"><p class="font-semibold">${r.fullName}</p>${badge(...STATUS[r.status])}</div>
                    <p class="muted text-sm">${r.email} · ${r.schoolName} · Branş: ${r.branch}</p>
                    ${r.note ? html`<p class="mt-1 text-sm">“${r.note}”</p>` : ''}
                    <p class="muted mt-1 text-xs">Başvuru: ${formatDate(r.createdAt)}${r.reviewedAt ? ` · Sonuç: ${formatDate(r.reviewedAt)}` : ''}${r.reason ? ` · Gerekçe: ${r.reason}` : ''}</p>
                  </div>
                  ${r.status === 'pending'
                    ? html`<div class="flex gap-2">
                        <button class="btn-secondary btn-sm text-rose-600" data-action="reject" data-id="${r.id}">Reddet</button>
                        <button class="btn-primary btn-sm" data-action="approve" data-id="${r.id}">Onayla</button>
                      </div>`
                    : ''}
                </article>`,
              )
            : emptyState('Kayıt yok', filter === 'pending' ? 'Bekleyen öğretmen başvurusu bulunmuyor.' : 'Bu filtrede başvuru yok.')}
        </div>`,
    );
  }

  const off = onAction(root, {
    filter: (el) => ((filter = el.dataset.value), paint()),
    approve: async (el) => {
      await api.admin.reviewTeacherRequest(el.dataset.id, true);
      toast('Başvuru onaylandı; kullanıcı artık öğretmen paneline erişebilir.', 'success');
      paint();
    },
    reject: async (el) => {
      let reason = '';
      const res = await openModal({
        title: 'Başvuruyu reddet',
        size: 'sm',
        body: html`<label class="label" for="rj-reason">Gerekçe (kullanıcıya gösterilir)</label><textarea id="rj-reason" class="input" rows="3"></textarea>`,
        actions: [
          { label: 'Vazgeç', value: null },
          { label: 'Reddet', value: 'ok', className: 'btn-danger', validate: (d) => ((reason = $('#rj-reason', d).value.trim()), true) },
        ],
      });
      if (res !== 'ok') return;
      await api.admin.reviewTeacherRequest(el.dataset.id, false, reason);
      toast('Başvuru reddedildi.', 'info');
      paint();
    },
  });

  await paint();
  return off;
}
