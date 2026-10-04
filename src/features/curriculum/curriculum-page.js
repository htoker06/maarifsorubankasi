// Yönetici: Müfredat yönetimi ve CSV içe aktarma.
import { html, setHtml, $, onAction } from '../../lib/html.js';
import { api } from '../../services/index.js';
import { toast } from '../../ui/toast.js';
import { confirmDialog } from '../../ui/modal.js';
import { CSV_COLUMNS, buildTemplateCsv, curriculumToCsv, parseCurriculumCsv } from './csv-import.js';
import { downloadBlob } from '../export/print-model.js';
import { SCHOOL_LEVELS, levelOfGrade } from '../../data/constants.js';
import { isDemo } from '../../lib/config.js';

const MAX_LISTED_ISSUES = 50;

export async function render(root) {
  let parsed = null;
  let fileLabel = '';
  let selectedSubjects = new Set();

  /** Seçili derslere ait kayıtlar */
  const selection = () => {
    const themeIds = new Set(parsed.themes.filter((t) => selectedSubjects.has(t.subjectId)).map((t) => t.id));
    return {
      subjects: parsed.subjects.filter((s) => selectedSubjects.has(s.id)),
      themes: parsed.themes.filter((t) => themeIds.has(t.id)),
      outcomes: parsed.outcomes.filter((o) => themeIds.has(o.themeId)),
    };
  };

  async function paint() {
    const summary = await api.curriculum.summary();
    const totalOutcomes = summary.reduce((a, s) => a + s.outcomeCount, 0);
    const byLevel = Object.entries(SCHOOL_LEVELS).map(([key, level]) => ({
      key,
      label: level.label,
      subjects: summary.filter((s) => levelOfGrade(s.gradeId) === key),
    }));

    setHtml(
      root,
      html`
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 class="page-title">Müfredat</h1>
            <p class="muted mt-1">Öğretim programlarındaki tema ve öğrenme çıktılarını (kazanımları) CSV dosyasıyla içe aktarın.</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button class="btn-secondary" data-action="template">⬇️ Boş şablon (CSV)</button>
            <button class="btn-secondary" data-action="export">⬇️ Mevcut müfredatı indir</button>
          </div>
        </div>

        <section class="card mt-6 flex flex-wrap items-center justify-between gap-4 border-indigo-200 bg-indigo-50/60 p-5 dark:border-indigo-900 dark:bg-indigo-950/40">
          <div class="max-w-2xl">
            <h2 class="font-bold">📚 Resmî MEB müfredatı (1–12. sınıf)</h2>
            <p class="muted mt-1 text-sm">Türkiye Yüzyılı Maarif Modeli öğretim programlarından alınmış 153 ders, 808 tema ve 7.369 öğrenme çıktısı; ünitelerin beceri, değer ve içerik çerçevesi bilgileriyle birlikte (yapay zekanın soru üretirken kullandığı bağlam). Aktarmadan önce dersleri seçebilirsiniz.</p>
          </div>
          <button class="btn-primary" data-action="official">Resmî müfredatı yükle</button>
        </section>

        <section class="mt-6 grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div class="card p-5">
            <h2 class="font-bold">Ya da kendi CSV dosyanızı yükleyin</h2>
            <label id="drop" class="mt-3 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-6 py-10 text-center transition hover:border-indigo-400 hover:bg-indigo-50/40 dark:border-slate-700 dark:hover:bg-indigo-950/30">
              <span class="text-3xl">📄</span>
              <span class="font-medium">Dosyayı buraya bırakın ya da seçmek için tıklayın</span>
              <span class="muted text-xs">.csv — UTF-8; ayraç ; , veya sekme olabilir (Excel'de "CSV UTF-8" olarak kaydedin)</span>
              <input type="file" accept=".csv,text/csv" class="sr-only" id="file" />
            </label>
            <div id="result" class="mt-5"></div>
          </div>

          <aside class="card p-5">
            <h2 class="font-bold">Sütunlar</h2>
            <table class="mt-3 w-full text-left text-xs">
              <tbody>${CSV_COLUMNS.map((c) => html`<tr class="border-b border-slate-100 dark:border-slate-800">
                <td class="py-1.5 pr-2 font-mono font-semibold">${c.key}</td>
                <td class="py-1.5">${c.label}${c.required ? html` <span class="text-rose-500">*</span>` : ''}</td></tr>`)}</tbody>
            </table>
            <ul class="muted mt-4 list-disc space-y-1 pl-5 text-xs">
              <li>Her satır bir öğrenme çıktısıdır. Aynı tema için ders, sınıf, tema no ve tema adı her satırda tekrarlanır.</li>
              <li>Süreç bileşenleri tek hücrede <code>|</code> ile ayrılır.</li>
              <li>İçe aktarma <strong>ekler ve günceller, silmez</strong>. Kazanım kodu aynıysa metni güncellenir; sorulara bağlı kayıtlar korunur.</li>
              <li>Ayrıntılı rehber: <code>docs/MUFREDAT-CSV.md</code></li>
            </ul>
          </aside>
        </section>

        <section class="mt-8">
          <h2 class="font-bold">Mevcut müfredat <span class="muted font-normal">— ${summary.length} ders, ${totalOutcomes.toLocaleString('tr-TR')} öğrenme çıktısı</span></h2>
          <div class="mt-3 grid gap-4 md:grid-cols-3">
            ${byLevel.map((lvl) => html`<div class="card p-4">
              <p class="font-semibold">${lvl.label}</p>
              ${lvl.subjects.length
                ? html`<ul class="mt-2 space-y-1 text-sm">${lvl.subjects.map((s) => html`<li class="flex justify-between gap-2">
                    <span>${s.gradeId}. sınıf ${s.name}</span><span class="muted shrink-0 text-xs">${s.themeCount} tema · ${s.outcomeCount} kazanım</span></li>`)}</ul>`
                : html`<p class="muted mt-2 text-sm">Henüz ders yok.</p>`}
            </div>`)}
          </div>
        </section>`,
    );

    const input = $('#file', root);
    const drop = $('#drop', root);
    input.addEventListener('change', () => input.files[0] && readFile(input.files[0]));
    drop.addEventListener('dragover', (e) => (e.preventDefault(), drop.classList.add('border-indigo-500')));
    drop.addEventListener('dragleave', () => drop.classList.remove('border-indigo-500'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('border-indigo-500');
      if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]);
    });
    if (parsed) paintResult();
  }

  async function readFile(file) {
    if (file.size > 20 * 1024 * 1024) return toast('Dosya 20 MB\'tan büyük olamaz.', 'error');
    fileLabel = file.name;
    parsed = parseCurriculumCsv(await file.text());
    selectedSubjects = new Set(parsed.subjects.map((s) => s.id));
    paintResult();
  }

  function issueList(items, tone) {
    const cls = tone === 'error' ? 'bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200' : 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200';
    return html`<ul class="max-h-48 space-y-0.5 overflow-y-auto rounded-lg p-3 text-xs ${cls}">
      ${items.slice(0, MAX_LISTED_ISSUES).map((e) => html`<li>${e.line ? `${e.line}. satır: ` : ''}${e.message}</li>`)}
      ${items.length > MAX_LISTED_ISSUES ? html`<li class="font-semibold">… ve ${items.length - MAX_LISTED_ISSUES} kayıt daha</li>` : ''}
    </ul>`;
  }

  function paintResult() {
    const p = parsed;
    const ok = p.errors.length === 0 && p.outcomes.length > 0;
    const sel = ok ? selection() : null;
    const outcomeCountBySubject = {};
    const themeSubject = Object.fromEntries(p.themes.map((t) => [t.id, t.subjectId]));
    p.outcomes.forEach((o) => (outcomeCountBySubject[themeSubject[o.themeId]] = (outcomeCountBySubject[themeSubject[o.themeId]] ?? 0) + 1));
    setHtml(
      $('#result', root),
      html`
        <h2 class="font-bold">2. Kontrol sonucu — <span class="font-normal">${fileLabel}</span></h2>
        <div class="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          ${[['Satır', p.rowCount], ['Ders', p.subjects.length], ['Tema', p.themes.length], ['Kazanım', p.outcomes.length]].map(
            ([l, v]) => html`<div class="rounded-lg bg-slate-50 p-2 dark:bg-slate-800"><p class="text-lg font-bold">${v}</p><p class="muted text-xs">${l}</p></div>`,
          )}
        </div>
        ${p.errors.length ? html`<p class="mt-4 text-sm font-semibold text-rose-700 dark:text-rose-300">❌ ${p.errors.length} hata — düzeltilmeden içe aktarılamaz</p>${issueList(p.errors, 'error')}` : ''}
        ${p.warnings.length ? html`<p class="mt-4 text-sm font-semibold text-amber-700 dark:text-amber-300">⚠️ ${p.warnings.length} uyarı</p>${issueList(p.warnings, 'warning')}` : ''}
        ${ok
          ? html`<div class="mt-4">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <p class="label">Aktarılacak dersler (${sel.subjects.length}/${p.subjects.length})</p>
                <span class="flex gap-2 text-xs"><button class="underline" data-action="select-all">Tümünü seç</button><button class="underline" data-action="select-none">Hiçbirini seçme</button></span>
              </div>
              <div class="mt-1 grid max-h-56 gap-1 overflow-y-auto rounded-lg border border-slate-200 p-2 text-sm sm:grid-cols-2 dark:border-slate-700">
                ${[...p.subjects].sort((a, b) => a.gradeId - b.gradeId || a.name.localeCompare(b.name, 'tr')).map((s) => html`<label class="flex items-center gap-2">
                  <input type="checkbox" data-subject="${s.id}" ${selectedSubjects.has(s.id) ? 'checked' : ''} />
                  <span class="truncate">${s.gradeId}. sınıf ${s.name}</span><span class="muted ml-auto shrink-0 text-xs">${outcomeCountBySubject[s.id] ?? 0}</span></label>`)}
              </div>
              <p class="label mt-4">Önizleme (ilk 8 kazanım)</p>
              <div class="overflow-x-auto"><table class="w-full text-left text-xs">
                <thead><tr class="border-b border-slate-200 dark:border-slate-700"><th class="py-1 pr-2">Kod</th><th class="py-1 pr-2">Tema</th><th class="py-1">Kazanım</th></tr></thead>
                <tbody>${p.outcomes.slice(0, 8).map((o) => html`<tr class="border-b border-slate-100 align-top dark:border-slate-800">
                  <td class="py-1 pr-2 font-mono whitespace-nowrap">${o.code}</td>
                  <td class="py-1 pr-2">${p.themes.find((t) => t.id === o.themeId)?.name}</td>
                  <td class="py-1">${o.text}${o.processComponents.length ? html`<span class="muted block">${o.processComponents.length} süreç bileşeni</span>` : ''}</td></tr>`)}</tbody>
              </table></div>
              <button class="btn-primary mt-4" data-action="import" ${sel.outcomes.length ? '' : 'disabled'}>İçe aktar (${sel.subjects.length} ders, ${sel.outcomes.length} kazanım)</button>
            </div>`
          : ''}`,
    );
  }

  const off = onAction(root, {
    template: () => downloadBlob(new Blob([buildTemplateCsv()], { type: 'text/csv;charset=utf-8' }), 'mufredat_sablonu.csv'),
    export: async () => downloadBlob(new Blob([curriculumToCsv(await api.curriculum.snapshot())], { type: 'text/csv;charset=utf-8' }), 'mufredat.csv'),
    'select-all': () => ((selectedSubjects = new Set(parsed.subjects.map((s) => s.id))), paintResult()),
    'select-none': () => ((selectedSubjects = new Set()), paintResult()),
    official: async () => {
      toast('Resmî müfredat dosyası indiriliyor…', 'info', 2500);
      try {
        const res = await fetch('/data/meb-mufredat.json');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const bundle = await res.json();
        parsed = { ...bundle, errors: [], warnings: [], rowCount: bundle.outcomes.length };
        fileLabel = `MEB resmî müfredatı (${bundle.fetchedAt})`;
        selectedSubjects = new Set(isDemo ? [] : bundle.subjects.map((s) => s.id));
        paintResult();
        if (isDemo) toast('Demo Modu\'nda tarayıcı depolama alanı sınırlı: aktarmak istediğiniz birkaç dersi seçin.', 'info', 7000);
        $('#result', root).scrollIntoView({ behavior: 'smooth' });
      } catch (err) {
        toast(`Resmî müfredat dosyası alınamadı: ${err.message}`, 'error');
      }
    },
    import: async () => {
      const sel = selection();
      const ok = await confirmDialog({
        title: 'Müfredatı içe aktar',
        message: `${sel.subjects.length} ders, ${sel.themes.length} tema ve ${sel.outcomes.length} kazanım eklenecek ya da güncellenecek. Mevcut kayıtlar silinmez.`,
        confirmLabel: 'İçe aktar',
      });
      if (!ok) return;
      let s;
      const btn = $('[data-action="import"]', root);
      btn.disabled = true;
      try {
        s = await api.curriculum.importBatch(sel, (p) => (btn.textContent = `Aktarılıyor… %${Math.round(p * 100)}`));
      } catch (err) {
        btn.disabled = false;
        toast(err.message, 'error', 8000);
        return;
      }
      toast(`İçe aktarıldı: ${s.outcomes.added} yeni, ${s.outcomes.updated} güncellenen kazanım (${s.subjects.added} yeni ders, ${s.themes.added} yeni tema).`, 'success', 6000);
      parsed = null;
      paint();
    },
  });

  // Ders seçimi kutuları (tek dinleyici; paint() her çağrıldığında yeniden bağlanmaz)
  const onSubjectToggle = (e) => {
    const cb = e.target.closest('[data-subject]');
    if (!cb) return;
    if (cb.checked) selectedSubjects.add(cb.dataset.subject);
    else selectedSubjects.delete(cb.dataset.subject);
    paintResult();
  };
  root.addEventListener('change', onSubjectToggle);

  await paint();
  return () => {
    off();
    root.removeEventListener('change', onSubjectToggle);
  };
}
