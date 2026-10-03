import { html, setHtml } from '../../lib/html.js';
import { api } from '../../services/index.js';

export async function render(root) {
  const [classes, lookup] = await Promise.all([api.classes.listMine(), api.curriculum.lookup()]);
  setHtml(
    root,
    html`<h1 class="page-title">Sınıflarım</h1>
      <p class="muted mt-1">Öğrenciler, sınıf koduyla kayıt olup sınıfınıza katılır.</p>
      <div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        ${classes.map(
          (c) => html`<div class="card p-5">
            <p class="text-lg font-bold">${c.name}</p>
            <p class="muted text-sm">${c.grade}. sınıf · ${lookup.subjects[c.subjectId]?.name ?? ''}</p>
            <div class="mt-4 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
              <span class="text-xs font-semibold uppercase text-slate-500">Sınıf kodu</span>
              <span class="font-mono text-lg font-bold tracking-widest text-indigo-600">${c.joinCode}</span>
            </div>
            <p class="muted mt-3 text-sm">${c.studentIds.length} öğrenci</p>
          </div>`,
        )}
      </div>
      <p class="muted mt-6 text-xs">Sınıf oluşturma ve öğrenci yönetimi Supabase bağlantısıyla (Adım 3) etkinleşecek.</p>`,
  );
}
