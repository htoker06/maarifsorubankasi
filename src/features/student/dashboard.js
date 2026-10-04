import { html, setHtml, $, onAction } from '../../lib/html.js';
import { api } from '../../services/index.js';
import { toast } from '../../ui/toast.js';

export async function render(root, { user }) {
  async function paint() {
    const [joined, lookup] = await Promise.all([api.classes.listJoined(), api.curriculum.lookup()]);
    setHtml(
      root,
      html`<h1 class="page-title">Merhaba, ${user.fullName.split(' ')[0]} 👋</h1>
        <p class="muted mt-1">${user.grade ? `${user.grade}. sınıf · ` : ''}${user.schoolName ?? ''}</p>

        <section class="mt-6 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <form class="card p-5" id="join-form">
            <h2 class="font-bold">Sınıfa katıl</h2>
            <p class="muted mt-1 text-sm">Öğretmeninin verdiği 6 karakterlik sınıf kodunu yaz.</p>
            <div class="mt-3 flex gap-2">
              <input id="join-code" class="input font-mono uppercase tracking-widest" maxlength="6" placeholder="ABC123" autocomplete="off" aria-label="Sınıf kodu" />
              <button class="btn-primary shrink-0" type="submit">Katıl</button>
            </div>
          </form>
          <div class="card p-5">
            <h2 class="font-bold">Sınıflarım</h2>
            ${joined.length
              ? html`<ul class="mt-2 divide-y divide-slate-100 text-sm dark:divide-slate-800">${joined.map((c) => html`<li class="py-2"><span class="font-medium">${c.name}</span>
                  <span class="muted"> · ${lookup.subjects[c.subjectId]?.name ?? ''}</span></li>`)}</ul>`
              : html`<p class="muted mt-2 text-sm">Henüz bir sınıfa katılmadın.</p>`}
          </div>
        </section>

        <div class="mt-6 grid gap-4 md:grid-cols-2">
          <a href="#/ogrenci/testler" class="card p-6 transition hover:shadow-md">
            <p class="text-3xl">📝</p><p class="mt-2 font-bold">Testlerim</p>
            <p class="muted text-sm">Öğretmeninin atadığı online testleri çöz.</p>
          </a>
          <a href="#/ogrenci/karne" class="card p-6 transition hover:shadow-md">
            <p class="text-3xl">📊</p><p class="mt-2 font-bold">Kazanım Karnem</p>
            <p class="muted text-sm">Hangi konularda güçlü, hangilerinde eksik olduğunu gör.</p>
          </a>
        </div>
        <p class="muted mt-6 text-xs">Online test ve karne ekranları Adım 4'te tamamlanacak.</p>`,
    );
    $('#join-form', root).addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = $('#join-code', root).value.trim();
      if (code.length !== 6) return toast('Sınıf kodu 6 karakter olmalı.', 'warning');
      try {
        const c = await api.classes.join(code);
        toast(`"${c.name}" sınıfına katıldın.`, 'success');
        paint();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }
  await paint();
  return onAction(root, {});
}
