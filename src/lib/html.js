// Güvenli HTML şablonu: araya eklenen her değer otomatik olarak kaçışlanır (XSS koruması).
// Zaten güvenli olan HTML parçaları raw() ile ya da başka bir html`` çağrısının sonucu olarak eklenir.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

class SafeHtml {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

export const raw = (value) => new SafeHtml(String(value));

function renderValue(value) {
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(renderValue).join('');
  if (value === false || value === null || value === undefined) return '';
  return escapeHtml(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((value, i) => {
    out += renderValue(value) + strings[i + 1];
  });
  return new SafeHtml(out);
}

export function setHtml(el, content) {
  el.innerHTML = String(content);
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/** data-action="..." özniteliğine sahip öğelerdeki tıklamaları tek dinleyiciyle yönetir. */
export function onAction(root, handlers) {
  const listener = (event) => {
    const target = event.target.closest('[data-action]');
    if (!target || !root.contains(target)) return;
    const handler = handlers[target.dataset.action];
    if (handler) {
      event.preventDefault();
      handler(target, event);
    }
  };
  root.addEventListener('click', listener);
  return () => root.removeEventListener('click', listener);
}
