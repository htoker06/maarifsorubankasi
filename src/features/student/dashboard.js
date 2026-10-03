import { html, setHtml } from '../../lib/html.js';

export function render(root, { user }) {
  setHtml(
    root,
    html`<h1 class="page-title">Merhaba, ${user.fullName.split(' ')[0]} 👋</h1>
      <p class="muted mt-1">${user.grade}. sınıf · ${user.schoolName}</p>
      <div class="mt-6 grid gap-4 md:grid-cols-2">
        <a href="#/ogrenci/testler" class="card p-6 transition hover:shadow-md">
          <p class="text-3xl">📝</p>
          <p class="mt-2 font-bold">Testlerim</p>
          <p class="muted text-sm">Öğretmeninin atadığı online testleri çöz.</p>
        </a>
        <a href="#/ogrenci/karne" class="card p-6 transition hover:shadow-md">
          <p class="text-3xl">📊</p>
          <p class="mt-2 font-bold">Kazanım Karnem</p>
          <p class="muted text-sm">Hangi konularda güçlü, hangilerinde eksik olduğunu gör.</p>
        </a>
      </div>
      <p class="muted mt-6 text-xs">Online test ve karne ekranları Adım 4'te tamamlanacak.</p>`,
  );
}
