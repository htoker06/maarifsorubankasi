/* =========================================================================
   net.js  —  İki kişilik, uçtan uca şifreli taşıma (Firebase/Firestore)
   -------------------------------------------------------------------------
   - Sunucuda (Firestore) YALNIZCA şifreli metin durur. Düz metin ve anahtarlar
     asla sunucuya gitmez.
   - Her cihaz bir ECDH (P-256) anahtar çifti üretir; ÖZEL anahtar cihazda,
     DIŞA AKTARILAMAZ (non-extractable) olarak IndexedDB'de saklanır.
   - İki cihaz ortak "oda kodu" ile buluşur, birbirinin açık anahtarını alır,
     ECDH ile ortak bir AES-GCM anahtarı türetir.
   - Yapılandırma yoksa HCNet.isConfigured() false döner; uygulama yerel modda
     çalışmaya devam eder.
   ========================================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, runTransaction,
  collection, addDoc, query, orderBy, onSnapshot, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = {
  enc: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))),
  dec: (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0)),
};
const sha256hex = async (s) => {
  const h = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

/* ---------- IndexedDB: özel anahtarı sakla (dışa aktarılamaz CryptoKey) ---------- */
const IDB_NAME = "hc-keys", IDB_STORE = "keys";
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet(key) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(key);
    tx.onsuccess = () => res(tx.result || null);
    tx.onerror = () => rej(tx.error);
  });
}
async function idbSet(key, val) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, "readwrite").objectStore(IDB_STORE).put(val, key);
    tx.onsuccess = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

/* ---------- durum ---------- */
let app, auth, db;
let uid = null;
let roomId = null;
let myPriv = null;        // CryptoKey (non-extractable)
let myPubJwk = null;      // JWK (dışa aktarılabilir açık anahtar)
let sharedKey = null;     // ECDH'den türeyen AES-GCM anahtarı
let unsubMessages = null;
let unsubUnread = null;

function cfgReady() {
  const c = window.HC_FIREBASE_CONFIG || {};
  const code = window.HC_ROOM_CODE || "";
  const filled = (v) => typeof v === "string" && v && !/BURAYA|^PROJE/.test(v);
  return filled(c.apiKey) && filled(c.projectId) && filled(c.appId) && filled(code);
}

/* ---------- anahtar yönetimi ---------- */
async function ensureKeypair() {
  const stored = await idbGet("ecdh");
  if (stored && stored.priv && stored.pubJwk) {
    myPriv = stored.priv;        // CryptoKey doğrudan IDB'den geri gelir
    myPubJwk = stored.pubJwk;
    return;
  }
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    false,                       // ÖZEL anahtar dışa aktarılamaz
    ["deriveKey", "deriveBits"]
  );
  myPriv = pair.privateKey;
  myPubJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  await idbSet("ecdh", { priv: myPriv, pubJwk: myPubJwk });
}

async function deriveShared(peerJwk) {
  const peerPub = await crypto.subtle.importKey(
    "jwk", peerJwk, { name: "ECDH", namedCurve: "P-256" }, false, []
  );
  sharedKey = await crypto.subtle.deriveKey(
    { name: "ECDH", public: peerPub },
    myPriv,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/* ---------- oda / üyelik ---------- */
async function joinRoom() {
  roomId = await sha256hex("room:" + window.HC_ROOM_CODE);
  const roomRef = doc(db, "rooms", roomId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef);
    if (!snap.exists()) {
      tx.set(roomRef, { members: [uid] });
    } else {
      const members = snap.data().members || [];
      if (members.includes(uid)) return;
      if (members.length >= 2) throw new Error("ROOM_FULL");
      tx.update(roomRef, { members: [...members, uid] });
    }
  });

  // açık anahtarımı yayınla
  await setDoc(doc(db, "rooms", roomId, "keys", uid), { pub: myPubJwk }, { merge: true });
}

async function peerUid() {
  const snap = await getDoc(doc(db, "rooms", roomId));
  const members = (snap.exists() && snap.data().members) || [];
  return members.find((m) => m !== uid) || null;
}

async function ensureShared() {
  if (sharedKey) return true;
  const peer = await peerUid();
  if (!peer) return false;
  const ks = await getDoc(doc(db, "rooms", roomId, "keys", peer));
  if (!ks.exists() || !ks.data().pub) return false;
  await deriveShared(ks.data().pub);
  return true;
}

/* ---------- genel API ---------- */
const HCNet = {
  isConfigured: () => cfgReady(),
  roomId: () => roomId,
  myUid: () => uid,

  async init() {
    if (!cfgReady()) return false;
    app = initializeApp(window.HC_FIREBASE_CONFIG);
    auth = getAuth(app);
    db = getFirestore(app);
    await new Promise((res, rej) => {
      onAuthStateChanged(auth, (u) => { if (u) { uid = u.uid; res(); } });
      signInAnonymously(auth).catch(rej);
    });
    await ensureKeypair();
    await joinRoom();
    return true;
  },

  // Hafif okunmamış göstergesi — şifre çözmez, anahtar gerekmez.
  // cb(count): okunmamış (karşı taraftan gelen, son okumadan yeni) mesaj sayısı.
  watchUnread(cb) {
    if (!db || !roomId) return;
    if (unsubUnread) { unsubUnread(); unsubUnread = null; }
    const qy = query(collection(db, "rooms", roomId, "messages"), orderBy("ts", "asc"));
    unsubUnread = onSnapshot(qy, (snap) => {
      const lastRead = Number(localStorage.getItem("hc.read." + roomId) || 0);
      let n = 0;
      snap.forEach((d) => {
        const m = d.data();
        const t = m.ts && m.ts.toMillis ? m.ts.toMillis() : 0;
        if (m.from !== uid && t > lastRead) n++;
      });
      cb(n);
    }, () => cb(0));
  },

  // Sohbet açıkken: mesajları dinle ve çöz. onMsg({from,text,ts})
  async connectChat(onMsg, onState) {
    if (!db || !roomId) return;
    const ok = await ensureShared();
    if (onState) onState(ok ? "bağlı" : "eş bekleniyor…");
    const qy = query(collection(db, "rooms", roomId, "messages"), orderBy("ts", "asc"));
    if (unsubMessages) { unsubMessages(); }
    unsubMessages = onSnapshot(qy, async (snap) => {
      if (!sharedKey) { const got = await ensureShared(); if (got && onState) onState("bağlı"); }
      for (const d of snap.docChanges()) {
        if (d.type !== "added") continue;
        const m = d.doc.data();
        const t = m.ts && m.ts.toMillis ? m.ts.toMillis() : Date.now();
        let text = "🔒";
        if (sharedKey) {
          try {
            const pt = await crypto.subtle.decrypt(
              { name: "AES-GCM", iv: b64.dec(m.iv) }, sharedKey, b64.dec(m.ct)
            );
            text = dec.decode(pt);
          } catch (_) { text = "🔒 (çözülemedi)"; }
        }
        onMsg({ from: m.from === uid ? "me" : "them", text, ts: t });
      }
      localStorage.setItem("hc.read." + roomId, String(Date.now()));
    });
  },

  async send(text) {
    if (!db || !roomId) throw new Error("NOT_READY");
    if (!sharedKey) { const ok = await ensureShared(); if (!ok) throw new Error("NO_PEER"); }
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, sharedKey, enc.encode(text));
    await addDoc(collection(db, "rooms", roomId, "messages"), {
      from: uid, iv: b64.enc(iv), ct: b64.enc(ct), ts: serverTimestamp(),
    });
  },

  markRead() {
    if (roomId) localStorage.setItem("hc.read." + roomId, String(Date.now()));
  },

  disconnect() {
    if (unsubMessages) { unsubMessages(); unsubMessages = null; }
  },
};

window.HCNet = HCNet;
window.dispatchEvent(new Event("hcnet-ready"));
