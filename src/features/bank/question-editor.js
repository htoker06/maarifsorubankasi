// Soru oluşturma / düzenleme formu (modal içinde). Tüm soru tiplerini destekler.
import { html, setHtml, $, $$ } from '../../lib/html.js';
import { openModal } from '../../ui/modal.js';
import { selectOptions } from '../../ui/components.js';
import { api } from '../../services/index.js';
import { toast } from '../../ui/toast.js';
import { BLOOM_LEVELS, DIFFICULTIES, QUESTION_TYPES, QUESTION_STATUSES, MAARIF_DIMENSIONS, OPTION_KEYS, optionCountForGrade } from '../../data/constants.js';

const entries = (obj) => Object.entries(obj).map(([k, v]) => [k, v.label]);

function blankQuestion(defaults = {}) {
  return {
    type: 'multiple_choice', difficulty: 'orta', bloom: 'uygulama', defaultPoints: 5, status: 'draft',
    stem: '', context: '', solution: '', outcomeCodes: [], skills: {}, body: {}, answer: null, ...defaults,
  };
}

/** Tipe özgü alanlar (şıklar, boşluk cevapları, eşleştirme çiftleri, rubrik). */
function typeFields(q) {
  switch (q.type) {
    case 'multiple_choice': {
      const count = Math.max(q.body?.options?.length ?? 0, optionCountForGrade(q.grade));
      const options = OPTION_KEYS.slice(0, count).map((key, i) => q.body?.options?.[i] ?? { key, text: '', rationale: '' });
      return html`<div class="space-y-2" data-mc>
        <p class="label">Şıklar — doğru şıkkı işaretleyin; çeldiricilerin hangi yanılgıyı ölçtüğünü yazın</p>
        ${options.map(
          (o) => html`<div class="grid grid-cols-[auto_1fr] items-start gap-2 sm:grid-cols-[auto_1fr_1fr]" data-option="${o.key}">
            <label class="flex items-center gap-1 pt-2 text-sm font-bold"><input type="radio" name="correct" value="${o.key}" ${q.answer === o.key ? 'checked' : ''} />${o.key})</label>
            <input class="input" data-field="text" placeholder="Şık metni" value="${o.text}" />
            <input class="input col-span-2 sm:col-span-1" data-field="rationale" placeholder="Çeldirici gerekçesi (kavram yanılgısı)" value="${o.rationale ?? ''}" />
          </div>`,
        )}
        <div class="flex gap-2">
          ${count < 5 ? html`<button type="button" class="btn-ghost btn-sm" data-add-option>+ Şık ekle</button>` : ''}
          ${count > 3 ? html`<button type="button" class="btn-ghost btn-sm" data-remove-option>− Son şıkkı sil</button>` : ''}
        </div>
      </div>`;
    }
    case 'true_false':
      return html`<div><p class="label">Doğru cevap</p>
        <label class="mr-4 text-sm"><input type="radio" name="tf" value="true" ${q.answer === true ? 'checked' : ''} /> Doğru</label>
        <label class="text-sm"><input type="radio" name="tf" value="false" ${q.answer === false ? 'checked' : ''} /> Yanlış</label></div>`;
    case 'fill_blank':
      return html`<div><label class="label" for="qe-blank">Kabul edilen cevaplar (virgülle ayırın)</label>
        <input id="qe-blank" class="input" data-blank value="${(q.answer ?? []).join(', ')}" placeholder="yoğunluk, özkütle" />
        <p class="muted mt-1 text-xs">Soru kökünde boşluğu ____ (dört alt çizgi) ile gösterin.</p></div>`;
    case 'matching': {
      const pairs = q.body?.pairs?.length ? q.body.pairs : [{ left: '', right: '' }, { left: '', right: '' }, { left: '', right: '' }];
      return html`<div class="space-y-2" data-pairs><p class="label">Eşleştirme çiftleri (doğru eşleşmeler; baskıda sağ sütun karıştırılır)</p>
        ${pairs.map((p, i) => html`<div class="grid grid-cols-[auto_1fr_1fr] items-center gap-2" data-pair>
          <span class="text-sm font-bold">${i + 1}.</span>
          <input class="input" data-field="left" placeholder="Sol" value="${p.left}" />
          <input class="input" data-field="right" placeholder="Sağ (eşi)" value="${p.right}" /></div>`)}
        <button type="button" class="btn-ghost btn-sm" data-add-pair>+ Çift ekle</button></div>`;
    }
    case 'open_ended': {
      const rubric = q.body?.rubric?.length ? q.body.rubric : [{ criterion: '', points: '' }];
      return html`<div class="space-y-2">
        <div><label class="label" for="qe-model">Örnek cevap</label><textarea id="qe-model" class="input" rows="2" data-model>${q.answer ?? ''}</textarea></div>
        <div data-rubric><p class="label">Dereceli puanlama anahtarı (ölçütler)</p>
          ${rubric.map((r) => html`<div class="mb-2 grid grid-cols-[1fr_6rem] gap-2" data-criterion>
            <input class="input" data-field="criterion" placeholder="Ölçüt" value="${r.criterion}" />
            <input class="input" type="number" min="0" data-field="points" placeholder="Puan" value="${r.points}" /></div>`)}
          <button type="button" class="btn-ghost btn-sm" data-add-criterion>+ Ölçüt ekle</button>
        </div></div>`;
    }
    default:
      return '';
  }
}

function readTypeFields(dialog, q) {
  switch (q.type) {
    case 'multiple_choice': {
      const options = $$('[data-option]', dialog).map((row) => ({
        key: row.dataset.option,
        text: $('[data-field="text"]', row).value.trim(),
        rationale: $('[data-field="rationale"]', row).value.trim() || null,
      }));
      return { body: { options }, answer: $('input[name="correct"]:checked', dialog)?.value ?? null };
    }
    case 'true_false': {
      const v = $('input[name="tf"]:checked', dialog)?.value;
      return { body: {}, answer: v === undefined ? null : v === 'true' };
    }
    case 'fill_blank':
      return { body: {}, answer: $('[data-blank]', dialog).value.split(',').map((s) => s.trim()).filter(Boolean) };
    case 'matching':
      return {
        body: { pairs: $$('[data-pair]', dialog).map((row) => ({ left: $('[data-field="left"]', row).value.trim(), right: $('[data-field="right"]', row).value.trim() })).filter((p) => p.left || p.right) },
        answer: null,
      };
    case 'open_ended':
      return {
        body: { rubric: $$('[data-criterion]', dialog).map((row) => ({ criterion: $('[data-field="criterion"]', row).value.trim(), points: Number($('[data-field="points"]', row).value) || 0 })).filter((r) => r.criterion) },
        answer: $('[data-model]', dialog).value.trim(),
      };
    default:
      return {};
  }
}

export function validateQuestion(q) {
  const errors = [];
  if (!q.subjectId) errors.push('Ders seçilmelidir.');
  if (!q.stem?.trim()) errors.push('Soru kökü boş olamaz.');
  if (q.type === 'multiple_choice') {
    if (q.body.options.some((o) => !o.text)) errors.push('Tüm şıklar doldurulmalıdır.');
    if (!q.answer) errors.push('Doğru şık işaretlenmelidir.');
    const texts = q.body.options.map((o) => o.text.toLocaleLowerCase('tr-TR'));
    if (new Set(texts).size !== texts.length) errors.push('Aynı metne sahip iki şık olamaz.');
  }
  if (q.type === 'true_false' && typeof q.answer !== 'boolean') errors.push('Doğru/Yanlış cevabı seçilmelidir.');
  if (q.type === 'fill_blank') {
    if (!q.answer.length) errors.push('En az bir kabul edilen cevap girilmelidir.');
    if (!q.stem.includes('____')) errors.push('Soru kökünde boşluk (____) bulunmalıdır.');
  }
  if (q.type === 'matching' && (q.body.pairs.length < 2 || q.body.pairs.some((p) => !p.left || !p.right))) errors.push('En az iki eksiksiz eşleştirme çifti gereklidir.');
  return errors;
}

/**
 * Soru düzenleyiciyi açar. Kaydedilirse kaydedilen soruyu, vazgeçilirse null döner.
 */
export async function openQuestionEditor(existing = null, defaults = {}) {
  let q = structuredClone(existing ?? blankQuestion(defaults));
  const allSubjects = await api.curriculum.subjects();

  const form = () => html`
    <div class="grid gap-4">
      <div class="grid gap-3 sm:grid-cols-3">
        <div><label class="label" for="qe-subject">Ders</label>
          <select id="qe-subject" class="input" data-k="subjectId">${selectOptions(allSubjects.map((s) => [s.id, `${s.gradeId}. sınıf ${s.name}`]), q.subjectId, 'Seçiniz')}</select></div>
        <div><label class="label" for="qe-theme">Tema / Ünite</label><select id="qe-theme" class="input" data-k="themeId"></select></div>
        <div><label class="label" for="qe-outcome">Öğrenme çıktısı (kazanım)</label><select id="qe-outcome" class="input" data-k="outcome"></select></div>
      </div>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div class="col-span-2 sm:col-span-1"><label class="label" for="qe-type">Soru tipi</label>
          <select id="qe-type" class="input" data-k="type" ${existing ? 'disabled' : ''}>${selectOptions(entries(QUESTION_TYPES), q.type)}</select></div>
        <div><label class="label" for="qe-bloom">Bloom</label><select id="qe-bloom" class="input" data-k="bloom">${selectOptions(entries(BLOOM_LEVELS), q.bloom)}</select></div>
        <div><label class="label" for="qe-diff">Zorluk</label><select id="qe-diff" class="input" data-k="difficulty">${selectOptions(entries(DIFFICULTIES), q.difficulty)}</select></div>
        <div><label class="label" for="qe-pts">Puan</label><input id="qe-pts" type="number" min="1" class="input" data-k="defaultPoints" value="${q.defaultPoints}" /></div>
        <div><label class="label" for="qe-status">Durum</label><select id="qe-status" class="input" data-k="status">${selectOptions(entries(QUESTION_STATUSES).filter(([k]) => k !== 'quarantined' || q.status === 'quarantined'), q.status)}</select></div>
      </div>
      <div><label class="label" for="qe-context">Bağlam / okuma metni (isteğe bağlı)</label>
        <textarea id="qe-context" class="input" rows="2" data-k="context">${q.context ?? ''}</textarea></div>
      <div><label class="label" for="qe-stem">Soru kökü</label>
        <textarea id="qe-stem" class="input" rows="3" data-k="stem" placeholder="Soruyu yazın…">${q.stem}</textarea></div>
      <div id="qe-type-fields">${typeFields(q)}</div>
      <div><label class="label" for="qe-solution">Çözüm yolu</label>
        <textarea id="qe-solution" class="input" rows="2" data-k="solution">${q.solution ?? ''}</textarea></div>
      <details class="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
        <summary class="cursor-pointer text-sm font-semibold">Maarif Modeli etiketleri (beceriler, değerler, okuryazarlıklar)</summary>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          ${Object.entries(MAARIF_DIMENSIONS).map(([dim, def]) => html`<fieldset>
            <legend class="label">${def.label}</legend>
            <div class="flex flex-wrap gap-1.5">${def.options.map((opt) => html`<label class="cursor-pointer">
              <input type="checkbox" class="peer sr-only" data-skill="${dim}" value="${opt}" ${(q.skills?.[dim] ?? []).includes(opt) ? 'checked' : ''} />
              <span class="badge border border-slate-200 bg-white text-slate-600 peer-checked:border-indigo-500 peer-checked:bg-indigo-50 peer-checked:text-indigo-700 peer-focus-visible:ring-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:peer-checked:bg-indigo-950 dark:peer-checked:text-indigo-300">${opt}</span>
            </label>`)}</div></fieldset>`)}
        </div>
      </details>
      <p id="qe-errors" class="hidden rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300"></p>
    </div>`;

  const collect = (dialog) => {
    const val = (k) => $(`[data-k="${k}"]`, dialog)?.value;
    const subject = allSubjects.find((s) => s.id === val('subjectId'));
    const skills = {};
    $$('[data-skill]:checked', dialog).forEach((cb) => (skills[cb.dataset.skill] ??= []).push(cb.value));
    const outcome = val('outcome');
    return {
      ...q,
      subjectId: val('subjectId') || null,
      grade: subject?.gradeId ?? q.grade ?? null,
      themeId: val('themeId') || null,
      // Birden çok kazanımlı sorularda, birincil kazanım değişmediyse diğer kazanımlar korunur.
      outcomeCodes: !outcome ? [] : outcome === q.outcomeCodes?.[0] ? q.outcomeCodes : [outcome],
      type: val('type'),
      bloom: val('bloom'),
      difficulty: val('difficulty'),
      defaultPoints: Number(val('defaultPoints')) || 1,
      status: val('status'),
      context: val('context').trim(),
      stem: val('stem').trim(),
      solution: val('solution').trim(),
      skills,
      ...readTypeFields(dialog, q),
    };
  };

  const result = await openModal({
    title: existing ? 'Soruyu düzenle' : 'Yeni soru',
    size: 'lg',
    body: form(),
    actions: [
      { label: 'Vazgeç', value: null },
      {
        label: 'Kaydet',
        value: 'save',
        className: 'btn-primary',
        validate: (dialog) => {
          q = collect(dialog);
          const errors = validateQuestion(q);
          const box = $('#qe-errors', dialog);
          box.classList.toggle('hidden', !errors.length);
          setHtml(box, html`${errors.map((e) => html`<span class="block">• ${e}</span>`)}`);
          return errors.length === 0;
        },
      },
    ],
    onMount: (dialog) => {
      const themeSel = $('[data-k="themeId"]', dialog);
      const outcomeSel = $('[data-k="outcome"]', dialog);
      const fillThemes = async () => {
        const subjectId = $('[data-k="subjectId"]', dialog).value;
        const themes = subjectId ? await api.curriculum.themes(subjectId) : [];
        setHtml(themeSel, selectOptions(themes.map((t) => [t.id, `${t.order}. ${t.name}`]), q.themeId, 'Seçiniz'));
        await fillOutcomes();
      };
      const fillOutcomes = async () => {
        const themeId = themeSel.value;
        const outcomes = themeId ? await api.curriculum.outcomes({ themeId }) : [];
        setHtml(outcomeSel, selectOptions(outcomes.map((o) => [o.code, `${o.code} — ${o.text}`]), q.outcomeCodes?.[0], 'Seçiniz'));
      };
      $('[data-k="subjectId"]', dialog).addEventListener('change', fillThemes);
      themeSel.addEventListener('change', () => ((q.themeId = themeSel.value), fillOutcomes()));
      $('[data-k="bloom"]', dialog).addEventListener('change', (e) => {
        $('[data-k="difficulty"]', dialog).value = BLOOM_LEVELS[e.target.value].defaultDifficulty;
      });
      const rerenderTypeFields = () => setHtml($('#qe-type-fields', dialog), typeFields(q));
      $('[data-k="type"]', dialog).addEventListener('change', (e) => {
        q = { ...collect(dialog), type: e.target.value, body: {}, answer: e.target.value === 'fill_blank' ? [] : null };
        rerenderTypeFields();
      });
      $('#qe-type-fields', dialog).addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        q = collect(dialog);
        if (btn.matches('[data-add-option]')) q.body.options.push({ key: OPTION_KEYS[q.body.options.length], text: '', rationale: '' });
        if (btn.matches('[data-remove-option]')) {
          const removed = q.body.options.pop();
          if (q.answer === removed.key) q.answer = null;
        }
        if (btn.matches('[data-add-pair]')) q.body.pairs.push({ left: '', right: '' });
        if (btn.matches('[data-add-criterion]')) q.body.rubric.push({ criterion: '', points: '' });
        rerenderTypeFields();
      });
      fillThemes();
    },
  });

  if (result !== 'save') return null;
  try {
    const saved = await api.questions.save(q);
    toast(existing ? 'Soru güncellendi.' : 'Soru havuza eklendi.', 'success');
    return saved;
  } catch (err) {
    toast(err.message, 'error');
    return null;
  }
}
