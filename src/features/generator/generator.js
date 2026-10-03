// AI ile soru üretim sihirbazı. Form ve istek modeli hazır; /api/generate-questions bağlantısı Adım 3'te eklenecek.
import { html, setHtml, $, $$ } from '../../lib/html.js';
import { api } from '../../services/index.js';
import { selectOptions } from '../../ui/components.js';
import { toast } from '../../ui/toast.js';
import { BLOOM_LEVELS, DIFFICULTIES, QUESTION_TYPES, MAARIF_DIMENSIONS, SCHOOL_LEVELS, levelOfGrade } from '../../data/constants.js';

const entries = (obj) => Object.entries(obj).map(([k, v]) => [k, v.label]);

export async function render(root) {
  const subjects = await api.curriculum.subjects();
  const grades = [...new Set(subjects.map((s) => s.gradeId))].sort((a, b) => a - b);

  setHtml(
    root,
    html`
      <h1 class="page-title">AI ile Soru Üret</h1>
      <p class="muted mt-1">Sınıf, ders, tema ve kazanımı seçin; yapay zeka Maarif Modeli'ne uygun özgün sorular üretsin. Üretilen sorular taslak olarak havuza düşer ve siz onaylamadan kullanılmaz.</p>

      <form id="gen" class="mt-6 grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div class="card grid gap-4 p-5">
          <h2 class="font-bold">1. Kapsam</h2>
          <div class="grid gap-3 sm:grid-cols-2">
            <div><label class="label" for="g-grade">Sınıf</label>
              <select id="g-grade" class="input" name="grade">${selectOptions(grades.map((g) => [g, `${g}. sınıf (${SCHOOL_LEVELS[levelOfGrade(g)].label})`]), '', 'Seçiniz')}</select></div>
            <div><label class="label" for="g-subject">Ders</label><select id="g-subject" class="input" name="subjectId" disabled></select></div>
            <div><label class="label" for="g-theme">Tema / Ünite</label><select id="g-theme" class="input" name="themeId" disabled></select></div>
            <div><label class="label" for="g-outcome">Öğrenme çıktısı (kazanım)</label><select id="g-outcome" class="input" name="outcomeCode" disabled></select></div>
          </div>
          <p class="muted text-xs">Demo verisinde yalnızca 4. sınıf Türkçe, 6. sınıf Matematik ve Fen Bilimleri örnekleri var. 1–12. sınıfların tam listesi içe aktarılacak.</p>

          <h2 class="mt-2 font-bold">2. Soru özellikleri</h2>
          <div class="grid gap-3 sm:grid-cols-4">
            <div class="sm:col-span-2"><label class="label" for="g-type">Soru tipi</label>
              <select id="g-type" class="input" name="type">${selectOptions(entries(QUESTION_TYPES), 'multiple_choice')}</select></div>
            <div><label class="label" for="g-bloom">Bloom basamağı</label>
              <select id="g-bloom" class="input" name="bloom">${selectOptions(entries(BLOOM_LEVELS), 'uygulama')}</select></div>
            <div><label class="label" for="g-diff">Zorluk</label>
              <select id="g-diff" class="input" name="difficulty">${selectOptions(entries(DIFFICULTIES), 'orta')}</select></div>
            <div><label class="label" for="g-count">Soru sayısı</label>
              <input id="g-count" class="input" type="number" min="1" max="10" name="count" value="5" /></div>
          </div>

          <h2 class="mt-2 font-bold">3. Maarif Modeli odağı (isteğe bağlı)</h2>
          <div class="grid gap-3 sm:grid-cols-2">
            ${['conceptual', 'values'].map((dim) => html`<fieldset><legend class="label">${MAARIF_DIMENSIONS[dim].label}</legend>
              <div class="flex flex-wrap gap-1.5">${MAARIF_DIMENSIONS[dim].options.map((opt) => html`<label class="cursor-pointer">
                <input type="checkbox" class="peer sr-only" name="${dim}" value="${opt}" />
                <span class="badge border border-slate-200 bg-white text-slate-600 peer-checked:border-indigo-500 peer-checked:bg-indigo-50 peer-checked:text-indigo-700 peer-focus-visible:ring-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:peer-checked:bg-indigo-950 dark:peer-checked:text-indigo-300">${opt}</span>
              </label>`)}</div></fieldset>`)}
          </div>
          <div><label class="label" for="g-notes">Ek yönerge</label>
            <textarea id="g-notes" class="input" rows="2" name="notes" placeholder="Örn. Günlük hayattan bağlam kullan, görsel gerektirmesin."></textarea></div>
        </div>

        <aside class="space-y-4">
          <div class="card p-5">
            <h2 class="font-bold">Üretim kuralları</h2>
            <ul class="muted mt-2 list-disc space-y-1 pl-5 text-sm">
              <li>Dil ve bağlam sınıf düzeyine uygun olur.</li>
              <li>Her çeldirici belirli bir kavram yanılgısına dayanır; gerekçesi kaydedilir.</li>
              <li>İlkokulda 3, ortaokul ve lisede 4 şık kullanılır.</li>
              <li>Her soruya çözüm yolu, açık uçlularda dereceli puanlama anahtarı eklenir.</li>
              <li>Havuzdaki benzer sorular kontrol edilir, tekrar üretilmez.</li>
            </ul>
          </div>
          <div class="card p-5">
            <h2 class="font-bold">İstek özeti</h2>
            <pre id="summary" class="mt-2 max-h-64 overflow-auto rounded-lg bg-slate-50 p-3 text-xs whitespace-pre-wrap dark:bg-slate-800"></pre>
            <button type="submit" class="btn-primary mt-4 w-full">✨ Soruları üret</button>
            <p class="muted mt-2 text-xs">Yapay zeka bağlantısı (Claude API, Vercel sunucu fonksiyonu üzerinden) Adım 3'te etkinleşecek.</p>
          </div>
        </aside>
      </form>`,
  );

  const form = $('#gen', root);
  const sel = (n) => $(`[name="${n}"]`, form);
  const fill = (el, items, placeholder) => {
    setHtml(el, selectOptions(items, '', placeholder));
    el.disabled = !items.length;
  };

  function request() {
    const data = new FormData(form);
    return {
      grade: Number(data.get('grade')) || null,
      subjectId: data.get('subjectId') || null,
      themeId: data.get('themeId') || null,
      outcomeCode: data.get('outcomeCode') || null,
      type: data.get('type'),
      bloom: data.get('bloom'),
      difficulty: data.get('difficulty'),
      count: Math.min(10, Math.max(1, Number(data.get('count')) || 1)),
      focus: { conceptual: data.getAll('conceptual'), values: data.getAll('values') },
      notes: String(data.get('notes') ?? '').trim(),
    };
  }

  const paintSummary = () => {
    $('#summary', root).textContent = JSON.stringify(request(), null, 2);
  };

  sel('grade').addEventListener('change', (e) => {
    fill(sel('subjectId'), subjects.filter((s) => s.gradeId === Number(e.target.value)).map((s) => [s.id, s.name]), 'Seçiniz');
    fill(sel('themeId'), [], '');
    fill(sel('outcomeCode'), [], '');
  });
  sel('subjectId').addEventListener('change', async (e) => {
    const themes = e.target.value ? await api.curriculum.themes(e.target.value) : [];
    fill(sel('themeId'), themes.map((t) => [t.id, `${t.order}. ${t.name}`]), 'Seçiniz');
    fill(sel('outcomeCode'), [], '');
    paintSummary();
  });
  sel('themeId').addEventListener('change', async (e) => {
    const outcomes = e.target.value ? await api.curriculum.outcomes({ themeId: e.target.value }) : [];
    fill(sel('outcomeCode'), outcomes.map((o) => [o.code, `${o.code} — ${o.text}`]), 'Tüm kazanımlar');
    paintSummary();
  });
  sel('bloom').addEventListener('change', (e) => {
    sel('difficulty').value = BLOOM_LEVELS[e.target.value].defaultDifficulty;
  });
  form.addEventListener('input', paintSummary);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const req = request();
    if (!req.subjectId || !req.themeId) return toast('Lütfen sınıf, ders ve tema seçin.', 'warning');
    toast('İstek hazır. Yapay zeka bağlantısı Adım 3\'te eklenecek; şimdilik soruları Soru Havuzu\'ndan elle ekleyebilirsiniz.', 'info', 6000);
  });
  $$('select', form).forEach((s) => s.disabled && setHtml(s, selectOptions([], '', '—')));
  paintSummary();
}
