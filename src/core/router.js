// Basit hash tabanlı yönlendirici (#/ogretmen/havuz gibi). Vercel'de ek yönlendirme ayarı gerektirmez.

const routes = [];
let cleanup = null;

/** pattern: '/ogretmen/sinav/:id' */
export function route(pattern, options) {
  const keys = [];
  const regex = new RegExp(
    `^${pattern.replace(/\//g, '\\/').replace(/:(\w+)/g, (_, key) => (keys.push(key), '([^/]+)'))}$`,
  );
  routes.push({ regex, keys, ...options });
}

export function navigate(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

let ctx = {};
export function startRouter(context) {
  ctx = context;
  window.addEventListener('hashchange', render);
  render();
}

export async function render() {
  const path = location.hash.replace(/^#/, '') || '/';
  const [pathname, query = ''] = path.split('?');
  for (const r of routes) {
    const match = pathname.match(r.regex);
    if (!match) continue;
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(match[i + 1])]));
    const guard = r.guard?.(ctx);
    if (guard) return navigate(guard);
    if (typeof cleanup === 'function') cleanup();
    cleanup = null;
    cleanup = await ctx.renderPage(r, { params, query: new URLSearchParams(query) });
    window.scrollTo({ top: 0 });
    return;
  }
  navigate(ctx.fallback());
}
