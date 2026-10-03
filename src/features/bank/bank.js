import { html, setHtml, $, onAction } from '../../lib/html.js';
import { api } from '../../services/index.js';
import { questionBody, questionMeta, selectOptions, emptyState } from '../../ui/components.js';
import { openModal, confirmDialog } from '../../ui/modal.js';
import { toast } from '../../ui/toast.js';
import { openQuestionEditor } from './question-editor.js';
import { readJson, writeJson } from '../../lib/storage.js';
import { formatDate } from '../../lib/format.js';
import { BLOOM_LEVELS, DIFFICULTIES, QUESTION_STATUSES, QUESTION_TYPES } from '../../data/constants.js';

const FILTER_KEY = 'sbm-bank-filters';
const entries = (obj) => Object.entries(obj).map(([k, v]) => [k, v.label]);

export async function render(root) {
  const [subjects, lookup] = await Promise.all([api.curriculum.subjects(), api.curriculum.lookup()]);
  let filters = readJson(FILTER_KEY, {}) ?? {};
  let usageMap = new Map();
  let list = [];

  setHtml(
    root,
    html`
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="page-title">Soru Havuzu</h1>
          <p class="muted mt-1">Filtreleyin, önizleyin, düzenleyin. Turuncu rozet, sorunun daha önce bir sınavda kullanıldığını gösterir.</p>
        </div>
        <div class="flex gap-2">
          <a href="#/ogretmen/uret" class="btn-secondary">✨ AI ile üret</a>
          <button class="btn-primary" data-action="new">+ Yeni soru</button>
        </div>
      </div>

      <form id="filters" class="card mt-5 grid grid-cols-2 gap-3 p-4 md:grid-cols-4 xl:grid-cols-8">
        <div class="col-span-2"><label class="label" for="f-search">Ara</label>
          <input id="f-search" class="input" name="search" placeholder="Soru metninde ara…" value="${filters.search ?? ''}" /></div>
        <div class="col-span-2 md:col-span-1"><label class="label" for="f-subject">Ders</label>
          <select id="f-subject" class="input" name="subjectId">${selectOptions(subjects.map((s) => [s.id, `${s.gradeId}. ${s.name}`]), filters.subjectId, 'Tümü')}</select></div>
        <div class="col-span-2 md:col-span-1"><label class="label" for="f-theme">Tema</label>
          <select id="f-theme" class="input" name="themeId"></select></div>
        <div><label class="label" for="f-diff">Zorluk</label>
          <select id="f-diff" class="input" name="difficulty">${selectOptions(entries(DIFFICULTIES), filters.difficulty, 'Tümü')}</select></div>
        <div><label class="label" for="f-type">Tip</label>
          <select id="f-type" class="input" name="type">${selectOptions(entries(QUESTION_TYPES), filters.type, 'Tümü')}</select></div>
        <div><label class="label" for="f-bloom">Bloom</label>
          <select id="f-bloom" class="input" name="bloom">${selectOptions(entries(BLOOM_LEVELS), filters.bloom, 'Tümü')}</select></div>
        <div><label class="label" for="f-status">Durum</label>
          <select id="f-status" class="input" name="status">${selectOptions(entries(QUESTION_STATUSES), filters.status, 'Tümü')}</select></div>
        <label class="col-span-2 flex items-center gap-2 text-sm md:col-span-4 xl:col-span-8">
          <input type="checkbox" name="unusedOnly" ${filters.unusedOnly ? 'checked' : ''} /> Yalnızca daha önce kullanmadığım soruları göster
        </label>
      </form>

      <p id="count" class="muted mt-4 text-xs"></p>
      <div id="list" class="mt-2 grid gap-3"></div>`,
  );

  const form = $('#filters', root);
  const themeSel = $('#f-theme', root);

  async function fillThemes() {
    const themes = filters.subjectId ? await api.curriculum.themes(filters.subjectId) : [];
    if (!themes.some((t) => t.id === filters.themeId)) filters.themeId = '';
    setHtml(themeSel, selectOptions(themes.map((t) => [t.id, t.name]), filters.themeId, 'Tümü'));
    themeSel.disabled = !themes.length;
  }

  async function load() {
    [list, usageMap] = await Promise.all([api.questions.list(filters), api.usages.mySummary()]);
    if (filters.unusedOnly) list = list.filter((q) => !usageMap.has(q.id));
    paint();
  }

  function paint() {
    setHtml($('#count', root), html`${list.length} soru listeleniyor`);
    setHtml(
      $('#list', root),
      list.length
        ? html`${list.map((q) => {
            const usage = usageMap.get(q.id);
            return html`<article class="card p-4">
              <div class="flex flex-wrap items-start justify-between gap-2">
                ${questionMeta(q, lookup, usage)}
                <div class="flex shrink-0 gap-1">
                  <button class="btn-ghost btn-sm" data-action="preview" data-id="${q.id}">Önizle</button>
                  <button class="btn-ghost btn-sm" data-action="edit" data-id="${q.id}">Düzenle</button>
                  ${q.status === 'draft' ? html`<button class="btn-ghost btn-sm text-emerald-700" data-action="approve" data-id="${q.id}">Onayla</button>` : ''}
                  <button class="btn-ghost btn-sm" data-action="more" data-id="${q.id}" aria-label="Diğer işlemler">⋯</button>
                </div>
              </div>
              <div class="mt-3">${questionBody(q, { compact: true })}</div>
              ${usage ? html`<p class="mt-3 rounded-md bg-orange-50 px-3 py-1.5 text-xs text-orange-800 dark:bg-orange-950 dark:text-orange-300">
                Son kullanım: ${formatDate(usage[0].examDate)} tarihli “${usage[0].examTitle}”</p>` : ''}
            </article>`;
          })}`
        : emptyState('Bu filtrelere uygun soru yok', 'Filtreleri değiştirin ya da yeni bir soru ekleyin.'),
    );
  }

  form.addEventListener('input', async (e) => {
    const data = new FormData(form);
    const previousSubject = filters.subjectId;
    filters = Object.fromEntries([...data.entries()].filter(([, v]) => v !== ''));
    filters.unusedOnly = data.has('unusedOnly');
    if (e.target.name === 'subjectId' || previousSubject !== filters.subjectId) await fillThemes();
    writeJson(FILTER_KEY, filters);
    load();
  });

  const find = (id) => list.find((q) => q.id === id);
  const off = onAction(root, {
    new: async () => {
      if (await openQuestionEditor(null, { subjectId: filters.subjectId, themeId: filters.themeId })) load();
    },
    edit: async (el) => {
      if (await openQuestionEditor(find(el.dataset.id))) load();
    },
    approve: async (el) => {
      await api.questions.setStatus(el.dataset.id, 'active');
      toast('Soru onaylandı ve aktif hale geldi.', 'success');
      load();
    },
    preview: (el) => {
      const q = find(el.dataset.id);
      const usage = usageMap.get(q.id) ?? [];
      openModal({
        title: 'Soru önizleme',
        size: 'lg',
        body: html`${questionMeta(q, lookup, usage)}
          <div class="mt-4">${questionBody(q, { showAnswer: true })}</div>
          ${q.solution ? html`<div class="mt-4 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800"><strong>Çözüm:</strong> ${q.solution}</div>` : ''}
          ${q.type === 'multiple_choice' ? html`<div class="mt-4"><p class="label">Çeldirici gerekçeleri</p><ul class="space-y-1 text-sm">
            ${q.body.options.filter((o) => o.rationale).map((o) => html`<li><strong>${o.key})</strong> ${o.rationale}</li>`)}</ul></div>` : ''}
          ${q.type === 'open_ended' && q.body?.rubric?.length ? html`<div class="mt-4"><p class="label">Dereceli puanlama</p><ul class="space-y-1 text-sm">
            ${q.body.rubric.map((r) => html`<li>${r.criterion} — <strong>${r.points} puan</strong></li>`)}</ul></div>` : ''}
          <div class="mt-4 text-xs text-slate-500">Kazanım: ${q.outcomeCodes.map((c) => `${c} — ${lookup.outcomes[c]?.text ?? ''}`).join('; ') || '—'}</div>
          ${usage.length ? html`<div class="mt-4"><p class="label">Kullanım geçmişi</p><ul class="space-y-1 text-sm">
            ${usage.map((u) => html`<li>📅 ${formatDate(u.examDate)} — ${u.examTitle}</li>`)}</ul></div>` : ''}`,
        actions: [{ label: 'Kapat', value: null }],
      });
    },
    more: async (el) => {
      const q = find(el.dataset.id);
      const choice = await openModal({
        title: 'Soru işlemleri',
        size: 'sm',
        body: html`<p class="muted">${q.stem.slice(0, 120)}</p>`,
        actions: [
          q.status !== 'archived' ? { label: 'Arşivle', value: 'archive' } : { label: 'Arşivden çıkar', value: 'unarchive' },
          { label: 'Kopyasını oluştur', value: 'copy' },
          { label: 'Sil', value: 'delete', className: 'btn-danger' },
        ],
      });
      try {
        if (choice === 'archive') await api.questions.setStatus(q.id, 'archived');
        if (choice === 'unarchive') await api.questions.setStatus(q.id, 'active');
        if (choice === 'copy') {
          const { id, version, createdAt, updatedAt, ...rest } = q;
          await api.questions.save({ ...rest, status: 'draft', source: 'manual' });
          toast('Kopya taslak olarak oluşturuldu.', 'success');
        }
        if (choice === 'delete' && (await confirmDialog({ title: 'Soruyu sil', message: 'Bu soru kalıcı olarak silinecek. Emin misiniz?', confirmLabel: 'Sil', tone: 'danger' }))) {
          await api.questions.remove(q.id);
          toast('Soru silindi.', 'success');
        }
        if (choice) load();
      } catch (err) {
        toast(err.message, 'error');
      }
    },
  });

  await fillThemes();
  await load();
  return off;
}
