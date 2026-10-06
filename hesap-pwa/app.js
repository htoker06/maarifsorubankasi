'use strict';

/* =========================================================================
   Hesap Makinesi + gizli sohbet
   - Görünüm: gerçek çalışan hesap makinesi
   - Gizli açılış kodunu yazıp "=" basınca sohbet açılır
   - Mesajlar yalnızca bu cihazda, koddan türetilen anahtarla AES-GCM ile şifreli
   - Uygulamadan çıkınca / arka plana atınca otomatik kilitlenir (hesap makinesine döner)
   ========================================================================= */

const CFG_KEY = 'hc.cfg';
const MSG_KEY = 'hc.msgs';
const DEFAULT_CODE = '1+3+5';

const $ = (id) => document.getElementById(id);

/* ---------- küçük yardımcılar ---------- */
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = {
  enc: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))),
  dec: (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0)),
};

async function sha256hex(str) {
  const h = await crypto.subtle.digest('SHA-256', enc.encode(str));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ---------- yapılandırma ---------- */
function loadCfg() {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return null;
}
function saveCfg(cfg) {
  try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (_) {}
}
async function ensureCfg() {
  let cfg = loadCfg();
  if (!cfg) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    cfg = {
      codeHash: await sha256hex(DEFAULT_CODE),
      salt: b64.enc(salt),
      name: 'Kişi',
    };
    saveCfg(cfg);
  }
  return cfg;
}

/* ---------- şifreleme ---------- */
let cryptoKey = null; // yalnızca sohbet açıkken bellekte tutulur

async function deriveKey(code, saltB64) {
  const baseKey = await crypto.subtle.importKey(
    'raw', enc.encode(code), { name: 'PBKDF2' }, false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: b64.dec(saltB64), iterations: 150000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptObj(obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, cryptoKey, enc.encode(JSON.stringify(obj))
  );
  return { iv: b64.enc(iv), ct: b64.enc(ct) };
}
async function decryptObj(rec) {
  try {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64.dec(rec.iv) }, cryptoKey, b64.dec(rec.ct)
    );
    return JSON.parse(dec.decode(pt));
  } catch (_) { return null; }
}

function loadRawMsgs() {
  try { return JSON.parse(localStorage.getItem(MSG_KEY) || '[]'); } catch (_) { return []; }
}
function saveRawMsgs(arr) {
  try { localStorage.setItem(MSG_KEY, JSON.stringify(arr)); } catch (_) {}
}

/* =========================================================================
   HESAP MAKİNESİ
   ========================================================================= */
let expr = '';
const calcResult = $('calcResult');
const calcHistory = $('calcHistory');

function renderCalc(resultOverride) {
  calcHistory.textContent = expr;
  calcResult.textContent = resultOverride != null ? resultOverride : (prettyLast() || '0');
}
function prettyLast() {
  // ekranda son sayıyı/ifadeyi göster
  return expr === '' ? '' : expr;
}

function safeEval(e) {
  // yalnızca izin verilen karakterler
  if (!/^[0-9+\-*/().%\s]*$/.test(e)) return null;
  let s = e.replace(/%/g, '/100');
  if (s.trim() === '') return null;
  try {
    // kontrollü girdi (sadece tuşlardan gelir) + karakter beyaz listesi
    const v = Function('"use strict";return (' + s + ')')();
    if (typeof v !== 'number' || !isFinite(v)) return null;
    return Math.round((v + Number.EPSILON) * 1e10) / 1e10;
  } catch (_) { return null; }
}

function pressCalc(k) {
  switch (k) {
    case 'C': expr = ''; renderCalc('0'); return;
    case 'DEL': expr = expr.slice(0, -1); renderCalc(); return;
    case '()': {
      const opens = (expr.match(/\(/g) || []).length;
      const closes = (expr.match(/\)/g) || []).length;
      const last = expr.slice(-1);
      if (expr === '' || /[+\-*/(]/.test(last) || last === '') expr += '(';
      else if (opens > closes) expr += ')';
      else expr += '*(';
      renderCalc(); return;
    }
    case '=': return onEquals();
    default:
      // operatör tekrarını sadeleştir
      if (/[+\-*/.]/.test(k) && /[+\-*/.]$/.test(expr)) {
        expr = expr.slice(0, -1) + k;
      } else {
        expr += k;
      }
      renderCalc();
  }
}

async function onEquals() {
  const cfg = await ensureCfg();
  // gizli kod kontrolü
  if (expr !== '' && (await sha256hex(expr)) === cfg.codeHash) {
    const typedCode = expr;
    expr = '';
    renderCalc('0');
    await openChat(typedCode, cfg);
    return;
  }
  // normal hesap
  const v = safeEval(expr);
  if (v != null) {
    calcHistory.textContent = expr + ' =';
    calcResult.textContent = String(v);
    expr = String(v);
  } else {
    renderCalc();
  }
}

document.querySelector('.calc-pad').addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-k]');
  if (btn) pressCalc(btn.dataset.k);
});

/* fiziksel klavye desteği (masaüstü için) */
window.addEventListener('keydown', (ev) => {
  if (!$('calc').classList.contains('hidden')) {
    const map = { Enter: '=', '=': '=', Backspace: 'DEL', Escape: 'C' };
    const k = map[ev.key] || (/[0-9+\-*/.%()]/.test(ev.key) ? ev.key : null);
    if (k) { ev.preventDefault(); pressCalc(k); }
  } else if (ev.key === 'Escape') {
    lock();
  }
});

/* =========================================================================
   SOHBET
   ========================================================================= */
const messagesEl = $('messages');

async function openChat(code, cfg) {
  try {
    cryptoKey = await deriveKey(code, cfg.salt);
  } catch (_) {
    cryptoKey = null;
    return;
  }
  $('chatName').textContent = cfg.name || 'Kişi';
  showScreen('chat');
  await renderMessages();
  setTimeout(() => $('msgInput').focus(), 100);
}

async function renderMessages() {
  if (!cryptoKey) return;
  const raw = loadRawMsgs();
  messagesEl.innerHTML = '';
  if (raw.length === 0) {
    const n = document.createElement('div');
    n.className = 'empty-note';
    n.textContent = 'Henüz mesaj yok. Yazdığın mesajlar yalnızca bu cihazda şifreli saklanır.';
    messagesEl.appendChild(n);
    return;
  }
  for (const rec of raw) {
    const m = await decryptObj(rec);
    if (!m) continue;
    addBubble(m.text, m.from, m.ts, false);
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addBubble(text, from, ts, scroll = true) {
  const note = messagesEl.querySelector('.empty-note');
  if (note) note.remove();
  const b = document.createElement('div');
  b.className = 'bubble ' + (from === 'me' ? 'me' : 'them');
  b.textContent = text;
  const t = document.createElement('small');
  const d = new Date(ts || Date.now());
  t.textContent = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  b.appendChild(t);
  messagesEl.appendChild(b);
  if (scroll) messagesEl.scrollTop = messagesEl.scrollHeight;
}

$('composer').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const input = $('msgInput');
  const text = input.value.trim();
  if (!text || !cryptoKey) return;
  input.value = '';
  const msg = { from: 'me', text, ts: Date.now() };
  addBubble(text, 'me', msg.ts);
  const raw = loadRawMsgs();
  raw.push(await encryptObj(msg));
  saveRawMsgs(raw);
  // NOT: Gerçek gönderim (tek kişiye, uçtan uca) bir sonraki adımda eklenecek.
});

$('btnBack').addEventListener('click', lock);

/* =========================================================================
   AYARLAR (yalnızca sohbet açıkken erişilebilir)
   ========================================================================= */
$('btnSettings').addEventListener('click', async () => {
  const cfg = await ensureCfg();
  $('setCode').value = '';
  $('setCode').placeholder = 'değiştirmek için yeni kod yaz';
  $('setName').value = cfg.name || '';
  showScreen('settings');
});
$('btnSettingsBack').addEventListener('click', () => showScreen('chat'));

$('btnSaveSettings').addEventListener('click', async () => {
  const cfg = await ensureCfg();
  const newName = $('setName').value.trim() || 'Kişi';
  const newCode = $('setCode').value.trim();
  cfg.name = newName;

  if (newCode) {
    // kod değişince anahtar da değişir → mevcut mesajları yeni anahtara taşı
    const oldRaw = loadRawMsgs();
    const plain = [];
    for (const rec of oldRaw) { const m = await decryptObj(rec); if (m) plain.push(m); }

    const newSalt = crypto.getRandomValues(new Uint8Array(16));
    cfg.salt = b64.enc(newSalt);
    cfg.codeHash = await sha256hex(newCode);
    saveCfg(cfg);

    cryptoKey = await deriveKey(newCode, cfg.salt);
    const reRaw = [];
    for (const m of plain) reRaw.push(await encryptObj(m));
    saveRawMsgs(reRaw);
  } else {
    saveCfg(cfg);
  }
  $('chatName').textContent = cfg.name;
  showScreen('chat');
  await renderMessages();
});

$('btnWipe').addEventListener('click', () => {
  saveRawMsgs([]);
  renderMessages();
  showScreen('chat');
});

/* =========================================================================
   EKRAN YÖNETİMİ + KİLİT
   ========================================================================= */
function showScreen(name) {
  for (const s of ['calc', 'chat', 'settings']) {
    const el = $(s);
    const on = s === name;
    el.classList.toggle('hidden', !on);
    el.setAttribute('aria-hidden', on ? 'false' : 'true');
  }
}

function lock() {
  // anahtarı ve çözülmüş mesajları bellekten temizle, hesap makinesine dön
  cryptoKey = null;
  messagesEl.innerHTML = '';
  $('msgInput').value = '';
  expr = '';
  renderCalc('0');
  showScreen('calc');
}

// Uygulamadan çıkınca / arka plana atınca / sekme gizlenince hemen kilitle
document.addEventListener('visibilitychange', () => { if (document.hidden) lock(); });
window.addEventListener('pagehide', lock);
window.addEventListener('blur', () => {
  // sohbet açıkken odak kaybında kilitle (input'a tıklamada tetiklenmesin diye küçük gecikme)
  if (!$('chat').classList.contains('hidden') || !$('settings').classList.contains('hidden')) {
    setTimeout(() => { if (!document.hasFocus()) lock(); }, 150);
  }
});

/* =========================================================================
   BAŞLANGIÇ
   ========================================================================= */
(async function init() {
  await ensureCfg();
  renderCalc('0');
  showScreen('calc');
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('service-worker.js'); } catch (_) {}
  }
})();
