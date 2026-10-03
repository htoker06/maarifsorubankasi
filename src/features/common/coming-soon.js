import { html, setHtml } from '../../lib/html.js';

export function render(root, { meta }) {
  setHtml(
    root,
    html`<h1 class="page-title">${meta.title}</h1>
      <div class="card mt-6 flex flex-col items-center gap-3 px-6 py-14 text-center">
        <div class="text-4xl">🚧</div>
        <p class="font-semibold">Bu bölüm Adım ${meta.step}'te tamamlanacak</p>
        <p class="muted max-w-lg">${meta.text}</p>
      </div>`,
  );
}
