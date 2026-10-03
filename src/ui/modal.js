import { html, setHtml } from '../lib/html.js';

const SIZES = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };

/**
 * Modal pencere açar. Bir düğmeye basılınca o düğmenin `value` değeriyle çözülen bir Promise döner.
 * Kapatılırsa (Esc / ✕) null döner.
 * onMount(el, close) form alanlarını bağlamak için; düğmenin `validate` fonksiyonu false dönerse pencere kapanmaz.
 */
export function openModal({ title, body, actions = [], size = 'md', tone = 'default', onMount }) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = `m-auto w-[calc(100%-2rem)] ${SIZES[size]} rounded-2xl border-0 bg-white p-0 text-slate-800 shadow-2xl dark:bg-slate-900 dark:text-slate-100`;
    const toneBar = { danger: 'bg-rose-500', warning: 'bg-amber-500', default: 'bg-indigo-500' }[tone];
    setHtml(
      dialog,
      html`
        <div class="h-1.5 rounded-t-2xl ${toneBar}"></div>
        <form method="dialog" class="flex max-h-[85vh] flex-col">
          <header class="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <h2 class="text-base font-bold">${title}</h2>
            <button type="button" class="btn-icon btn-ghost -m-1" data-close aria-label="Kapat">✕</button>
          </header>
          <div class="modal-body overflow-y-auto px-5 py-4">${body}</div>
          ${actions.length
            ? html`<footer class="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">
                ${actions.map(
                  (a, i) => html`<button type="button" class="${a.className ?? 'btn-secondary'}" data-index="${i}">${a.label}</button>`,
                )}
              </footer>`
            : ''}
        </form>`,
    );
    document.body.append(dialog);

    let settled = false;
    const close = (value) => {
      if (settled) return;
      settled = true;
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    dialog.addEventListener('cancel', (e) => (e.preventDefault(), close(null)));
    dialog.querySelector('[data-close]').addEventListener('click', () => close(null));
    dialog.querySelectorAll('footer [data-index]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const action = actions[Number(btn.dataset.index)];
        if (action.validate && (await action.validate(dialog)) === false) return;
        close(action.value);
      }),
    );
    dialog.querySelector('form').addEventListener('submit', (e) => e.preventDefault());
    dialog.showModal();
    onMount?.(dialog, close);
  });
}

export async function confirmDialog({ title, message, confirmLabel = 'Onayla', tone = 'default' }) {
  const result = await openModal({
    title,
    size: 'sm',
    tone,
    body: html`<p class="text-sm leading-relaxed">${message}</p>`,
    actions: [
      { label: 'Vazgeç', value: false },
      { label: confirmLabel, value: true, className: tone === 'danger' ? 'btn-danger' : 'btn-primary' },
    ],
  });
  return result === true;
}
