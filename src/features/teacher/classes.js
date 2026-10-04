import { html, setHtml, $, onAction } from '../../lib/html.js';
import { api } from '../../services/index.js';
import { openModal, confirmDialog } from '../../ui/modal.js';
import { toast } from '../../ui/toast.js';
import { emptyState, selectOptions } from '../../ui/components.js';

export async function render(root) {
  async function paint() {
    const [classes, lookup, subjects] = await Promise.all([api.classes.listMine(), api.curriculum.lookup(), api.curriculum.subjects()]);
    setHtml(
      root,
      html`<div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 class="page-title">Sınıflarım</h1>
            <p class="muted mt-1">Öğrenciler kayıt olduktan sonra panellerindeki "Sınıfa katıl" alanına sınıf kodunu yazarak katılır.</p>
          </div>
          <button class="btn-primary" data-action="new" ${subjects.length ? '' : 'disabled'}>+ Yeni sınıf</button>
        </div>
        ${subjects.length ? '' : html`<p class="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">Sınıf oluşturmak için önce yöneticinin müfredatı içe aktarması gerekir.</p>`}
        <div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          ${classes.length
            ? classes.map((c) => html`<div class="card p-5">
                <div class="flex items-start justify-between gap-2">
                  <div><p class="text-lg font-bold">${c.name}</p>
                    <p class="muted text-sm">${c.grade ? `${c.grade}. sınıf · ` : ''}${lookup.subjects[c.subjectId]?.name ?? ''}</p></div>
                  <button class="btn-ghost btn-sm text-rose-600" data-action="delete" data-id="${c.id}" aria-label="Sınıfı sil">🗑</button>
                </div>
                <div class="mt-4 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
                  <span class="text-xs font-semibold uppercase text-slate-500">Sınıf kodu</span>
                  <button class="font-mono text-lg font-bold tracking-widest text-indigo-600" data-action="copy" data-code="${c.joinCode}" title="Kopyala">${c.joinCode}</button>
                </div>
                <button class="btn-ghost btn-sm mt-3 w-full" data-action="students" data-id="${c.id}" data-name="${c.name}">👥 ${c.studentIds.length} öğrenci — listeyi gör</button>
              </div>`)
            : html`<div class="sm:col-span-2 lg:col-span-3">${emptyState('Henüz sınıfınız yok', 'İlk sınıfınızı oluşturun ve sınıf kodunu öğrencilerinizle paylaşın.')}</div>`}
        </div>`,
    );
    return subjects;
  }

  let subjects = await paint();
  const off = onAction(root, {
    new: async () => {
      let values = null;
      const res = await openModal({
        title: 'Yeni sınıf',
        size: 'sm',
        body: html`<div class="grid gap-3">
          <div><label class="label" for="nc-name">Sınıf adı</label><input id="nc-name" class="input" placeholder="Örn. 6-A Matematik" maxlength="80" /></div>
          <div><label class="label" for="nc-subject">Ders</label><select id="nc-subject" class="input">${selectOptions(subjects.map((s) => [s.id, `${s.gradeId}. sınıf ${s.name}`]), '', 'Seçiniz')}</select></div>
          <p id="nc-err" class="hidden text-sm text-rose-600">Sınıf adı ve ders zorunludur.</p></div>`,
        actions: [
          { label: 'Vazgeç', value: null },
          { label: 'Oluştur', value: 'ok', className: 'btn-primary', validate: (d) => {
            const name = $('#nc-name', d).value.trim();
            const subjectId = $('#nc-subject', d).value;
            $('#nc-err', d).classList.toggle('hidden', Boolean(name && subjectId));
            if (!name || !subjectId) return false;
            values = { name, subjectId, grade: subjects.find((s) => s.id === subjectId)?.gradeId ?? null };
            return true;
          } },
        ],
        onMount: (d) => $('#nc-name', d).focus(),
      });
      if (res !== 'ok') return;
      try {
        const c = await api.classes.create(values);
        toast(`Sınıf oluşturuldu. Sınıf kodu: ${c.joinCode}`, 'success', 6000);
        subjects = await paint();
      } catch (err) {
        toast(err.message, 'error');
      }
    },
    copy: async (el) => {
      try {
        await navigator.clipboard.writeText(el.dataset.code);
        toast('Sınıf kodu kopyalandı.', 'success');
      } catch {
        toast(`Sınıf kodu: ${el.dataset.code}`, 'info');
      }
    },
    students: async (el) => {
      const list = await api.classes.students(el.dataset.id);
      const choice = await openModal({
        title: `${el.dataset.name} — öğrenciler`,
        size: 'sm',
        body: list.length
          ? html`<ul class="divide-y divide-slate-100 text-sm dark:divide-slate-800">${list.map((s) => html`<li class="flex items-center justify-between py-2">
              <span>${s.fullName}</span><button type="button" class="btn-ghost btn-sm text-rose-600" data-remove="${s.id}">Çıkar</button></li>`)}</ul>`
          : html`<p class="muted text-sm">Bu sınıfa henüz katılan öğrenci yok.</p>`,
        actions: [{ label: 'Kapat', value: null }],
        onMount: (d, close) => d.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => close(b.dataset.remove))),
      });
      if (choice && (await confirmDialog({ title: 'Öğrenciyi çıkar', message: 'Öğrenci bu sınıftan çıkarılacak.', confirmLabel: 'Çıkar', tone: 'danger' }))) {
        await api.classes.removeStudent(el.dataset.id, choice);
        toast('Öğrenci sınıftan çıkarıldı.', 'success');
        subjects = await paint();
      }
    },
    delete: async (el) => {
      if (!(await confirmDialog({ title: 'Sınıfı sil', message: 'Sınıf ve öğrenci üyelikleri silinecek. Sorular ve sınavlar etkilenmez.', confirmLabel: 'Sil', tone: 'danger' }))) return;
      try {
        await api.classes.remove(el.dataset.id);
        toast('Sınıf silindi.', 'success');
        subjects = await paint();
      } catch (err) {
        toast(err.message, 'error');
      }
    },
  });
  return off;
}
