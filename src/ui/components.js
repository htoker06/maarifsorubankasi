import { html } from '../lib/html.js';
import { formatDate, seededShuffle, truncate } from '../lib/format.js';
import { BLOOM_LEVELS, DIFFICULTIES, QUESTION_STATUSES, QUESTION_TYPES, EXAM_STATUSES, EXAM_KINDS } from '../data/constants.js';

// Tailwind yalnızca kaynakta tam yazılmış sınıf adlarını derler; bu yüzden renkler sabit tabloda.
const TONES = {
  slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  zinc: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  emerald: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  rose: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  indigo: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
  sky: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  violet: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  orange: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
};

export const badge = (text, tone = 'slate', title = '') =>
  html`<span class="badge ${TONES[tone] ?? TONES.slate}" ${title ? html`title="${title}"` : ''}>${text}</span>`;

export const difficultyBadge = (d) => badge(DIFFICULTIES[d]?.label ?? d, DIFFICULTIES[d]?.color);
export const typeBadge = (t) => badge(QUESTION_TYPES[t]?.label ?? t, 'sky');
export const bloomBadge = (b) => badge(BLOOM_LEVELS[b]?.label ?? b, 'violet');
export const statusBadge = (s) => badge(QUESTION_STATUSES[s]?.label ?? s, QUESTION_STATUSES[s]?.color);
export const examStatusBadge = (s) => badge(EXAM_STATUSES[s]?.label ?? s, EXAM_STATUSES[s]?.color);
export const examKindBadge = (k) => badge(EXAM_KINDS[k]?.label ?? k, 'slate');

/** Kullanılmış soru rozeti: "🔁 2 kez kullanıldı" (üzerine gelince son sınav). */
export function usageBadge(entries) {
  if (!entries?.length) return '';
  const last = entries[0];
  return badge(
    `🔁 ${entries.length} kez kullanıldı`,
    'orange',
    `Son: ${formatDate(last.examDate)} — ${last.examTitle}`,
  );
}

export function emptyState(title, message, action = '') {
  return html`<div class="card flex flex-col items-center gap-2 px-6 py-12 text-center">
    <div class="text-3xl">🗂️</div>
    <p class="font-semibold">${title}</p>
    <p class="muted max-w-sm">${message}</p>
    ${action}
  </div>`;
}

export function statCard(label, value, hint = '', tone = 'indigo') {
  const ring = { indigo: 'text-indigo-600', emerald: 'text-emerald-600', amber: 'text-amber-600', rose: 'text-rose-600', slate: 'text-slate-600' }[tone];
  return html`<div class="card p-4">
    <p class="muted text-xs font-semibold uppercase tracking-wide">${label}</p>
    <p class="mt-1 text-2xl font-bold ${ring}">${value}</p>
    ${hint ? html`<p class="muted mt-1 text-xs">${hint}</p>` : ''}
  </div>`;
}

/** Eşleştirme sorusunun sağ sütunu, soruya özgü sabit bir sırayla karıştırılır (baskı ve cevap anahtarında aynı). */
export function matchingLayout(question) {
  const pairs = question.body?.pairs ?? [];
  const right = seededShuffle(pairs.map((p, i) => ({ text: p.right, index: i })), question.id);
  const letters = 'abcdefghij';
  const key = pairs.map((_, i) => `${i + 1}-${letters[right.findIndex((r) => r.index === i)]}`);
  return { left: pairs.map((p) => p.left), right: right.map((r, i) => ({ letter: letters[i], text: r.text })), key };
}

/** Sorunun doğru cevabını okunur metne çevirir (cevap anahtarı, önizleme). */
export function answerText(question) {
  switch (question.type) {
    case 'multiple_choice': {
      const opt = question.body?.options?.find((o) => o.key === question.answer);
      return opt ? `${opt.key}) ${opt.text}` : String(question.answer ?? '—');
    }
    case 'true_false':
      return question.answer === true ? 'Doğru' : question.answer === false ? 'Yanlış' : '—';
    case 'fill_blank':
      return (question.answer ?? []).join(' / ');
    case 'matching':
      return matchingLayout(question).key.join(', ');
    case 'open_ended':
      return question.answer || 'Dereceli puanlama anahtarına bakınız.';
    default:
      return '—';
  }
}

/** Sorunun gövdesini (şıklar, eşleştirme sütunları vb.) gösterir. showAnswer: doğru cevabı vurgula. */
export function questionBody(q, { showAnswer = false, compact = false } = {}) {
  const stem = html`<p class="whitespace-pre-line ${compact ? 'text-sm' : ''}">${q.stem}</p>`;
  const context = q.context ? html`<blockquote class="mb-2 border-l-4 border-slate-300 pl-3 text-sm italic text-slate-600 dark:text-slate-400">${q.context}</blockquote>` : '';
  let body = '';
  if (q.type === 'multiple_choice') {
    body = html`<ul class="mt-2 grid gap-1 ${compact ? 'text-xs' : 'text-sm'} sm:grid-cols-2">
      ${(q.body?.options ?? []).map((o) => {
        const correct = showAnswer && o.key === q.answer;
        return html`<li class="rounded-md px-2 py-1 ${correct ? 'bg-emerald-100 font-semibold text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200' : ''}">
          <span class="font-semibold">${o.key})</span> ${o.text}
        </li>`;
      })}
    </ul>`;
  } else if (q.type === 'true_false') {
    body = html`<p class="mt-2 text-sm">( ) Doğru &nbsp;&nbsp; ( ) Yanlış
      ${showAnswer ? html` → <strong class="text-emerald-700 dark:text-emerald-400">${answerText(q)}</strong>` : ''}</p>`;
  } else if (q.type === 'matching') {
    const layout = matchingLayout(q);
    body = html`<div class="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 ${compact ? 'text-xs' : 'text-sm'}">
      <ol class="list-decimal pl-5">${layout.left.map((l) => html`<li>${l}</li>`)}</ol>
      <ul>${layout.right.map((r) => html`<li><span class="font-semibold">${r.letter})</span> ${r.text}</li>`)}</ul>
    </div>
    ${showAnswer ? html`<p class="mt-1 text-sm text-emerald-700 dark:text-emerald-400">Cevap: ${layout.key.join(', ')}</p>` : ''}`;
  } else if (showAnswer) {
    body = html`<p class="mt-2 text-sm text-emerald-700 dark:text-emerald-400"><strong>Cevap:</strong> ${answerText(q)}</p>`;
  }
  return html`${context}${stem}${body}`;
}

/** Havuz ve yazılı oluşturucuda kullanılan soru kartı başlık satırı. */
export function questionMeta(q, lookup, usageEntries) {
  const theme = lookup?.themes?.[q.themeId];
  return html`<div class="flex flex-wrap items-center gap-1.5">
    ${typeBadge(q.type)} ${difficultyBadge(q.difficulty)} ${bloomBadge(q.bloom)}
    ${q.status !== 'active' ? statusBadge(q.status) : ''}
    ${usageBadge(usageEntries)}
    ${theme ? html`<span class="muted text-xs">· ${truncate(theme.name, 40)}</span>` : ''}
  </div>`;
}

export function selectOptions(entries, selected, placeholder) {
  return html`${placeholder !== undefined ? html`<option value="">${placeholder}</option>` : ''}
    ${entries.map(([value, label]) => html`<option value="${value}" ${String(value) === String(selected ?? '') ? 'selected' : ''}>${label}</option>`)}`;
}
