import { html, setHtml, $, $$, onAction } from '../../lib/html.js';
import { api } from '../../services/index.js';
import { navigate } from '../../core/router.js';
import { openModal, confirmDialog } from '../../ui/modal.js';
import { toast } from '../../ui/toast.js';
import { emptyState, examKindBadge, examStatusBadge, selectOptions } from '../../ui/components.js';
import { formatDate, todayIso } from '../../lib/format.js';
import { EXAM_KINDS } from '../../data/constants.js';
import { totalPoints } from './answer-key.js';

export async function render(root, { query }) {
  async function paint() {
    const exams = await api.exams.listMine();
    const lookup = await api.curriculum.lookup();
    setHtml(
      root,
      html`
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 class="page-title">Yazılı ve Testler</h1>
            <p class="muted mt-1">Yazılı kağıtları, tarama testleri ve online denemeler</p>
          </div>
          <button class="btn-primary" data-action="new">+ Yeni sınav / test</button>
        </div>
        <div class="mt-5 grid gap-3">
          ${exams.length
            ? exams.map(
                (e) => html`<div class="card flex flex-wrap items-center justify-between gap-3 p-4">
                  <a href="#/ogretmen/sinav/${e.id}" class="min-w-0 flex-1">
                    <p class="truncate font-semibold hover:text-indigo-600">${e.title}</p>
                    <p class="muted text-xs">${lookup.subjects[e.subjectId]?.name ?? ''} · ${formatDate(e.examDate)} ·
                      ${e.sections.reduce((a, s) => a + s.items.length, 0)} soru · ${totalPoints(e)} puan</p>
                  </a>
                  <div class="flex flex-wrap items-center gap-2">
                    ${examKindBadge(e.kind)} ${examStatusBadge(e.status)}
                    <button class="btn-ghost btn-sm" data-action="duplicate" data-id="${e.id}">Kopyala</button>
                    ${e.status === 'draft' ? html`<button class="btn-ghost btn-sm text-rose-600" data-action="delete" data-id="${e.id}">Sil</button>` : ''}
                  </div>
                </div>`,
              )
            : emptyState('Henüz sınav yok', 'İlk yazılınızı oluşturmak için "Yeni sınav / test" düğmesini kullanın.')}
        </div>`,
    );
  }

  async function createFlow(kind) {
    // Form değerleri, modal kapanmadan önce validate içinde yakalanır
    let values = null;
    const [subjects, classes] = await Promise.all([api.curriculum.subjects(), api.classes.listMine()]);
    const res = await openModal({
      title: 'Yeni sınav / test',
      body: html`<div class="grid gap-3">
        <div><label class="label" for="ne-kind">Tür</label>
          <select id="ne-kind" class="input" name="kind">${selectOptions(Object.entries(EXAM_KINDS).map(([k, v]) => [k, v.label]), kind)}</select></div>
        <div><label class="label" for="ne-title">Başlık</label>
          <input id="ne-title" class="input" name="title" placeholder="Örn. 6-A Matematik 1. Dönem 1. Yazılı" /></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="label" for="ne-subject">Ders</label>
            <select id="ne-subject" class="input" name="subjectId">${selectOptions(subjects.map((s) => [s.id, `${s.gradeId}. sınıf ${s.name}`]), '', 'Seçiniz')}</select></div>
          <div><label class="label" for="ne-date">Uygulama tarihi</label>
            <input id="ne-date" class="input" type="date" name="examDate" value="${todayIso()}" /></div>
        </div>
        <fieldset><legend class="label">Uygulanacak sınıflar</legend>
          <div class="flex flex-wrap gap-3">${classes.map((c) => html`<label class="text-sm"><input type="checkbox" name="classIds" value="${c.id}" data-subject="${c.subjectId}" /> ${c.name}</label>`)}</div>
          <p class="muted mt-1 text-xs">Sınıf seçimi, "aynı sınıfta kullanılmış soru" uyarısı için önemlidir.</p>
        </fieldset>
        <p id="ne-error" class="hidden text-sm text-rose-600">Başlık ve ders zorunludur.</p>
      </div>`,
      actions: [
        { label: 'Vazgeç', value: null },
        {
          label: 'Oluştur ve düzenle',
          className: 'btn-primary',
          value: 'ok',
          validate: (d) => {
            const title = $('[name="title"]', d).value.trim();
            const subjectId = $('[name="subjectId"]', d).value;
            $('#ne-error', d).classList.toggle('hidden', Boolean(title && subjectId));
            if (!title || !subjectId) return false;
            values = {
              kind: $('[name="kind"]', d).value,
              title,
              subjectId,
              grade: subjects.find((s) => s.id === subjectId)?.gradeId ?? null,
              examDate: $('[name="examDate"]', d).value,
              classIds: $$('[name="classIds"]:checked', d).map((cb) => cb.value),
            };
            return true;
          },
        },
      ],
      onMount: (d) => {
        $('[name="subjectId"]', d).addEventListener('change', (e) => {
          $$('[name="classIds"]', d).forEach((cb) => (cb.checked = cb.dataset.subject === e.target.value));
        });
        $('[name="title"]', d).focus();
      },
    });
    if (res !== 'ok' || !values) return;
    const exam = await api.exams.create(values);
    navigate(`#/ogretmen/sinav/${exam.id}`);
  }

  await paint();
  const off = onAction(root, {
    new: () => createFlow('written'),
    duplicate: async (el) => {
      const copy = await api.exams.duplicate(el.dataset.id);
      toast('Sınavın taslak kopyası oluşturuldu.', 'success');
      navigate(`#/ogretmen/sinav/${copy.id}`);
    },
    delete: async (el) => {
      if (!(await confirmDialog({ title: 'Taslağı sil', message: 'Bu taslak sınav silinecek. Emin misiniz?', confirmLabel: 'Sil', tone: 'danger' }))) return;
      try {
        await api.exams.remove(el.dataset.id);
        toast('Taslak silindi.', 'success');
        paint();
      } catch (err) {
        toast(err.message, 'error');
      }
    },
  });

  if (query.get('yeni')) {
    history.replaceState(null, '', '#/ogretmen/sinavlar');
    createFlow(query.get('yeni'));
  }
  return off;
}
