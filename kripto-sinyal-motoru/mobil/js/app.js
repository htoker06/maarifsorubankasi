// Mobil arayüz.

import { defaultConfig, mergeConfig } from './engine/config.js';
import { analyzeOne, runScan } from './scanner.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fin = (x) => typeof x === 'number' && Number.isFinite(x);

// ------------------------------------------------------------------ depolama (yalnızca bu cihaz)
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* özel sekme vb. */ }
  },
};

const DEFAULT_SETTINGS = { minScore: 85, minVolM: 5, ignoreLock: false, strictData: true, requireAth: true };
let settings = { ...DEFAULT_SETTINGS, ...store.get('settings', {}) };

function buildConfig() {
  return mergeConfig(defaultConfig(), {
    scoring: { min_score: settings.minScore },
    liquidity: { min_quote_volume_24h: settings.minVolM * 1e6 },
    manipulation: { strict_missing_data: settings.strictData },
    setup: { require_ath_drawdown: settings.requireAth },
  });
}

// ------------------------------------------------------------------ biçimlendirme
function fmtPrice(p) {
  if (!fin(p)) return '—';
  const mag = p === 0 ? 0 : Math.floor(Math.log10(Math.abs(p)));
  const digits = Math.max(2, Math.min(10, 5 - mag));
  return p.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: digits });
}
const num = (x, d) => x.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtPct = (x, d = 1, sign = false) => {
  if (!fin(x)) return '—';
  const v = Math.abs(x * 100);
  const s = Number(v.toFixed(d)) === 0 ? '' : x < 0 ? '−' : sign ? '+' : '';
  return `${s}%${num(v, d)}`;
};
const fmtUsd = (x) => (fin(x) ? (x >= 1e9 ? `${num(x / 1e9, 2)} milyar $` : x >= 1e6 ? `${num(x / 1e6, 1)} milyon $` : `${Math.round(x / 1e3)} bin $`) : '—');
const fmtTime = (t) => new Date(t).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const scoreClass = (s, min) => (s >= min ? 'good' : s >= min - 10 ? 'mid' : 'bad');

// ------------------------------------------------------------------ makro kartı
function renderMacro(m) {
  const el = $('macroCard');
  el.classList.remove('empty');
  const cls = m.regime === 'GÜVENLİ' ? 'good' : m.regime === 'NÖTR' ? 'mid' : 'bad';
  const slope = (x) => (fin(x) ? `${x >= 0 ? '↑' : '↓'} ${fmtPct(x, 2, true)}` : '—');
  el.innerHTML = `
    <div class="macro-head">
      <h3>Piyasa Rejimi</h3>
      <span class="regime ${cls}">${esc(m.regime)} · ${Math.round(m.score)}/100</span>
    </div>
    <div class="kv">
      <div><div class="k">BTC</div><div class="v num">${fmtPrice(m.btc_close)}</div></div>
      <div><div class="k">BTC / SMA200</div><div class="v num">${fin(m.btc_sma_slow) ? fmtPct(m.btc_close / m.btc_sma_slow - 1, 1, true) : '—'}</div></div>
      <div><div class="k">BTC dominansı (eğim)</div><div class="v num">${slope(m.btc_dom_slope)}</div></div>
      <div><div class="k">USDT dominansı (eğim)</div><div class="v num">${slope(m.usdt_dom_slope)}</div></div>
      <div><div class="k">Altcoin piyasası TOTAL3</div><div class="v num">${slope(m.total3_slope)}</div></div>
      <div><div class="k">Piyasa 24 saat</div><div class="v num">${fmtPct(m.total3_change_24h, 2, true)}</div></div>
    </div>
    ${m.locked ? '<div class="lock">🔒 Sistem kilitli: piyasa riskli olduğu için alım sinyali üretilmiyor.</div>' : ''}
    ${m.notes?.length ? `<ul class="notes">${m.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}`;
}

// ------------------------------------------------------------------ sinyal kartı
function planHtml(p) {
  if (!p) return '';
  const rows = [
    ['Alım bölgesi', `${fmtPrice(p.buy_zone[0])} – ${fmtPrice(p.buy_zone[1])}`],
    ...p.tranches.map(([px, w], i) => [`${i + 1}. kademe (%${Math.round(w * 100)})`, fmtPrice(px)]),
    ['Ortalama giriş', fmtPrice(p.avg_entry)],
  ];
  return `<div class="plan">
    <h4>İşlem Planı</h4>
    ${rows.map(([k, v]) => `<div class="plan-row"><span class="k">${esc(k)}</span><span class="v num">${v}</span></div>`).join('')}
    <div class="plan-row stop"><span class="k">Stop-Loss</span><span class="v num">${fmtPrice(p.stop)} (${fmtPct(-p.risk_pct, 1)})</span></div>
    ${p.targets.map(([l, px, r]) => `<div class="plan-row target"><span class="k">🎯 ${esc(l)}</span><span class="v num">${fmtPrice(px)} · ${r.toFixed(1)}R</span></div>`).join('')}
  </div>`;
}

function gatesHtml(gates) {
  return `<ul class="gates">${gates.map((g) => `
    <li class="${g.passed ? 'ok' : 'no'}"><span class="ic">${g.passed ? '✓' : '✗'}</span><span>${esc(g.name)}</span>
    ${g.detail ? `<span class="d">${esc(g.detail)}</span>` : ''}</li>`).join('')}</ul>`;
}

function signalCard(s, minScore, { open = false } = {}) {
  const trap = s.manipulation ? fmtPct(s.manipulation.trap_risk, 0) : '—';
  const liq = s.liquidity ? `±%2 ${fmtUsd(Math.min(s.liquidity.bid_depth_usd, s.liquidity.ask_depth_usd))}` : fmtUsd(s.quote_volume_24h);
  const failed = s.gates.filter((g) => !g.passed);
  const notes = s.manipulation?.notes?.length ? `<ul class="notes">${s.manipulation.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '';
  const pair = s.symbol.replace('/', '_');
  return `<article class="card sig">
    <div class="sig-head">
      <div class="score ${scoreClass(s.score, minScore)} num">${fin(s.score) ? s.score.toFixed(0) : '—'}</div>
      <div class="sig-title">
        <h3>${esc(s.symbol)}</h3>
        <div class="pattern">${esc(s.pattern_label)}</div>
      </div>
    </div>
    <div class="metrics">
      <div class="metric"><div class="k">Fiyat</div><div class="v num">${fmtPrice(s.price)}</div></div>
      <div class="metric"><div class="k">MA200 mesafe</div><div class="v num">${fmtPct(s.ma200_distance, 1, true)}</div></div>
      <div class="metric"><div class="k">Hacim</div><div class="v num">${fin(s.volume_mult) ? s.volume_mult.toFixed(1) + 'x' : '—'}</div></div>
      <div class="metric"><div class="k">RSI</div><div class="v num">${fin(s.rsi) ? s.rsi.toFixed(1) : '—'}</div></div>
      <div class="metric"><div class="k">Tuzak riski</div><div class="v num">${trap}</div></div>
      <div class="metric"><div class="k">Likidite</div><div class="v num">${liq}</div></div>
    </div>
    ${!s.passed && failed.length ? `<div class="chips">${failed.map((g) => `<span class="chip">${esc(g.name)}</span>`).join('')}</div>` : ''}
    ${s.passed ? planHtml(s.plan) : ''}
    <details class="more" ${open ? 'open' : ''}>
      <summary>Tüm şartlar (${s.gates.length - failed.length}/${s.gates.length} geçti)</summary>
      ${gatesHtml(s.gates)}
      ${!s.passed && s.plan ? planHtml(s.plan) : ''}
      ${notes}
      ${Object.keys(s.components || {}).length ? `<p class="muted small-text">Skor bileşenleri: ${Object.entries(s.components).map(([k, v]) => `${esc(k)} ${Math.round(v * 100)}`).join(' · ')}</p>` : ''}
    </details>
    <div class="links"><a href="https://www.binance.com/tr/trade/${encodeURIComponent(pair)}?type=spot" target="_blank" rel="noopener">Binance'te aç ↗</a>
    <a href="https://www.tradingview.com/chart/?symbol=BINANCE:${encodeURIComponent(s.symbol.replace('/', ''))}" target="_blank" rel="noopener">Grafik ↗</a></div>
  </article>`;
}

/** Kaydetmek için gereksiz büyük alanları atar. */
function slim(s) {
  return {
    symbol: s.symbol, score: s.score, price: s.price, pattern_label: s.pattern_label, ma200_distance: s.ma200_distance,
    volume_mult: s.volume_mult, rsi: s.rsi, quote_volume_24h: s.quote_volume_24h, passed: s.passed, gates: s.gates,
    components: s.components, plan: s.plan,
    liquidity: s.liquidity ? { bid_depth_usd: s.liquidity.bid_depth_usd, ask_depth_usd: s.liquidity.ask_depth_usd } : null,
    manipulation: s.manipulation ? { trap_risk: s.manipulation.trap_risk, notes: s.manipulation.notes } : null,
  };
}

function renderResults(r) {
  if (r.macro) renderMacro(r.macro);
  const min = settings.minScore;
  const title = $('signalsTitle');
  title.hidden = false;
  const meta = [`Son tarama: ${fmtTime(r.finishedAt)}`];
  if (r.scanned) meta.push(`${r.scanned} coin tarandı`);
  if (r.stageCounts?.hacim !== undefined) meta.push(`${r.stageCounts.hacim} hacim artışı, ${r.stageCounts.formasyon} formasyon adayı`);
  if (r.errors) meta.push(`${r.errors} coin alınamadı`);
  $('scanMeta').textContent = meta.join(' · ');

  if (r.macro?.locked && !r.ignoredLock) {
    title.textContent = 'Sinyaller';
    $('signals').innerHTML = `<div class="card empty-state"><div class="big-ic">🔒</div><p><b>Piyasa riskli, tarama yapılmadı.</b></p>
      <p class="muted small-text">Makro kilit açıkken alım sinyali üretilmez. Yine de adayları görmek istersen Ayarlar'dan "Makro kilidi yok say" seçeneğini aç.</p></div>`;
    $('nearWrap').hidden = true;
    return;
  }
  title.textContent = `Sinyaller (${r.signals.length})`;
  $('signals').innerHTML = r.signals.length
    ? r.signals.map((s) => signalCard(s, min)).join('')
    : `<div class="card empty-state"><div class="big-ic">🧘</div><p><b>Bugün tüm şartları geçen coin yok.</b></p>
       <p class="muted small-text">Bu normaldir: motor yanlış sinyali önlemek için çok seçici. Aşağıda en çok yaklaşanları görebilirsin.</p></div>`;
  const near = r.candidates.filter((s) => !s.passed).slice(0, 15);
  $('nearWrap').hidden = !near.length;
  $('nearCount').textContent = near.length;
  $('near').innerHTML = near.map((s) => signalCard(s, min)).join('');
}

// ------------------------------------------------------------------ tarama
let controller = null;

async function startScan() {
  const btn = $('scanBtn');
  btn.disabled = true;
  $('scanError').hidden = true;
  $('progress').hidden = false;
  $('progressFill').style.width = '2%';
  controller = new AbortController();
  const weights = { makro: [0, 10], hacim: [10, 45], formasyon: [55, 25], kalkan: [80, 20] };
  try {
    const r = await runScan(buildConfig(), {
      signal: controller.signal,
      ignoreLock: settings.ignoreLock,
      onProgress: ({ stage, done, total, text }) => {
        const [from, span] = weights[stage] || [0, 100];
        $('progressFill').style.width = `${from + (total ? (span * done) / total : 0)}%`;
        $('progressText').textContent = text;
      },
    });
    r.ignoredLock = settings.ignoreLock;
    const saved = { ...r, signals: r.signals.map(slim), candidates: r.candidates.slice(0, 20).map(slim) };
    store.set('lastScan', saved);
    renderResults(saved);
    if (r.signals.length && 'vibrate' in navigator) navigator.vibrate(120);
  } catch (e) {
    if (e.name !== 'AbortError') showError('scanError', e);
  } finally {
    btn.disabled = false;
    $('progress').hidden = true;
    controller = null;
  }
}

function showError(id, e) {
  console.error(e);
  const el = $(id);
  const net = e instanceof TypeError || /fetch|network|Failed/i.test(String(e.message));
  el.innerHTML = net
    ? `<b>Binance'e bağlanılamadı.</b><br>İnternet bağlantını kontrol et. Mobil veri yerine Wi-Fi (ya da tersi) dene. Sorun sürerse Binance bulunduğun ağı engelliyor olabilir.`
    : `<b>Hata:</b> ${esc(e.message || e)}`;
  el.hidden = false;
}

// ------------------------------------------------------------------ coin incele
async function inspectCoin(ev) {
  ev.preventDefault();
  const value = $('coinInput').value;
  if (!value.trim()) return;
  $('coinError').hidden = true;
  $('coinResult').innerHTML = '<div class="card muted">Analiz ediliyor… (emir defteri 3 kez okunuyor, ~10 sn)</div>';
  try {
    const cached = store.get('lastScan', null);
    const fresh = cached?.macro && Date.now() - cached.finishedAt < 30 * 60_000 ? cached.macro : null;
    const { macro, signal } = await analyzeOne(buildConfig(), value, { macro: fresh });
    if (!cached) renderMacro(macro);
    $('coinResult').innerHTML = signalCard(signal, settings.minScore, { open: true });
  } catch (e) {
    $('coinResult').innerHTML = '';
    if (e.status === 400) {
      $('coinError').innerHTML = `<b>"${esc(value)}" Binance'te USDT paritesi olarak bulunamadı.</b>`;
      $('coinError').hidden = false;
    } else showError('coinError', e);
  }
}

// ------------------------------------------------------------------ ayarlar
function bindSettings() {
  const sync = () => {
    $('minScore').value = settings.minScore;
    $('minScoreVal').textContent = settings.minScore;
    $('minVol').value = settings.minVolM;
    $('ignoreLock').checked = settings.ignoreLock;
    $('strictData').checked = settings.strictData;
    $('requireAth').checked = settings.requireAth;
  };
  const save = () => store.set('settings', settings);
  $('minScore').addEventListener('input', (e) => { settings.minScore = +e.target.value; $('minScoreVal').textContent = settings.minScore; save(); });
  $('minVol').addEventListener('change', (e) => { settings.minVolM = Math.max(1, +e.target.value || 5); save(); sync(); });
  for (const key of ['ignoreLock', 'strictData', 'requireAth']) {
    $(key).addEventListener('change', (e) => { settings[key] = e.target.checked; save(); });
  }
  $('resetSettings').addEventListener('click', () => { settings = { ...DEFAULT_SETTINGS }; save(); sync(); });
  sync();
}

// ------------------------------------------------------------------ sekmeler ve kurulum
function bindTabs() {
  document.querySelectorAll('.tabbar button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.tabbar button').forEach((x) => x.classList.toggle('active', x === b));
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === `tab-${b.dataset.tab}`));
    window.scrollTo({ top: 0 });
  }));
}

function bindInstall() {
  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    $('installBtn').hidden = false;
  });
  $('installBtn').addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    $('installBtn').hidden = true;
  });
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (ios && !standalone && !store.get('iosHintSeen', false)) $('iosHint').hidden = false;
  $('iosHintClose').addEventListener('click', () => { $('iosHint').hidden = true; store.set('iosHintSeen', true); });
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

bindTabs();
bindSettings();
bindInstall();
$('scanBtn').addEventListener('click', startScan);
$('cancelBtn').addEventListener('click', () => controller?.abort());
$('coinForm').addEventListener('submit', inspectCoin);
const last = store.get('lastScan', null);
if (last?.finishedAt) renderResults(last);
