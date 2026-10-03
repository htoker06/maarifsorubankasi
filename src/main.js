import './styles/main.css';
import { route, startRouter } from './core/router.js';
import { getUser, homeFor, restoreSession } from './core/session.js';
import { renderLogin } from './features/auth/login.js';
import { renderShell } from './features/layout/shell.js';
import { html, setHtml } from './lib/html.js';

const app = document.getElementById('app');

const teacherOnly = () => (!getUser() ? '#/giris' : getUser().role !== 'teacher' ? homeFor(getUser()) : null);
const adminOnly = () => (!getUser() ? '#/giris' : getUser().role !== 'admin' ? homeFor(getUser()) : null);
const studentOnly = () => (!getUser() ? '#/giris' : getUser().role !== 'student' ? homeFor(getUser()) : null);

// Sayfa modülleri ihtiyaç anında yüklenir (ilk açılış hızlı olur).
route('/giris', { public: true, guard: () => (getUser() ? homeFor(getUser()) : null), page: async () => ({ render: renderLogin }) });
route('/', { guard: () => (getUser() ? homeFor(getUser()) : '#/giris') });

route('/ogretmen', { guard: teacherOnly, page: () => import('./features/teacher/dashboard.js') });
route('/ogretmen/havuz', { guard: teacherOnly, page: () => import('./features/bank/bank.js') });
route('/ogretmen/uret', { guard: teacherOnly, page: () => import('./features/generator/generator.js') });
route('/ogretmen/sinavlar', { guard: teacherOnly, page: () => import('./features/exam-builder/exam-list.js') });
route('/ogretmen/sinav/:id', { guard: teacherOnly, page: () => import('./features/exam-builder/builder.js') });
route('/ogretmen/siniflar', { guard: teacherOnly, page: () => import('./features/teacher/classes.js') });
route('/ogretmen/analiz', { guard: teacherOnly, page: () => import('./features/common/coming-soon.js'), meta: { title: 'Kazanım Analizi', step: 4, text: 'Sınıf ısı haritası (öğrenci × kazanım), tema radar grafiği ve madde analizi (soru başına doğru yüzdesi) Chart.js ile burada yer alacak.' } });
route('/ogretmen/bildirimler', { guard: teacherOnly, page: () => import('./features/common/coming-soon.js'), meta: { title: 'Hatalı Soru Bildirimleri', step: 4, text: 'Öğrenci ve öğretmenlerden gelen hatalı soru bildirimleri, karantinaya alınan sorular ve revizyon akışı burada yönetilecek.' } });

route('/yonetici', { guard: adminOnly, page: () => import('./features/admin/teacher-requests.js') });
route('/yonetici/mufredat', { guard: adminOnly, page: () => import('./features/curriculum/curriculum-page.js') });

route('/ogrenci', { guard: studentOnly, page: () => import('./features/student/dashboard.js') });
route('/ogrenci/testler', { guard: studentOnly, page: () => import('./features/common/coming-soon.js'), meta: { title: 'Testlerim', step: 4, text: 'Öğretmeninizin atadığı online testler; süre tutucu, soru paleti, boş bırakma ve anında sonuç ekranıyla burada çözülecek.' } });
route('/ogrenci/karne', { guard: studentOnly, page: () => import('./features/common/coming-soon.js'), meta: { title: 'Kazanım Karnem', step: 4, text: 'Hangi tema ve kazanımda eksiğiniz olduğunu gösteren grafikler burada yer alacak.' } });

async function renderPage(r, ctx) {
  try {
    const mod = await r.page();
    if (r.public) return mod.render(app, ctx);
    const pageEl = renderShell(app, getUser());
    return await mod.render(pageEl, { ...ctx, user: getUser(), meta: r.meta });
  } catch (err) {
    console.error(err);
    setHtml(app, html`<div class="p-8"><div class="card p-6"><h1 class="font-bold text-rose-600">Bir hata oluştu</h1><p class="muted mt-2">${err.message}</p><a class="btn-secondary mt-4" href="#/">Ana sayfaya dön</a></div></div>`);
    return null;
  }
}

await restoreSession();
startRouter({ renderPage, fallback: () => (getUser() ? homeFor(getUser()) : '#/giris') });
