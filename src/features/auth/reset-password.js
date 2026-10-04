// E-postadaki şifre yenileme bağlantısından gelen kullanıcı yeni şifresini belirler
import { html, setHtml, $ } from '../../lib/html.js';
import { updatePassword, getUser, homeFor } from '../../core/session.js';
import { navigate } from '../../core/router.js';
import { toast } from '../../ui/toast.js';

export function render(root) {
  setHtml(
    root,
    html`<div class="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
      <form class="card grid w-full max-w-sm gap-3 p-8" id="pw-form">
        <h1 class="text-xl font-bold">Yeni şifre belirleyin</h1>
        <div><label class="label" for="pw1">Yeni şifre</label><input id="pw1" type="password" class="input" minlength="8" required autocomplete="new-password" /></div>
        <div><label class="label" for="pw2">Yeni şifre (tekrar)</label><input id="pw2" type="password" class="input" minlength="8" required autocomplete="new-password" /></div>
        <p id="pw-err" class="hidden text-sm text-rose-600"></p>
        <button class="btn-primary" type="submit">Şifreyi kaydet</button>
      </form>
    </div>`,
  );
  const form = $('#pw-form', root);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#pw-err', root);
    if ($('#pw1', root).value !== $('#pw2', root).value) {
      err.textContent = 'Şifreler aynı değil.';
      return err.classList.remove('hidden');
    }
    try {
      await updatePassword($('#pw1', root).value);
      toast('Şifreniz güncellendi.', 'success');
      navigate(homeFor(getUser()));
    } catch (ex) {
      err.textContent = ex.message;
      err.classList.remove('hidden');
    }
  });
}
