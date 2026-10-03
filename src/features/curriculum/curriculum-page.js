// Yönetici: Müfredat yönetimi ve CSV içe aktarma.
import { html, setHtml, $, onAction } from '../../lib/html.js';
import { api } from '../../services/index.js';
import { toast } from '../../ui/toast.js';
import { confirmDialog } from '../../ui/modal.js';
import { CSV_COLUMNS, buildTemplateCsv, curriculumToCsv, parseCurriculumCsv } from './csv-import.js';
import { downloadBlob } from '../export/print-model.js';
import { SCHOOL_LEVELS, levelOfGrade } from '../../data/constants.js';

const MAX_LISTED_ISSUES = 50;

export async function render(root) {
  let parsed = null;
  let fileLabel = '';

  async function paint() {
    const snap = await api.curriculum.snapshot();
    const themeCount = (subjectId) => snap.themes.filter((t) => t.subjectId === subjectId).length;
    const outcomeCount = (subjectId) => {
      const ids = new Set(snap.themes.filter((t) => t.subjectId === subjectId).map((t) => t.id));
      return snap.outcomes.filter((o) => ids.has(o.themeId)).length;
    };
    const byLevel = Object.entries(SCHOOL_LEVELS).map(([key, level]) => ({
      key,
      label: level.label,
      subjects: snap.subjects.filter((s) => levelOfGrade(s.gradeId) === key).sort((a, b) => a.gradeId - b.gradeId || a.name.localeCompare(b.name, 'tr')),
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

        <section class="mt-6 grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div class="card p-5">
            <h2 class="font-bold">1. CSV dosyasını yükleyin</h2>
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
          <h2 class="font-bold">Mevcut müfredat</h2>
          <div class="mt-3 grid gap-4 md:grid-cols-3">
            ${byLevel.map((lvl) => html`<div class="card p-4">
              <p class="font-semibold">${lvl.label}</p>
              ${lvl.subjects.length
                ? html`<ul class="mt-2 space-y-1 text-sm">${lvl.subjects.map((s) => html`<li class="flex justify-between gap-2">
                    <span>${s.gradeId}. sınıf ${s.name}</span><span class="muted text-xs">${themeCount(s.id)} tema · ${outcomeCount(s.id)} kazanım</span></li>`)}</ul>`
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
    if (file.size > 5 * 1024 * 1024) return toast('Dosya 5 MB\'tan büyük olamaz.', 'error');
    fileLabel = file.name;
    parsed = parseCurriculumCsv(await file.text());
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
              <p class="label">Önizleme (ilk 8 kazanım)</p>
              <div class="overflow-x-auto"><table class="w-full text-left text-xs">
                <thead><tr class="border-b border-slate-200 dark:border-slate-700"><th class="py-1 pr-2">Kod</th><th class="py-1 pr-2">Tema</th><th class="py-1">Kazanım</th></tr></thead>
                <tbody>${p.outcomes.slice(0, 8).map((o) => html`<tr class="border-b border-slate-100 align-top dark:border-slate-800">
                  <td class="py-1 pr-2 font-mono whitespace-nowrap">${o.code}</td>
                  <td class="py-1 pr-2">${p.themes.find((t) => t.id === o.themeId)?.name}</td>
                  <td class="py-1">${o.text}${o.processComponents.length ? html`<span class="muted block">${o.processComponents.length} süreç bileşeni</span>` : ''}</td></tr>`)}</tbody>
              </table></div>
              <button class="btn-primary mt-4" data-action="import">İçe aktar (${p.outcomes.length} kazanım)</button>
            </div>`
          : ''}`,
    );
  }

  const off = onAction(root, {
    template: () => downloadBlob(new Blob([buildTemplateCsv()], { type: 'text/csv;charset=utf-8' }), 'mufredat_sablonu.csv'),
    export: async () => downloadBlob(new Blob([curriculumToCsv(await api.curriculum.snapshot())], { type: 'text/csv;charset=utf-8' }), 'mufredat.csv'),
    import: async () => {
      const ok = await confirmDialog({
        title: 'Müfredatı içe aktar',
        message: `${parsed.subjects.length} ders, ${parsed.themes.length} tema ve ${parsed.outcomes.length} kazanım eklenecek ya da güncellenecek. Mevcut kayıtlar silinmez.`,
        confirmLabel: 'İçe aktar',
      });
      if (!ok) return;
      const s = await api.curriculum.importBatch(parsed);
      toast(`İçe aktarıldı: ${s.outcomes.added} yeni, ${s.outcomes.updated} güncellenen kazanım (${s.subjects.added} yeni ders, ${s.themes.added} yeni tema).`, 'success', 6000);
      parsed = null;
      paint();
    },
  });

  await paint();
  return off;
}
