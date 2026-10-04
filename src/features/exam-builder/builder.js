// Yazılı / Test Oluşturucu: sürükle-bırak, kullanılmış soru uyarısı, otomatik oluşturma,
// cevap anahtarı, kesinleştirme ve PDF/Word dışa aktarımı.
import Sortable from 'sortablejs';
import { html, setHtml, $, $$, onAction } from '../../lib/html.js';
import { api } from '../../services/index.js';
import { openModal, confirmDialog } from '../../ui/modal.js';
import { toast } from '../../ui/toast.js';
import { badge, questionBody, questionMeta, selectOptions, examStatusBadge, examKindBadge, typeBadge, difficultyBadge } from '../../ui/components.js';
import { formatDate, truncate, uid } from '../../lib/format.js';
import { DIFFICULTIES, QUESTION_TYPES, EXAM_KINDS } from '../../data/constants.js';
import { evaluateUsage, draftConflicts } from './usage-warning.js';
import { buildAnswerKey, numberedItems, totalPoints } from './answer-key.js';
import { autoSelect, distributePoints } from './auto-select.js';

const entries = (obj) => Object.entries(obj).map(([k, v]) => [k, v.label]);

export async function render(root, { params }) {
  let exam = await api.exams.get(params.id);
  if (!exam) {
    setHtml(root, html`<div class="card p-6"><p class="font-semibold">Sınav bulunamadı.</p><a href="#/ogretmen/sinavlar" class="btn-secondary mt-4">Listeye dön</a></div>`);
    return null;
  }

  const [lookup, classes] = await Promise.all([api.curriculum.lookup(), api.classes.listMine()]);
  const themes = exam.subjectId ? await api.curriculum.themes(exam.subjectId) : [];
  let usageMap = new Map();
  let allExams = [];
  let questionsById = {};
  let poolFilters = { themeId: '', difficulty: '', type: '', search: '', unusedOnly: false };
  const poolSortables = [];
  const paperSortables = [];
  let saveTimer = null;

  const readOnly = () => exam.status !== 'draft';
  const itemIds = () => new Set(exam.sections.flatMap((s) => s.items.map((i) => i.questionId)));
  const questionOf = (item) => item.snapshot ?? questionsById[item.questionId];

  async function loadData() {
    const subjectQuestions = exam.subjectId ? await api.questions.list({ subjectId: exam.subjectId }) : [];
    questionsById = Object.fromEntries(subjectQuestions.map((q) => [q.id, q]));
    const missing = [...itemIds()].filter((id) => !questionsById[id]);
    if (missing.length) (await api.questions.getMany(missing)).forEach((q) => (questionsById[q.id] = q));
    [usageMap, allExams] = await Promise.all([api.usages.mySummary(), api.exams.listMine()]);
  }

  // ------------------------------------------------------------ kaydetme
  function scheduleSave() {
    if (readOnly()) return;
    setSaveState('Kaydediliyor…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        const { id, title, examDate, classIds, header, sections, kind } = exam;
        await api.exams.save({ id, title, examDate, classIds, header, sections, kind });
        setSaveState('✓ Kaydedildi');
      } catch (err) {
        setSaveState('Kaydedilemedi');
        toast(err.message, 'error');
      }
    }, 400);
  }
  const setSaveState = (text) => {
    const el = $('#save-state', root);
    if (el) el.textContent = text;
  };

  // ------------------------------------------------------------ iskelet
  function renderLayout() {
    poolSortables.splice(0).forEach((s) => s.destroy());
    setHtml(
      root,
      html`
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <a href="#/ogretmen/sinavlar" class="text-xs font-medium text-indigo-600 hover:underline">← Yazılı ve Testler</a>
            <h1 class="page-title mt-1 truncate">${exam.title}</h1>
            <div class="mt-1 flex flex-wrap items-center gap-2">
              ${examKindBadge(exam.kind)} ${examStatusBadge(exam.status)}
              <span class="muted text-xs">${lookup.subjects[exam.subjectId]?.name ?? ''} · ${formatDate(exam.examDate)}</span>
              ${readOnly() ? '' : html`<span id="save-state" class="muted text-xs"></span>`}
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            ${readOnly()
              ? html`<button class="btn-secondary" data-action="unfinalize">Kesinleştirmeyi geri al</button>`
              : html`<button class="btn-secondary" data-action="auto">⚡ Otomatik oluştur</button>`}
            <button class="btn-secondary" data-action="answer-key">🔑 Cevap anahtarı</button>
            <button class="btn-secondary" data-action="export">⬇️ PDF / Word</button>
            ${readOnly() ? '' : html`<button class="btn-primary" data-action="finalize">Kesinleştir</button>`}
          </div>
        </div>

        ${readOnly()
          ? html`<div class="mt-4 rounded-lg bg-indigo-50 px-4 py-3 text-sm text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200">
              Bu sınav ${formatDate(exam.finalizedAt)} tarihinde kesinleşti. İçindeki sorular “kullanılmış” olarak kaydedildi;
              soruların bu sınavdaki hali korunur. Düzenlemek için kesinleştirmeyi geri alabilir ya da kopyasını oluşturabilirsiniz.
            </div>`
          : ''}

        <div class="mt-5 grid gap-5 ${readOnly() ? '' : 'lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]'}">
          ${readOnly() ? '' : html`<section id="pool" class="order-2 lg:order-1"></section>`}
          <section id="paper" class="order-1 lg:order-2"></section>
        </div>`,
    );
    if (!readOnly()) {
      renderPool();
      bindPaperEvents($('#paper', root));
    }
    renderPaper();
  }

  // ------------------------------------------------------------ soru havuzu (sol)
  function renderPool() {
    const pool = $('#pool', root);
    setHtml(
      pool,
      html`<div class="card sticky top-4 flex max-h-[calc(100vh-2rem)] flex-col">
        <div class="border-b border-slate-200 p-3 dark:border-slate-800">
          <h2 class="font-bold">Soru havuzu</h2>
          <div class="mt-2 grid grid-cols-2 gap-2">
            <input class="input col-span-2" name="search" placeholder="Ara…" value="${poolFilters.search}" />
            <select class="input col-span-2" name="themeId">${selectOptions(themes.map((t) => [t.id, t.name]), poolFilters.themeId, 'Tüm temalar')}</select>
            <select class="input" name="difficulty">${selectOptions(entries(DIFFICULTIES), poolFilters.difficulty, 'Tüm zorluklar')}</select>
            <select class="input" name="type">${selectOptions(entries(QUESTION_TYPES), poolFilters.type, 'Tüm tipler')}</select>
            <label class="col-span-2 flex items-center gap-2 text-xs"><input type="checkbox" name="unusedOnly" ${poolFilters.unusedOnly ? 'checked' : ''} /> Daha önce kullanmadıklarım</label>
          </div>
        </div>
        <div id="pool-list" class="flex-1 space-y-2 overflow-y-auto p-3"></div>
      </div>`,
    );
    pool.querySelector('.border-b').addEventListener('input', (e) => {
      const t = e.target;
      poolFilters[t.name] = t.type === 'checkbox' ? t.checked : t.value;
      renderPoolList();
    });
    renderPoolList();
    poolSortables.push(
      Sortable.create($('#pool-list', root), {
        group: { name: 'exam', pull: 'clone', put: false },
        sort: false,
        handle: '.drag-handle',
        filter: '.is-added',
        animation: 150,
        forceFallback: true, // fare ve dokunmatik ekranda aynı davranış
      }),
    );
  }

  function renderPoolList() {
    const inExam = itemIds();
    const needle = poolFilters.search.toLocaleLowerCase('tr-TR');
    const list = Object.values(questionsById)
      .filter((q) => q.status === 'active' && q.subjectId === exam.subjectId)
      .filter((q) => !poolFilters.themeId || q.themeId === poolFilters.themeId)
      .filter((q) => !poolFilters.difficulty || q.difficulty === poolFilters.difficulty)
      .filter((q) => !poolFilters.type || q.type === poolFilters.type)
      .filter((q) => !needle || q.stem.toLocaleLowerCase('tr-TR').includes(needle))
      .filter((q) => !poolFilters.unusedOnly || !usageMap.has(q.id));

    setHtml(
      $('#pool-list', root),
      list.length
        ? html`${list.map((q) => {
            const added = inExam.has(q.id);
            const warn = evaluateUsage(usageMap.get(q.id), exam);
            return html`<div class="rounded-lg border p-3 ${added ? 'is-added border-dashed border-slate-300 opacity-50 dark:border-slate-700' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'}
                ${warn?.level === 'danger' && !added ? 'ring-1 ring-rose-300 dark:ring-rose-800' : ''}" data-qid="${q.id}">
              <div class="flex items-start gap-2">
                <span class="drag-handle mt-0.5 cursor-grab select-none text-slate-400 ${added ? 'invisible' : ''}" title="Sürükleyerek ekleyin" aria-hidden="true">⠿</span>
                <div class="min-w-0 flex-1">
                  ${questionMeta(q, lookup, usageMap.get(q.id))}
                  <p class="mt-1.5 text-sm">${truncate(q.stem, 140)}</p>
                </div>
                ${added
                  ? html`<span class="badge bg-slate-100 text-slate-500 dark:bg-slate-800">Ekli</span>`
                  : html`<button class="btn-icon btn-secondary h-8 w-8 shrink-0" data-action="add" data-id="${q.id}" aria-label="Yazılıya ekle">+</button>`}
              </div>
            </div>`;
          })}`
        : html`<p class="muted py-8 text-center text-sm">Bu filtrelere uygun aktif soru yok.</p>`,
    );
  }

  // ------------------------------------------------------------ yazılı kağıdı (sağ)
  function renderPaper() {
    const paper = $('#paper', root);
    const ro = readOnly();
    const items = numberedItems(exam, questionsById);
    const numberOf = Object.fromEntries(items.map((r) => [r.item.questionId, r.no]));
    const total = totalPoints(exam);
    const h = exam.header ?? {};

    setHtml(
      paper,
      html`
        <details class="card mb-4 p-4" ${ro ? '' : 'open'}>
          <summary class="cursor-pointer font-bold">Sınav bilgileri</summary>
          <fieldset class="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4" ${ro ? 'disabled' : ''} data-header>
            <div class="col-span-2"><label class="label">Başlık</label><input class="input" data-field="title" value="${exam.title}" /></div>
            <div><label class="label">Tür</label><select class="input" data-field="kind">${selectOptions(entries(EXAM_KINDS), exam.kind)}</select></div>
            <div><label class="label">Tarih</label><input class="input" type="date" data-field="examDate" value="${exam.examDate ?? ''}" /></div>
            <div class="col-span-2"><label class="label">Okul</label><input class="input" data-h="schoolName" value="${h.schoolName ?? ''}" /></div>
            <div><label class="label">Eğitim yılı</label><input class="input" data-h="academicYear" placeholder="2026-2027" value="${h.academicYear ?? ''}" /></div>
            <div><label class="label">Dönem</label><input class="input" data-h="term" placeholder="1. Dönem" value="${h.term ?? ''}" /></div>
            <div><label class="label">Süre (dk)</label><input class="input" type="number" min="1" data-h="durationMin" value="${h.durationMin ?? ''}" /></div>
            <div class="col-span-2 md:col-span-3"><label class="label">Sınıflar</label>
              <div class="flex flex-wrap gap-3 pt-1">${classes.map((c) => html`<label class="text-sm"><input type="checkbox" data-class="${c.id}" ${exam.classIds.includes(c.id) ? 'checked' : ''} /> ${c.name}</label>`)}</div></div>
            <div class="col-span-2 md:col-span-4"><label class="label">Yönerge</label><textarea class="input" rows="2" data-h="instructions">${h.instructions ?? ''}</textarea></div>
          </fieldset>
        </details>

        <div class="space-y-4" id="sections">
          ${exam.sections.map(
            (section, si) => html`<div class="card" data-section-card="${section.id}">
              <div class="flex items-center gap-2 border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
                <input class="input border-transparent bg-transparent px-1 font-semibold shadow-none focus:border-indigo-500" data-section-title="${section.id}" value="${section.title}" ${ro ? 'disabled' : ''} aria-label="Bölüm başlığı" />
                <span class="muted shrink-0 text-xs">${section.items.length} soru · ${section.items.reduce((a, i) => a + (Number(i.points) || 0), 0)} p</span>
                ${!ro && exam.sections.length > 1 ? html`<button class="btn-ghost btn-sm" data-action="remove-section" data-id="${section.id}" title="Bölümü sil">🗑</button>` : ''}
              </div>
              <ol class="drop-zone min-h-16 space-y-2 p-3" data-section="${section.id}">${section.items.map((item) => {
                const q = questionOf(item);
                if (!q) return html`<li data-qid="${item.questionId}" class="text-sm text-rose-600">Soru bulunamadı</li>`;
                const warn = evaluateUsage(usageMap.get(q.id), exam);
                return html`<li class="group rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900" data-qid="${q.id}">
                  <div class="flex items-start gap-2">
                    ${ro ? '' : html`<span class="drag-handle mt-0.5 cursor-grab select-none text-slate-400" title="Sürükleyerek sıralayın" aria-hidden="true">⠿</span>`}
                    <span class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">${numberOf[q.id]}</span>
                    <div class="min-w-0 flex-1">
                      <div class="flex flex-wrap items-center gap-1.5">${typeBadge(q.type)} ${difficultyBadge(q.difficulty)}
                        ${warn && !ro ? badge(warn.sameClass ? '⚠️ Bu sınıfta kullanıldı' : '🔁 Daha önce kullanıldı', warn.sameClass ? 'rose' : 'orange', warn.message) : ''}
                        ${q.status === 'quarantined' ? badge('Karantinada', 'rose') : ''}</div>
                      <div class="mt-1.5">${questionBody(q, { compact: true })}</div>
                    </div>
                    <div class="flex shrink-0 flex-col items-end gap-1">
                      <label class="flex items-center gap-1 text-xs"><input class="input w-16 px-2 py-1 text-right" type="number" min="0" step="0.5" value="${item.points}" data-points="${q.id}" ${ro ? 'disabled' : ''} aria-label="Puan" />p</label>
                      ${ro ? '' : html`<button class="btn-ghost btn-sm text-rose-600 opacity-70 group-hover:opacity-100" data-action="remove" data-id="${q.id}">Çıkar</button>`}
                    </div>
                  </div>
                </li>`;
              })}</ol>
            </div>`,
          )}
        </div>

        <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
          ${ro ? html`<span></span>` : html`<button class="btn-ghost" data-action="add-section">+ Bölüm ekle</button>`}
          <p class="text-sm font-semibold">Toplam: <span id="total" class="${total === 100 ? 'text-emerald-600' : 'text-amber-600'}">${total}</span> puan
            ${total !== 100 ? html`<span class="muted text-xs font-normal">(yazılılarda genellikle 100)</span>` : ''}</p>
        </div>`,
    );

    paperSortables.splice(0).forEach((s) => s.destroy());
    if (!ro) createDropZones(paper);
  }

  /** #paper içindeki tüm form olayları tek bir dinleyiciyle (yalnızca bir kez) bağlanır. */
  function bindPaperEvents(paper) {
    paper.addEventListener('input', (e) => {
      const t = e.target;
      if (t.dataset.field) exam[t.dataset.field] = t.value;
      if (t.dataset.h) exam.header = { ...exam.header, [t.dataset.h]: t.dataset.h === 'durationMin' ? Number(t.value) || null : t.value };
      if (t.dataset.class) {
        exam.classIds = $$('[data-class]:checked', paper).map((cb) => cb.dataset.class);
        renderPoolList(); // sınıf değişince "aynı sınıfta kullanıldı" vurgusu yeniden hesaplanır
      }
      if (t.dataset.field === 'title') $('h1', root).textContent = exam.title;
      if (t.dataset.field || t.dataset.h || t.dataset.class) scheduleSave();
      if (t.dataset.sectionTitle) {
        exam.sections.find((s) => s.id === t.dataset.sectionTitle).title = t.value;
        scheduleSave();
      }
      if (t.dataset.points) {
        const item = exam.sections.flatMap((s) => s.items).find((i) => i.questionId === t.dataset.points);
        item.points = Number(t.value) || 0;
        const total = totalPoints(exam);
        const totalEl = $('#total', root);
        totalEl.textContent = total;
        totalEl.className = total === 100 ? 'text-emerald-600' : 'text-amber-600';
        scheduleSave();
      }
    });
  }

  function createDropZones(paper) {
    $$('.drop-zone', paper).forEach((zone) =>
      paperSortables.push(
        Sortable.create(zone, {
          group: { name: 'exam', pull: true, put: true },
          handle: '.drag-handle',
          animation: 150,
          forceFallback: true,
          onAdd: (evt) => {
            if (evt.from.id !== 'pool-list') return; // bölümler arası taşıma onEnd'de işlenir
            const qid = evt.item.dataset.qid;
            evt.item.remove();
            addQuestion(qid, zone.dataset.section, evt.newIndex);
          },
          onEnd: (evt) => {
            if (evt.from.id === 'pool-list') return;
            syncOrderFromDom();
          },
        }),
      ),
    );
  }

  /** Sürükle-bırak sonrası DOM'daki sırayı sınav verisine yansıtır. */
  function syncOrderFromDom() {
    const allItems = Object.fromEntries(exam.sections.flatMap((s) => s.items.map((i) => [i.questionId, i])));
    exam.sections = exam.sections.map((section) => {
      const zone = $(`.drop-zone[data-section="${section.id}"]`, root);
      return { ...section, items: $$(':scope > [data-qid]', zone).map((li) => allItems[li.dataset.qid]).filter(Boolean) };
    });
    scheduleSave();
    renderPaper();
  }

  // ------------------------------------------------------------ ⭐ soru ekleme + kullanılmış soru uyarısı
  async function addQuestion(qid, sectionId = exam.sections[0].id, index = null) {
    const q = questionsById[qid];
    if (!q) return;
    if (itemIds().has(qid)) return toast('Bu soru zaten yazılıda.', 'info');
    if (q.status !== 'active') return toast('Yalnızca aktif (onaylı) sorular eklenebilir.', 'warning');

    const warning = evaluateUsage(usageMap.get(qid), exam);
    if (warning) {
      const history = usageMap.get(qid).filter((u) => u.examId !== exam.id);
      const choice = await openModal({
        title: warning.sameClass ? 'Bu soru bu sınıfta daha önce kullanıldı' : 'Bu soru daha önce kullanıldı',
        tone: warning.level === 'danger' ? 'danger' : 'warning',
        body: html`
          <div class="rounded-xl ${warning.level === 'danger' ? 'bg-rose-50 text-rose-900 dark:bg-rose-950 dark:text-rose-100' : 'bg-orange-50 text-orange-900 dark:bg-orange-950 dark:text-orange-100'} p-4">
            <p class="text-base font-bold">⚠️ ${warning.message}</p>
            ${warning.sameClass ? html`<p class="mt-1 text-sm">Bu sınavın sınıflarından en az biri bu soruyla daha önce karşılaştı.</p>` : ''}
          </div>
          <div class="mt-4 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">${questionBody(q, { compact: true })}</div>
          ${history.length > 1 ? html`<div class="mt-4"><p class="label">Tüm kullanım geçmişi (${history.length})</p>
            <ul class="space-y-1 text-sm">${history.map((u) => html`<li>📅 ${formatDate(u.examDate)} — ${u.examTitle}</li>`)}</ul></div>` : ''}`,
        actions: [
          { label: 'Vazgeç', value: 'cancel' },
          { label: '✨ Benzer yeni soru üret', value: 'similar' },
          { label: 'Yine de ekle', value: 'add', className: warning.level === 'danger' ? 'btn-danger' : 'btn-warning' },
        ],
      });
      if (choice === 'similar') return generateSimilar(q, sectionId, index);
      if (choice !== 'add') return;
    }

    const conflicts = draftConflicts(qid, exam, allExams);
    if (conflicts.length) toast(`Bilgi: Bu soru “${conflicts[0].title}” taslağında da var.`, 'info', 5000);

    const section = exam.sections.find((s) => s.id === sectionId) ?? exam.sections[0];
    const item = { questionId: qid, points: q.defaultPoints ?? 5 };
    if (index === null || index > section.items.length) section.items.push(item);
    else section.items.splice(index, 0, item);
    scheduleSave();
    renderPaper();
    renderPoolList();
  }

  /** Kullanılmış bir sorunun yerine aynı kazanımı ölçen yeni bir soru üretir ve onaylanırsa yazılıya ekler. */
  async function generateSimilar(source, sectionId, index) {
    if (!api.ai.available) return toast('Benzer soru üretimi Demo Modu\'nda kullanılamaz; Supabase ve Claude API bağlandığında etkinleşir.', 'info', 6000);
    toast('Benzer soru üretiliyor… (30-60 saniye sürebilir)', 'info', 8000);
    let out;
    try {
      out = await api.ai.generate({ similarToId: source.id, count: 1 });
    } catch (err) {
      return toast(err.message, 'error', 6000);
    }
    const fresh = out.questions[0];
    if (!fresh) return toast('Yeni soru denetimden geçemedi. Tekrar deneyin.', 'warning');
    questionsById[fresh.id] = fresh;
    const choice = await openModal({
      title: 'Benzer yeni soru üretildi',
      size: 'lg',
      body: html`<p class="muted mb-3 text-sm">Aynı öğrenme çıktısını ölçen yeni soru taslak olarak havuza eklendi. İnceleyin:</p>
        <div class="rounded-lg border border-slate-200 p-3 dark:border-slate-700">${questionBody(fresh, { showAnswer: true })}</div>
        ${fresh.solution ? html`<p class="mt-2 text-xs text-slate-500">Çözüm: ${fresh.solution}</p>` : ''}`,
      actions: [
        { label: 'Taslak olarak bırak', value: null },
        { label: 'Onayla ve yazılıya ekle', value: 'add', className: 'btn-primary' },
      ],
    });
    if (choice !== 'add') {
      renderPoolList();
      return;
    }
    questionsById[fresh.id] = await api.questions.setStatus(fresh.id, 'active');
    const section = exam.sections.find((s) => s.id === sectionId) ?? exam.sections[0];
    const item = { questionId: fresh.id, points: fresh.defaultPoints ?? 5 };
    if (index === null || index > section.items.length) section.items.push(item);
    else section.items.splice(index, 0, item);
    scheduleSave();
    renderPaper();
    renderPoolList();
    toast('Yeni soru onaylandı ve yazılıya eklendi.', 'success');
  }

  // ------------------------------------------------------------ otomatik oluşturma
  async function autoBuild() {
    let opts = null;
    const result = await openModal({
      title: 'Otomatik yazılı oluştur',
      size: 'md',
      body: html`<div class="grid gap-4">
        <div class="grid grid-cols-2 gap-3">
          <div><label class="label" for="ab-count">Soru sayısı</label><input id="ab-count" class="input" type="number" min="1" max="50" name="count" value="10" /></div>
          <div><label class="label" for="ab-total">Toplam puan</label><input id="ab-total" class="input" type="number" min="1" name="total" value="100" /></div>
        </div>
        <fieldset><legend class="label">Zorluk dağılımı (%)</legend>
          <div class="grid grid-cols-3 gap-3">
            <label class="text-sm">Kolay<input class="input mt-1" type="number" min="0" max="100" name="kolay" value="30" /></label>
            <label class="text-sm">Orta<input class="input mt-1" type="number" min="0" max="100" name="orta" value="50" /></label>
            <label class="text-sm">Zor<input class="input mt-1" type="number" min="0" max="100" name="zor" value="20" /></label>
          </div></fieldset>
        <fieldset><legend class="label">Temalar</legend>
          <div class="flex flex-wrap gap-3">${themes.map((t) => html`<label class="text-sm"><input type="checkbox" name="themes" value="${t.id}" checked /> ${t.name}</label>`)}</div></fieldset>
        <fieldset><legend class="label">Soru tipleri</legend>
          <div class="flex flex-wrap gap-3">${Object.entries(QUESTION_TYPES).map(([k, v]) => html`<label class="text-sm"><input type="checkbox" name="types" value="${k}" checked /> ${v.label}</label>`)}</div></fieldset>
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="excludeUsed" checked /> Daha önce kullandığım soruları hariç tut</label>
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="replace" ${itemIds().size ? '' : 'checked'} /> Mevcut soruları kaldır ve baştan oluştur</label>
      </div>`,
      actions: [
        { label: 'Vazgeç', value: null },
        {
          label: 'Oluştur',
          value: 'ok',
          className: 'btn-primary',
          validate: (d) => {
            const val = (n) => $(`[name="${n}"]`, d);
            opts = {
              count: Number(val('count').value) || 10,
              total: Number(val('total').value) || 100,
              ratios: { kolay: Number(val('kolay').value), orta: Number(val('orta').value), zor: Number(val('zor').value) },
              themes: $$('[name="themes"]:checked', d).map((c) => c.value),
              types: $$('[name="types"]:checked', d).map((c) => c.value),
              excludeUsed: val('excludeUsed').checked,
              replace: val('replace').checked,
            };
            return true;
          },
        },
      ],
    });
    if (result !== 'ok') return;

    const pool = Object.values(questionsById).filter(
      (q) => q.status === 'active' && q.subjectId === exam.subjectId && opts.themes.includes(q.themeId) && opts.types.includes(q.type),
    );
    const excludeIds = new Set([...(opts.excludeUsed ? usageMap.keys() : []), ...(opts.replace ? [] : itemIds())]);
    const { selected, shortage } = autoSelect(pool, { count: opts.count, ratios: opts.ratios, excludeIds });
    if (!selected.length) return toast('Ölçütlere uygun soru bulunamadı. AI ile yeni soru üretebilirsiniz.', 'warning', 5000);

    // Sorular zorluğa göre (kolaydan zora) sıralanır
    const order = { kolay: 0, orta: 1, zor: 2 };
    selected.sort((a, b) => order[a.difficulty] - order[b.difficulty]);
    const existing = opts.replace ? [] : exam.sections.flatMap((s) => s.items).map((i) => questionsById[i.questionId]).filter(Boolean);
    const all = [...existing, ...selected];
    const points = distributePoints(all, opts.total);
    const items = all.map((q, i) => ({ questionId: q.id, points: points[i] }));
    exam.sections = [{ id: exam.sections[0]?.id ?? uid('s'), title: exam.sections[0]?.title ?? 'Sorular', items }];
    scheduleSave();
    renderLayout();
    if (shortage) toast(`${shortage} soru için havuzda yeterli uygun soru yok. Eksikleri AI ile üretebilirsiniz.`, 'warning', 6000);
    else toast(`${selected.length} soru eklendi, puanlar dağıtıldı.`, 'success');
  }

  // ------------------------------------------------------------ cevap anahtarı
  function showAnswerKey() {
    const key = buildAnswerKey(exam, questionsById);
    openModal({
      title: `Cevap anahtarı ve puanlama baremi — ${exam.title}`,
      size: 'lg',
      body: key.length
        ? html`<table class="w-full text-left text-sm">
            <thead><tr class="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-700"><th class="py-2 pr-2">No</th><th class="py-2 pr-2">Cevap</th><th class="py-2 text-right">Puan</th></tr></thead>
            <tbody>${key.map((row) => html`<tr class="border-b border-slate-100 align-top dark:border-slate-800">
              <td class="py-2 pr-2 font-bold">${row.no}</td>
              <td class="py-2 pr-2"><p class="font-medium">${row.answer}</p>
                ${row.rubric ? html`<ul class="mt-1 space-y-0.5 text-xs text-slate-600 dark:text-slate-400">${row.rubric.map((r) => html`<li>• ${r.criterion}: <strong>${r.points} p</strong></li>`)}</ul>` : ''}
                ${row.solution ? html`<p class="mt-1 text-xs text-slate-500">Çözüm: ${row.solution}</p>` : ''}</td>
              <td class="py-2 text-right font-semibold">${row.points}</td></tr>`)}</tbody>
            <tfoot><tr><td></td><td class="py-2 text-right font-bold">Toplam</td><td class="py-2 text-right font-bold">${totalPoints(exam)}</td></tr></tfoot>
          </table>`
        : html`<p class="muted">Henüz soru eklenmedi.</p>`,
      actions: [{ label: 'Kapat', value: null }],
    });
  }

  // ------------------------------------------------------------ dışa aktarma
  async function exportExam() {
    if (!itemIds().size) return toast('Önce yazılıya soru ekleyin.', 'warning');
    let choice = null;
    await openModal({
      title: 'Dışa aktar',
      size: 'sm',
      body: html`<div class="grid gap-2">
        ${[
          ['pdf-exam', '📄 Sınav kağıdı (PDF)'],
          ['pdf-key', '🔑 Cevap anahtarı + barem (PDF)'],
          ['docx-exam', '📝 Sınav kağıdı (Word)'],
          ['docx-key', '🔑 Cevap anahtarı + barem (Word)'],
        ].map(([v, l]) => html`<button type="button" class="btn-secondary justify-start" data-export="${v}">${l}</button>`)}
      </div>`,
      onMount: (d, close) => $$('[data-export]', d).forEach((b) => b.addEventListener('click', () => ((choice = b.dataset.export), close(choice)))),
    });
    if (!choice) return;
    const [format, variant] = choice.split('-');
    toast('Dosya hazırlanıyor…', 'info', 2000);
    try {
      const mod = format === 'pdf' ? await import('../export/pdf.js') : await import('../export/docx.js');
      await mod.exportExam({ exam, questionsById, lookup, variant });
    } catch (err) {
      console.error(err);
      toast(`Dışa aktarma başarısız: ${err.message}`, 'error');
    }
  }

  // ------------------------------------------------------------ kesinleştirme
  async function finalize() {
    const count = itemIds().size;
    if (!count) return toast('Sınavda hiç soru yok.', 'warning');
    if (!exam.examDate) return toast('Önce sınav tarihini girin.', 'warning');
    const ok = await confirmDialog({
      title: 'Sınavı kesinleştir',
      message: `“${exam.title}” kesinleştirilecek. ${count} soru, ${formatDate(exam.examDate)} tarihiyle “kullanılmış” olarak kaydedilecek ve bundan sonra bu soruları başka bir yazılıya eklediğinizde uyarı göreceksiniz. Kesinleşen sınav düzenlenemez.`,
      confirmLabel: 'Kesinleştir',
    });
    if (!ok) return;
    clearTimeout(saveTimer);
    const { id, title, examDate, classIds, header, sections, kind } = exam;
    await api.exams.save({ id, title, examDate, classIds, header, sections, kind });
    exam = await api.exams.finalize(exam.id);
    await loadData();
    toast('Sınav kesinleşti. Sorular kullanılmış olarak işaretlendi.', 'success');
    renderLayout();
  }

  async function unfinalize() {
    const ok = await confirmDialog({
      title: 'Kesinleştirmeyi geri al',
      message: 'Sınav yeniden taslak olacak ve bu sınava ait “kullanılmış soru” kayıtları silinecek. Sınav öğrencilere uygulandıysa bunun yerine kopyasını oluşturmanız önerilir.',
      confirmLabel: 'Geri al',
      tone: 'warning',
    });
    if (!ok) return;
    exam = await api.exams.unfinalize(exam.id);
    await loadData();
    toast('Sınav yeniden taslak durumunda.', 'success');
    renderLayout();
  }

  // ------------------------------------------------------------ olaylar
  const off = onAction(root, {
    add: (el) => addQuestion(el.dataset.id),
    remove: (el) => {
      exam.sections.forEach((s) => (s.items = s.items.filter((i) => i.questionId !== el.dataset.id)));
      scheduleSave();
      renderPaper();
      renderPoolList();
    },
    'add-section': () => {
      const letter = String.fromCharCode(65 + exam.sections.length);
      exam.sections.push({ id: uid('s'), title: `${letter}. Bölüm`, items: [] });
      scheduleSave();
      renderPaper();
    },
    'remove-section': async (el) => {
      const section = exam.sections.find((s) => s.id === el.dataset.id);
      if (section.items.length && !(await confirmDialog({ title: 'Bölümü sil', message: 'Bölümdeki sorular yazılıdan çıkarılacak.', confirmLabel: 'Sil', tone: 'danger' }))) return;
      exam.sections = exam.sections.filter((s) => s.id !== section.id);
      scheduleSave();
      renderPaper();
      renderPoolList();
    },
    auto: autoBuild,
    'answer-key': showAnswerKey,
    export: exportExam,
    finalize,
    unfinalize,
  });

  await loadData();
  renderLayout();

  return () => {
    off();
    [...poolSortables, ...paperSortables].forEach((s) => s.destroy());
    if (saveTimer) {
      clearTimeout(saveTimer);
      if (!readOnly()) {
        const { id, title, examDate, classIds, header, sections, kind } = exam;
        api.exams.save({ id, title, examDate, classIds, header, sections, kind });
      }
    }
  };
}
