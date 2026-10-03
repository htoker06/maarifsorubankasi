import { html, setHtml } from '../lib/html.js';

const STYLES = {
  success: 'bg-emerald-600',
  error: 'bg-rose-600',
  info: 'bg-slate-800',
  warning: 'bg-amber-500',
};

export function toast(message, type = 'info', ms = 3500) {
  const container = document.getElementById('toasts');
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  el.className = `pointer-events-auto max-w-md rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-lg ${STYLES[type] ?? STYLES.info}`;
  setHtml(el, html`${message}`);
  container.append(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, ms);
}
