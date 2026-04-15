import React, { useState, useEffect, useMemo, useCallback } from "react";
import * as Papa from "papaparse";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, get, onValue } from "firebase/database";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";

// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyCeOj-MRauM6QwKk56xSb3B9woKAnEA71Y",
  authDomain: "ev-butcesi-96167.firebaseapp.com",
  databaseURL: "https://ev-butcesi-96167-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "ev-butcesi-96167",
  storageBucket: "ev-butcesi-96167.firebasestorage.app",
  messagingSenderId: "743390678681",
  appId: "1:743390678681:web:cc31aba583a2be5ca73208"
};
const fbApp = initializeApp(firebaseConfig);
const rtdb = getDatabase(fbApp);
const auth = getAuth(fbApp);

const C = n => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const td = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const cmk = () => { const d = new Date(); if (d.getDate() < 15) d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const MTR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const ml = mk => { const [y, m] = mk.split("-"); return MTR[+m - 1] + " " + y; };
const nmk = mk => { let [y, m] = mk.split("-").map(Number); m++; if (m > 12) { m = 1; y++; } return `${y}-${String(m).padStart(2, "0")}`; };
const pmk = mk => { let [y, m] = mk.split("-").map(Number); m--; if (m < 1) { m = 12; y--; } return `${y}-${String(m).padStart(2, "0")}`; };
const PM = [{ id: "account", label: "Hesaptan", icon: "🏦" }, { id: "cc", label: "Kredi Kartı", icon: "💳" }];

const CARD_USABLE_PCT = 0.75;      // serbest bütçenin en fazla %75'i karta aktarılabilir
const CARD_SINGLE_MAX_PCT = 0.70;  // kullanılabilir tutarın tek seferde en fazla %70'i
const EMERGENCY_BUFFER_PCT = 0.25; // serbest bütçenin %25'i acil tampon
const MIN_TL_SAVINGS_PCT = 0.15;   // toplam birikimin en az %15'i TL olmalı

const DD = { settings: { monthlyBudget: 450000, fixedExpenses: [], variableExpenses: [], cards: [], emergencyFundTarget: null, billTypes: [] }, months: {}, installmentPlans: [], debts: [], merchantMap: {}, goldRates: {}, usdRates: {}, eurRates: {}, liveRates: { USD: null, EUR: null, XAU: null, fetchedAt: null }, savings: { TRY: [], USD: [], EUR: [], XAU: [] }, lastClosedMonth: null, lastBackup: null };
const DM = () => ({ budget: null, fixedPaid: {}, variableEntries: {}, ccSingle: [], cardLoaded: 0, debtPayments: {}, ccTransferred: {}, csvByCard: {}, finalSavings: null, receipts: [] });

const STORAGE_KEY = "ev-butce-v11";

// İsim normalizasyonu (büyük/küçük harf duyarsız)
const normName = n => n.toLowerCase().replace(/\s+/g, " ").trim();
const nameKey = n => normName(n).replace(/[.#$\[\]\/]/g, "_");

// Aile sistemi
function genCode() { return String(Math.floor(100000 + Math.random() * 900000)); }

// İsim → e-posta eşleştirme (giriş için)
async function lookupName(name) {
  try {
    const snap = await get(ref(rtdb, `nameIndex/${nameKey(name)}`));
    if (snap.exists()) return snap.val(); // { email, familyId, uid }
  } catch {}
  return null;
}
async function registerName(name, email, familyId, uid2) {
  await set(ref(rtdb, `nameIndex/${nameKey(name)}`), { email, familyId, uid: uid2 });
}

// Aile oluştur (ilk kullanıcı = yönetici)
async function createFamily(uid2, email, name) {
  const familyId = uid2;
  const code = genCode();
  await set(ref(rtdb, `families/${familyId}/admin`), uid2);
  await set(ref(rtdb, `families/${familyId}/members/${uid2}`), { name, email, role: "admin", joinedAt: new Date().toISOString() });
  await set(ref(rtdb, `userFamilies/${uid2}`), { familyId, code, role: "admin", name });
  await registerName(name, email, familyId, uid2);
  return { familyId, code, role: "admin", name };
}

// Davet oluştur (admin tarafından)
async function createInvitation(familyId, memberName, memberEmail) {
  const code = genCode();
  await set(ref(rtdb, `invitations/${code}`), { familyId, name: memberName, email: memberEmail, createdAt: new Date().toISOString(), used: false });
  return code;
}

// Davet kodunu kontrol et
async function lookupInvitation(code) {
  try {
    const snap = await get(ref(rtdb, `invitations/${code}`));
    if (snap.exists()) { const inv = snap.val(); if (!inv.used) return inv; }
  } catch {}
  return null;
}

// Davetli üye katılım (Firebase Auth hesabı oluşturulduktan sonra)
async function joinViaInvitation(uid2, code, invData) {
  const { familyId, name, email } = invData;
  await set(ref(rtdb, `families/${familyId}/members/${uid2}`), { name, email, role: "member", joinedAt: new Date().toISOString() });
  await set(ref(rtdb, `userFamilies/${uid2}`), { familyId, code, role: "member", name });
  await set(ref(rtdb, `invitations/${code}/used`), true);
  await registerName(name, email, familyId, uid2);
  return { familyId, code, role: "member", name };
}

// Üye erişim sıfırlama (yeni kod ver, eski üye kaydını temizle)
async function resetMemberAccess(familyId, memberUid, memberName, memberEmail) {
  // Eski kayıtları temizle
  try { await set(ref(rtdb, `userFamilies/${memberUid}`), null); } catch {}
  try { await set(ref(rtdb, `nameIndex/${nameKey(memberName)}`), null); } catch {}
  try { await set(ref(rtdb, `families/${familyId}/members/${memberUid}`), null); } catch {}
  // Yeni davet oluştur
  return await createInvitation(familyId, memberName, memberEmail);
}

async function getUserFamily(uid2) {
  try {
    const snap = await get(ref(rtdb, `userFamilies/${uid2}`));
    if (snap.exists()) return snap.val();
  } catch {}
  return null;
}

async function getFamilyMembers(familyId) {
  try {
    const snap = await get(ref(rtdb, `families/${familyId}/members`));
    if (snap.exists()) return snap.val();
  } catch {}
  return {};
}

async function loadDB(familyId) {
  try {
    if (familyId) {
      const snap = await get(ref(rtdb, `families/${familyId}/data`));
      if (snap.exists()) {
        const data = snap.val();
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
        return data;
      }
    }
  } catch (e) { console.warn("Firebase okuma hatası:", e); }
  try { const r = localStorage.getItem(STORAGE_KEY); if (r) return JSON.parse(r); } catch {}
  return null;
}

async function saveDB(d, familyId) {
  const clean = JSON.parse(JSON.stringify(d));
  try { if (familyId) await set(ref(rtdb, `families/${familyId}/data`), clean); } catch (e) { console.warn("Firebase kayıt hatası:", e); }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch {}
}

async function deleteDB(familyId) {
  try { if (familyId) await set(ref(rtdb, `families/${familyId}/data`), null); } catch {}
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

async function migrateOldData(uid2) {
  try {
    const oldSnap = await get(ref(rtdb, `budgets/${uid2}`));
    if (oldSnap.exists()) {
      const oldData = oldSnap.val();
      await set(ref(rtdb, `families/${uid2}/data`), oldData);
      await set(ref(rtdb, `budgets/${uid2}`), null);
      return oldData;
    }
  } catch {}
  return null;
}

/* ═══ KUR SİSTEMİ (sadece manuel) ═══ */
const HAREMALTIN_XAU = "https://www.haremaltin.com/grafik?tip=altin&birim=ALTIN";
const HAREMALTIN_USD = "https://www.haremaltin.com/grafik?tip=doviz&birim=USDTRY";
const HAREMALTIN_EUR = "https://www.haremaltin.com/grafik?tip=doviz&birim=EURTRY";

const THEMES = {
  default: {
    name: "Varsayılan",
    ff: "'Quicksand',sans-serif",
    fm: "'Quicksand',sans-serif",
    X: { bg: "#EBE3DB", card: "rgba(140,180,195,0.65)", cardSolid: "#B0C8D5", border: "rgba(255,255,255,0.22)", g: "#0F766E", gd: "rgba(15,118,110,0.18)", w: "#B45309", wd: "rgba(180,83,9,0.18)", r: "#DC2626", rd: "rgba(220,38,38,0.18)", b: "#1D4ED8", bd: "rgba(29,78,216,0.18)", p: "#7C3AED", pd: "rgba(124,58,237,0.18)", o: "#C2410C", od: "rgba(194,65,12,0.18)", t: "#141008", tm: "#3D3528", td: "#5A5045" },
    neu: "6px 6px 14px rgba(0,0,0,0.12), -6px -6px 14px rgba(255,255,255,0.6)",
    neuIn: "inset 3px 3px 6px rgba(0,0,0,0.10), inset -3px -3px 6px rgba(255,255,255,0.4)",
    glass: (n) => ({ background: "rgba(140,180,195,0.65)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.22)", boxShadow: n }),
    glassSolid: { background: "rgba(145,185,205,0.90)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.25)" },
    gradient: "linear-gradient(160deg, #E5DBD0 0%, #DCD0C4 40%, #EBE3DA 100%)",
    gradientShort: "linear-gradient(160deg, #E5DBD0, #DCD0C4, #EBE3DA)",
    inputBg: "rgba(200,220,232,0.65)",
    expandedBg: "rgba(160,190,200,0.50)",
    expandedBgLight: "rgba(160,190,200,0.35)"
  },
  warm: {
    name: "Sıcak Kurumsal",
    ff: "'DM Sans',sans-serif",
    fm: "'DM Sans',sans-serif",
    X: { bg: "#F5F0EB", card: "rgba(255,255,255,0.70)", cardSolid: "#F0EBE5", border: "rgba(0,0,0,0.05)", g: "#0F766E", gd: "rgba(15,118,110,0.08)", w: "#B45309", wd: "rgba(180,83,9,0.08)", r: "#DC2626", rd: "rgba(220,38,38,0.08)", b: "#1D4ED8", bd: "rgba(29,78,216,0.08)", p: "#7C3AED", pd: "rgba(124,58,237,0.08)", o: "#C2410C", od: "rgba(194,65,12,0.08)", t: "#1C1917", tm: "#57534E", td: "#A8A29E" },
    neu: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
    neuIn: "inset 1px 1px 3px rgba(0,0,0,0.06), inset -1px -1px 3px rgba(255,255,255,0.7)",
    glass: (n) => ({ background: "rgba(255,255,255,0.70)", border: "1px solid rgba(0,0,0,0.05)", boxShadow: n }),
    glassSolid: { background: "rgba(255,255,255,0.88)", border: "1px solid rgba(0,0,0,0.06)" },
    gradient: "linear-gradient(160deg, #F5F0EB 0%, #EDE7E0 40%, #F5F0EB 100%)",
    gradientShort: "linear-gradient(160deg, #F5F0EB, #EDE7E0, #F5F0EB)",
    inputBg: "rgba(245,240,235,0.8)",
    expandedBg: "rgba(245,240,235,0.6)",
    expandedBgLight: "rgba(245,240,235,0.4)"
  }
};
let _tid = "default";
function applyTheme(id) { _tid = THEMES[id] ? id : "default"; const th = THEMES[_tid]; X = th.X; ff = th.ff; fm = th.fm; neu = th.neu; neuIn = th.neuIn; glass = th.glass(th.neu); glassSolid = th.glassSolid; }
let X = THEMES.default.X;
let ff = THEMES.default.ff;
let fm = THEMES.default.fm;
let neu = THEMES.default.neu;
let neuIn = THEMES.default.neuIn;
let glass = THEMES.default.glass(THEMES.default.neu);
let glassSolid = THEMES.default.glassSolid;

/* ═══ UI ═══ */
function Card({ children, s, onClick }) { return <div onClick={onClick} style={{ borderRadius: 14, padding: "14px 16px", cursor: onClick ? "pointer" : "default", ...glass, ...s }}>{children}</div>; }
function Btn({ children, c = X.g, v = "filled", onClick, s, disabled }) { return <button disabled={disabled} onClick={onClick} style={{ background: v === "filled" ? c : "transparent", color: v === "filled" ? "#fff" : c, border: v === "filled" ? "none" : `2px solid ${c}`, borderRadius: 12, padding: "12px 20px", fontSize: 15, fontWeight: 700, fontFamily: ff, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? .5 : 1, width: "100%", boxShadow: v === "filled" ? `0 2px 8px ${c}40` : "none", ...s }}>{children}</button>; }
function Inp({ label, value, onChange, type = "text", placeholder, suffix, s }) { return (<div style={{ marginBottom: 12, ...s }}>{label && <label style={{ fontSize: 12, color: X.tm, fontWeight: 600, marginBottom: 4, display: "block", fontFamily: ff }}>{label}</label>}<div style={{ position: "relative" }}><input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ width: "100%", background: "rgba(200,220,232,0.65)", border: `1px solid rgba(0,0,0,0.08)`, borderRadius: 10, padding: "12px 14px", paddingRight: suffix ? 50 : 14, color: X.t, fontSize: 16, fontFamily: type === "number" ? fm : ff, outline: "none", boxSizing: "border-box", boxShadow: neuIn }} />{suffix && <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: X.td, fontSize: 13, fontWeight: 600 }}>{suffix}</span>}</div></div>); }
function Sel({ label, value, onChange, options }) { return (<div style={{ marginBottom: 12 }}>{label && <label style={{ fontSize: 12, color: X.tm, fontWeight: 600, marginBottom: 4, display: "block", fontFamily: ff }}>{label}</label>}<select value={value} onChange={e => onChange(e.target.value)} style={{ width: "100%", background: "rgba(200,220,232,0.65)", border: `1px solid rgba(0,0,0,0.08)`, borderRadius: 10, padding: "12px 14px", color: X.t, fontSize: 15, fontFamily: ff, outline: "none", boxSizing: "border-box", boxShadow: neuIn }}>{options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select></div>); }
function Modal({ title, onClose, children }) { return (<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 1000 }} onClick={onClose}><div onClick={e => e.stopPropagation()} style={{ ...glassSolid, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, maxHeight: "85vh", overflow: "auto", padding: 24, boxShadow: "0 -8px 32px rgba(0,0,0,0.1)" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}><h3 style={{ margin: 0, color: X.t, fontSize: 18, fontFamily: ff }}>{title}</h3><button onClick={onClose} style={{ background: "none", border: "none", color: X.tm, fontSize: 22, cursor: "pointer" }}>✕</button></div>{children}</div></div>); }

/* ═══ INFO POPUP ═══ */
function InfoBtn({ onClick }) {
  return <button onClick={e => { e.stopPropagation(); e.preventDefault(); onClick(); }} style={{ position: "absolute", top: 2, right: 2, width: 26, height: 26, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, zIndex: 2 }}><span style={{ width: 17, height: 17, borderRadius: "50%", background: "rgba(0,0,0,0.12)", color: X.tm, fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: ff }}>i</span></button>;
}
function InfoModal({ title, text, onClose }) {
  return <Modal title={`ℹ️ ${title}`} onClose={onClose}><div style={{ color: X.t, fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{text}</div><Btn onClick={onClose} s={{ marginTop: 16 }}>Anladım</Btn></Modal>;
}

// Dinamik tutar dökümü modalı — herhangi bir tutara tıklanınca açılır
function DetailModal({ title, rows, total, totalLabel, totalColor, note, onClose }) {
  // rows: [{label, value, sign, color, sub}]
  return (
    <Modal title={title} onClose={onClose}>
      <div style={{ borderRadius: 10, padding: "12px 14px", background: "rgba(160,190,200,0.35)" }}>
        {rows.map((row, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: i < rows.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none", fontSize: 13 }}>
            <span style={{ color: row.color || X.tm, flex: 1, paddingRight: 8 }}>{row.sign === "−" ? "− " : ""}{row.label}{row.sub ? ` (${row.sub})` : ""}</span>
            <span style={{ color: row.color || X.tm, fontFamily: fm, fontWeight: 700, flexShrink: 0 }}>{row.sign === "−" ? "−" : ""}{typeof row.value === "number" ? C(row.value) : row.value}</span>
          </div>
        ))}
        {total !== undefined && (
          <div style={{ borderTop: "2px solid rgba(0,0,0,0.1)", marginTop: 6, paddingTop: 8, display: "flex", justifyContent: "space-between", fontSize: 15 }}>
            <span style={{ color: X.t, fontWeight: 800 }}>{totalLabel || "Toplam"}</span>
            <span style={{ color: totalColor || X.g, fontFamily: fm, fontWeight: 800 }}>{C(total)}</span>
          </div>
        )}
      </div>
      {note && <div style={{ color: X.tm, fontSize: 11, marginTop: 10, lineHeight: 1.5 }}>{note}</div>}
      <Btn onClick={onClose} s={{ marginTop: 12 }}>Anladım</Btn>
    </Modal>
  );
}

// Tıklanabilir tutar — altı noktalı çizgiyle gösterilir
function TapAmt({ children, onTap, color, style: s }) {
  return (
    <span onClick={e => { e.stopPropagation(); onTap(); }} style={{ cursor: "pointer", borderBottom: `1px dotted ${color || X.td}`, paddingBottom: 1, ...s }}>
      {children}
    </span>
  );
}

function CatButton({ icon, label, total, color, dimColor, expanded, onToggle, children, onInfo }) {
  return (<div style={{ marginBottom: 8 }}><div onClick={onToggle} style={{ display: "flex", alignItems: "center", gap: 12, ...glass, borderRadius: expanded ? "14px 14px 0 0" : 14, padding: "14px 16px", cursor: "pointer", position: "relative", border: `1px solid ${expanded ? color + "40" : "rgba(255,255,255,0.55)"}` }}><span style={{ fontSize: 28, lineHeight: 1 }}>{icon}</span><div style={{ flex: 1 }}><div style={{ color: X.t, fontWeight: 700, fontSize: 14, fontFamily: ff }}>{label}</div></div><div style={{ textAlign: "right", marginRight: 4 }}><div style={{ color, fontWeight: 800, fontSize: 17, fontFamily: fm }}>{C(total)}</div></div><span style={{ color: X.td, fontSize: 11, transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "0.2s" }}>▼</span>{onInfo && <InfoBtn onClick={onInfo} />}</div>{expanded && <div style={{ background: "rgba(160,190,200,0.50)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", borderTop: `1px solid rgba(0,0,0,0.05)`, borderRadius: "0 0 14px 14px", padding: "8px 16px 14px", boxShadow: "0 4px 10px rgba(0,0,0,0.04)" }}>{children}</div>}</div>);
}
function ItemRow({ label, value, sub, color = X.t, onAction, actionLabel, onEdit, onDelete }) { return (<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(0,0,0,0.06)" }}><div style={{ flex: 1, minWidth: 0 }}><div style={{ color: X.t, fontSize: 13, fontWeight: 600 }}>{label}</div>{sub && <div style={{ color: X.td, fontSize: 11 }}>{sub}</div>}</div><div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}><span style={{ color, fontWeight: 700, fontFamily: fm, fontSize: 14 }}>{typeof value === "number" ? C(value) : value}</span>{onEdit && <button onClick={e => { e.stopPropagation(); onEdit(); }} style={{ background: "none", border: "none", color: X.b, fontSize: 18, cursor: "pointer", padding: "6px 8px", minWidth: 36, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center" }}>✎</button>}{onDelete && <button onClick={e => { e.stopPropagation(); if(confirm("Bu kaydı silmek istediğinize emin misiniz?")) onDelete(); }} style={{ background: "none", border: "none", color: X.r, fontSize: 18, cursor: "pointer", padding: "6px 8px", minWidth: 36, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>}{onAction && <button onClick={e => { e.stopPropagation(); onAction(); }} style={{ background: "rgba(22,163,74,0.1)", border: "none", borderRadius: 8, padding: "5px 10px", color: X.g, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: ff }}>{actionLabel || "✓"}</button>}</div></div>); }

/* ═══ ENGINE ═══ */
/* ═══ BİRİKİM HELPER ═══ */
const ASSET_INFO = {
  TRY: { label: "TL", icon: "🏦", unit: "₺", color: "#3B82F6" },
  XAU: { label: "Altın", icon: "🪙", unit: "gr", color: "#F59E0B" },
  USD: { label: "Dolar", icon: "💵", unit: "$", color: "#22C55E" },
  EUR: { label: "Euro", icon: "💶", unit: "€", color: "#A855F7" }
};

function getAssetBalance(data, asset) {
  const txs = data.savings?.[asset] || [];
  let qty = 0, cost = 0, buyQty = 0;
  txs.forEach(t => {
    if (t.type === "buy") { qty += t.amount; cost += t.amount * t.unitPrice; buyQty += t.amount; }
    else if (t.type === "sell") { qty -= t.amount; cost -= t.amount * t.unitPrice; }
  });
  return { qty: Math.max(0, qty), totalCost: Math.max(0, cost), txs };
}

function getAssetTLValue(data, asset) {
  const { qty } = getAssetBalance(data, asset);
  if (asset === "TRY") return qty;
  const rate = data.liveRates?.[asset] || 0;
  return qty * rate;
}

function getTotalSavingsTL(data) {
  return ["TRY", "XAU", "USD", "EUR"].reduce((s, a) => s + getAssetTLValue(data, a), 0);
}


// Bir text içinde herhangi bir variableExpense kalemine ait keyword geçiyor mu?
function matchCategory(text, variableExpenses) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const ve of variableExpenses) {
    const keywords = ve.keywords || [];
    for (const kw of keywords) {
      if (kw && lower.includes(kw.toLowerCase())) return ve.id;
    }
  }
  return null;
}

// Fatura alt-kategori tespiti: banka açıklamasından fatura türünü belirle
const BILL_TYPES = {
  telefon: { icon: "📱", label: "Telefon", keywords: ["turkcell", "vodafone", "turk telekom", "tt mobil", "superonline fatura", "avea", "telsim", "pttcell"] },
  elektrik: { icon: "⚡", label: "Elektrik", keywords: ["enerjisa", "ck bogazici", "gediz elek", "dicle elek", "toroslar elek", "aydem", "baskent elek", "meram elek", "yesilirmak", "sakarya elek", "clk akdeniz", "osmangazi elek", "firat elek", "aras elek", "coruh elek", "vangolu elek", "kayseri elek", "edsm", "edas"] },
  su: { icon: "💧", label: "Su", keywords: ["iski", "aski", "muski", "suski", "kaski", "koski", "beski", "buski", "meski", "saski", "deski", "tiski", "cski", "su idaresi", "su faturas"] },
  dogalgaz: { icon: "🔥", label: "Doğalgaz", keywords: ["igdas", "baskentgaz", "izmirgaz", "esgaz", "kayserigaz", "kargaz", "palgaz", "aksa dogalgaz", "enerya", "armadas", "cingaz", "gazdas", "agdas"] },
  internet: { icon: "🌐", label: "İnternet", keywords: ["superonline", "turknet", "turk telekom internet", "kablonet", "millenicom", "vodafone net", "d-smart", "turksat"] },
  sigorta: { icon: "🛡️", label: "Sigorta", keywords: ["sigorta", "axa", "allianz", "anadolu sigorta", "mapfre", "zurich", "hdi sigorta", "sompo", "unico", "dask"] },
  egitim: { icon: "🎓", label: "Eğitim", keywords: ["okul", "universite", "egitim", "kurs", "dershane", "kolej"] }
};

function detectBillSubType(desc) {
  if (!desc) return null;
  const lower = desc.toLowerCase();
  for (const [type, cfg] of Object.entries(BILL_TYPES)) {
    for (const kw of cfg.keywords) {
      if (lower.includes(kw)) return type;
    }
  }
  // Genel fatura tespiti
  if (lower.includes("fatura")) return "_diger_fatura";
  return null;
}

// Özel fatura türüne göre CSV işlemini eşleştir
// Önce BILL_TYPES keyword tespiti → kullanıcı türleriyle isim benzerliği
// Sonra kullanıcı türü adı kelimeleri → işlem açıklamasında arama
function matchCustomBillType(desc, billTypes) {
  if (!desc || !billTypes?.length) return null;
  const lower = desc.toLowerCase();
  // 1. Otomatik tespit → kullanıcı türüyle eşleştir
  for (const [sysType, cfg] of Object.entries(BILL_TYPES)) {
    if (cfg.keywords.some(kw => lower.includes(kw))) {
      const sysLabel = cfg.label.toLowerCase(); // "elektrik", "su" vb.
      const bt = billTypes.find(b => {
        const bn = b.name.toLowerCase();
        return bn.includes(sysLabel) || sysLabel.includes(bn.split(" ")[0]);
      });
      if (bt) return bt.id;
    }
  }
  // 2. Kullanıcı türü adı kelimeleri işlem açıklamasında var mı?
  for (const bt of billTypes) {
    const words = bt.name.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    if (words.length > 0 && words.some(w => lower.includes(w))) return bt.id;
  }
  // 3. Genel "fatura" eşleşmesi — türsüz fatura
  if (lower.includes("fatura")) return "_fatura_other";
  return null;
}

// Son N ayın fatura verisi (CSV'den): { mk, byType: {btId: total}, total }
function getBillHistory(data, currentMk, numMonths = 5) {
  const billTypes = data.settings.billTypes || [];
  const result = [];
  let m = currentMk;
  for (let i = 0; i < numMonths; i++) {
    m = pmk(m);
    const csvByCard = data.months[m]?.csvByCard || {};
    const byType = {};
    let total = 0;
    Object.values(csvByCard).forEach(cardData => {
      (cardData.transactions || []).forEach(t => {
        const btId = matchCustomBillType(t.desc, billTypes);
        if (!btId) return;
        byType[btId] = (byType[btId] || 0) + t.amount;
        total += t.amount;
      });
    });
    if (Object.keys(byType).length > 0) result.unshift({ mk: m, byType, total });
  }
  return result;
}

// Anomali: mevcut ay değeri geçmiş ortalamanın %25+ üzerindeyse
function isBillAnomaly(current, histAmounts) {
  if (histAmounts.length < 2 || current === 0) return false;
  const avg = histAmounts.reduce((s, v) => s + v, 0) / histAmounts.length;
  return avg > 0 && current > avg * 1.25;
}

// Mini trend bar (unicode): ▁▂▃▄▅▆▇█
function sparkLine(vals) {
  if (!vals || vals.length === 0) return "";
  const bars = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  const max = Math.max(...vals, 1);
  return vals.map(v => bars[Math.min(7, Math.floor((v / max) * 7))]).join("");
}

// Bir aydaki tüm harcamaları kategorilerine göre topla
function categorizeMonthSpending(data, mk) {
  const md = data.months[mk] || DM();
  const ves = data.settings.variableExpenses || [];
  const result = {};
  ves.forEach(ve => { result[ve.id] = 0; });
  result._uncategorized = 0;

  const tryMatch = (entry, text) => {
    if (entry.categoryId && result[entry.categoryId] !== undefined) return entry.categoryId;
    return matchCategory(text, ves);
  };

  // Sadece CC tek çekim harcamaları — taksitler SAYILMAZ (ayrı katman)
  (md.ccSingle || []).forEach(e => {
    const cat = tryMatch(e, (e.note || "") + " " + (e.merchantName || ""));
    if (cat && result[cat] !== undefined) result[cat] += e.amount;
    else result._uncategorized += e.amount;
  });

  // Taksitlerin kategori bilgisi ayrı döndürülür (bilgi amaçlı, toplama dahil değil)
  const instByCategory = {};
  data.installmentPlans.forEach(p => {
    let cur = p.startMonth;
    for (let i = 0; i < p.months; i++) {
      if (cur === mk) {
        const cat = tryMatch(p, (p.note || "") + " " + (p.merchantName || ""));
        if (cat && cat !== "_uncategorized") {
          instByCategory[cat] = (instByCategory[cat] || 0) + p.monthlyPayment;
        }
        break;
      }
      cur = nmk(cur);
    }
  });

  return { categories: result, instByCategory };
}

// Geçmiş 3 ayın kategorize harcama ortalaması
function getCategorizedAvg(data, mk) {
  const past = [pmk(mk), pmk(pmk(mk)), pmk(pmk(pmk(mk)))];
  const totals = past.map(pm => {
    const { categories: cats } = categorizeMonthSpending(data, pm);
    return Object.entries(cats).filter(([k]) => k !== "_uncategorized").reduce((s, [, v]) => s + v, 0);
  }).filter(t => t > 0);
  return totals.length > 0 ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0;
}

// Bir aydaki kategorize edilmiş toplam (analiz amaçlı, totalSpent'a EKLENMEZ)
function getCategorizedTotal(data, mk) {
  const { categories: cats } = categorizeMonthSpending(data, mk);
  return Object.entries(cats).filter(([k]) => k !== "_uncategorized").reduce((s, [, v]) => s + v, 0);
}


// Average CC single from past 3 months
function getCCSingleAvg(data, m) {
  const past = [pmk(m), pmk(pmk(m)), pmk(pmk(pmk(m)))];
  const vals = past.map(pm => { const pmd = data.months[pm]; if (!pmd) return 0; return (pmd.ccSingle || []).reduce((s, e) => s + e.amount, 0); }).filter(t => t > 0);
  return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
}

function calcMonth(data, m, extraInst) {
  const md = data.months[m] || DM();
  const baseBudget = md.budget || data.settings.monthlyBudget;
  let carryoverDeficit = 0;
  if (data.months[pmk(m)]) { const pr = calcFlat(data, pmk(m), extraInst); if (pr.remaining < 0) carryoverDeficit = Math.abs(pr.remaining); }
  const effectiveBudget = baseBudget - carryoverDeficit;
  const fixedTotal = data.settings.fixedExpenses.reduce((s, e) => s + e.amount, 0);
  const fixedCC = data.settings.fixedExpenses.filter(e => e.paymentMethod === "cc").reduce((s, e) => s + e.amount, 0);
  const variableTotal = getCategorizedTotal(data, m);
  const ccSingleTotal = (md.ccSingle || []).reduce((s, e) => s + e.amount, 0);
  let installmentTotal = data.installmentPlans.reduce((s, p) => { let c = p.startMonth; for (let i = 0; i < p.months; i++) { if (c === m) return s + p.monthlyPayment; c = nmk(c); } return s; }, 0);
  if (extraInst) { let c = extraInst.startMonth; for (let i = 0; i < extraInst.months; i++) { if (c === m) { installmentTotal += extraInst.monthlyPayment; break; } c = nmk(c); } }
  const debtTotal = data.debts.filter(d => d.remainingMonths > 0).reduce((s, d) => {
    if (d.currency === "TRY") return s + d.monthlyPayment;
    if (d.currency === "USD") { const rate = data.liveRates?.USD || data.usdRates?.[m] || 0; return s + d.monthlyPayment * rate; }
    if (d.currency === "EUR") { const rate = data.liveRates?.EUR || data.eurRates?.[m] || 0; return s + d.monthlyPayment * rate; }
    if (d.currency === "XAU") { const rate = data.liveRates?.XAU || data.goldRates?.[m] || data.goldRates?.[cmk()] || 0; return s + d.monthlyPayment * rate; }
    return s;
  }, 0);
  const cardLoaded = md.cardLoaded || 0;

  // === ZARF (ENVELOPE) MANTIĞI ===
  // Değişken gider tahmini: 3 ay ortalaması veya beklenen tutarlar
  const expectedVariableBase = (data.settings.variableExpenses || []).reduce((s, ve) => s + (ve.expectedAmount || 0), 0);
  const past3 = [pmk(pmk(pmk(m))), pmk(pmk(m)), pmk(m)]
    .map(pm => { const pmd = data.months[pm] || DM(); return (pmd.ccSingle || []).reduce((s2, e) => s2 + e.amount, 0); })
    .filter(t => t > 0);
  const variableEstimate = past3.length >= 2 ? Math.round(past3.reduce((s, t) => s + t, 0) / past3.length) : expectedVariableBase;

  // Kategorili CC harcamaları zarftan düşer, kategorisiz CC ek harcama olarak bütçeden düşer
  const { categories: cats } = categorizeMonthSpending(data, m);
  const categorizedCC = Object.entries(cats).filter(([k]) => k !== "_uncategorized").reduce((s, [, v]) => s + v, 0);
  const uncategorizedCC = cats._uncategorized || 0;

  // Zarflarda kalan tahmin: toplam tahmin - zarflardan harcanan (kategorili CC)
  const envelopeRemaining = Math.max(0, variableEstimate - categorizedCC);
  // Zarf taşması: kategorili harcama tahminden fazlaysa fark serbest bütçeden düşer
  const envelopeOverflow = Math.max(0, categorizedCC - variableEstimate);

  // Toplam harcama: sabit + taksit + borç + kategorili CC + kategorisiz CC + kart + kalan zarf tahmini + taşma
  const totalSpent = fixedTotal + installmentTotal + debtTotal + categorizedCC + uncategorizedCC + cardLoaded + envelopeRemaining + envelopeOverflow;
  const remaining = effectiveBudget - totalSpent;

  // === GENEL HARCAMA KARTI — yeni model ===
  const cardUsable = Math.max(0, Math.floor(remaining * CARD_USABLE_PCT));
  const cardLoadMaxPerTx = Math.floor(cardUsable * CARD_SINGLE_MAX_PCT);
  const cardLoadMaxTotal = cardUsable;
  const cardLoadRemaining = Math.max(0, cardLoadMaxTotal - cardLoaded);

  // === ACİL TAMPON ===
  const emergencyBuffer = Math.max(0, Math.floor(remaining * EMERGENCY_BUFFER_PCT));

  // === BİRİKİM HEDEFİ ===
  // Acil tampon harcanmazsa ay sonunda birikime eklenir
  const savingsTarget = emergencyBuffer;

  // CC transfer needed (sabit CC + CC tek çekim + taksitler)
  const ccTransferNeeded = fixedCC + ccSingleTotal + installmentTotal;

  // Geriye uyumluluk alanları
  const hasActualSpending = ccSingleTotal > 0 || cardLoaded > 0;
  const expectedVariable = envelopeRemaining + envelopeOverflow;
  const pendingVariable = envelopeRemaining;
  const availableForCard = cardUsable;
  const expectedCCSingle = hasActualSpending ? getCCSingleAvg(data, m) : 0;

  return { effectiveBudget, baseBudget, carryoverDeficit, fixedTotal, variableTotal, ccSingleTotal, installmentTotal, debtTotal, cardLoaded, cardLoadMaxPerTx, cardLoadMaxTotal, cardLoadRemaining, availableForCard, totalSpent, remaining, savingsTarget, expectedCCSingle, ccTransferNeeded, expectedVariable, pendingVariable, variableEstimate, categorizedCC, uncategorizedCC, envelopeRemaining, envelopeOverflow, emergencyBuffer, cardUsable };
}
function calcFlat(data, m, extraInst) {
  const md = data.months[m] || DM();
  const b = md.budget || data.settings.monthlyBudget;
  const ft = data.settings.fixedExpenses.reduce((s, e) => s + e.amount, 0);
  let inst = data.installmentPlans.reduce((s, p) => { let c = p.startMonth; for (let i = 0; i < p.months; i++) { if (c === m) return s + p.monthlyPayment; c = nmk(c); } return s; }, 0);
  if (extraInst) { let c = extraInst.startMonth; for (let i = 0; i < extraInst.months; i++) { if (c === m) { inst += extraInst.monthlyPayment; break; } c = nmk(c); } }
  const dt = data.debts.filter(d => d.remainingMonths > 0).reduce((s, d) => {
    if (d.currency === "TRY") return s + d.monthlyPayment;
    if (d.currency === "USD") return s + d.monthlyPayment * (data.liveRates?.USD || data.usdRates?.[m] || 0);
    if (d.currency === "EUR") return s + d.monthlyPayment * (data.liveRates?.EUR || data.eurRates?.[m] || 0);
    if (d.currency === "XAU") return s + d.monthlyPayment * (data.liveRates?.XAU || data.goldRates?.[m] || data.goldRates?.[cmk()] || 0);
    return s;
  }, 0);
  const cl = md.cardLoaded || 0;
  // Zarf mantığı: categorizedCC + uncategorizedCC + kalan tahmin
  const expectedVariableBase = (data.settings.variableExpenses || []).reduce((s, ve) => s + (ve.expectedAmount || 0), 0);
  const past3 = [pmk(pmk(pmk(m))), pmk(pmk(m)), pmk(m)]
    .map(pm => { const pmd = data.months[pm] || DM(); return (pmd.ccSingle || []).reduce((s2, e) => s2 + e.amount, 0); })
    .filter(t => t > 0);
  const variableEstimate = past3.length >= 2 ? Math.round(past3.reduce((s, t) => s + t, 0) / past3.length) : expectedVariableBase;
  const { categories: cats } = categorizeMonthSpending(data, m);
  const categorizedCC = Object.entries(cats).filter(([k]) => k !== "_uncategorized").reduce((s, [, v]) => s + v, 0);
  const uncategorizedCC = cats._uncategorized || 0;
  const envelopeRemaining = Math.max(0, variableEstimate - categorizedCC);
  const envelopeOverflow = Math.max(0, categorizedCC - variableEstimate);
  const totalSpent = ft + inst + dt + cl + categorizedCC + uncategorizedCC + envelopeRemaining + envelopeOverflow;
  return { remaining: b - totalSpent, totalSpent };
}

/* ═══ YAKLAŞAN ÖDEMELER ═══ */
function getUpcomingPayments(data, daysAhead = 3) {
  const today = new Date();
  const todayDay = today.getDate();
  const todayMonth = today.getMonth();
  const todayYear = today.getFullYear();
  const upcoming = [];

  const daysDiff = (payDay, payDayEnd) => {
    // Bu ay ve gelecek ay için kontrol et
    const results = [];
    for (let monthOffset = 0; monthOffset <= 1; monthOffset++) {
      const checkDate = new Date(todayYear, todayMonth + monthOffset, payDay);
      const diff = Math.floor((checkDate - today) / 86400000);
      if (diff >= 0 && diff <= daysAhead) {
        results.push({ diff, date: checkDate });
      }
      // Aralık gün varsa (payDayEnd)
      if (payDayEnd && payDayEnd > payDay) {
        for (let d = payDay; d <= payDayEnd; d++) {
          const cd = new Date(todayYear, todayMonth + monthOffset, d);
          const dd = Math.floor((cd - today) / 86400000);
          if (dd >= 0 && dd <= daysAhead) {
            results.push({ diff: dd, date: cd });
            break; // en yakın günü bulduk
          }
        }
      }
    }
    return results.length > 0 ? results[0] : null;
  };

  // Sabit giderler
  data.settings.fixedExpenses.forEach(exp => {
    if (!exp.paymentDay) return;
    const result = daysDiff(exp.paymentDay, exp.paymentDayEnd);
    if (result) {
      const isToday = result.diff === 0;
      const isTomorrow = result.diff === 1;
      upcoming.push({
        id: exp.id,
        type: "fixed",
        name: exp.name,
        amount: C(exp.amount),
        amountRaw: exp.amount,
        day: exp.paymentDay,
        dayEnd: exp.paymentDayEnd,
        diff: result.diff,
        label: isToday ? "Bugün" : isTomorrow ? "Yarın" : `${result.diff} gün sonra`,
        icon: exp.paymentMethod === "cc" ? "💳" : "🏦",
        color: isToday ? X.r : isTomorrow ? X.o : X.w,
        auto: exp.autoPayment || false,
      });
    }
  });

  // Borç ödemeleri
  data.debts.filter(d => d.remainingMonths > 0).forEach(debt => {
    if (!debt.paymentDay) return;
    const result = daysDiff(debt.paymentDay, debt.paymentDayEnd);
    if (result) {
      const isToday = result.diff === 0;
      const isTomorrow = result.diff === 1;
      const tlVal = debtTLValue(debt, data, cmk());
      upcoming.push({
        id: debt.id,
        type: "debt",
        name: debt.name,
        amount: C(tlVal),
        amountRaw: tlVal,
        day: debt.paymentDay,
        dayEnd: debt.paymentDayEnd,
        diff: result.diff,
        label: isToday ? "Bugün" : isTomorrow ? "Yarın" : `${result.diff} gün sonra`,
        icon: "📌",
        color: isToday ? X.r : isTomorrow ? X.o : X.w,
      });
    }
  });

  return upcoming.sort((a, b) => a.diff - b.diff);
}

// ICS takvim dosyası oluştur
function generateICS(data) {
  const events = [];
  const now = new Date();
  const year = now.getFullYear();

  const icsDate = (y, m, d) => `${y}${String(m+1).padStart(2,"0")}${String(d).padStart(2,"0")}`;

  // Sabit giderler → aylık tekrarlayan etkinlik
  data.settings.fixedExpenses.forEach(exp => {
    if (!exp.paymentDay) return;
    const day = exp.paymentDay;
    const uid2 = `fixed-${exp.id}@ev-butcesi`;
    events.push(
      `BEGIN:VEVENT\nDTSTART;VALUE=DATE:${icsDate(year, now.getMonth(), day)}\nSUMMARY:💰 ${exp.name} ${C(exp.amount)}\nDESCRIPTION:${exp.autoPayment ? "Otomatik ödeme" : "Manuel ödeme"} - Ev Bütçesi\nRRULE:FREQ=MONTHLY;BYMONTHDAY=${day}\nBEGIN:VALARM\nTRIGGER:-PT12H\nACTION:DISPLAY\nDESCRIPTION:Yarın: ${exp.name} ${C(exp.amount)}\nEND:VALARM\nBEGIN:VALARM\nTRIGGER:PT0S\nACTION:DISPLAY\nDESCRIPTION:Bugün: ${exp.name} ${C(exp.amount)}\nEND:VALARM\nUID:${uid2}\nEND:VEVENT`
    );
  });

  // Borçlar → aylık tekrarlayan etkinlik (kalan ay kadar)
  data.debts.filter(d => d.remainingMonths > 0).forEach(debt => {
    if (!debt.paymentDay) return;
    const day = debt.paymentDay;
    const tlVal = debtTLValue(debt, data, cmk());
    const uid2 = `debt-${debt.id}@ev-butcesi`;
    events.push(
      `BEGIN:VEVENT\nDTSTART;VALUE=DATE:${icsDate(year, now.getMonth(), day)}\nSUMMARY:📌 ${debt.name} ${C(tlVal)}\nDESCRIPTION:Borç ödemesi - ${debt.remainingMonths} ay kaldı - Ev Bütçesi\nRRULE:FREQ=MONTHLY;BYMONTHDAY=${day};COUNT=${debt.remainingMonths}\nBEGIN:VALARM\nTRIGGER:-PT12H\nACTION:DISPLAY\nDESCRIPTION:Yarın: ${debt.name} borç ödemesi\nEND:VALARM\nBEGIN:VALARM\nTRIGGER:PT0S\nACTION:DISPLAY\nDESCRIPTION:Bugün: ${debt.name} borç ödemesi\nEND:VALARM\nUID:${uid2}\nEND:VEVENT`
    );
  });

  // Taksitler → kalan ay kadar tekrarlayan etkinlik (15'inde varsayılan)
  data.installmentPlans.forEach(plan => {
    let remaining = 0;
    let cur = plan.startMonth;
    for (let i = 0; i < plan.months; i++) { if (cur >= cmk()) remaining++; cur = nmk(cur); }
    if (remaining <= 0) return;
    const uid2 = `inst-${plan.id}@ev-butcesi`;
    events.push(
      `BEGIN:VEVENT\nDTSTART;VALUE=DATE:${icsDate(year, now.getMonth(), 15)}\nSUMMARY:📅 Taksit: ${plan.note || "Taksitli harcama"} ${C(plan.monthlyPayment)}\nDESCRIPTION:${plan.months} taksit - ${remaining} ay kaldı - Ev Bütçesi\nRRULE:FREQ=MONTHLY;BYMONTHDAY=15;COUNT=${remaining}\nBEGIN:VALARM\nTRIGGER:-PT12H\nACTION:DISPLAY\nDESCRIPTION:Yarın: ${plan.note || "Taksit"} ${C(plan.monthlyPayment)}\nEND:VALARM\nUID:${uid2}\nEND:VEVENT`
    );
  });

  const ics = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Ev Bütçesi//TR\nCALSCALE:GREGORIAN\nMETHOD:PUBLISH\nX-WR-CALNAME:Ev Bütçesi Ödemeleri\n${events.join("\n")}\nEND:VCALENDAR`;
  return ics;
}

function downloadICS(data) {
  const ics = generateICS(data);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "ev-butcesi-odemeler.ics";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ═══ DÖKÜM HELPER ═══ */
function getMonthBreakdown(data, m) {
  const mc = calcMonth(data, m, null);
  const md = data.months[m] || DM();
  const rows = [];
  rows.push({ label: "Aylık bütçe", value: mc.effectiveBudget, color: X.g });
  if (mc.carryoverDeficit > 0) rows.push({ label: "Önceki aydan devir", value: mc.carryoverDeficit, sign: "−", color: X.o });
  if (mc.fixedTotal > 0) {
    rows.push({ label: `Sabit giderler (${data.settings.fixedExpenses.length} kalem)`, value: mc.fixedTotal, sign: "−" });
  }
  if (mc.installmentTotal > 0) {
    const planCount = data.installmentPlans.filter(p => { let c = p.startMonth; for (let i = 0; i < p.months; i++) { if (c === m) return true; c = nmk(c); } return false; }).length;
    rows.push({ label: `Taksitler (${planCount} plan)`, value: mc.installmentTotal, sign: "−", color: X.p });
  }
  if (mc.debtTotal > 0) {
    const activeDebts = data.debts.filter(d => d.remainingMonths > 0);
    const debtNames = activeDebts.map(d => d.name).join(", ");
    rows.push({ label: `Borç ödemeleri (${debtNames})`, value: mc.debtTotal, sign: "−", color: X.w });
  }
  // Kategorili CC harcamaları (zarflardan harcanan)
  if (mc.categorizedCC > 0) {
    rows.push({ label: `Kategorili harcamalar`, value: mc.categorizedCC, sign: "−", color: X.b });
  }
  // Kategorisiz CC harcamaları
  if (mc.uncategorizedCC > 0) {
    rows.push({ label: `Kategorisiz harcamalar`, value: mc.uncategorizedCC, sign: "−", color: X.o });
  }
  // Kart yükleme
  if (mc.cardLoaded > 0) {
    rows.push({ label: "Genel harcama kartı", value: mc.cardLoaded, sign: "−", color: X.g });
  }
  // Değişken gider kalan tahmini
  if (mc.envelopeRemaining > 0) {
    const hasAvg = mc.variableEstimate !== (data.settings.variableExpenses || []).reduce((s, ve) => s + (ve.expectedAmount || 0), 0);
    rows.push({ label: hasAvg ? "Kalan değişken gider (3 ay ort.)" : "Kalan değişken gider (tahmini)", value: mc.envelopeRemaining, sign: "−", sub: "henüz harcanmamış" });
  }
  // Zarf taşması
  if (mc.envelopeOverflow > 0) {
    rows.push({ label: "Kategori taşması", value: mc.envelopeOverflow, sign: "−", color: X.r });
  }
  return { rows, mc };
}

/* ═══ RISK ═══ */
function calcRisk(data, mk) {
  const c = calcMonth(data, mk, null);
  const md = data.months[mk] || DM();
  let score = 0;
  const details = [];

  /*
   * 5 FAKTÖRLÜ RİSK MODELİ
   * Kişisel finans ve işletme bütçeleme ilkelerine dayalı.
   * Toplam: 100 puan (0 = en güvenli, 100 = en kritik)
   *
   * F1: Bu Ay Kalan Bütçe Oranı (25p) — Bu ayın kalan bütçe yüzdesi
   * F2: 12 Aylık Sürdürülebilirlik (25p) — Gelecek 12 ay projeksiyon
   * F3: Genel Harcama Kartı Kapasitesi (20p) — aylık serbest bütçe kontrolü
   * F4: Harcama Eğilimi (15p) — Son 3 ayın karşılaştırması
   * F5: Yaklaşan Gider Artışları (15p) — Yaklaşan maliyet artışları
   */

  // F1: Bu Ay Kalan Bütçe Oranı (25 puan)
  // İlke: Kalan bütçenin toplam bütçeye oranı, acil ödeme kapasitesini gösterir
  let f1 = 0;
  if (c.effectiveBudget > 0) {
    const ratio = c.remaining / c.effectiveBudget;
    if (ratio < 0) f1 = 25;
    else if (ratio < 0.05) f1 = 22;
    else if (ratio < 0.10) f1 = 18;
    else if (ratio < 0.20) f1 = 12;
    else if (ratio < 0.35) f1 = 6;
    else if (ratio < 0.50) f1 = 2;
  }
  score += f1;
  const remainPct = c.effectiveBudget > 0 ? Math.round((c.remaining / c.effectiveBudget) * 100) : 0;
  details.push({ label: "Bu ay kalan bütçe oranı", score: f1, max: 25, desc: c.effectiveBudget > 0 ? `Bütçenin %${remainPct}'i kullanılabilir` : "Bütçe tanımsız" });

  // F2: 12 Aylık Sürdürülebilirlik (25 puan)
  // İlke: İşletme sürekliliği — mevcut gider yapısı kaç ay sürdürülebilir
  let f2 = 0, mudm = 99;
  let m = nmk(mk);
  for (let i = 0; i < 12; i++) {
    const fc = calcMonth(data, m, null);
    if (fc.remaining < 0) { mudm = i + 1; break; }
    m = nmk(m);
  }
  if (mudm <= 1) f2 = 25;
  else if (mudm <= 2) f2 = 22;
  else if (mudm <= 3) f2 = 18;
  else if (mudm <= 4) f2 = 14;
  else if (mudm <= 6) f2 = 9;
  else if (mudm <= 9) f2 = 4;
  else if (mudm <= 12) f2 = 1;
  score += f2;
  details.push({ label: "12 aylık sürdürülebilirlik durumu", score: f2, max: 25, desc: mudm > 12 ? "Önümüzdeki 12 ay bütçe aşımı yok" : `${mudm} ay sonra bütçe aşımı oluşabilir` });

  // F3: Serbest Bütçe Kapasitesi (20 puan)
  // İlke: Tüm giderler düşüldükten sonra kalan serbest bütçe — harcama esnekliği
  let f3 = 0;
  const currentCardAvail = c.cardUsable;
  // Gelecek 6 ayın en kötü durumunu da kontrol et
  let worstCardAvail = currentCardAvail;
  let wm = nmk(mk);
  for (let i = 0; i < 6; i++) {
    const fc = calcMonth(data, wm, null);
    if (fc.cardUsable < worstCardAvail) worstCardAvail = fc.cardUsable;
    wm = nmk(wm);
  }
  const effectiveCardAvail = Math.min(currentCardAvail, worstCardAvail);
  if (effectiveCardAvail < 0) f3 = 20;
  else if (effectiveCardAvail < 10000) f3 = 17;
  else if (effectiveCardAvail < 20000) f3 = 13;
  else if (effectiveCardAvail < 30000) f3 = 8;
  else if (effectiveCardAvail < 40000) f3 = 3;
  score += f3;
  details.push({ label: "Serbest bütçe kapasitesi", score: f3, max: 20, desc: `Kullanılabilir: ${C(effectiveCardAvail)}` });

  // F4: Harcama Eğilimi (15 puan)
  // İlke: Son 3 ayın harcama ortalamasına göre bu ayın trendi.
  // Artan harcama trendi sürdürülebilirliği tehdit eder.
  let f4 = 0;
  const p3 = [pmk(pmk(mk)), pmk(mk), mk].map(m2 => calcMonth(data, m2, null).totalSpent).filter(t => t > 0);
  let trendPct = 0;
  if (p3.length >= 2) {
    const prev = p3.length >= 3 ? (p3[0] + p3[1]) / 2 : p3[0];
    const current = p3[p3.length - 1];
    if (prev > 0) {
      trendPct = Math.round(((current - prev) / prev) * 100);
      if (trendPct > 25) f4 = 15;
      else if (trendPct > 15) f4 = 11;
      else if (trendPct > 8) f4 = 7;
      else if (trendPct > 3) f4 = 3;
    }
  }
  score += f4;
  details.push({ label: "Harcama eğilimi (son 3 ay)", score: f4, max: 15, desc: trendPct > 0 ? `%${trendPct} artış` : "Harcamalar artış göstermiyor" });

  // F5: Yaklaşan Gider Artışları (15 puan)
  // İlke: Bilinen gelecek yükümlülükler (sabit gider artışları) bütçe
  // planlamasında proaktif risk oluşturur
  let f5 = 0, incCount = 0, incTotal = 0;
  let um = nmk(mk);
  for (let i = 0; i < 6; i++) {
    data.settings.fixedExpenses.forEach(exp => {
      if (exp.increaseDate && exp.increaseDate.startsWith(um)) {
        incCount++;
        incTotal += exp.amount * 0.20; // tahmini %20 artış etkisi
      }
    });
    um = nmk(um);
  }
  const incImpactPct = c.effectiveBudget > 0 ? (incTotal / c.effectiveBudget) * 100 : 0;
  if (incImpactPct > 15) f5 = 15;
  else if (incImpactPct > 8) f5 = 11;
  else if (incCount >= 3) f5 = 9;
  else if (incCount >= 2) f5 = 6;
  else if (incCount >= 1) f5 = 3;
  score += f5;
  details.push({ label: "Yaklaşan gider artışları", score: f5, max: 15, desc: incCount > 0 ? `${incCount} kalem, tahmini etki: ${C(incTotal)}/ay` : "Artış beklenen gider yok" });

  return { score: Math.min(100, score), details, monthsUntilDeficit: mudm, trendPct };
}
function getRiskInfo(score) { if (score >= 70) return { label: "KRİTİK", sub: "Harcamalar derhal kısılmalı", color: X.r }; if (score >= 50) return { label: "YÜKSEK", sub: "Harcamalarınızı gözden geçirin", color: "#FF6B35" }; if (score >= 30) return { label: "ORTA", sub: "Dikkatli olun", color: X.w }; if (score >= 15) return { label: "DÜŞÜK", sub: "Kontrol altında", color: "#84CC16" }; return { label: "GÜVENLİ", sub: "Bütçeniz sağlıklı", color: X.g }; }

function genWarnings(data, mk) {
  const w = []; const up3 = [nmk(mk), nmk(nmk(mk)), nmk(nmk(nmk(mk)))];
  data.settings.fixedExpenses.forEach(exp => { if (exp.increaseDate) { const i = up3.indexOf(exp.increaseDate.slice(0, 7)); if (i >= 0) w.push({ icon: "📈", msg: `"${exp.name}" ${i + 1} ay sonra artış yapacak.`, color: X.o }); } });
  let m = nmk(mk); for (let i = 0; i < 6; i++) { const fc = calcMonth(data, m, null); if (fc.remaining < 0) { w.push({ icon: "🚨", msg: `${i + 1} ay sonra (${ml(m)}) bütçe ${C(Math.abs(fc.remaining))} açık verecek!`, color: X.r }); break; } m = nmk(m); }
  const c = calcMonth(data, mk, null); if (c.remaining < 0) w.push({ icon: "🚨", msg: `Bu ay ${C(Math.abs(c.remaining))} açık!`, color: X.r }); else if (c.remaining < c.effectiveBudget * 0.1) w.push({ icon: "⚠️", msg: "Kalan bütçe %10'un altında.", color: X.w });
  // Zarf taşması uyarısı
  if (c.envelopeOverflow > 0) w.push({ icon: "⚠️", msg: `Değişken gider kategorilerinde ${C(c.envelopeOverflow)} taşma var.`, color: X.w });
  if (c.carryoverDeficit > 0) w.push({ icon: "📉", msg: `Geçen aydan ${C(c.carryoverDeficit)} devir.`, color: X.o });
  // Acil tampon uyarısı
  if (c.emergencyBuffer < 5000 && c.remaining > 0) w.push({ icon: "⚠️", msg: `Acil tampon ${C(c.emergencyBuffer)} — beklenmeyen giderler için yetersiz.`, color: X.w });
  return w;
}

/* ═══ INFO TEXTS ═══ */
const INFO = {
  ccSingle: { title: "Kredi Kartı Tek Çekim", text: "Kredi kartınızla tek seferde yaptığınız harcamaları buraya kaydedersiniz. Bu tutar anında bütçenizden düşer ve aynı zamanda ay sonunda kredi kartı hesabınıza aktarmanız gereken tutara eklenir.\n\nÖrnek: Marketten 500 ₺'lik bir alışveriş yaptınız, kredi kartıyla tek çekim ödediyseniz buraya 500 ₺ girersiniz." },
  ccInstall: { title: "Kredi Kartı Taksitli", text: "Kredi kartıyla taksitli yaptığınız harcamalarınızın toplam aylık taksit yükünü gösterir. Yeni bir taksitli alışveriş eklediğinizde, ilk taksit gelecek aydan itibaren bütçenize otomatik yansır.\n\nÖrnek: 30.000 ₺ × 6 taksit alırsanız, 6 ay boyunca her ay 5.000 ₺ bütçenizden düşülür." },
  cardLoad: { title: "Genel Harcama Kartı", text: "Aylık harcamalar için kullandığınız banka kartı. Restoran, kıyafet, çocuk harcamaları, ufak tefek alımlar buradan yapılır.\n\nKuralı: Serbest bütçenin (kalan) en fazla %75'i karta aktarılabilir. Tek seferde bu tutarın en fazla %70'i yüklenebilir. Kalan %25 acil tampon olarak korunur.\n\nHaftalık parça parça yükleme yaparak bütçe kontrolünü artırabilirsiniz." },
  debt: { title: "Borç Ödemeleri", text: "Aktif borçlarınızın bu ay ödemeniz gereken toplam tutarını gösterir. Türk Lirası, dolar veya altın bazlı borçlarınız olabilir. Dolar ve altın borçları için güncel kur kullanılır.\n\nHer borç ödemesi yaptığınızda 'Ödedim' butonuna basarak teyit edersiniz, kalan taksit sayısı azalır." },
  simulate: { title: "Taksit Simülasyonu", text: "Yeni bir taksitli alım yapmadan önce 'şu kadar X taksitle alırsam bütçem nasıl etkilenir' sorusunu test etmek için kullanılır.\n\nTutar ve taksit sayısını girin, 'Simüle Et' deyin. Uygulama gelecek 6-8 ayın bütçenizin durumunu hem mevcut hem de bu taksitli alımla birlikte gösterir. Güvenliyse 'Onayla ve Kaydet' diyerek doğrudan kredi kartı taksitli kısmına ekleyebilirsiniz." },
  savings: { title: "Birikim", text: "Bu ayın birikim potansiyelini gösterir.\n\nSerbest bütçenin %25'i acil tampon olarak ayrılır. Bu tampon ay içinde harcanmazsa ay sonunda otomatik olarak TL birikim havuzuna eklenir.\n\nAcil durumda (araç kazası, hastane vb.) tampon yetmezse TL birikimden kullanılabilir. Ancak toplam birikiminizin en az %15'i TL olarak tutulmak zorundadır." },
  fixed: { title: "Sabit Zorunlu Giderler", text: "Her ay sabit ve zorunlu olarak ödenen giderler. Kira, aidat, ev yardımcısı, burslar, sabit destek tutarları gibi.\n\nBu giderlerin tutarları belirli ve değişmez. Artış tarihleri tanımlanmışsa uygulama o tarih yaklaştığında uyarı verir. Her birini ödediğinizde 'Ödedim' butonuyla teyit edersiniz." },
  variable: { title: "Değişken Zorunlu Giderler", text: "Her ay ödemek zorunda olduğunuz ama tutarı değişen giderler. Elektrik, su, doğalgaz, internet, telefon, akaryakıt, yemek kartı yüklemesi gibi.\n\nHer kalem için bir 'beklenen tutar' belirlersiniz. Eğer girdiğiniz tutar beklenen tutarın %10'undan fazla aşarsa uygulama uyarı verir — böylece anormal faturaları erken yakalarsınız." },
  risk: { title: "Risk Skoru", text: "0-100 arası bir puan. 0 en güvenli, 100 en kritik durum.\n\nBeş faktöre bakılarak hesaplanır:\n\n1. Bu Ay Kalan Bütçe Oranı (25 puan): Bu ayın kalan bütçesinin toplam bütçeye oranı. Beklenmedik harcamalara karşı tampon gücünüzü gösterir. %50 üstü güvenli, %10 altı kritik.\n\n2. 12 Aylık Sürdürülebilirlik Durumu (25 puan): Mevcut harcama düzeniyle gelecek 12 ay içinde bütçe aşımı oluşup oluşmayacağını hesaplar. Değişken gider tahminlerini de içerir.\n\n3. Genel Harcama Kartı Kapasitesi (20 puan): Tüm zorunlu çıkışlar düşüldükten sonra genel harcama kartına yüklenebilecek aylık tutarı ölçer. Alt limit: 40.000 ₺. Gelecek 6 ayın en kötü durumunu da hesaba katar.\n\n4. Harcama Eğilimi (15 puan): Son 3 ayın harcama ortalamasına göre bu ayın artış/azalış yönünü analiz eder. Sürekli artan harcama eğilimi bütçeyi tehdit eder.\n\n5. Yaklaşan Gider Artışları (15 puan): Önümüzdeki 6 ay içinde bilinen sabit gider artışlarını ve bunların bütçeye toplam etkisini değerlendirir.\n\nSeviyeler: 0-14 GÜVENLİ, 15-29 DÜŞÜK, 30-49 ORTA, 50-69 YÜKSEK, 70-100 KRİTİK." },
  ccTransfer: { title: "Kredi Kartına Aktarılacak Tutar", text: "Bu ay kredi kartından yapılan tüm ödemelerin (sabit, değişken, tek çekim, taksitler) toplamıdır. Ay sonunda bu tutarı bankada kredi kartı hesabınıza aktarmanız gerekiyor — böylece kredi kartı borcunuz hesabınızdaki kullanılabilir bakiyeyi yanıltmaz." },
};

/* ═══ RISK BAR ═══ */
function RiskBar({ score, onInfo, warnings }) {
  const hasWarnings = warnings && warnings.length > 0;
  if (!hasWarnings) return null;
  return (
    <div style={{ margin: "0 0 12px", padding: "10px 14px", borderRadius: 14, ...glass }}>
      {warnings.map((w, i) => (
        <div key={i} style={{ color: w.color, fontSize: 12, fontWeight: 600, lineHeight: 1.5, padding: "3px 0" }}>{w.icon} {w.msg}</div>
      ))}
    </div>
  );
}

/* ═══ TABS ═══ */
const TABS = [{ id: "home", label: "Güncel Durum", icon: "◉" }, { id: "report", label: "Analiz", icon: "▤" }, { id: "plan", label: "Planlama", icon: "◈" }, { id: "settings", label: "Ayarlar", icon: "⚙" }];
function TabBar({ tab, setTab }) { return (<div style={{ position: "fixed", bottom: 0, left: 0, right: 0, ...glassSolid, borderRadius: "16px 16px 0 0", display: "flex", justifyContent: "space-around", alignItems: "center", padding: "6px 0 env(safe-area-inset-bottom, 8px)", zIndex: 100, boxShadow: "0 -4px 16px rgba(0,0,0,0.06)" }}>{TABS.map((t, i) => (<React.Fragment key={t.id}>{i > 0 && <div style={{ width: 1, height: 22, background: "rgba(0,0,0,0.1)" }} />}<button onClick={() => setTab(t.id)} style={{ background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "6px 10px", cursor: "pointer", color: tab === t.id ? X.g : X.td, fontFamily: ff }}><span style={{ fontSize: 18, lineHeight: 1 }}>{t.icon}</span><span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "-0.2px" }}>{t.label}</span></button></React.Fragment>))}</div>); }

/* ═══ MODALS ═══ */
function CCSingleModal({ cards, variableExpenses, onClose, onSave }) {
  const [a, sa] = useState(""); const [n, sn] = useState(""); const [d, sd] = useState(td());
  const [cardId, setCardId] = useState(cards[0]?.id || "");
  const [categoryId, setCategoryId] = useState("");
  const [userChanged, setUserChanged] = useState(false);

  useEffect(() => {
    if (userChanged) return;
    const matched = matchCategory(n, variableExpenses || []);
    if (matched) setCategoryId(matched);
  }, [n, userChanged, variableExpenses]);

  const handleCategoryChange = v => { setCategoryId(v); setUserChanged(true); };

  return (
    <Modal title="💳 Kredi Kartı Tek Çekim" onClose={onClose}>
      {cards.length === 0 ? (
        <div style={{ color: X.w, fontSize: 13, marginBottom: 12, padding: 10, background: X.wd, borderRadius: 8 }}>⚠️ Önce Ayarlar → Kartlarım'dan en az bir kart eklemelisiniz.</div>
      ) : (
        <Sel label="Hangi Kart" value={cardId} onChange={setCardId} options={cards.map(c => ({ v: c.id, l: c.name }))} />
      )}
      <Inp label="Tutar" type="number" value={a} onChange={sa} suffix="₺" />
      <Inp label="Harcama Açıklaması" value={n} onChange={sn} placeholder="Örn: Shell Çumra, File market" />
      {(variableExpenses || []).length > 0 && (
        <Sel label="Kategori" value={categoryId} onChange={handleCategoryChange} options={[{ v: "", l: "— Otomatik / Kategorisiz —" }, ...(variableExpenses || []).map(ve => ({ v: ve.id, l: (ve.icon || "📋") + " " + ve.name }))]} />
      )}
      {categoryId && !userChanged && <div style={{ color: X.g, fontSize: 11, marginTop: -8, marginBottom: 12 }}>✓ Anahtar kelime eşleşmesi bulundu</div>}
      <Inp label="Tarih" type="date" value={d} onChange={sd} />
      <Btn onClick={() => { if (!a || !cardId) return; onSave({ id: uid(), amount: parseFloat(a), note: n, merchantName: "", date: d, cardId, categoryId: categoryId || null }); onClose(); }} disabled={!cardId}>💳 Kaydet</Btn>
    </Modal>
  );
}

function CardLoadModal({ currentLoaded, maxPerTx, maxTotal, onClose, onSave, onEdit }) {
  const [a, sa] = useState("");
  const amt = parseFloat(a) || 0;
  const remaining = Math.max(0, maxTotal - currentLoaded);
  const wouldExceedTx = amt > maxPerTx;
  const wouldExceedTotal = (currentLoaded + amt) > maxTotal;
  const canSave = amt > 0 && !wouldExceedTx && !wouldExceedTotal;

  return (
    <Modal title="🛒 Kart Yükleme" onClose={onClose}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <div><div style={{ color: X.tm, fontSize: 11 }}>Bu Ay Yüklenen</div><div style={{ color: X.t, fontSize: 22, fontWeight: 800, fontFamily: fm }}>{C(currentLoaded)}</div></div>
        <div style={{ textAlign: "right" }}><div style={{ color: X.tm, fontSize: 11 }}>Aylık Yükleme Limiti</div><div style={{ color: X.td, fontSize: 22, fontWeight: 800, fontFamily: fm }}>{C(maxTotal)}</div></div>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: X.border, marginBottom: 8 }}><div style={{ height: "100%", borderRadius: 2, background: X.g, width: `${maxTotal > 0 ? Math.min((currentLoaded / maxTotal) * 100, 100) : 0}%` }} /></div>
      <div style={{ color: X.tm, fontSize: 11, marginBottom: 12 }}>Tek seferde maks: {C(maxPerTx)} • Bu ay yüklenebilir: {C(remaining)}</div>
      <Inp label="Tutar" type="number" value={a} onChange={sa} suffix="₺" />
      {wouldExceedTx && <div style={{ color: X.r, fontSize: 12, marginBottom: 8 }}>⚠️ Tek seferde maksimum {C(maxPerTx)} yükleyebilirsiniz</div>}
      {!wouldExceedTx && wouldExceedTotal && <div style={{ color: X.r, fontSize: 12, marginBottom: 8 }}>⚠️ Bu ay toplam {C(maxTotal)} sınırını aşıyor</div>}
      <Btn onClick={() => { if (!canSave) return; onSave(amt); onClose(); }} disabled={!canSave}>🛒 Yükle</Btn>
      {currentLoaded > 0 && onEdit && <div style={{ marginTop: 10 }}><Btn v="outline" c={X.td} onClick={() => { onEdit(); onClose(); }}>✎ Toplam Tutarı Düzelt</Btn></div>}
    </Modal>
  );
}

function debtCurSymbol(c) { return c === "TRY" ? "₺" : c === "XAU" ? "gr" : c === "EUR" ? "€" : "$"; }
function debtTLValue(debt, data, m) {
  if (debt.currency === "TRY") return debt.monthlyPayment;
  if (debt.currency === "USD") return debt.monthlyPayment * (data.liveRates?.USD || data.usdRates?.[m] || 0);
  if (debt.currency === "EUR") return debt.monthlyPayment * (data.liveRates?.EUR || data.eurRates?.[m] || 0);
  if (debt.currency === "XAU") return debt.monthlyPayment * (data.liveRates?.XAU || data.goldRates?.[m] || data.goldRates?.[cmk()] || 0);
  return 0;
}

function DebtPayModal({ debts, debtPayments, data, mk, onClose, onPay, onUndo }) {
  const active = debts.filter(d => d.remainingMonths > 0 || debtPayments?.[d.id]);
  return (
    <Modal title="📌 Borç Ödemesi" onClose={onClose}>
      {active.length === 0 && <p style={{ color: X.tm }}>Aktif borç yok.</p>}
      {active.map(debt => {
        const paid = debtPayments?.[debt.id];
        const sym = debtCurSymbol(debt.currency);
        const tlVal = debtTLValue(debt, data, mk);
        return (
          <Card key={debt.id} s={{ marginBottom: 8, opacity: paid ? .6 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: X.t, fontWeight: 700 }}>{debt.name}</div>
                <div style={{ color: X.tm, fontSize: 12 }}>
                  <span style={{ fontFamily: fm }}>{debt.monthlyPayment} {sym}</span>
                  {debt.currency !== "TRY" && <span style={{ color: X.td }}> ({C(tlVal)})</span>}
                  <span> aylık · {debt.remainingMonths} taksit kaldı</span>
                </div>
              </div>
              {paid ? <button onClick={() => onUndo(debt.id)} style={{ background: "none", border: `1px solid ${X.td}`, borderRadius: 8, padding: "6px 12px", color: X.td, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>↩ Geri Al</button> : <Btn onClick={() => onPay(debt.id)} s={{ width: "auto", padding: "8px 16px", fontSize: 13 }}>Ödedim</Btn>}
            </div>
          </Card>
        );
      })}
    </Modal>
  );
}
function EmergencyFundSettings({ data, setData, onBack }) {
  const fixedTotal = data.settings.fixedExpenses.reduce((s, e) => s + e.amount, 0);
  const variableTotal2 = (data.settings.variableExpenses || []).reduce((s, ve) => s + (ve.expectedAmount || 0), 0);
  const instTotal = data.installmentPlans.reduce((s, p) => s + p.monthlyPayment, 0);
  const debtTotal2 = data.debts.filter(d => d.remainingMonths > 0).reduce((s, d) => { if (d.currency === "TRY") return s + d.monthlyPayment; if (d.currency === "XAU") return s + d.monthlyPayment * (data.liveRates?.XAU || 0); if (d.currency === "USD") return s + d.monthlyPayment * (data.liveRates?.USD || 0); if (d.currency === "EUR") return s + d.monthlyPayment * (data.liveRates?.EUR || 0); return s; }, 0);
  const monthlyTotal = fixedTotal + variableTotal2 + instTotal + debtTotal2;
  const suggested3x = Math.round(monthlyTotal * 3);
  const suggested6x = Math.round(monthlyTotal * 6);
  const current = data.settings.emergencyFundTarget;
  const [val, setVal] = useState(current ? String(current) : "");

  const save = v => {
    setData(d => ({ ...d, settings: { ...d.settings, emergencyFundTarget: v || null } }));
    setVal(v ? String(v) : "");
  };

  const currentTotal = getTotalSavingsTL(data);
  const target = parseFloat(val) || current || 0;
  const progress = target > 0 ? Math.min((currentTotal / target) * 100, 100) : 0;

  return (
    <div style={{ padding: "20px 16px 100px" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: X.g, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: ff, padding: 0, marginBottom: 16 }}>← Geri</button>
      <h3 style={{ color: X.t, fontSize: 16, margin: "0 0 12px" }}>🛡️ Acil Durum Fonu</h3>
      <p style={{ color: X.td, fontSize: 12, marginBottom: 16 }}>Acil durum fonu, beklenmedik durumlarda (iş kaybı, sağlık harcaması, büyük tamirat vs.) kullanabileceğiniz güvenlik havuzudur. Hedef belirlediğinizde birikim havuzunuz bu hedefe göre ölçülür.</p>

      {target > 0 && (
        <Card s={{ marginBottom: 12, background: "rgba(15,118,110,0.35)", border: "1px solid rgba(15,118,110,0.30)" }}>
          <div style={{ color: X.g, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>HEDEFE İLERLEMEN</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <span style={{ color: X.t, fontSize: 22, fontWeight: 800, fontFamily: fm }}>{C(currentTotal)}</span>
            <span style={{ color: X.tm, fontSize: 13, fontFamily: fm }}>/ {C(target)}</span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: "rgba(0,0,0,0.06)", overflow: "hidden", marginBottom: 6 }}>
            <div style={{ height: "100%", borderRadius: 4, background: X.g, width: `${progress}%`, transition: "width 0.5s" }} />
          </div>
          <div style={{ color: X.g, fontSize: 12, fontWeight: 700, textAlign: "right" }}>%{progress.toFixed(1)}</div>
        </Card>
      )}

      <Card s={{ marginBottom: 12 }}>
        <div style={{ color: X.tm, fontSize: 12, fontWeight: 700, marginBottom: 10 }}>HEDEF TUTAR BELİRLE</div>
        <Inp label="Hedef Tutar" type="number" value={val} onChange={setVal} suffix="₺" placeholder={suggested3x > 0 ? C(suggested3x).replace("₺", "").trim() : "Örn: 480.000"} />
        <Btn onClick={() => save(parseFloat(val) || 0)}>Kaydet</Btn>
      </Card>

      {fixedTotal > 0 && (
        <Card s={{ marginBottom: 12 }}>
          <div style={{ color: X.tm, fontSize: 12, fontWeight: 700, marginBottom: 10 }}>HIZLI ÖNERİLER</div>
          <p style={{ color: X.td, fontSize: 11, marginBottom: 10 }}>Sabit zorunlu giderlerinizin ({C(fixedTotal)}/ay) katlarına göre hesaplanmış öneriler:</p>
          <div onClick={() => { setVal(String(suggested3x)); save(suggested3x); }} style={{ background: X.bd, border: `1px solid ${X.b}`, borderRadius: 10, padding: "12px 14px", marginBottom: 8, cursor: "pointer" }}>
            <div style={{ color: X.b, fontSize: 12, fontWeight: 700 }}>3 aylık gider (muhafazakâr)</div>
            <div style={{ color: X.t, fontSize: 16, fontWeight: 800, fontFamily: fm, marginTop: 2 }}>{C(suggested3x)}</div>
            <div style={{ color: X.td, fontSize: 10, marginTop: 2 }}>Kısa süreli belirsizlikler için yeterli</div>
          </div>
          <div onClick={() => { setVal(String(suggested6x)); save(suggested6x); }} style={{ background: X.pd, border: `1px solid ${X.p}`, borderRadius: 10, padding: "12px 14px", cursor: "pointer" }}>
            <div style={{ color: X.p, fontSize: 12, fontWeight: 700 }}>6 aylık gider (güvenli)</div>
            <div style={{ color: X.t, fontSize: 16, fontWeight: 800, fontFamily: fm, marginTop: 2 }}>{C(suggested6x)}</div>
            <div style={{ color: X.td, fontSize: 10, marginTop: 2 }}>Uzun süreli koruma için ideal</div>
          </div>
        </Card>
      )}

      {current && (
        <Card s={{ border: `1px solid ${X.r}`, background: X.rd }}>
          <Btn c={X.r} v="outline" onClick={() => save(0)}>Hedefi Kaldır</Btn>
        </Card>
      )}
    </div>
  );
}

function BackupSettings({ data, setData, onBack }) {
  const [msg, setMsg] = useState(null);
  const [importData, setImportData] = useState("");

  const exportData = () => {
    try {
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, ".");
      a.download = `ev-butcesi-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setMsg({ type: "success", text: "✓ Yedek dosyası indirildi" });
      setTimeout(() => setMsg(null), 3000);
    } catch (err) {
      setMsg({ type: "error", text: "Hata: " + err.message });
    }
  };

  const importFile = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const parsed = JSON.parse(evt.target.result);
        if (!parsed.settings || !parsed.months) throw new Error("Geçersiz yedek dosyası");
        if (!confirm("Mevcut tüm verilerinizin üzerine yazılacak. Emin misiniz?")) return;
        setData({ ...DD, ...parsed, settings: { ...DD.settings, ...(parsed.settings || {}) } });
        setMsg({ type: "success", text: "✓ Yedek başarıyla geri yüklendi" });
        setTimeout(() => setMsg(null), 3000);
      } catch (err) {
        setMsg({ type: "error", text: "Hata: " + err.message });
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  };

  const copyToClipboard = async () => {
    try {
      const json = JSON.stringify(data, null, 2);
      await navigator.clipboard.writeText(json);
      setMsg({ type: "success", text: "✓ Panoya kopyalandı" });
      setTimeout(() => setMsg(null), 3000);
    } catch (err) {
      setMsg({ type: "error", text: "Kopyalama başarısız" });
    }
  };

  const pasteImport = () => {
    try {
      const parsed = JSON.parse(importData);
      if (!parsed.settings || !parsed.months) throw new Error("Geçersiz yedek");
      if (!confirm("Mevcut tüm verilerinizin üzerine yazılacak. Emin misiniz?")) return;
      setData({ ...DD, ...parsed, settings: { ...DD.settings, ...(parsed.settings || {}) } });
      setMsg({ type: "success", text: "✓ Yedek başarıyla geri yüklendi" });
      setImportData("");
      setTimeout(() => setMsg(null), 3000);
    } catch (err) {
      setMsg({ type: "error", text: "Hata: " + err.message });
    }
  };

  const dataSize = new Blob([JSON.stringify(data)]).size;
  const sizeKB = (dataSize / 1024).toFixed(1);

  return (
    <div style={{ padding: "20px 16px 100px" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: X.g, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: ff, padding: 0, marginBottom: 16 }}>← Geri</button>
      <h3 style={{ color: X.t, fontSize: 16, margin: "0 0 12px" }}>💾 Yedekleme</h3>
      <p style={{ color: X.td, fontSize: 12, marginBottom: 16 }}>Tüm verileriniz tarayıcınızda saklanıyor. Telefon değişikliği, tarayıcı temizliği veya veri kaybı durumunda verileriniz gider. Düzenli olarak yedek almanız şiddetle tavsiye edilir.</p>

      {msg && (
        <Card s={{ marginBottom: 12, background: msg.type === "success" ? X.gd : X.rd, border: `1px solid ${msg.type === "success" ? X.g : X.r}` }}>
          <div style={{ color: msg.type === "success" ? X.g : X.r, fontSize: 13, fontWeight: 700 }}>{msg.text}</div>
        </Card>
      )}

      <Card s={{ marginBottom: 12 }}>
        <div style={{ color: X.tm, fontSize: 12, fontWeight: 700, marginBottom: 4 }}>MEVCUT VERİ</div>
        <div style={{ color: X.t, fontSize: 14, fontFamily: fm }}>{sizeKB} KB</div>
        <div style={{ color: X.td, fontSize: 11, marginTop: 4 }}>
          {Object.keys(data.months).length} ay kaydı • {(data.settings.fixedExpenses || []).length} sabit gider • {(data.debts || []).length} borç • {(data.installmentPlans || []).length} taksit
        </div>
      </Card>

      <Card s={{ marginBottom: 12 }}>
        <div style={{ color: X.tm, fontSize: 12, fontWeight: 700, marginBottom: 10 }}>DIŞA AKTAR</div>
        <Btn onClick={exportData} s={{ marginBottom: 8 }}>📥 JSON Dosyası Olarak İndir</Btn>
        <Btn onClick={copyToClipboard} v="outline" c={X.b}>📋 Panoya Kopyala</Btn>
      </Card>

      <Card s={{ marginBottom: 12 }}>
        <div style={{ color: X.tm, fontSize: 12, fontWeight: 700, marginBottom: 10 }}>İÇE AKTAR</div>
        <label style={{ display: "block", marginBottom: 10 }}>
          <span style={{ display: "block", width: "100%", background: X.bd, border: `2px solid ${X.b}`, borderRadius: 12, padding: "12px 20px", fontSize: 15, fontWeight: 700, cursor: "pointer", color: X.b, textAlign: "center", boxSizing: "border-box" }}>📂 JSON Dosyası Yükle</span>
          <input type="file" accept=".json,application/json" onChange={importFile} style={{ display: "none" }} />
        </label>
        <div style={{ color: X.td, fontSize: 11, marginBottom: 8, textAlign: "center" }}>— veya —</div>
        <textarea value={importData} onChange={e => setImportData(e.target.value)} placeholder="JSON içeriğini buraya yapıştırın..." style={{ width: "100%", background: "rgba(200,220,232,0.65)", border: `1px solid ${X.border}`, borderRadius: 10, padding: "12px 14px", color: X.t, fontSize: 12, fontFamily: fm, outline: "none", boxSizing: "border-box", minHeight: 100, resize: "vertical", marginBottom: 8 }} />
        <Btn onClick={pasteImport} v="outline" c={X.p} disabled={!importData.trim()}>📋 Panodan İçe Aktar</Btn>
      </Card>

      <Card s={{ background: X.od, border: `1px solid ${X.o}` }}>
        <div style={{ color: X.o, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>⚠️ Önemli Uyarı</div>
        <div style={{ color: X.tm, fontSize: 11, lineHeight: 1.5 }}>
          İçe aktarma işlemi mevcut tüm verilerinizin üzerine yazar. İçe aktarmadan önce mevcut verilerinizin yedeğini almayı unutmayın. Yedek dosyasını güvenli bir yerde saklayın (e-posta, bulut depolama vs).
        </div>
      </Card>
    </div>
  );
}

/* ═══ HAFTALIK YEDEK ═══ */
function getWeekNumber(dateStr) {
  // ISO hafta numarası: yılın hangi haftası (Pazartesi başlangıçlı)
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  // Pazartesi'yi haftanın ilk günü yap
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function needsWeeklyBackup(data) {
  if (!data.lastBackup) return true;
  const lastWeek = getWeekNumber(data.lastBackup);
  const thisWeek = getWeekNumber(new Date().toISOString().slice(0, 10));
  return lastWeek !== thisWeek;
}

async function exportJsonAsFile(data) {
  const json = JSON.stringify(data, null, 2);
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, ".");
  const fileName = `ev-butcesi-${dateStr}.json`;
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return { blob, fileName };
}

function WeeklyBackupRitual({ data, setData }) {
  const [downloaded, setDownloaded] = useState(false);
  const [shared, setShared] = useState(false);
  const [msg, setMsg] = useState(null);
  const weekStart = (() => {
    const d = new Date();
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1);
    return d.toISOString().slice(0, 10);
  })();

  const doDownload = async () => {
    try {
      await exportJsonAsFile(data);
      setDownloaded(true);
      setMsg({ type: "success", text: "✓ Dosya indirildi" });
      setTimeout(() => setMsg(null), 3000);
    } catch (err) {
      setMsg({ type: "error", text: "İndirme başarısız: " + err.message });
    }
  };

  const doOpenMail = () => {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, ".");
    const subject = encodeURIComponent(`ev-butcesi-${dateStr}`);
    const body = encodeURIComponent(
      `Ev Bütçesi haftalık yedek.\n\n` +
      `Tarih: ${dateStr}\n\n` +
      `⚠️ İndirdiğiniz yedek dosyasını bu maile ek olarak sürükleyin, sonra gönderin.\n\n` +
      `Dosya adı: ev-butcesi-${dateStr}.json`
    );
    window.location.href = `mailto:abdullahsehidhuca@gmail.com?subject=${subject}&body=${body}`;
    setShared(true);
    setMsg({ type: "success", text: "✓ Mail uygulaması açıldı — dosyayı ek olarak sürükleyin" });
    setTimeout(() => setMsg(null), 4000);
  };

  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setMsg({ type: "success", text: "✓ Panoya kopyalandı" });
      setTimeout(() => setMsg(null), 3000);
    } catch (err) {
      setMsg({ type: "error", text: "Kopyalama başarısız" });
    }
  };

  const finalize = () => {
    if (!downloaded && !shared) {
      if (!confirm("Yedek almadan devam etmek istediğinize emin misiniz? Verileriniz risk altında olabilir.")) return;
    }
    setData(d => ({ ...d, lastBackup: new Date().toISOString().slice(0, 10) }));
  };

  const lastBackupText = data.lastBackup
    ? `Son yedek: ${data.lastBackup}`
    : "Henüz hiç yedek alınmadı";

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", backdropFilter: "blur(12px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9998, padding: 16 }}>
      <div style={{ ...glassSolid, borderRadius: 20, width: "100%", maxWidth: 440, maxHeight: "90vh", overflow: "auto", padding: 24, border: `2px solid ${X.w}`, boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>💾</div>
          <div style={{ color: X.t, fontSize: 20, fontWeight: 800, fontFamily: ff }}>Haftalık Yedek Zamanı</div>
          <div style={{ color: X.tm, fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>Verilerinizin güvenliği için haftada bir yedek almanız gerekiyor. Yedek almadan uygulamayı kullanamazsınız.</div>
        </div>

        {msg && (
          <Card s={{ marginBottom: 12, background: msg.type === "success" ? X.gd : msg.type === "warning" ? X.wd : X.rd, border: `1px solid ${msg.type === "success" ? X.g : msg.type === "warning" ? X.w : X.r}` }}>
            <div style={{ color: msg.type === "success" ? X.g : msg.type === "warning" ? X.w : X.r, fontSize: 13, fontWeight: 700 }}>{msg.text}</div>
          </Card>
        )}

        <Card s={{ marginBottom: 12, background: "rgba(200,218,212,0.4)" }}>
          <div style={{ color: X.tm, fontSize: 11, fontWeight: 700, marginBottom: 4 }}>DURUM</div>
          <div style={{ color: X.t, fontSize: 13 }}>{lastBackupText}</div>
          <div style={{ color: X.td, fontSize: 11, marginTop: 2 }}>Bu haftanın başlangıcı: {weekStart}</div>
        </Card>

        <Card s={{ marginBottom: 12 }}>
          <div style={{ color: X.tm, fontSize: 12, fontWeight: 700, marginBottom: 10 }}>1. YEDEK DOSYASINI İNDİRİN</div>
          <p style={{ color: X.td, fontSize: 11, marginBottom: 10 }}>Yedek dosyası telefonunuza indirilecek. Dosya adı: <span style={{ fontFamily: fm, color: X.tm }}>ev-butcesi-{new Date().toISOString().slice(0, 10).replace(/-/g, ".")}.json</span></p>
          <Btn onClick={doDownload} c={downloaded ? X.g : X.w}>
            {downloaded ? "✓ İndirildi" : "📥 İndir"}
          </Btn>
        </Card>

        <Card s={{ marginBottom: 12 }}>
          <div style={{ color: X.tm, fontSize: 12, fontWeight: 700, marginBottom: 10 }}>2. E-POSTA İLE KENDİNİZE GÖNDERİN</div>
          <p style={{ color: X.td, fontSize: 11, marginBottom: 10 }}>Mail uygulaması açılır, alıcı ve konu dolu gelir. İndirdiğiniz yedek dosyasını maile <strong>ek olarak sürükleyin</strong>, sonra "Gönder" tuşuna basın.</p>
          <Btn onClick={doOpenMail} v="outline" c={X.b} s={{ marginBottom: 8 }}>
            {shared ? "✓ Mail Açıldı" : "📧 Mail'de Aç"}
          </Btn>
          <Btn onClick={doCopy} v="outline" c={X.p}>📋 Panoya Kopyala</Btn>
        </Card>

        <Card s={{ marginBottom: 16, background: X.od, border: `1px solid ${X.o}` }}>
          <div style={{ color: X.o, fontSize: 11, fontWeight: 700, marginBottom: 4 }}>⚠️ Önemli Uyarı</div>
          <div style={{ color: X.tm, fontSize: 10, lineHeight: 1.5 }}>
            Tarayıcı güvenlik kısıtlamaları nedeniyle uygulama otomatik e-posta gönderemez. Yedek dosyanızı kendiniz güvenli bir yere saklamanız (Gmail, Drive, iCloud, vs.) gerekir.
          </div>
        </Card>

        <Btn onClick={finalize} c={downloaded || shared ? X.g : X.td} disabled={false}>
          {downloaded || shared ? "✓ Yedek Aldım, Devam Et" : "⚠️ Yedek Almadan Devam Et"}
        </Btn>
      </div>
    </div>
  );
}

function BudgetModal({ mk: m, cur, def, onSave, onClose }) { const [v, setV] = useState(String(cur || def)); return (<Modal title={`💰 ${ml(m)} Bütçesi`} onClose={onClose}><Inp label="Bu Ayın Bütçesi" type="number" value={v} onChange={setV} suffix="₺" /><Btn onClick={() => { onSave(parseFloat(v) || def); onClose(); }}>Kaydet</Btn></Modal>); }

function CCInstallModal({ data, mk, cards, variableExpenses, onClose, onSave, onDeletePlan, onEditPlan, startInSim }) {
  const [a, sa] = useState(""); const [mo, smo] = useState("3"); const [n, sn] = useState("");
  const [cardId, setCardId] = useState(cards[0]?.id || "");
  const [categoryId, setCategoryId] = useState("");
  const [userChanged, setUserChanged] = useState(false);
  const [sim, setSim] = useState(null);
  const [startMk, setStartMk] = useState(nmk(mk));
  const [editingId, setEditingId] = useState(null);
  const [editNote, setEditNote] = useState("");
  const [editTotal, setEditTotal] = useState("");
  const [editMonths, setEditMonths] = useState("");
  const [editStartMk, setEditStartMk] = useState("");
  const [editCardId, setEditCardId] = useState("");
  const t = parseFloat(a) || 0; const m2 = parseInt(mo) || 1; const mp = Math.ceil(t / m2);

  // İlk taksit ayı seçenekleri: bu ay + gelecek 3 ay
  const startOptions = [];
  let sm = mk;
  for (let i = 0; i < 4; i++) { startOptions.push({ v: sm, l: ml(sm) + (i === 0 ? " (bu ay)" : "") }); sm = nmk(sm); }

  useEffect(() => {
    if (userChanged) return;
    const matched = matchCategory(n, variableExpenses || []);
    if (matched) setCategoryId(matched);
  }, [n, userChanged, variableExpenses]);

  const handleCategoryChange = v => { setCategoryId(v); setUserChanged(true); };

  const doSim = () => {
    if (!t || !m2) return;
    const plan = { startMonth: startMk, months: m2, monthlyPayment: mp, totalAmount: t };
    const without = [], withS = []; let m3 = startMk;
    for (let i = 0; i < Math.min(m2 + 2, 8); i++) { without.push({ mk: m3, ...calcMonth(data, m3, null) }); withS.push({ mk: m3, ...calcMonth(data, m3, plan) }); m3 = nmk(m3); }
    let deficit = null; withS.forEach(ws => { if (ws.remaining < 0 && !deficit) deficit = ws.mk; });
    setSim({ plan, without, withS, deficit });
  };

  const save = () => { if (!t || !cardId) return; onSave({ id: uid(), totalAmount: t, monthlyPayment: mp, months: m2, rate: 0, startMonth: startMk, remainingMonths: m2, note: n, merchantName: "", cardId, categoryId: categoryId || null, createdDate: td() }); onClose(); };

  // Aktif taksit planları
  const activePlans = data.installmentPlans.filter(p => {
    let cur = p.startMonth;
    for (let i = 0; i < p.months; i++) {
      if (cur >= mk) return true;
      cur = nmk(cur);
    }
    return false;
  });

  return (
    <Modal title={startInSim ? "🔮 Taksit Simülasyonu" : "📅 Kredi Kartı Taksitli"} onClose={onClose}>

      {/* AKTİF TAKSİT PLANLARI */}
      {activePlans.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: X.tm, fontSize: 11, fontWeight: 700, marginBottom: 8 }}>AKTİF TAKSİT PLANLARI</div>
          {activePlans.map(p => {
            const cardName = cards.find(c2 => c2.id === p.cardId)?.name || "—";
            let paidCount = 0;
            let cur = p.startMonth;
            for (let i = 0; i < p.months; i++) {
              if (cur < mk) paidCount++;
              else break;
              cur = nmk(cur);
            }
            const remainingCount = p.months - paidCount;
            const isEditing = editingId === p.id;

            const startEdit = () => {
              setEditingId(p.id);
              setEditNote(p.note || "");
              setEditTotal(String(p.totalAmount || 0));
              setEditMonths(String(p.months || 1));
              setEditStartMk(p.startMonth || mk);
              setEditCardId(p.cardId || cards[0]?.id || "");
            };

            const cancelEdit = () => { setEditingId(null); };

            const saveEdit = () => {
              const newTotal = parseFloat(editTotal) || p.totalAmount;
              const newMonths = parseInt(editMonths) || p.months;
              const newMp = Math.ceil(newTotal / newMonths);
              const oldPaidCount = paidCount;
              const newRemaining = Math.max(0, newMonths - oldPaidCount);
              onEditPlan(p.id, {
                note: editNote,
                totalAmount: newTotal,
                months: newMonths,
                monthlyPayment: newMp,
                startMonth: editStartMk,
                cardId: editCardId,
                remainingMonths: newRemaining
              });
              setEditingId(null);
            };

            return (
              <Card key={p.id} s={{ marginBottom: 6, padding: "10px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: X.t, fontSize: 13, fontWeight: 700 }}>{p.note || "Taksitli harcama açıklaması"}</div>
                    {p.merchantName && <div style={{ color: X.td, fontSize: 11 }}>{p.merchantName}</div>}
                    <div style={{ color: X.tm, fontSize: 11, marginTop: 4 }}>
                      <span style={{ fontFamily: fm, fontWeight: 700, color: X.p }}>{C(p.monthlyPayment)}</span>/ay × {p.months} taksit · {ml(p.startMonth)}'dan
                    </div>
                    <div style={{ color: X.td, fontSize: 10, marginTop: 2 }}>
                      💳 {cardName} · {paidCount}/{p.months} ödendi · {remainingCount} kaldı · Toplam: {C(p.totalAmount)}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0, marginLeft: 8 }}>
                    <button onClick={isEditing ? cancelEdit : startEdit} style={{ background: "none", border: "none", color: X.b, fontSize: 20, cursor: "pointer", padding: "6px 8px", minWidth: 36, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center" }}>{isEditing ? "▲" : "✎"}</button>
                    {onDeletePlan && <button onClick={() => { if (confirm(`"${p.note || "Bu taksit planı"}" silinecek. Emin misiniz?`)) onDeletePlan(p.id); }} style={{ background: "none", border: "none", color: X.r, fontSize: 20, cursor: "pointer", padding: "6px 8px", minWidth: 36, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>}
                  </div>
                </div>

                {/* INLINE DÜZENLEME FORMU */}
                {isEditing && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${X.border}` }}>
                    <Inp label="Harcama Açıklaması" value={editNote} onChange={setEditNote} placeholder="Örn: Saloni yatak odası" />
                    <Inp label="Toplam Tutar" type="number" value={editTotal} onChange={setEditTotal} suffix="₺" />
                    <div style={{ display: "flex", gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <Inp label="Taksit Sayısı" type="number" value={editMonths} onChange={setEditMonths} />
                      </div>
                      <div style={{ flex: 1 }}>
                        {(() => {
                          const eT = parseFloat(editTotal) || 0;
                          const eM = parseInt(editMonths) || 1;
                          const eMp = Math.ceil(eT / eM);
                          return (
                            <div style={{ marginBottom: 12 }}>
                              <label style={{ fontSize: 12, color: X.tm, fontWeight: 600, marginBottom: 4, display: "block", fontFamily: ff }}>Aylık Taksit</label>
                              <div style={{ background: "rgba(200,220,232,0.65)", borderRadius: 10, padding: "12px 14px", fontSize: 16, fontFamily: fm, fontWeight: 700, color: X.p }}>{C(eMp)}</div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                    <Sel label="İlk Taksit Ayı" value={editStartMk} onChange={setEditStartMk} options={(() => {
                      const opts = []; let s = pmk(pmk(pmk(mk)));
                      for (let i = 0; i < 12; i++) { opts.push({ v: s, l: ml(s) }); s = nmk(s); }
                      return opts;
                    })()} />
                    <Sel label="Kart" value={editCardId} onChange={setEditCardId} options={cards.map(c2 => ({ v: c2.id, l: c2.name }))} />
                    <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                      <Btn onClick={saveEdit} c={X.g} s={{ flex: 1 }}>✓ Güncelle</Btn>
                      <Btn onClick={cancelEdit} v="outline" c={X.td} s={{ flex: 1 }}>İptal</Btn>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
          <div style={{ borderBottom: `1px solid rgba(0,0,0,0.08)`, marginBottom: 12, paddingBottom: 4 }}>
            <div style={{ color: X.tm, fontSize: 11, fontWeight: 700 }}>YENİ TAKSİTLİ İŞLEM EKLE</div>
          </div>
        </div>
      )}
      {cards.length === 0 ? (
        <div style={{ color: X.w, fontSize: 13, marginBottom: 12, padding: 10, background: X.wd, borderRadius: 8 }}>⚠️ Önce Ayarlar → Kartlarım'dan en az bir kart eklemelisiniz.</div>
      ) : (
        <Sel label="Hangi Kart" value={cardId} onChange={setCardId} options={cards.map(c => ({ v: c.id, l: c.name }))} />
      )}
      <Inp label="Toplam Tutar" type="number" value={a} onChange={v2 => { sa(v2); setSim(null); }} suffix="₺" placeholder="0" />
      <Inp label="Taksit Sayısı" type="number" value={mo} onChange={v2 => { smo(v2); setSim(null); }} />
      <Sel label="İlk Taksit Ayı" value={startMk} onChange={v2 => { setStartMk(v2); setSim(null); }} options={startOptions} />
      {t > 0 && m2 > 0 && <div style={{ color: X.tm, fontSize: 13, marginBottom: 12 }}>Aylık taksit: <span style={{ color: X.p, fontWeight: 800, fontFamily: fm, fontSize: 16 }}>{C(mp)}</span> × {m2} ay · {ml(startMk)}'dan itibaren</div>}
      <Inp label="Harcama Açıklaması" value={n} onChange={sn} placeholder="Örn: Saloni yatak odası" />
      {(variableExpenses || []).length > 0 && (
        <Sel label="Kategori" value={categoryId} onChange={handleCategoryChange} options={[{ v: "", l: "— Otomatik / Kategorisiz —" }, ...(variableExpenses || []).map(ve => ({ v: ve.id, l: (ve.icon || "📋") + " " + ve.name }))]} />
      )}
      {categoryId && !userChanged && <div style={{ color: X.g, fontSize: 11, marginTop: -8, marginBottom: 12 }}>✓ Anahtar kelime eşleşmesi bulundu</div>}
      {!sim && (
        <div style={{ display: "flex", gap: 8 }}>
          {!startInSim && <Btn onClick={save} c={X.p} s={{ flex: 1 }} disabled={!cardId}>📅 Direkt Kaydet</Btn>}
          <Btn onClick={doSim} v={startInSim ? "filled" : "outline"} c={X.p} s={{ flex: 1 }}>🔮 Hesapla</Btn>
        </div>
      )}
      {sim && (
        <>
          <Card s={{ marginBottom: 10, background: "rgba(160,190,200,0.50)", border: `1px solid ${X.border}` }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 4, fontSize: 11, marginBottom: 4 }}>
              <span style={{ color: X.td }}>Ay</span><span style={{ color: X.td, textAlign: "right" }}>Şu Anki Kalan</span><span style={{ color: X.p, textAlign: "right" }}>Taksit Sonrası Kalan</span>
            </div>
            {sim.withS.map((ws, i) => { const wo = sim.without[i]; return (
              <div key={ws.mk} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 4, padding: "5px 0", borderBottom: `1px solid ${X.border}`, fontSize: 12 }}>
                <span style={{ color: X.t }}>{ml(ws.mk).split(" ")[0]}</span>
                <span style={{ color: wo.remaining >= 0 ? X.g : X.r, textAlign: "right", fontFamily: fm, fontWeight: 700 }}>{C(wo.remaining)}</span>
                <span style={{ color: ws.remaining >= 0 ? X.g : X.r, textAlign: "right", fontFamily: fm, fontWeight: 700 }}>{C(ws.remaining)}</span>
              </div>); })}
          </Card>
          {(() => {
            const minMonth = sim.withS.reduce((min, ws) => ws.remaining < min.remaining ? ws : min, sim.withS[0]);
            const hasDeficit = sim.deficit;
            const budgetTight = !hasDeficit && minMonth.remaining < minMonth.effectiveBudget * 0.05;
            const budgetHard = budgetTight && minMonth.remaining < 0;

            if (hasDeficit) {
              const defMonth = sim.withS.find(ws => ws.remaining < 0);
              return <div style={{ color: X.r, fontSize: 13, fontWeight: 600, marginBottom: 10, lineHeight: 1.5 }}>🚨 Bu taksitli işlem bütçenizi zorlar. {ml(sim.deficit)} ayında {C(Math.abs(defMonth?.remaining || 0))} açık oluşuyor. İşlemi onaylamadan önce o ayın giderlerini gözden geçirin.</div>;
            }
            if (budgetTight) {
              return <div style={{ color: budgetHard ? X.r : X.w, fontSize: 13, fontWeight: 600, marginBottom: 10, lineHeight: 1.5 }}>⚠️ Bu taksitli işlem serbest bütçenizi daraltır. {ml(minMonth.mk)} ayında kalan bütçe {C(minMonth.remaining)} olacak — acil tampon ve genel harcama alanı çok daralıyor.</div>;
            }
            return <div style={{ color: X.g, fontSize: 13, fontWeight: 600, marginBottom: 10, lineHeight: 1.5 }}>✅ Bu taksitli işlemi yapabilirsiniz. Taksit sonrası en düşük aylık kalan: {C(minMonth.remaining)} ({ml(minMonth.mk)}). Hiçbir ayda bütçe açığı oluşmuyor.</div>;
          })()}
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={save} c={X.g} s={{ flex: 1 }} disabled={!cardId}>✓ Taksiti Onayla ve Kaydet</Btn>
            <Btn onClick={() => setSim(null)} v="outline" c={X.td} s={{ flex: 1 }}>Geri</Btn>
          </div>
        </>
      )}
    </Modal>
  );
}

function BuyAssetModal({ asset, data, onClose, onSave }) {
  const info = ASSET_INFO[asset];
  const [amt, setAmt] = useState("");
  const [rate, setRate] = useState(() => {
    if (asset === "TRY") return "1";
    return data.liveRates?.[asset] ? String(data.liveRates[asset]) : "";
  });
  const [date, setDate] = useState(td());
  const [note, setNote] = useState("");

  const amtNum = parseFloat(amt) || 0;
  const rateNum = parseFloat(rate) || 0;
  const tlCost = amtNum * rateNum;

  const canSave = amtNum > 0 && rateNum > 0;
  const save = () => {
    if (!canSave) return;
    onSave({ id: uid(), type: "buy", amount: amtNum, unitPrice: rateNum, date, source: "manual", note });
    onClose();
  };

  return (
    <Modal title={`${info.icon} ${info.label} Al`} onClose={onClose}>
      {asset === "TRY" ? (
        <Inp label="Tutar" type="number" value={amt} onChange={setAmt} suffix="₺" />
      ) : (
        <>
          <Inp label={`Miktar`} type="number" value={amt} onChange={setAmt} suffix={info.unit} />
          <Inp label="Kur (alım sırasındaki TL karşılığı)" type="number" value={rate} onChange={setRate} suffix="₺" placeholder={data.liveRates?.[asset] ? String(data.liveRates[asset].toFixed(2)) : "0"} />
          {tlCost > 0 && <div style={{ color: X.tm, fontSize: 13, marginBottom: 12 }}>Toplam TL maliyeti: <span style={{ color: X.t, fontWeight: 800, fontFamily: fm }}>{C(tlCost)}</span></div>}
        </>
      )}
      <Inp label="Tarih" type="date" value={date} onChange={setDate} />
      <Inp label="Not (opsiyonel)" value={note} onChange={setNote} placeholder="Nereden/nasıl alındı?" />
      <Btn onClick={save} disabled={!canSave} c={info.color}>{info.icon} Kaydet</Btn>
    </Modal>
  );
}

function SellAssetModal({ asset, data, onClose, onSave }) {
  const info = ASSET_INFO[asset];
  const { qty } = getAssetBalance(data, asset);
  const [amt, setAmt] = useState("");
  const [rate, setRate] = useState(() => {
    if (asset === "TRY") return "1";
    return data.liveRates?.[asset] ? String(data.liveRates[asset]) : "";
  });
  const [date, setDate] = useState(td());
  const [reason, setReason] = useState("");

  const amtNum = parseFloat(amt) || 0;
  const rateNum = parseFloat(rate) || 0;
  const tlValue = amtNum * rateNum;

  const exceedsBalance = amtNum > qty;
  const canSave = amtNum > 0 && rateNum > 0 && reason.trim().length > 0 && !exceedsBalance;

  const save = () => {
    if (!canSave) return;
    onSave({ id: uid(), type: "sell", amount: amtNum, unitPrice: rateNum, date, reason: reason.trim() });
    onClose();
  };

  return (
    <Modal title={`${info.icon} ${info.label} Sat / Boz`} onClose={onClose}>
      <div style={{ color: X.tm, fontSize: 12, marginBottom: 12 }}>
        Mevcut: <span style={{ color: X.t, fontWeight: 700, fontFamily: fm }}>{qty.toFixed(asset === "XAU" ? 2 : 0)} {info.unit}</span>
      </div>
      {asset === "TRY" ? (
        <Inp label="Tutar" type="number" value={amt} onChange={setAmt} suffix="₺" />
      ) : (
        <>
          <Inp label="Miktar" type="number" value={amt} onChange={setAmt} suffix={info.unit} />
          <Inp label="Kur (satım sırasındaki TL karşılığı)" type="number" value={rate} onChange={setRate} suffix="₺" placeholder={data.liveRates?.[asset] ? String(data.liveRates[asset].toFixed(2)) : "0"} />
          {tlValue > 0 && <div style={{ color: X.tm, fontSize: 13, marginBottom: 12 }}>Elde edilen TL: <span style={{ color: X.t, fontWeight: 800, fontFamily: fm }}>{C(tlValue)}</span></div>}
        </>
      )}
      {exceedsBalance && <div style={{ color: X.r, fontSize: 12, marginBottom: 8 }}>⚠️ Mevcut bakiyeden fazla</div>}
      <Inp label="Tarih" type="date" value={date} onChange={setDate} />
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, color: X.tm, fontWeight: 600, marginBottom: 4, display: "block" }}>Ne için bozduruldu? <span style={{ color: X.r }}>*</span></label>
        <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Örn: Okul taksidi için, acil sağlık harcaması için..." style={{ width: "100%", background: "rgba(200,220,232,0.65)", border: `1px solid ${reason ? X.border : X.r}`, borderRadius: 10, padding: "12px 14px", color: X.t, fontSize: 14, fontFamily: ff, outline: "none", boxSizing: "border-box", minHeight: 60, resize: "vertical" }} />
      </div>
      <Btn onClick={save} disabled={!canSave} c={X.r}>{info.icon} Sat / Boz</Btn>
    </Modal>
  );
}

/* ═══ RECEIPT ANALYSIS (FİŞ ANALİZİ) ═══ */

const RECEIPT_CATEGORIES = ["süt ürünleri", "et/tavuk", "meyve/sebze", "temel gıda", "atıştırmalık", "içecek", "temizlik", "kişisel bakım", "bebek/çocuk", "diğer"];
const RECEIPT_CAT_ICONS = { "süt ürünleri": "🥛", "et/tavuk": "🥩", "meyve/sebze": "🥬", "temel gıda": "🌾", "atıştırmalık": "🍫", "içecek": "🥤", "temizlik": "🧹", "kişisel bakım": "🧴", "bebek/çocuk": "👶", "diğer": "📦" };

function analyzeReceipts(receipts) {
  if (!receipts || receipts.length === 0) return null;
  const allItems = receipts.flatMap(r => (r.items || []).map(it => ({ ...it, store: r.store, date: r.date })));
  if (allItems.length === 0) return null;

  // Kategori dağılımı
  const catTotals = {};
  allItems.forEach(it => {
    const cat = it.category || "diğer";
    catTotals[cat] = (catTotals[cat] || 0) + (it.price * (it.qty || 1));
  });
  const grandTotal = Object.values(catTotals).reduce((s, v) => s + v, 0);
  const catBreakdown = Object.entries(catTotals)
    .map(([cat, total]) => ({ cat, total, pct: grandTotal > 0 ? Math.round((total / grandTotal) * 100) : 0, icon: RECEIPT_CAT_ICONS[cat] || "📦" }))
    .sort((a, b) => b.total - a.total);

  // Tekrar eden ürünler
  const itemMap = {};
  allItems.forEach(it => {
    const key = (it.name || "").toLowerCase().trim();
    if (!key) return;
    if (!itemMap[key]) itemMap[key] = { name: it.name, totalQty: 0, totalSpent: 0, count: 0, brand: it.brand };
    itemMap[key].totalQty += (it.qty || 1);
    itemMap[key].totalSpent += (it.price * (it.qty || 1));
    itemMap[key].count += 1;
  });
  const repeating = Object.values(itemMap).filter(it => it.count >= 2).sort((a, b) => b.totalSpent - a.totalSpent);

  // Marka tercihleri
  const brandMap = {};
  allItems.forEach(it => {
    if (!it.brand || it.brand.toLowerCase() === "marka yok" || it.brand === "-") return;
    const cat = it.category || "diğer";
    if (!brandMap[cat]) brandMap[cat] = {};
    const b = it.brand;
    if (!brandMap[cat][b]) brandMap[cat][b] = { brand: b, totalSpent: 0, count: 0 };
    brandMap[cat][b].totalSpent += (it.price * (it.qty || 1));
    brandMap[cat][b].count += 1;
  });
  const topBrands = Object.entries(brandMap).flatMap(([cat, brands]) =>
    Object.values(brands).map(b => ({ ...b, category: cat }))
  ).sort((a, b) => b.totalSpent - a.totalSpent).slice(0, 8);

  return { catBreakdown, repeating, topBrands, grandTotal, totalReceipts: receipts.length, totalItems: allItems.length };
}

function ReceiptModal({ receipts, onClose, onSave, onDelete, apiKey, onSaveApiKey }) {
  const [step, setStep] = useState("list"); // list, capture, analyzing, result, analysis
  const [imgSrc, setImgSrc] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [editIdx, setEditIdx] = useState(null);
  const [keyInput, setKeyInput] = useState(apiKey || "");
  const [showKeyInput, setShowKeyInput] = useState(!apiKey);

  const handleFile = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      setImgSrc(ev.target.result);
      setStep("capture");
    };
    reader.readAsDataURL(file);
  };

  const doAnalyze = async () => {
    if (!imgSrc) return;
    const key = apiKey || keyInput;
    if (!key) { setError("Claude API anahtarı gerekli. Lütfen anahtarınızı girin."); setShowKeyInput(true); return; }
    if (keyInput && !apiKey) { onSaveApiKey(keyInput); }
    setAnalyzing(true);
    setError(null);
    setStep("analyzing");
    try {
      const base64 = imgSrc.split(",")[1];
      const mediaType = imgSrc.split(";")[0].split(":")[1] || "image/jpeg";
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
              { type: "text", text: `Bu bir market/mağaza fişi. Fişi analiz et ve SADECE aşağıdaki JSON formatında yanıt ver, başka hiçbir şey yazma:
{"store":"mağaza adı","totalAmount":toplam_tutar_sayı,"items":[{"name":"ürün adı","qty":adet_sayı,"price":birim_fiyat_sayı,"brand":"marka veya boş string","category":"kategori"}]}
category değerleri SADECE şunlardan biri olmalı: süt ürünleri, et/tavuk, meyve/sebze, temel gıda, atıştırmalık, içecek, temizlik, kişisel bakım, bebek/çocuk, diğer.
Fiyatlar Türk Lirası cinsindendir. Eğer fiş okunamıyorsa {"error":"Fiş okunamadı"} döndür.` }
            ]
          }]
        })
      });
      const data = await resp.json();
      const text = (data.content || []).map(c => c.text || "").join("");
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      if (parsed.error) { setError(parsed.error); setStep("capture"); }
      else { setResult(parsed); setStep("result"); }
    } catch (err) {
      console.error("Fiş analizi hatası:", err);
      setError("Fiş analiz edilemedi. Lütfen tekrar deneyin.");
      setStep("capture");
    } finally { setAnalyzing(false); }
  };

  const saveResult = () => {
    if (!result) return;
    const receipt = {
      id: uid(),
      date: td(),
      store: result.store || "Bilinmeyen",
      totalAmount: result.totalAmount || result.items?.reduce((s, it) => s + (it.price * (it.qty || 1)), 0) || 0,
      items: (result.items || []).map(it => ({
        name: it.name || "",
        qty: it.qty || 1,
        price: it.price || 0,
        brand: it.brand || "",
        category: it.category || "diğer"
      }))
    };
    onSave(receipt);
    setResult(null);
    setImgSrc(null);
    setStep("list");
  };

  const editItem = (idx, field, value) => {
    if (!result) return;
    const items = [...result.items];
    items[idx] = { ...items[idx], [field]: field === "qty" || field === "price" ? (parseFloat(value) || 0) : value };
    setResult({ ...result, items });
  };

  const deleteItem = idx => {
    if (!result) return;
    setResult({ ...result, items: result.items.filter((_, i) => i !== idx) });
  };

  const analysis = useMemo(() => analyzeReceipts(receipts), [receipts]);

  return (
    <Modal title="📷 Market Fişi" onClose={onClose}>
      {/* Tab bar */}
      <div style={{ display: "flex", gap: 0, marginBottom: 16, borderRadius: 10, overflow: "hidden", border: `1px solid ${X.border}` }}>
        <button onClick={() => setStep("list")} style={{ flex: 1, padding: "10px 0", background: step === "list" || step === "capture" || step === "analyzing" || step === "result" ? X.g : "transparent", color: step === "list" || step === "capture" || step === "analyzing" || step === "result" ? "#fff" : X.tm, border: "none", fontSize: 13, fontWeight: 700, fontFamily: ff, cursor: "pointer" }}>📷 Fiş Yükle</button>
        <button onClick={() => setStep("analysis")} style={{ flex: 1, padding: "10px 0", background: step === "analysis" ? X.g : "transparent", color: step === "analysis" ? "#fff" : X.tm, border: "none", fontSize: 13, fontWeight: 700, fontFamily: ff, cursor: "pointer" }}>📊 Analiz {receipts.length > 0 ? `(${receipts.length})` : ""}</button>
      </div>

      {/* ── FİŞ YÜKLEME ── */}
      {step === "list" && (
        <div>
          {/* API Key uyarısı / girişi */}
          {showKeyInput && (
            <div style={{ marginBottom: 14, padding: "12px 14px", background: X.wd, borderRadius: 10, border: `1px solid ${X.w}40` }}>
              <div style={{ color: X.w, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>🔑 Claude API Anahtarı</div>
              <div style={{ color: X.tm, fontSize: 11, marginBottom: 8 }}>Fiş analizi için Anthropic API anahtarı gerekli. Anahtar güvenli şekilde aile veritabanında saklanır.</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input type="password" value={keyInput} onChange={e => setKeyInput(e.target.value)} placeholder="sk-ant-..." style={{ flex: 1, background: "rgba(200,220,232,0.65)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: fm, outline: "none" }} />
                <button onClick={() => { if (keyInput) { onSaveApiKey(keyInput); setShowKeyInput(false); } }} style={{ background: X.g, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: ff, whiteSpace: "nowrap" }}>Kaydet</button>
              </div>
            </div>
          )}
          {apiKey && !showKeyInput && (
            <div style={{ marginBottom: 10, display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => setShowKeyInput(true)} style={{ background: "none", border: "none", color: X.td, fontSize: 10, cursor: "pointer", fontFamily: ff }}>🔑 API anahtarını değiştir</button>
            </div>
          )}
          {/* Yükleme butonu */}
          <label style={{ display: "block", cursor: "pointer", marginBottom: 16 }}>
            <input type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: "none" }} />
            <div style={{ ...glass, borderRadius: 14, padding: "24px 16px", textAlign: "center", border: `2px dashed ${X.g}40` }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>📷</div>
              <div style={{ color: X.g, fontSize: 14, fontWeight: 700 }}>Fiş Fotoğrafı Çek / Seç</div>
              <div style={{ color: X.td, fontSize: 11, marginTop: 4 }}>Kamera açılır veya galeriden seçebilirsiniz</div>
            </div>
          </label>

          {/* Bu aydaki fişler */}
          {receipts.length > 0 && (
            <div>
              <div style={{ color: X.tm, fontSize: 11, fontWeight: 700, marginBottom: 8 }}>BU AY YÜKLENEN FİŞLER</div>
              {receipts.map((r, i) => (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: X.t, fontSize: 13, fontWeight: 600 }}>🧾 {r.store}</div>
                    <div style={{ color: X.td, fontSize: 11 }}>{r.date} · {(r.items || []).length} ürün</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: X.t, fontSize: 14, fontWeight: 700, fontFamily: fm }}>{C(r.totalAmount)}</span>
                    <button onClick={() => { if (confirm("Bu fişi silmek istediğinize emin misiniz?")) onDelete(r.id); }} style={{ background: "none", border: "none", color: X.r, fontSize: 18, cursor: "pointer", padding: "6px 8px", minWidth: 36, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                  </div>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, marginTop: 4, borderTop: "1px solid rgba(0,0,0,0.1)" }}>
                <span style={{ color: X.tm, fontSize: 12, fontWeight: 700 }}>Toplam ({receipts.length} fiş)</span>
                <span style={{ color: X.t, fontSize: 14, fontWeight: 800, fontFamily: fm }}>{C(receipts.reduce((s, r) => s + r.totalAmount, 0))}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── FOTOĞRAF ÖNİZLEME ── */}
      {step === "capture" && imgSrc && (
        <div>
          <div style={{ borderRadius: 12, overflow: "hidden", marginBottom: 12, border: `1px solid ${X.border}` }}>
            <img src={imgSrc} alt="Fiş" style={{ width: "100%", display: "block" }} />
          </div>
          {error && <div style={{ color: X.r, fontSize: 13, fontWeight: 600, marginBottom: 12, padding: "8px 12px", background: X.rd, borderRadius: 8 }}>⚠️ {error}</div>}
          <div style={{ display: "flex", gap: 10 }}>
            <Btn v="outline" c={X.tm} onClick={() => { setImgSrc(null); setStep("list"); setError(null); }}>İptal</Btn>
            <Btn onClick={doAnalyze}>🔍 Analiz Et</Btn>
          </div>
        </div>
      )}

      {/* ── ANALİZ EDİLİYOR ── */}
      {step === "analyzing" && (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <div style={{ fontSize: 48, marginBottom: 16, animation: "pulse 1.5s ease-in-out infinite" }}>🔍</div>
          <div style={{ color: X.t, fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Fiş analiz ediliyor...</div>
          <div style={{ color: X.td, fontSize: 12 }}>Ürünler, fiyatlar ve markalar okunuyor</div>
          <style>{`@keyframes pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.15); opacity: 0.7; } }`}</style>
        </div>
      )}

      {/* ── SONUÇ ── */}
      {step === "result" && result && (
        <div>
          <div style={{ ...glass, borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div>
                <div style={{ color: X.t, fontSize: 15, fontWeight: 700 }}>🏪 {result.store || "Mağaza"}</div>
                <div style={{ color: X.td, fontSize: 11 }}>{td()} · {(result.items || []).length} ürün</div>
              </div>
              <div style={{ color: X.g, fontSize: 18, fontWeight: 800, fontFamily: fm }}>{C(result.totalAmount || 0)}</div>
            </div>
          </div>

          {/* Ürün listesi */}
          <div style={{ color: X.tm, fontSize: 11, fontWeight: 700, marginBottom: 6 }}>ÜRÜNLER</div>
          <div style={{ maxHeight: 300, overflow: "auto", marginBottom: 12 }}>
            {(result.items || []).map((it, idx) => (
              <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 12 }}>{RECEIPT_CAT_ICONS[it.category] || "📦"}</span>
                    {editIdx === idx ? (
                      <input value={it.name} onChange={e => editItem(idx, "name", e.target.value)} style={{ background: "rgba(200,220,232,0.65)", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 6, padding: "4px 8px", fontSize: 12, fontFamily: ff, width: "100%", outline: "none" }} />
                    ) : (
                      <span style={{ color: X.t, fontSize: 12, fontWeight: 600 }} onClick={() => setEditIdx(idx)}>{it.name}</span>
                    )}
                  </div>
                  <div style={{ color: X.td, fontSize: 10, marginLeft: 20 }}>
                    {it.brand && it.brand !== "" && <span>{it.brand} · </span>}
                    <span>{it.category}</span>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  {editIdx === idx ? (
                    <>
                      <input value={it.qty} onChange={e => editItem(idx, "qty", e.target.value)} style={{ width: 32, textAlign: "center", background: "rgba(200,220,232,0.65)", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 6, padding: "4px", fontSize: 12, fontFamily: fm, outline: "none" }} />
                      <span style={{ color: X.td, fontSize: 10 }}>×</span>
                      <input value={it.price} onChange={e => editItem(idx, "price", e.target.value)} style={{ width: 56, textAlign: "right", background: "rgba(200,220,232,0.65)", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 6, padding: "4px", fontSize: 12, fontFamily: fm, outline: "none" }} />
                      <button onClick={() => setEditIdx(null)} style={{ background: "none", border: "none", color: X.g, fontSize: 14, cursor: "pointer" }}>✓</button>
                    </>
                  ) : (
                    <>
                      <span style={{ color: X.td, fontSize: 11 }}>{it.qty > 1 ? `${it.qty}×` : ""}</span>
                      <span style={{ color: X.t, fontSize: 13, fontWeight: 700, fontFamily: fm }}>{C(it.price * (it.qty || 1))}</span>
                      <button onClick={() => setEditIdx(idx)} style={{ background: "none", border: "none", color: X.b, fontSize: 16, cursor: "pointer", padding: "6px", minWidth: 32, minHeight: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>✎</button>
                      <button onClick={() => deleteItem(idx)} style={{ background: "none", border: "none", color: X.r, fontSize: 16, cursor: "pointer", padding: "6px", minWidth: 32, minHeight: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <Btn v="outline" c={X.tm} onClick={() => { setResult(null); setStep("capture"); }}>Geri</Btn>
            <Btn onClick={saveResult}>💾 Kaydet</Btn>
          </div>
        </div>
      )}

      {/* ── AYLIK ANALİZ ── */}
      {step === "analysis" && (
        <div>
          {!analysis ? (
            <div style={{ textAlign: "center", padding: "30px 0" }}>
              <div style={{ fontSize: 36, marginBottom: 8, opacity: 0.5 }}>📊</div>
              <div style={{ color: X.td, fontSize: 13 }}>Henüz fiş yüklenmedi</div>
              <div style={{ color: X.td, fontSize: 11, marginTop: 4 }}>Fiş yükledikçe burada analiz göreceksiniz</div>
            </div>
          ) : (
            <div>
              {/* Özet */}
              <div style={{ ...glass, borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ color: X.t, fontSize: 14, fontWeight: 700 }}>Bu Ay Toplam</div>
                    <div style={{ color: X.td, fontSize: 11 }}>{analysis.totalReceipts} fiş · {analysis.totalItems} ürün</div>
                  </div>
                  <div style={{ color: X.t, fontSize: 20, fontWeight: 800, fontFamily: fm }}>{C(analysis.grandTotal)}</div>
                </div>
              </div>

              {/* Kategori Dağılımı */}
              <div style={{ color: X.tm, fontSize: 11, fontWeight: 700, marginBottom: 8 }}>KATEGORİ DAĞILIMI</div>
              <div style={{ marginBottom: 16 }}>
                {analysis.catBreakdown.map(cat => (
                  <div key={cat.cat} style={{ marginBottom: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                      <span style={{ color: X.t, fontSize: 12, fontWeight: 600 }}>{cat.icon} {cat.cat}</span>
                      <span style={{ color: X.t, fontSize: 12, fontWeight: 700, fontFamily: fm }}>{C(cat.total)} <span style={{ color: X.td, fontSize: 10 }}>%{cat.pct}</span></span>
                    </div>
                    <div style={{ height: 5, borderRadius: 3, background: "rgba(0,0,0,0.06)", overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 3, background: X.g, width: `${cat.pct}%`, transition: "width 0.4s" }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Tekrar Eden Ürünler */}
              {analysis.repeating.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ color: X.tm, fontSize: 11, fontWeight: 700, marginBottom: 8 }}>🔄 TEKRAR EDEN ÜRÜNLER</div>
                  {analysis.repeating.slice(0, 6).map((it, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                      <div>
                        <div style={{ color: X.t, fontSize: 12, fontWeight: 600 }}>{it.name}</div>
                        <div style={{ color: X.td, fontSize: 10 }}>{it.count} alışverişte toplam {it.totalQty} adet{it.brand ? ` · ${it.brand}` : ""}</div>
                      </div>
                      <span style={{ color: X.w, fontSize: 12, fontWeight: 700, fontFamily: fm }}>{C(it.totalSpent)}</span>
                    </div>
                  ))}
                  {analysis.repeating.length > 0 && (
                    <div style={{ color: X.b, fontSize: 11, fontWeight: 600, marginTop: 8, padding: "8px 12px", background: X.bd, borderRadius: 8 }}>
                      💡 Sık aldığınız ürünlerde toplu alım ile tasarruf edebilirsiniz
                    </div>
                  )}
                </div>
              )}

              {/* Marka Tercihleri */}
              {analysis.topBrands.length > 0 && (
                <div>
                  <div style={{ color: X.tm, fontSize: 11, fontWeight: 700, marginBottom: 8 }}>🏷️ MARKA TERCİHLERİ</div>
                  {analysis.topBrands.slice(0, 6).map((b, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                      <div>
                        <div style={{ color: X.t, fontSize: 12, fontWeight: 600 }}>{b.brand}</div>
                        <div style={{ color: X.td, fontSize: 10 }}>{b.category} · {b.count} kez</div>
                      </div>
                      <span style={{ color: X.p, fontSize: 12, fontWeight: 700, fontFamily: fm }}>{C(b.totalSpent)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

/* ═══ DASHBOARD ═══ */
function Dashboard({ data, mk, gmd, setMonthField, setData }) {
  const [expanded, setExpanded] = useState(null);
  const [modal, setModal] = useState(null);
  const [info, setInfo] = useState(null);
  const [msg, setMsg] = useState(null);
  const [detail, setDetail] = useState(null);

  const md = gmd(mk); const c = calcMonth(data, mk, null);
  const showMonthDetail = () => { const bd = getMonthBreakdown(data, mk); setDetail({ title: `${ml(mk)} — Bütçe Dökümü`, rows: bd.rows, total: bd.mc.remaining, totalLabel: "Serbest bütçe", totalColor: bd.mc.remaining > bd.mc.effectiveBudget * 0.1 ? X.g : bd.mc.remaining >= 0 ? X.w : X.r }); };
  const risk = useMemo(() => calcRisk(data, mk), [data, mk]);
  const pct = c.effectiveBudget > 0 ? (c.totalSpent / c.effectiveBudget) * 100 : 0;
  const toggle = id => setExpanded(expanded === id ? null : id);
  const flash = m2 => { setMsg(m2); setTimeout(() => setMsg(null), 2500); };
  const warnings = useMemo(() => genWarnings(data, mk), [data, mk]);

  const handleFixedPay = expId => { setMonthField(mk, "fixedPaid", { ...md.fixedPaid, [expId]: { paid: true, date: td() } }); };
  const handleFixedUnpay = expId => { const fp = { ...md.fixedPaid }; delete fp[expId]; setMonthField(mk, "fixedPaid", fp); };
  const handleCCSingle = entry => { setMonthField(mk, "ccSingle", [...md.ccSingle, entry]); flash("✓"); };
  const deleteCCSingle = id => { setMonthField(mk, "ccSingle", (md.ccSingle || []).filter(e => e.id !== id)); };
  const editCCSingle = id => {
    const entry = (md.ccSingle || []).find(e => e.id === id); if (!entry) return;
    const newAmt = prompt("Tutar:", String(entry.amount)); if (newAmt === null) return;
    const newNote = prompt("Açıklama:", entry.note || entry.merchantName || "");
    setMonthField(mk, "ccSingle", (md.ccSingle || []).map(e => e.id === id ? { ...e, amount: parseFloat(newAmt) || e.amount, note: newNote !== null ? newNote : e.note } : e));
  };
  const handleCardLoad = amt => { setMonthField(mk, "cardLoaded", (md.cardLoaded || 0) + amt); flash("✓"); };
  const editCardLoad = () => {
    const newVal = prompt("Toplam yüklenen tutar:", String(md.cardLoaded || 0)); if (newVal === null) return;
    setMonthField(mk, "cardLoaded", parseFloat(newVal) || 0);
  };
  const handleDebtPay = debtId => { setMonthField(mk, "debtPayments", { ...md.debtPayments, [debtId]: { paid: true, date: td() } }); setData(d => ({ ...d, debts: d.debts.map(db => db.id === debtId ? { ...db, remainingMonths: Math.max(0, db.remainingMonths - 1) } : db) })); flash("✓"); };
  const undoDebtPay = debtId => { const dp = { ...md.debtPayments }; delete dp[debtId]; setMonthField(mk, "debtPayments", dp); setData(d => ({ ...d, debts: d.debts.map(db => db.id === debtId ? { ...db, remainingMonths: db.remainingMonths + 1 } : db) })); };
  const handleInstSave = plan => { setData(d => ({ ...d, installmentPlans: [...d.installmentPlans, plan] })); flash("✓ Taksit kaydedildi"); };
  const deleteInstallment = id => { setData(d => ({ ...d, installmentPlans: d.installmentPlans.filter(p => p.id !== id) })); };
  const editInstallment = (id, updates) => {
    if (updates) {
      // Inline düzenleme (CCInstallModal'dan)
      setData(d => ({ ...d, installmentPlans: d.installmentPlans.map(p => p.id === id ? { ...p, ...updates } : p) }));
    } else {
      // Eski prompt düzenleme (CC Hesabına Aktar listesinden)
      const plan = data.installmentPlans.find(p => p.id === id); if (!plan) return;
      const newNote = prompt("Açıklama:", plan.note || ""); if (newNote === null) return;
      const newAmt = prompt("Aylık taksit tutarı:", String(plan.monthlyPayment));
      setData(d => ({ ...d, installmentPlans: d.installmentPlans.map(p => p.id === id ? { ...p, note: newNote, monthlyPayment: parseFloat(newAmt) || p.monthlyPayment } : p) }));
    }
  };
  const handleCCTransfer = itemKey => { setMonthField(mk, "ccTransferred", { ...(md.ccTransferred || {}), [itemKey]: { transferred: true, date: td() } }); };
  const undoCCTransfer = itemKey => { const ct = { ...(md.ccTransferred || {}) }; delete ct[itemKey]; setMonthField(mk, "ccTransferred", ct); };

  // Fiş handler'ları
  const handleReceiptSave = receipt => { setMonthField(mk, "receipts", [...(md.receipts || []), receipt]); flash("✓ Fiş kaydedildi"); };
  const handleReceiptDelete = id => { setMonthField(mk, "receipts", (md.receipts || []).filter(r => r.id !== id)); };

  // CC Hesabına Aktarılacak Kalemlerin Listesi
  const ccTransferItems = useMemo(() => {
    const items = [];
    const cards = data.settings.cards || [];
    // 1. Sabit zorunlu giderler (CC ile ödenenler)
    data.settings.fixedExpenses.filter(e => e.paymentMethod === "cc").forEach(e => {
      const cid = e.cardId || cards[0]?.id;
      const cardName = cards.find(c2 => c2.id === cid)?.name;
      items.push({ key: `fixed-${e.id}`, label: e.name, sub: `Sabit zorunlu${cardName ? " • " + cardName : ""}`, amount: e.amount, cardId: cid });
    });
    // 2. CC tek çekim harcamaları
    (md.ccSingle || []).forEach(e => {
      const cid = e.cardId || cards[0]?.id;
      const cardName = cards.find(c2 => c2.id === cid)?.name;
      items.push({ key: `single-${e.id}`, label: e.note || e.merchantName || "Tek çekim", sub: `${e.date || ""}${cardName ? " • " + cardName : ""}`, amount: e.amount, cardId: cid });
    });
    // 3. Bu ay aktif taksitler
    data.installmentPlans.forEach(p => {
      let cur = p.startMonth;
      for (let i = 0; i < p.months; i++) {
        if (cur === mk) {
          const cid = p.cardId || cards[0]?.id;
          const cardName = cards.find(c2 => c2.id === cid)?.name;
          items.push({ key: `inst-${p.id}`, label: p.note || "Taksit", sub: `${p.monthlyPayment > 0 ? `Taksit ${i + 1}/${p.months}` : ""}${cardName ? " • " + cardName : ""}`, amount: p.monthlyPayment, cardId: cid });
          break;
        }
        cur = nmk(cur);
      }
    });
    return items;
  }, [data, md, mk]);
  const ccTransferTotal = ccTransferItems.reduce((s, i) => s + i.amount, 0);
  const ccTransferredCount = ccTransferItems.filter(i => md.ccTransferred?.[i.key]?.transferred).length;
  // Kart bazlı toplam
  const ccTransferByCard = useMemo(() => {
    const cards = data.settings.cards || [];
    const byCard = {};
    ccTransferItems.forEach(item => {
      const cid = item.cardId || "unknown";
      if (!byCard[cid]) byCard[cid] = { name: cards.find(c2 => c2.id === cid)?.name || "Bilinmeyen Kart", total: 0 };
      byCard[cid].total += item.amount;
    });
    return Object.values(byCard).sort((a, b) => b.total - a.total);
  }, [ccTransferItems, data.settings.cards]);

  // Savings progress
  const savingsProgress = c.savingsTarget > 0 ? Math.min((c.remaining / c.savingsTarget) * 100, 100) : 0;

  return (
    <div style={{ padding: "12px 16px 100px" }}>
      {msg && <div style={{ background: X.gd, border: `1px solid ${X.g}`, borderRadius: 10, padding: 10, marginBottom: 10, color: X.g, fontSize: 14, fontWeight: 600, textAlign: "center" }}>{msg}</div>}

      <RiskBar score={risk.score} onInfo={() => setInfo("risk")} warnings={warnings} />

      {/* ÖDEME HATIRLATICI */}
      {(() => {
        // CC aktarım uyarıları (2+ gün aktarılmamış CC harcamaları)
        const ccOverdue = [];
        const now = new Date();
        (md.ccSingle || []).forEach(e => {
          if (md.ccTransferred?.[`single-${e.id}`]?.transferred) return;
          if (!e.date) return;
          const entryDate = new Date(e.date + "T00:00:00");
          const daysSince = Math.floor((now - entryDate) / 86400000);
          if (daysSince >= 2) {
            const cardName = (data.settings.cards || []).find(c2 => c2.id === e.cardId)?.name || "kart";
            ccOverdue.push({ id: `cc-overdue-${e.id}`, name: `${e.note || e.merchantName || "Tek çekim"} ödemesi ${cardName} hesabına aktarılmadı`, amount: C(e.amount), amountRaw: e.amount, color: X.r, icon: "💳", label: `${daysSince} gündür`, diff: -1 });
          }
        });

        const upcoming = getUpcomingPayments(data, 3);
        // Ödenen sabit giderleri ve borçları filtrele
        const filteredUpcoming = upcoming.filter(u => {
          if (u.type === "fixed" && md.fixedPaid?.[u.id]?.paid) return false;
          if (u.type === "debt" && md.debtPayments?.[u.id]?.paid) return false;
          return true;
        });

        const allItems = [...ccOverdue, ...filteredUpcoming];
        if (allItems.length === 0) return null;
        const totalAmt = [...ccOverdue, ...filteredUpcoming].reduce((s, u) => s + (u.amountRaw || 0), 0);
        const topColor = ccOverdue.length > 0 ? X.r : (filteredUpcoming[0]?.color || X.w);
        const hasTodayOrOverdue = ccOverdue.length > 0 || filteredUpcoming.some(u => u.diff === 0);
        return (
          <div style={{ margin: "0 0 10px" }}>
            <div onClick={() => toggle("payments")} style={{ background: hasTodayOrOverdue ? X.rd : X.wd, border: `1px solid ${topColor}40`, borderRadius: expanded === "payments" ? "14px 14px 0 0" : 14, padding: "14px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20 }}>📅</span>
                <div>
                  <div style={{ color: topColor, fontSize: 14, fontWeight: 800 }}>Ödeme Hatırlatıcı</div>
                  <div style={{ color: X.tm, fontSize: 11, marginTop: 1 }}>{allItems.length} kalem · {ccOverdue.length > 0 ? `${ccOverdue.length} gecikmiş` : filteredUpcoming[0]?.diff === 0 ? "Bugün ödeme var" : `${filteredUpcoming[0]?.diff} gün içinde`}</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: topColor, fontSize: 16, fontWeight: 800, fontFamily: fm }}>{C(totalAmt)}</span>
                <span style={{ color: X.td, fontSize: 12, transform: expanded === "payments" ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
              </div>
            </div>
            {expanded === "payments" && (
              <div style={{ background: hasTodayOrOverdue ? X.rd : X.wd, border: `1px solid ${topColor}40`, borderTop: `1px solid ${topColor}20`, borderRadius: "0 0 14px 14px", padding: "6px 16px 12px" }}>
                {ccOverdue.map(u => (
                  <div key={u.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid rgba(220,38,38,0.12)" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ color: X.r, fontSize: 12, fontWeight: 800 }}>{u.icon} {u.name}</span>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
                      <span style={{ color: X.r, fontSize: 12, fontWeight: 800, fontFamily: fm }}>{u.amount}</span>
                      <span style={{ color: X.r, fontSize: 10, marginLeft: 4 }}>{u.label}</span>
                    </div>
                  </div>
                ))}
                {filteredUpcoming.map(u => (
                  <div key={u.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                    <div>
                      <span style={{ fontSize: 12 }}>{u.icon} </span>
                      <span style={{ color: X.t, fontSize: 12, fontWeight: 600 }}>{u.name}</span>
                      {u.auto && <span style={{ color: X.g, fontSize: 9, marginLeft: 4 }}>⚡oto</span>}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ color: u.color, fontSize: 12, fontWeight: 700, fontFamily: fm }}>{u.amount}</span>
                      <span style={{ color: u.color, fontSize: 10, marginLeft: 4 }}>{u.label}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* QUICK ACTIONS */}
      {(() => {
        // Taksit özet bilgileri
        const activePlans = data.installmentPlans.filter(p => {
          let cur = p.startMonth;
          for (let i = 0; i < p.months; i++) { if (cur >= mk) return true; cur = nmk(cur); }
          return false;
        });
        const totalCommitted = activePlans.reduce((s, p) => s + p.totalAmount, 0);
        const nextMk = nmk(mk);
        const nextMonthInst = activePlans.reduce((s, p) => {
          let cur = p.startMonth;
          for (let i = 0; i < p.months; i++) { if (cur === nextMk) return s + p.monthlyPayment; cur = nmk(cur); }
          return s;
        }, 0);

        return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, margin: "12px 0" }}>
        <div onClick={() => setModal("ccSingle")} style={{ background: "rgba(29,78,216,0.24)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: "1px solid rgba(29,78,216,0.28)", borderRadius: 16, padding: "14px 12px", cursor: "pointer", textAlign: "center", position: "relative", boxShadow: neu }}>
          <InfoBtn onClick={() => setInfo("ccSingle")} />
          <div style={{ fontSize: 24, marginBottom: 4 }}>💳</div>
          <div style={{ color: X.b, fontSize: 13, fontWeight: 800 }}>Kredi Kartı Tek Çekim</div>
          <div style={{ color: X.t, fontSize: 18, fontWeight: 800, fontFamily: fm, marginTop: 2 }}>{C(c.ccSingleTotal)}</div>
        </div>
        <div onClick={() => setModal("ccInstall")} style={{ background: "rgba(124,58,237,0.20)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: "1px solid rgba(124,58,237,0.26)", borderRadius: 16, padding: "14px 12px", cursor: "pointer", textAlign: "center", position: "relative", boxShadow: neu }}>
          <InfoBtn onClick={() => setInfo("ccInstall")} />
          <div style={{ fontSize: 24, marginBottom: 4 }}>📅</div>
          <div style={{ color: X.p, fontSize: 13, fontWeight: 800 }}>Kredi Kartı Taksitli</div>
          <div style={{ color: X.t, fontSize: 18, fontWeight: 800, fontFamily: fm, marginTop: 2 }}>{C(c.installmentTotal)}</div>
          {activePlans.length > 0 && (
            <div style={{ marginTop: 4 }}>
              {c.installmentTotal === 0 && nextMonthInst > 0 && (
                <div style={{ color: X.p, fontSize: 10, fontWeight: 600 }}>{ml(nextMk)}'dan {C(nextMonthInst)}/ay</div>
              )}
              <div style={{ color: X.td, fontSize: 10 }}>{activePlans.length} plan · toplam {C(totalCommitted)}</div>
            </div>
          )}
        </div>
        <div onClick={() => setModal("cardLoad")} style={{ background: "rgba(15,118,110,0.32)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: "1px solid rgba(15,118,110,0.30)", borderRadius: 16, padding: "14px 12px", cursor: "pointer", textAlign: "center", position: "relative", boxShadow: neu }}>
          <InfoBtn onClick={() => setInfo("cardLoad")} />
          <div style={{ fontSize: 24, marginBottom: 4 }}>🛒</div>
          <div style={{ color: X.g, fontSize: 13, fontWeight: 800 }}>Genel Harcama Kartı</div>
          <div style={{ color: X.t, fontSize: 18, fontWeight: 800, fontFamily: fm, marginTop: 2 }}>{C(md.cardLoaded || 0)} <span style={{ color: X.td, fontSize: 11 }}>/ {C(c.cardLoadMaxTotal)}</span></div>
        </div>
        <div onClick={() => setModal("debtPay")} style={{ background: "rgba(180,83,9,0.28)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: "1px solid rgba(180,83,9,0.28)", borderRadius: 16, padding: "14px 12px", cursor: "pointer", textAlign: "center", position: "relative", boxShadow: neu }}>
          <InfoBtn onClick={() => setInfo("debt")} />
          <div style={{ fontSize: 24, marginBottom: 4 }}>📌</div>
          <div style={{ color: X.w, fontSize: 13, fontWeight: 800 }}>Borç Ödemeleri</div>
          <div style={{ color: X.t, fontSize: 18, fontWeight: 800, fontFamily: fm, marginTop: 2 }}>{C(c.debtTotal)}</div>
        </div>

        {/* Receipt + Simulation half width */}
        <div onClick={() => setModal("receipt")} style={{ background: "rgba(194,65,12,0.20)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: "1px solid rgba(194,65,12,0.26)", borderRadius: 16, padding: "14px 12px", cursor: "pointer", textAlign: "center", position: "relative", boxShadow: neu }}>
          <div style={{ fontSize: 24, marginBottom: 4 }}>📷</div>
          <div style={{ color: X.o, fontSize: 13, fontWeight: 800 }}>Market Fişi</div>
        </div>
        <div onClick={() => setModal("simulate")} style={{ background: "rgba(124,58,237,0.18)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: "1px solid rgba(124,58,237,0.24)", borderRadius: 16, padding: "14px 12px", cursor: "pointer", textAlign: "center", position: "relative", boxShadow: neu }}>
          <div style={{ fontSize: 24, marginBottom: 4 }}>🔮</div>
          <div style={{ color: X.p, fontSize: 13, fontWeight: 800 }}>Taksit Simülasyonu</div>
        </div>

        {/* Savings full width */}
        <div style={{ gridColumn: "1 / -1", background: "rgba(15,118,110,0.35)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: "1px solid rgba(15,118,110,0.30)", borderRadius: 16, padding: "14px 16px", position: "relative", minHeight: 92, display: "flex", flexDirection: "column", justifyContent: "space-between", boxShadow: neu }}>
          <InfoBtn onClick={() => setInfo("savings")} />
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: 24 }}>💰</span>
            <div style={{ color: X.g, fontSize: 14, fontWeight: 800 }}>Bu Ayın Birikimi</div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <span style={{ color: c.remaining >= 0 ? X.g : X.r, fontSize: 22, fontWeight: 800, fontFamily: fm }}>{C(Math.max(0, c.remaining))}</span>
            <span style={{ color: X.tm, fontSize: 13, fontFamily: fm }}>/ {C(c.savingsTarget)} hedef</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, boxShadow: neuIn }}>
            <div style={{ height: "100%", borderRadius: 3, background: X.g, width: `${savingsProgress}%`, transition: "width 0.5s" }} />
          </div>
        </div>
      </div>
        );
      })()}

      {/* DEĞİŞKEN GİDER TAKİBİ */}
      {(() => {
        const ves = data.settings.variableExpenses || [];
        if (ves.length === 0) return null;
        const { categories: cats, instByCategory } = categorizeMonthSpending(data, mk);
        const totalBudget = ves.reduce((s, ve) => s + (ve.expectedAmount || 0), 0);
        const totalSpentEnv = Object.entries(cats).filter(([k]) => k !== "_uncategorized").reduce((s, [, v]) => s + v, 0);
        const uncat = cats._uncategorized || 0;
        return (
          <div style={{ margin: "10px 0" }}>
            <div onClick={() => toggle("envelopes")} style={{ ...glassSolid, borderRadius: 14, padding: "12px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16 }}>📊</span>
                <span style={{ color: X.t, fontSize: 13, fontWeight: 700 }}>Değişken Gider Takibi</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: totalSpentEnv > totalBudget ? X.r : X.t, fontSize: 14, fontWeight: 800, fontFamily: fm }}>{C(totalSpentEnv)}</span>
                <span style={{ color: X.td, fontSize: 11 }}>/ {C(totalBudget)}</span>
                <span style={{ color: X.td, fontSize: 12, transform: expanded === "envelopes" ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
              </div>
            </div>
            {expanded === "envelopes" && (
              <div style={{ ...glassSolid, borderRadius: "0 0 14px 14px", marginTop: -1, padding: "8px 16px 12px", borderTop: `1px solid ${X.border}` }}>
                {ves.map(ve => {
                  const spent = cats[ve.id] || 0;
                  const instAmt = instByCategory[ve.id] || 0;
                  const budget = ve.expectedAmount || 0;
                  const over = budget > 0 && spent > budget;
                  return (
                    <div key={ve.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${X.border}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 14 }}>{ve.icon || "📋"}</span>
                        <span style={{ color: X.t, fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ve.name}</span>
                        {instAmt > 0 && <span style={{ color: X.p, fontSize: 9, fontWeight: 700, background: X.pd, padding: "1px 4px", borderRadius: 4 }}>+taksit</span>}
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
                        <span style={{ color: over ? X.r : X.t, fontSize: 13, fontWeight: 800, fontFamily: fm }}>{C(spent)}</span>
                        {budget > 0 && <span style={{ color: X.td, fontSize: 10 }}> / {C(budget)}</span>}
                        {budget === 0 && spent > 0 && <span style={{ color: X.w, fontSize: 9, marginLeft: 4 }}>tahmin yok</span>}
                      </div>
                    </div>
                  );
                })}
                {uncat > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${X.border}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 14 }}>❓</span>
                      <span style={{ color: X.o, fontSize: 12, fontWeight: 600 }}>Kategorisiz</span>
                    </div>
                    <span style={{ color: X.o, fontSize: 13, fontWeight: 800, fontFamily: fm }}>{C(uncat)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0 2px" }}>
                  <span style={{ color: X.tm, fontSize: 11, fontWeight: 700 }}>Kalan tahmin</span>
                  <span style={{ color: X.g, fontSize: 13, fontWeight: 800, fontFamily: fm }}>{C(Math.max(0, totalBudget - totalSpentEnv))}</span>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* CC TRANSFER */}
      {ccTransferTotal > 0 && (
        <CatButton icon="💳" label="Kredi Kartı Hesabına Aktar" total={ccTransferTotal} color={X.b} dimColor={X.bd} expanded={expanded === "ccTransfer"} onToggle={() => toggle("ccTransfer")} onInfo={() => setInfo("ccTransfer")}>
          <div style={{ color: X.td, fontSize: 11, marginBottom: 8 }}>
            {ccTransferredCount}/{ccTransferItems.length} kalem aktarıldı
          </div>
          {/* Kart bazlı özet */}
          {ccTransferByCard.length > 0 && (
            <div style={{ marginBottom: 10, padding: "8px 10px", borderRadius: 10, background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.12)" }}>
              {ccTransferByCard.map((card, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: i < ccTransferByCard.length - 1 ? "1px solid rgba(29,78,216,0.24)" : "none" }}>
                  <span style={{ color: X.b, fontSize: 12, fontWeight: 700 }}>💳 {card.name}</span>
                  <span style={{ color: X.b, fontSize: 14, fontWeight: 800, fontFamily: fm }}>{C(card.total)}</span>
                </div>
              ))}
            </div>
          )}
          {ccTransferItems.map(item => {
            const transferred = md.ccTransferred?.[item.key]?.transferred;
            const isSingle = item.key.startsWith("single-");
            const isInst = item.key.startsWith("inst-");
            const sourceId = item.key.split("-").slice(1).join("-");
            return <ItemRow key={item.key} label={item.label} sub={item.sub} value={item.amount} color={transferred ? X.g : X.t}
              onAction={!transferred ? () => handleCCTransfer(item.key) : () => undoCCTransfer(item.key)}
              actionLabel={transferred ? "↩ Geri Al" : "Aktardım"}
              onEdit={isSingle ? () => editCCSingle(sourceId) : isInst ? () => editInstallment(sourceId) : null}
              onDelete={isSingle ? () => deleteCCSingle(sourceId) : isInst ? () => deleteInstallment(sourceId) : null}
            />;
          })}
        </CatButton>
      )}

      {/* CATEGORIES */}
      <CatButton icon="🔒" label="Sabit Zorunlu Giderler" total={c.fixedTotal} color={X.w} dimColor={X.wd} expanded={expanded === "fixed"} onToggle={() => toggle("fixed")} onInfo={() => setInfo("fixed")}>
        {data.settings.fixedExpenses.length === 0 && <div style={{ color: X.td, fontSize: 12, padding: 8 }}>Ayarlar'dan ekleyin</div>}
        {data.settings.fixedExpenses.map(exp => { const paid = md.fixedPaid?.[exp.id]; return <ItemRow key={exp.id} label={exp.name} sub={`${exp.paymentMethod === "cc" ? "💳" : "🏦"}${exp.increaseDate ? " • Artış: " + exp.increaseDate : ""}`} value={exp.amount} color={paid ? X.g : X.t} onAction={!paid ? () => handleFixedPay(exp.id) : () => handleFixedUnpay(exp.id)} actionLabel={paid ? "↩ Geri Al" : "Ödedim"} />; })}
      </CatButton>

      {modal === "ccSingle" && <CCSingleModal cards={data.settings.cards || []} variableExpenses={data.settings.variableExpenses || []} onClose={() => setModal(null)} onSave={handleCCSingle} />}
      {modal === "ccInstall" && <CCInstallModal data={data} mk={mk} cards={data.settings.cards || []} variableExpenses={data.settings.variableExpenses || []} onClose={() => setModal(null)} onSave={handleInstSave} onDeletePlan={deleteInstallment} onEditPlan={editInstallment} />}
      {modal === "simulate" && <CCInstallModal data={data} mk={mk} cards={data.settings.cards || []} variableExpenses={data.settings.variableExpenses || []} onClose={() => setModal(null)} onSave={handleInstSave} onDeletePlan={deleteInstallment} onEditPlan={editInstallment} startInSim={true} />}
      {modal === "cardLoad" && <CardLoadModal currentLoaded={md.cardLoaded || 0} maxPerTx={c.cardLoadMaxPerTx} maxTotal={c.cardLoadMaxTotal} onClose={() => setModal(null)} onSave={handleCardLoad} onEdit={editCardLoad} />}
      {modal === "debtPay" && <DebtPayModal debts={data.debts} debtPayments={md.debtPayments} data={data} mk={mk} onClose={() => setModal(null)} onPay={handleDebtPay} onUndo={undoDebtPay} />}
      {modal === "budget" && <BudgetModal mk={mk} cur={md.budget || data.settings.monthlyBudget} def={data.settings.monthlyBudget} onSave={v => setMonthField(mk, "budget", v)} onClose={() => setModal(null)} />}
      {modal === "receipt" && <ReceiptModal receipts={md.receipts || []} onClose={() => setModal(null)} onSave={handleReceiptSave} onDelete={handleReceiptDelete} apiKey={data.settings.claudeApiKey || ""} onSaveApiKey={key => setData(d => ({ ...d, settings: { ...d.settings, claudeApiKey: key } }))} />}
      {info && info === "cardLoad" && (
        <Modal title="ℹ️ Genel Harcama Kartı" onClose={() => setInfo(null)}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ color: X.tm, fontSize: 11, fontWeight: 700, marginBottom: 10 }}>BU AY YÜKLENEBİLİR TUTAR HESABI</div>
            <div style={{ borderRadius: 10, padding: "12px 14px", background: "rgba(160,190,200,0.35)" }}>
              {[
                { label: "Serbest bütçe (kalan)", value: c.remaining, sign: "", hl: true },
                { label: `Kullanılabilir (%${Math.round(CARD_USABLE_PCT * 100)})`, value: c.cardUsable, sign: "" },
                { label: "Bu ay yüklenen", value: md.cardLoaded || 0, sign: "−" },
              ].map((row, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: i === 0 ? "1px solid rgba(0,0,0,0.06)" : "none", fontSize: 13 }}>
                  <span style={{ color: row.hl ? X.t : X.tm }}>{row.sign} {row.label}</span>
                  <span style={{ color: row.hl ? X.g : X.tm, fontFamily: fm, fontWeight: 700 }}>{row.sign}{C(row.value)}</span>
                </div>
              ))}
              <div style={{ borderTop: "1px solid rgba(0,0,0,0.1)", marginTop: 6, paddingTop: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                  <span style={{ color: X.t, fontWeight: 800 }}>Kalan kapasite</span>
                  <span style={{ color: c.cardLoadRemaining > 0 ? X.g : X.r, fontFamily: fm, fontWeight: 800 }}>{C(c.cardLoadRemaining)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 0", color: X.td }}>
                  <span>Tek seferde max (%{Math.round(CARD_SINGLE_MAX_PCT * 100)})</span>
                  <span style={{ fontFamily: fm }}>{C(c.cardLoadMaxPerTx)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 0", color: X.td }}>
                  <span>Acil tampon (%{Math.round(EMERGENCY_BUFFER_PCT * 100)})</span>
                  <span style={{ fontFamily: fm }}>{C(c.emergencyBuffer)}</span>
                </div>
              </div>
            </div>
          </div>
          <div style={{ color: X.t, fontSize: 13, lineHeight: 1.6 }}>{INFO.cardLoad.text}</div>
          <Btn onClick={() => setInfo(null)} s={{ marginTop: 16 }}>Anladım</Btn>
        </Modal>
      )}
      {info && info !== "cardLoad" && INFO[info] && <InfoModal title={INFO[info].title} text={INFO[info].text} onClose={() => setInfo(null)} />}
      {detail && <DetailModal {...detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

/* ═══ ANALYSIS ═══ */
function AnalysisScreen({ data, setData, mk: initialMk }) {
  const [view, setView] = useState("risk");
  const [csvSub, setCsvSub] = useState("analysis"); // analysis | category
  const [selMk, setSelMk] = useState(initialMk);
  const [csvCardId, setCsvCardId] = useState("");
  const [expandedAsset, setExpandedAsset] = useState(null);
  const [savingsModal, setSavingsModal] = useState(null); // { type: "buy"|"sell", asset }
  const cards = data.settings.cards || [];
  const mk = selMk;
  const risk = useMemo(() => calcRisk(data, mk), [data, mk]);
  const c = calcMonth(data, mk, null);
  const isCurrentMonth = mk === initialMk;

  const handleSavingsSave = (asset, tx) => {
    setData(d => {
      const list = [...(d.savings?.[asset] || [])];
      list.push(tx);
      return { ...d, savings: { ...d.savings, [asset]: list } };
    });
  };

  // Savings pool — past months only (closed)
  const savingsPool = useMemo(() => {
    let pool = 0;
    Object.keys(data.months).sort().forEach(m => {
      if (m >= mk) return;
      const cm = calcMonth(data, m, null);
      if (cm.remaining > 0) pool += cm.remaining;
      if (cm.remaining < 0) pool = Math.max(0, pool + cm.remaining);
    });
    return pool;
  }, [data, mk]);

  // Hit rate analysis
  const hitRate = useMemo(() => {
    const months = [];
    Object.keys(data.months).sort().forEach(m => {
      if (m >= mk) return;
      const cm = calcMonth(data, m, null);
      if (cm.savingsTarget > 0) {
        const actual = Math.max(0, cm.remaining);
        const rate = (actual / cm.savingsTarget) * 100;
        months.push({ mk: m, target: cm.savingsTarget, actual, rate });
      }
    });
    const avg = months.length > 0 ? months.reduce((s, m) => s + m.rate, 0) / months.length : 0;
    return { months, avgHitRate: Math.round(avg) };
  }, [data, mk]);

  const history = useMemo(() => { const ms = []; let m = mk; for (let i = 0; i < 6; i++) { ms.unshift({ mk: m, ...calcMonth(data, m, null) }); m = pmk(m); } return ms; }, [mk, data]);

  const handleCSV = e => {
    const file = e.target.files?.[0]; if (!file) return;
    if (!csvCardId) { alert("Önce hangi karta ait olduğunu seçin"); return; }
    Papa.parse(file, {
      header: true, skipEmptyLines: true, complete: r => {
        const ves = data.settings.variableExpenses || [];
        const md = data.months[mk] || DM();
        const ccEntries = (md.ccSingle || []).filter(e2 => e2.cardId === csvCardId);

        // CSV satırlarını parse et
        const transactions = r.data.map(row => {
          const desc = (row["Açıklama"] || row["Description"] || row["İşlem Açıklaması"] || Object.values(row)[1] || "").toString();
          const raw = row["Tutar"] || row["Amount"] || row["İşlem Tutarı"] || Object.values(row)[2] || "0";
          const date = (row["Tarih"] || row["Date"] || row["İşlem Tarihi"] || Object.values(row)[0] || "").toString();
          const amt = Math.abs(parseFloat(raw.toString().replace(/[^\d,.-]/g, "").replace(",", ".")) || 0);
          return { id: uid(), desc, amount: amt, date };
        }).filter(t => t.amount > 0);

        // EŞLEŞME MOTORU
        const matchedCCIds = new Set();
        const newMerchantMap = { ...(data.merchantMap || {}) };

        const enriched = transactions.map(tx => {
          let categoryId = null;
          let matchedEntryId = null;
          let matchedNote = null;

          // 1. Tarih + tutar eşleşmesi (en güvenilir)
          const dateNorm = tx.date.replace(/\./g, "-").replace(/(\d{2})-(\d{2})-(\d{4})/, "$3-$2-$1"); // dd.mm.yyyy → yyyy-mm-dd
          for (const entry of ccEntries) {
            if (matchedCCIds.has(entry.id)) continue;
            const entryAmt = Math.abs(entry.amount);
            const txAmt = Math.abs(tx.amount);
            if (Math.abs(entryAmt - txAmt) < 0.5 && entry.date) {
              // Tarih karşılaştırma (farklı formatları tolere et)
              const entryDateNorm = entry.date.replace(/\./g, "-");
              if (entryDateNorm === dateNorm || entry.date === tx.date || entryDateNorm.includes(tx.date) || tx.date.includes(entryDateNorm)) {
                matchedEntryId = entry.id;
                matchedNote = entry.note;
                categoryId = entry.categoryId;
                matchedCCIds.add(entry.id);

                // merchantMap'e öğret: kullanıcının açıklamasındaki anahtar kelimeler → banka açıklaması
                if (entry.note) {
                  const noteWords = entry.note.toLowerCase().split(/\s+/);
                  const bankDesc = tx.desc.toLowerCase().split(/\s+/).slice(0, 3).join(" ");
                  noteWords.forEach(word => {
                    if (word.length >= 3 && !newMerchantMap[word]) {
                      newMerchantMap[word] = { bankName: tx.desc, categoryId: entry.categoryId || null };
                    }
                  });
                  if (bankDesc.length >= 3) {
                    newMerchantMap[bankDesc] = { bankName: tx.desc, categoryId: entry.categoryId || null };
                  }
                }
                break;
              }
            }
          }

          // 2. Tutar eşleşmesi (tarihsiz — taksitler için)
          if (!matchedEntryId) {
            for (const entry of ccEntries) {
              if (matchedCCIds.has(entry.id)) continue;
              if (Math.abs(Math.abs(entry.amount) - Math.abs(tx.amount)) < 0.5) {
                matchedEntryId = entry.id;
                matchedNote = entry.note;
                categoryId = entry.categoryId;
                matchedCCIds.add(entry.id);
                if (entry.note) {
                  const noteWords = entry.note.toLowerCase().split(/\s+/);
                  noteWords.forEach(word => { if (word.length >= 3) newMerchantMap[word] = { bankName: tx.desc, categoryId: entry.categoryId || null }; });
                }
                break;
              }
            }
          }

          // 3. merchantMap'ten öğrenilmiş eşleşme
          if (!categoryId) {
            const descLower = tx.desc.toLowerCase();
            for (const [key, val] of Object.entries(newMerchantMap)) {
              if (descLower.includes(key.toLowerCase())) {
                categoryId = typeof val === "string" ? val : val.categoryId;
                break;
              }
            }
          }

          // 4. Anahtar kelime eşleşmesi (variableExpenses keywords)
          if (!categoryId) {
            categoryId = matchCategory(tx.desc, ves);
          }

          // 5. Fatura otomatik tespiti: kategori yoksa ama fatura ise "Faturalar" kategorisine ata
          const billSub = detectBillSubType(tx.desc);
          if (!categoryId && billSub) {
            const faturaVe = ves.find(ve => ve.name && ve.name.toLowerCase().includes("fatura"));
            if (faturaVe) categoryId = faturaVe.id;
          }

          return { ...tx, categoryId, matchedEntryId, matchedNote, billSubType: billSub };
        });

        // Eşleşmeyen uygulama kayıtları (CSV'de bulunmayan)
        const unmatchedEntries = ccEntries.filter(e2 => !matchedCCIds.has(e2.id));

        setData(d => {
          const ms = { ...d.months };
          const md2 = { ...(ms[mk] || DM()) };
          const csvByCard = { ...(md2.csvByCard || {}) };
          csvByCard[csvCardId] = {
            transactions: enriched,
            uploadedAt: td(),
            matchStats: {
              total: enriched.length,
              matched: enriched.filter(t => t.matchedEntryId).length,
              unmatched: enriched.filter(t => !t.matchedEntryId).length,
              unmatchedEntries: unmatchedEntries.map(e2 => ({ id: e2.id, note: e2.note, amount: e2.amount, date: e2.date }))
            }
          };
          md2.csvByCard = csvByCard;
          ms[mk] = md2;
          return { ...d, months: ms, merchantMap: newMerchantMap };
        });
        e.target.value = "";
      }
    });
  };

  // Combine all card CSVs for current month - new structure
  const allCsvData = data.months[mk]?.csvByCard || {};
  const csvCats = useMemo(() => {
    const ves = data.settings.variableExpenses || [];
    const merged = {};
    ves.forEach(ve => { merged[ve.id] = 0; });
    merged._uncategorized = 0;
    Object.values(allCsvData).forEach(cardData => {
      (cardData.transactions || []).forEach(t => {
        if (t.categoryId && merged[t.categoryId] !== undefined) merged[t.categoryId] += t.amount;
        else merged._uncategorized += t.amount;
      });
      // Backward compat: eski yapıda categories varsa da ekle
      if (cardData.categories) {
        Object.entries(cardData.categories).forEach(([cat, amt]) => {
          if (!merged[cat]) merged[cat] = 0;
          merged[cat] += amt;
        });
      }
    });
    return merged;
  }, [allCsvData, data.settings.variableExpenses]);
  const csvTotal = Object.values(csvCats).reduce((s, v) => s + v, 0);

  // Fatura alt-kategori dağılımı — özel fatura türlerine göre
  const billBreakdown = useMemo(() => {
    const billTypes = data.settings.billTypes || [];
    const ves = data.settings.variableExpenses || [];
    const faturaVe = ves.find(ve => ve.name && ve.name.toLowerCase().includes("fatura"));

    // Mevcut ay: her işlemi özel fatura türüne eşleştir
    const byType = {}; // { btId: { total, count, items } }
    let otherTotal = 0; let otherCount = 0; const otherItems = [];

    Object.values(allCsvData).forEach(cardData => {
      (cardData.transactions || []).forEach(t => {
        if (t.categoryId && faturaVe && t.categoryId !== faturaVe.id) return;
        const btId = matchCustomBillType(t.desc, billTypes);
        if (!btId) return;
        if (btId === "_fatura_other") {
          otherTotal += t.amount; otherCount++; otherItems.push({ desc: t.desc, amount: t.amount, date: t.date });
          return;
        }
        if (!byType[btId]) byType[btId] = { total: 0, count: 0, items: [] };
        byType[btId].total += t.amount;
        byType[btId].count++;
        byType[btId].items.push({ desc: t.desc, amount: t.amount, date: t.date });
      });
    });

    const matchedTotal = Object.values(byType).reduce((s, g) => s + g.total, 0);
    const grandTotal = matchedTotal + otherTotal;

    // Tarihsel veri: son 5 ay
    const history = getBillHistory(data, mk, 5);

    // Her tür için istatistik
    const typeStats = {};
    billTypes.forEach(bt => {
      const current = byType[bt.id]?.total || 0;
      const histAmounts = history.map(h => h.byType[bt.id] || 0);
      const histWithData = histAmounts.filter(v => v > 0);
      const avg = histWithData.length > 0 ? histWithData.reduce((s, v) => s + v, 0) / histWithData.length : 0;
      const isAnomaly = isBillAnomaly(current, histWithData);
      const spark = sparkLine([...histAmounts, current]);
      typeStats[bt.id] = { budget: bt.budget || 0, current, avg, isAnomaly, spark, histAmounts, histWithData };
    });

    const totalBudget = billTypes.reduce((s, bt) => s + (bt.budget || 0), 0);

    return { byType, otherTotal, otherCount, otherItems, grandTotal, history, typeStats, billTypes, totalBudget, faturaVeId: faturaVe?.id };
  }, [allCsvData, data.settings.variableExpenses, data.settings.billTypes, data.months, mk]);

  // Kategori güncelleme ve öğrenme
  const updateCsvTransaction = (cardId, txId, newCategoryId) => {
    setData(d => {
      const ms = { ...d.months };
      const md = { ...(ms[mk] || DM()) };
      const csvByCard = { ...(md.csvByCard || {}) };
      const cardData = { ...(csvByCard[cardId] || {}) };
      const txs = (cardData.transactions || []).map(t => {
        if (t.id === txId) return { ...t, categoryId: newCategoryId };
        return t;
      });
      cardData.transactions = txs;
      csvByCard[cardId] = cardData;
      md.csvByCard = csvByCard;
      ms[mk] = md;

      // merchantMap öğrenmesi: bu işlemin desc'inden anahtar çıkar ve kaydet
      const updatedTx = txs.find(t => t.id === txId);
      const newMerchantMap = { ...(d.merchantMap || {}) };
      if (updatedTx && newCategoryId) {
        // Basit anahtar: ilk 3 kelimeyi veya tam desc'i kullan
        const key = updatedTx.desc.split(/\s+/).slice(0, 3).join(" ").toLowerCase().trim();
        if (key.length > 2) newMerchantMap[key] = newCategoryId;
      }

      return { ...d, months: ms, merchantMap: newMerchantMap };
    });
  };
  const forecast = useMemo(() => { const ms = []; let m = nmk(mk); for (let i = 0; i < 6; i++) { const cm = calcMonth(data, m, null); const incs = data.settings.fixedExpenses.filter(f => f.increaseDate && f.increaseDate.startsWith(m)); ms.push({ mk: m, ...cm, increases: incs }); m = nmk(m); } return ms; }, [data, mk]);
  const debtEnds = data.debts.filter(d => d.remainingMonths > 0).map(d => { let m = mk; for (let i = 0; i < d.remainingMonths; i++) m = nmk(m); return { name: d.name, endMonth: m, monthly: d.monthlyPayment, currency: d.currency, monthlyTL: debtTLValue(d, data, mk) }; });

  const guidance = useMemo(() => {
    const tips = [];
    const totalDebtMonthly = c.debtTotal;
    const totalInstMonthly = c.installmentTotal;
    const fullCardMax = c.cardLoadMaxTotal;
    const expectedCC = c.expectedCCSingle;

    if (risk.score >= 70) {
      // KRİTİK
      const reducedCardMax = Math.floor(fullCardMax * 0.3);
      const variableCutTarget = Math.floor(c.variableTotal * 0.85);
      tips.push({
        title: "🚨 Kritik — Acil Aksiyon",
        text: `Bütçeniz kırmızı alarmda. Bu ay genel harcama kartına en fazla ${C(reducedCardMax)} yükleyin (normalin %30'u). Restoran, kıyafet, eğlence gibi isteğe bağlı tüm harcamaları durdurun — sadece market ve zorunlu ihtiyaçlar. Değişken giderlerinizi ${C(variableCutTarget)} altında tutmayı hedefleyin (yani normalden ${C(c.variableTotal - variableCutTarget)} daha az). Yeni hiçbir taksitli alım yapmayın, simülasyon bile çalıştırmayın. Mevcut ${C(totalInstMonthly)} aylık taksit yükünüz var, bunlar kapanana kadar ek yük almayın. Borç ödemelerinizi (${C(totalDebtMonthly)}/ay) aksatmayın çünkü bunlar birikmesin. Birikim havuzunuza dokunmayın — açık kapatma için son çare olarak saklayın. Eğer açık çok büyükse ek gelir kaynakları düşünün ya da ailenize durumu açıkça anlatın.`,
        color: X.r
      });
    } else if (risk.score >= 50) {
      // YÜKSEK
      const reducedCardMax = Math.floor(fullCardMax * 0.5);
      const variableCutTarget = Math.floor(c.variableTotal * 0.92);
      tips.push({
        title: "🟠 Yüksek Risk — Sıkı Tasarruf",
        text: `Bu ay genel harcama kartına en fazla ${C(reducedCardMax)} yükleyin (normalin yarısı). Restoran ve eğlence harcamalarını minimum seviyeye çekin, kıyafet alımını erteleyebiliyorsanız erteleyin. Değişken zorunlu giderlerinizi ${C(variableCutTarget)} altında tutun — özellikle elektrik ve akaryakıtta tasarruf yapın. Yeni taksitli alım yapmayın, çok zorunluysa önce mutlaka simülasyon çalıştırıp güvenli olduğunu onaylayın. Mevcut ${C(totalInstMonthly)} aylık taksitlerinizi erken kapatabiliyorsanız kapatmayı düşünün. Borç ödemelerinizi (${C(totalDebtMonthly)}/ay) düzenli yapın. Birikim havuzunuza şimdilik dokunmayın, gelecek 2-3 ay zor geçebilir.`,
        color: "#FF6B35"
      });
    } else if (risk.score >= 30) {
      // ORTA
      const reducedCardMax = Math.floor(fullCardMax * 0.75);
      tips.push({
        title: "🟡 Orta Risk — Aktif Kontrol",
        text: `Bu ay genel harcama kartına en fazla ${C(reducedCardMax)} yükleyin (normalin %75'i). Lüks alımları erteleyin, dışarıda yemek sayısını azaltın. Değişken zorunlu giderlerinizde dikkatli olun, beklenen tutarların üstüne çıkmayın. Yeni taksitli alımlardan önce mutlaka simülasyon çalıştırın — en az 6 ay ilerisini test edin, açık çıkıyorsa vazgeçin. Mevcut ${C(totalInstMonthly)} aylık taksit ve ${C(totalDebtMonthly)} aylık borç ödemenizi düzenli yapın, ek yük almayın. Bu ay birikim hedefiniz ${C(c.savingsTarget)} — bu hedefe ulaşmaya çalışın, en azından ${C(Math.floor(c.savingsTarget * 0.7))} biriktirin.`,
        color: X.w
      });
    } else if (risk.score >= 15) {
      // DÜŞÜK
      tips.push({
        title: "🟢 Düşük Risk — Bilinçli Devam",
        text: `Bütçeniz iyi durumda ama bazı uyarıcı sinyaller var. Genel harcama kartına normal limitiniz olan ${C(fullCardMax)} kadar yükleyebilirsiniz ama tek seferde ${C(c.cardLoadMaxPerTx)} sınırını unutmayın. Değişken zorunlu giderlerinizi takip edin, beklenmedik artışlar olursa nedenini araştırın. Yeni taksitli alımlardan önce simülasyonu kullanmayı alışkanlık haline getirin — özellikle 3 taksitten uzun olanlar için. Mevcut ${C(totalInstMonthly)} taksit ve ${C(totalDebtMonthly)} borç yükünüz makul seviyede. Bu ay birikim hedefiniz ${C(c.savingsTarget)} — bu hedefin altına düşmemeye çalışın çünkü gelecek ay artışlar geliyor olabilir.`,
        color: "#84CC16"
      });
    } else {
      // GÜVENLİ
      tips.push({
        title: "✅ Güvenli — Sağlıklı Bütçe",
        text: `Bütçeniz sağlıklı, normal hayatınıza devam edebilirsiniz. Genel harcama kartına bu ay ${C(fullCardMax)} kadar yükleyebilirsiniz (tek seferde ${C(c.cardLoadMaxPerTx)} sınırı geçerli). Değişken zorunlu giderlerinizi normal seviyede tutun, anormal bir şey görürseniz uyarı alacaksınız. Yeni taksitli alımlar yapabilirsiniz fakat alışkanlık olarak simülasyonu çalıştırın — geleceği görmek faydalı. Mevcut ${C(totalInstMonthly)} taksit ve ${C(totalDebtMonthly)} borç yükünüz kontrol altında. Bu ay birikim hedefiniz ${C(c.savingsTarget)} — bu hedefe ulaşırsanız birikim havuzunuza ${C(c.savingsTarget)} eklenmiş olacak. Lüks bir alım, tatil planı veya hediye alımı için uygun bir dönem.`,
        color: X.g
      });
    }

    // Dinamik ek uyarılar
    if (risk.trendPct > 15) {
      const lastSpent = c.totalSpent;
      const targetSpent = Math.floor(lastSpent / (1 + risk.trendPct / 100));
      tips.push({
        title: "📊 Harcama Artışı Trendi",
        text: `Son 3 ayda harcamalarınız %${risk.trendPct} arttı. Bu trend devam ederse 6 ay içinde bütçeniz ciddi sıkıntıya girer. Bu ay toplam harcamanızı ${C(targetSpent)} seviyesinde tutmayı hedefleyin (yani normalden ${C(lastSpent - targetSpent)} daha az). Hangi kategorinin arttığını CSV analizinden kontrol edin — büyük olasılıkla restoran, market veya akaryakıt kalemlerinden biri.`,
        color: X.w
      });
    }

    if (risk.monthsUntilDeficit <= 6 && risk.monthsUntilDeficit > 0) {
      // Calculate how much to save per month to avoid deficit
      let m = nmk(mk);
      let totalDeficit = 0;
      for (let i = 0; i < 12; i++) {
        const fc = calcMonth(data, m, null);
        if (fc.remaining < 0) totalDeficit += Math.abs(fc.remaining);
        m = nmk(m);
      }
      const monthlySaveTarget = Math.ceil(totalDeficit / risk.monthsUntilDeficit);
      tips.push({
        title: "🔮 Projeksiyon Uyarısı",
        text: `Mevcut harcama düzeninde ${risk.monthsUntilDeficit} ay sonra bütçe açık verecek ve önümüzdeki 12 ay içinde toplam ${C(totalDeficit)} açık birikecek. Bunu önlemek için bu aydan itibaren her ay en az ${C(monthlySaveTarget)} fazladan tasarruf etmelisiniz — yani genel harcama kartına yüklediğiniz tutarı bu kadar azaltın ya da değişken giderlerinizi bu kadar kısın.`,
        color: X.r
      });
    }

    const upcoming = data.settings.fixedExpenses.filter(e => e.increaseDate && e.increaseDate >= mk);
    if (upcoming.length > 0) {
      const nearest = upcoming.sort((a, b) => a.increaseDate.localeCompare(b.increaseDate))[0];
      const incMonth = nearest.increaseDate.slice(0, 7);
      let monthsAway = 0; let m = mk;
      while (m < incMonth && monthsAway < 24) { m = nmk(m); monthsAway++; }
      tips.push({
        title: "📈 Yaklaşan Artış",
        text: `"${nearest.name}" giderinizin tutarı ${monthsAway} ay sonra (${ml(incMonth)}) artacak. Mevcut tutar ${C(nearest.amount)}. Şimdiden bu artışa hazırlanmak için her ay ${C(Math.ceil(nearest.amount * 0.15 / Math.max(monthsAway, 1)))} ek birikim yapmaya çalışın — böylece artış geldiğinde bütçeniz sarsılmaz. Artış oranını öğrendiğinizde Ayarlar'dan kalemin tutarını güncelleyin.`,
        color: X.o
      });
    }

    if (debtEnds.length > 0) {
      const nearest = debtEnds.sort((a, b) => a.endMonth.localeCompare(b.endMonth))[0];
      let monthsAway = 0; let m = mk;
      while (m < nearest.endMonth && monthsAway < 60) { m = nmk(m); monthsAway++; }
      const sym = debtCurSymbol(nearest.currency);
      const amtText = nearest.currency === "TRY" ? C(nearest.monthlyTL) : `${C(nearest.monthlyTL)} (${nearest.monthly} ${sym})`;
      tips.push({
        title: "🎯 Borç Bitiş Müjdesi",
        text: `"${nearest.name}" borcunuz ${monthsAway} ay sonra (${ml(nearest.endMonth)}) bitecek. O tarihten itibaren her ay ${amtText} bütçenizde rahatlama olacak. Bu rahatlamayı planlayın — birikim havuzuna ekleyebilir, yeni bir hedefe yönlendirebilir ya da başka bir borcu erken kapatmak için kullanabilirsiniz.`,
        color: X.g
      });
    }

    // Kart yükleme kapasitesi kontrolü
    const cardLoadCapacity = c.cardLoadRemaining;
    if (c.cardUsable < 15000) {
      const isHard = c.cardUsable < 5000;
      tips.push({
        title: isHard ? "🚨 Aylık Serbest Bütçe Yetersiz" : "⚠️ Aylık Serbest Bütçe Azalıyor",
        text: isHard
          ? `Genel harcama kartına bu ay yükleyebileceğiniz tutar ${C(cardLoadCapacity)} seviyesine düştü. Bu, ₺15.000 alt limitinin altında. Aylık zorunlu harcamalarınız (market, akaryakıt, fatura) için yeterli alan kalmıyor. Kredi kartı tek çekim harcamalarınızı veya taksit yükünüzü gözden geçirin.`
          : `Genel harcama kartına bu ay yükleyebileceğiniz tutar ${C(cardLoadCapacity)} seviyesinde ve ₺15.000 alt limitine yaklaşıyor. Yeni tek çekim veya taksitli işlem yapmadan önce bu dengeyi göz önünde bulundurun.`,
        color: isHard ? X.r : X.w
      });
    }

    return tips;
  }, [risk, data, c, debtEnds, mk]);

  return (
    <div style={{ padding: "20px 16px 100px" }}>
      {/* AY SEÇİCİ */}
      <Card s={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px" }}>
        <button onClick={() => setSelMk(pmk(selMk))} style={{ background: "none", border: "none", color: X.g, fontSize: 24, fontWeight: 700, cursor: "pointer", padding: "0 8px" }}>‹</button>
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ color: X.t, fontSize: 16, fontWeight: 800, fontFamily: ff }}>{ml(mk)}</div>
          {!isCurrentMonth && <div style={{ color: X.td, fontSize: 11 }}>Geçmiş/gelecek ay</div>}
          {isCurrentMonth && <div style={{ color: X.g, fontSize: 11 }}>Bu ay</div>}
        </div>
        <button onClick={() => setSelMk(nmk(selMk))} style={{ background: "none", border: "none", color: X.g, fontSize: 24, fontWeight: 700, cursor: "pointer", padding: "0 8px" }}>›</button>
      </Card>
      {!isCurrentMonth && <Btn v="outline" c={X.g} onClick={() => setSelMk(initialMk)} s={{ marginBottom: 12 }}>↻ Bu Aya Dön</Btn>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
        {[
          { id: "csv", l: "Ekstre Analizi", i: "🧾" },
          { id: "trend", l: "Harcama Trendi", i: "📈" },
          { id: "risk", l: "Risk & Yönlendirme", i: "⚠️" },
          { id: "calendar", l: "Takvim", i: "📅" }
        ].map(t => (
          <button key={t.id} onClick={() => setView(t.id)} style={{ background: view === t.id ? X.gd : X.bg, border: `1px solid ${view === t.id ? X.g : X.border}`, borderRadius: 10, padding: "12px 8px", color: view === t.id ? X.g : X.tm, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: ff, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, lineHeight: 1.2 }}>
            <span style={{ fontSize: 18 }}>{t.i}</span>
            <span>{t.l}</span>
          </button>
        ))}
      </div>

      {/* ═══ HARCAMA TRENDİ ═══ */}
      {view === "trend" && (() => {
        // Son 6 ayın verilerini hazırla — VERİSİ OLMAYAN AYLARI FİLTRELE
        const allMonths = [];
        let m6 = mk;
        for (let i = 0; i < 6; i++) { allMonths.unshift({ mk: m6, ...calcMonth(data, m6, null), hasData: !!data.months[m6] }); m6 = pmk(m6); }
        const months6 = allMonths.filter(m => m.hasData || m.mk === mk);
        if (months6.length === 0) months6.push(allMonths[allMonths.length - 1]);
        const chartMax = Math.max(...months6.map(m => Math.max(m.effectiveBudget, m.totalSpent)), 1);

        // Kategori bazlı karşılaştırma
        const catCompare = [];
        const ves = data.settings.variableExpenses || [];
        if (ves.length > 0) {
          const prevMk = pmk(mk);
          const curCats = getCategorizedTotal(data, mk);
          const prevCats = getCategorizedTotal(data, prevMk);
          ves.forEach(ve => {
            const cur = curCats[ve.id] || 0;
            const prev = prevCats[ve.id] || 0;
            if (cur > 0 || prev > 0) {
              const change = prev > 0 ? Math.round(((cur - prev) / prev) * 100) : (cur > 0 ? 100 : 0);
              catCompare.push({ name: ve.name, icon: ve.icon || "📋", cur, prev, change });
            }
          });
        }

        // Ay bazlı değişim yüzdeleri
        const monthChanges = months6.slice(1).map((m, i) => {
          const prev = months6[i];
          const change = prev.totalSpent > 0 ? Math.round(((m.totalSpent - prev.totalSpent) / prev.totalSpent) * 100) : 0;
          return { ...m, change };
        });

        return (
          <>
            {/* BÜTÇE vs HARCAMA + BİRİKİM CHART */}
            <Card s={{ marginBottom: 12 }}>
              <div style={{ color: X.tm, fontSize: 12, fontWeight: 700, marginBottom: 12 }}>BÜTÇE vs HARCAMA</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 130, marginBottom: 6 }}>
                {months6.map(m => {
                  const spentPct = m.effectiveBudget > 0 ? Math.round((m.totalSpent / m.effectiveBudget) * 100) : 0;
                  const savingsPct = m.effectiveBudget > 0 ? Math.max(0, Math.round((m.remaining / m.effectiveBudget) * 100)) : 0;
                  const spentH = (m.totalSpent / chartMax) * 100;
                  const savingsH = m.remaining > 0 ? (m.remaining / chartMax) * 100 : 0;
                  const isOver = m.totalSpent > m.effectiveBudget;
                  return (
                    <div key={m.mk} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: 105 }}>
                        {/* Birikim barı (turuncu, bütçenin fazlası) */}
                        {savingsH > 0 && <div style={{ width: "70%", background: "#F59E0B", borderRadius: "4px 4px 0 0", height: `${savingsH}%`, minHeight: 2, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {savingsPct >= 8 && <span style={{ color: "#fff", fontSize: 8, fontWeight: 800, fontFamily: fm }}>%{savingsPct}</span>}
                        </div>}
                        {/* Harcama barı */}
                        <div style={{ width: "70%", background: isOver ? X.r : X.b, borderRadius: savingsH > 0 ? 0 : "4px 4px 0 0", height: `${spentH}%`, minHeight: 2, opacity: 0.75, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {spentPct >= 20 && <span style={{ color: "#fff", fontSize: 8, fontWeight: 800, fontFamily: fm }}>%{spentPct}</span>}
                        </div>
                      </div>
                      <div style={{ color: m.mk === mk ? X.t : X.td, fontSize: 9, fontWeight: m.mk === mk ? 800 : 400, marginTop: 3 }}>
                        {ml(m.mk).split(" ")[0].slice(0, 3)}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 14, justifyContent: "center", fontSize: 10 }}>
                <span style={{ color: X.b }}>■ Harcama</span>
                <span style={{ color: "#F59E0B" }}>■ Birikim</span>
                <span style={{ color: X.r }}>■ Aşım</span>
              </div>
            </Card>

            {/* AYLIK DEĞİŞİM */}
            {monthChanges.length > 0 && (
            <Card s={{ marginBottom: 12 }}>
              <div style={{ color: X.tm, fontSize: 12, fontWeight: 700, marginBottom: 10 }}>AYLIK DEĞİŞİM</div>
              {monthChanges.map((m, i) => (
                <div key={m.mk} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${X.border}` }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: m.mk === mk ? X.t : X.tm, fontSize: 13, fontWeight: m.mk === mk ? 700 : 400 }}>{ml(m.mk)}</div>
                    <div style={{ color: X.td, fontSize: 11 }}>Harcama: {C(m.totalSpent)} · Kalan: {C(m.remaining)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: m.change > 5 ? X.r : m.change < -5 ? X.g : X.td, fontSize: 15, fontWeight: 800, fontFamily: fm }}>
                      {m.change > 0 ? "+" : ""}{m.change}%
                    </div>
                    <div style={{ color: X.td, fontSize: 9 }}>önceki aya göre</div>
                  </div>
                </div>
              ))}
            </Card>
            )}

            {/* KATEGORİ KARŞILAŞTIRMA */}
            {catCompare.length > 0 && (
              <Card s={{ marginBottom: 12 }}>
                <div style={{ color: X.tm, fontSize: 12, fontWeight: 700, marginBottom: 4 }}>KATEGORİ KARŞILAŞTIRMA</div>
                <div style={{ color: X.td, fontSize: 10, marginBottom: 10 }}>{ml(pmk(mk))} → {ml(mk)}</div>
                {catCompare.sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).map(cat => (
                  <div key={cat.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${X.border}` }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: X.t, fontSize: 12, fontWeight: 600 }}>{cat.icon} {cat.name}</div>
                      <div style={{ color: X.td, fontSize: 10 }}>{C(cat.prev)} → {C(cat.cur)}</div>
                    </div>
                    <div style={{ color: cat.change > 10 ? X.r : cat.change < -10 ? X.g : X.td, fontSize: 14, fontWeight: 800, fontFamily: fm }}>
                      {cat.change > 0 ? "+" : ""}{cat.change}%
                    </div>
                  </div>
                ))}
              </Card>
            )}

            {/* İÇGÖRÜLER */}
            {(() => {
              const insights = [];
              const curTotal = months6[months6.length - 1]?.totalSpent || 0;
              const avg3 = months6.slice(-4, -1).reduce((s, m) => s + m.totalSpent, 0) / Math.max(months6.slice(-4, -1).length, 1);
              if (avg3 > 0 && curTotal > avg3 * 1.15) insights.push({ icon: "📊", text: `Bu ay harcamanız (${C(curTotal)}) son 3 ay ortalamasının (${C(Math.round(avg3))}) %${Math.round(((curTotal - avg3) / avg3) * 100)} üzerinde.`, color: X.r });
              else if (avg3 > 0 && curTotal < avg3 * 0.85) insights.push({ icon: "✨", text: `Bu ay harcamanız (${C(curTotal)}) son 3 ay ortalamasından (${C(Math.round(avg3))}) %${Math.round(((avg3 - curTotal) / avg3) * 100)} daha az. Tebrikler!`, color: X.g });

              const withData = months6.filter(m => m.hasData);
              if (withData.length >= 2) {
                const bestMonth = withData.reduce((best, m) => m.remaining > best.remaining ? m : best, withData[0]);
                const worstMonth = withData.reduce((worst, m) => m.remaining < worst.remaining ? m : worst, withData[0]);
                insights.push({ icon: "🏆", text: `En iyi ay: ${ml(bestMonth.mk)} (${C(bestMonth.remaining)} birikim). En zor ay: ${ml(worstMonth.mk)} (${C(worstMonth.remaining)}).`, color: X.b });
              }

              if (insights.length === 0) return null;
              return (
                <Card s={{ marginBottom: 12, borderLeft: `3px solid ${X.b}` }}>
                  <div style={{ color: X.tm, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>💡 İÇGÖRÜLER</div>
                  {insights.map((ins, i) => (
                    <div key={i} style={{ color: ins.color, fontSize: 12, fontWeight: 600, lineHeight: 1.5, padding: "4px 0" }}>{ins.icon} {ins.text}</div>
                  ))}
                </Card>
              );
            })()}
          </>
        );
      })()}

      {view === "risk" && (
        <>
          <Card s={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ color: X.tm, fontSize: 12, fontWeight: 700 }}>RİSK SKORU DETAYI</div>
              <div style={{ color: getRiskInfo(risk.score).color, fontSize: 22, fontWeight: 900, fontFamily: fm }}>{risk.score}<span style={{ fontSize: 11, color: X.td }}>/100</span></div>
            </div>
            {risk.details.map((d, i) => (
              <div key={i} style={{ marginBottom: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                  <span style={{ color: X.t, fontSize: 11, flex: 1 }}>{d.label}</span>
                  <span style={{ color: X.tm, fontSize: 11, fontFamily: fm, flexShrink: 0 }}>{d.score}/{d.max}</span>
                </div>
                <div style={{ height: 3, borderRadius: 2, background: X.border }}>
                  <div style={{ height: "100%", borderRadius: 2, background: d.score > d.max * 0.6 ? X.r : d.score > d.max * 0.3 ? X.w : X.g, width: `${(d.score / d.max) * 100}%` }} />
                </div>
                <div style={{ color: X.td, fontSize: 10, marginTop: 1 }}>{d.desc}</div>
              </div>
            ))}
          </Card>

          <div style={{ color: X.tm, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>YÖNLENDİRMELER</div>
          {guidance.map((g, i) => (
            <Card key={i} s={{ marginBottom: 8, borderLeft: `3px solid ${g.color}` }}>
              <div style={{ color: g.color, fontSize: 13, fontWeight: 800, marginBottom: 4 }}>{g.title}</div>
              <div style={{ color: X.tm, fontSize: 12, lineHeight: 1.5 }}>{g.text}</div>
            </Card>
          ))}
        </>
      )}

      {view === "savings" && (() => {
        const totalSavings = getTotalSavingsTL(data);
        const assets = ["TRY", "XAU", "USD", "EUR"];
        return (
          <>
            <Card s={{ marginBottom: 12, background: "rgba(15,118,110,0.35)", border: "1px solid rgba(15,118,110,0.30)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div><div style={{ color: X.g, fontSize: 14, fontWeight: 800 }}>💰 Birikim Havuzu</div><div style={{ color: X.tm, fontSize: 11, marginTop: 2 }}>Tüm varlıklarınızın güncel TL karşılığı</div></div>
                <span style={{ color: X.g, fontSize: 24, fontWeight: 800, fontFamily: fm }}>{C(totalSavings)}</span>
              </div>
            </Card>

            {data.settings.emergencyFundTarget > 0 && (() => {
              const target = data.settings.emergencyFundTarget;
              const progress = Math.min((totalSavings / target) * 100, 100);
              const reached = totalSavings >= target;
              return (
                <Card s={{ marginBottom: 12, border: `1px solid ${reached ? X.g : X.w}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ color: reached ? X.g : X.w, fontSize: 13, fontWeight: 700 }}>🛡️ Acil Durum Fonu {reached && "✓"}</div>
                    <div style={{ color: reached ? X.g : X.t, fontSize: 13, fontWeight: 700, fontFamily: fm }}>%{progress.toFixed(1)}</div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ color: X.tm, fontSize: 11, fontFamily: fm }}>{C(totalSavings)}</span>
                    <span style={{ color: X.td, fontSize: 11, fontFamily: fm }}>/ {C(target)}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: X.border, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 3, background: reached ? X.g : X.w, width: `${progress}%`, transition: "width 0.5s" }} />
                  </div>
                  {!reached && target - totalSavings > 0 && (
                    <div style={{ color: X.tm, fontSize: 11, marginTop: 6 }}>Hedefe kalan: {C(target - totalSavings)}</div>
                  )}
                </Card>
              );
            })()}

            {assets.map(asset => {
              const info = ASSET_INFO[asset];
              const { qty, totalCost, txs } = getAssetBalance(data, asset);
              const tlValue = getAssetTLValue(data, asset);
              const profit = asset === "TRY" ? 0 : tlValue - totalCost;
              const profitPct = totalCost > 0 ? (profit / totalCost) * 100 : 0;
              const expanded = expandedAsset === asset;
              const isEmpty = qty === 0 && txs.length === 0;
              return (
                <Card key={asset} s={{ marginBottom: 8, borderColor: expanded ? info.color : X.border }}>
                  <div onClick={() => !isEmpty && setExpandedAsset(expanded ? null : asset)} style={{ display: "flex", alignItems: "center", cursor: isEmpty ? "default" : "pointer" }}>
                    <span style={{ fontSize: 24, marginRight: 10 }}>{info.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: X.t, fontSize: 13, fontWeight: 700 }}>{info.label}</div>
                      {asset === "TRY" ? (
                        <div style={{ color: X.t, fontSize: 15, fontWeight: 800, fontFamily: fm }}>{C(qty)}</div>
                      ) : (
                        <div style={{ color: X.t, fontSize: 13 }}>
                          <span style={{ fontFamily: fm, fontWeight: 800 }}>{qty.toFixed(asset === "XAU" ? 2 : 0)} {info.unit}</span>
                          {tlValue > 0 && <span style={{ color: X.td, fontSize: 11, marginLeft: 6 }}>({C(tlValue)})</span>}
                          {totalCost > 0 && Math.abs(profitPct) > 0.5 && (
                            <span style={{ color: profit >= 0 ? X.g : X.r, fontSize: 11, marginLeft: 6, fontFamily: fm }}>
                              {profit >= 0 ? "+" : ""}%{profitPct.toFixed(1)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={e => { e.stopPropagation(); setSavingsModal({ type: "buy", asset }); }} style={{ background: X.gd, border: `1px solid ${X.g}`, borderRadius: 6, padding: "6px 10px", color: X.g, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: ff }}>+ Al</button>
                      {qty > 0 && <button onClick={e => { e.stopPropagation(); setSavingsModal({ type: "sell", asset }); }} style={{ background: X.rd, border: `1px solid ${X.r}`, borderRadius: 6, padding: "6px 10px", color: X.r, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: ff }}>− Sat</button>}
                      {!isEmpty && <span style={{ color: X.td, fontSize: 11, alignSelf: "center", marginLeft: 2 }}>{expanded ? "▼" : "›"}</span>}
                    </div>
                  </div>
                  {expanded && txs.length > 0 && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${X.border}` }}>
                      {txs.slice().reverse().map(t => (
                        <div key={t.id} style={{ padding: "6px 0", borderBottom: `1px solid ${X.border}`, fontSize: 11 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ flex: 1 }}>
                              <span style={{ color: t.type === "buy" ? X.g : X.r, fontWeight: 700 }}>{t.type === "buy" ? "+ Alım" : "− Satım"}</span>
                              <span style={{ color: X.td, marginLeft: 6 }}>{t.date}</span>
                              {t.source === "monthly_close" && <span style={{ color: X.b, marginLeft: 6 }}>(ay kapatma)</span>}
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ color: X.t, fontFamily: fm, fontWeight: 700 }}>
                                {t.amount.toFixed(asset === "XAU" ? 2 : 0)} {info.unit}
                              </div>
                              {asset !== "TRY" && <div style={{ color: X.td, fontSize: 10, fontFamily: fm }}>@ {t.unitPrice.toFixed(2)} ₺ = {C(t.amount * t.unitPrice)}</div>}
                            </div>
                          </div>
                          {t.reason && <div style={{ color: X.tm, fontSize: 10, marginTop: 2, fontStyle: "italic" }}>✎ {t.reason}</div>}
                          {t.note && <div style={{ color: X.td, fontSize: 10, marginTop: 2 }}>{t.note}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}

            <Card s={{ marginTop: 16, marginBottom: 12 }}>
              <div style={{ color: X.tm, fontSize: 13, fontWeight: 700, marginBottom: 12 }}>BU AY DURUMU</div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ color: X.t, fontSize: 13 }}>Hedef</span>
                <span style={{ color: X.tm, fontFamily: fm, fontWeight: 700 }}>{C(c.savingsTarget)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ color: X.t, fontSize: 13 }}>Bugüne kadar</span>
                <span style={{ color: X.g, fontFamily: fm, fontWeight: 700 }}>{C(Math.max(0, c.remaining))}</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: X.border, marginTop: 8 }}>
                <div style={{ height: "100%", borderRadius: 3, background: X.g, width: `${c.savingsTarget > 0 ? Math.min((c.remaining / c.savingsTarget) * 100, 100) : 0}%` }} />
              </div>
            </Card>

            {hitRate.months.length > 0 && (
              <Card>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ color: X.tm, fontSize: 13, fontWeight: 700 }}>HEDEF TUTTURMA ORANI</div>
                  <div style={{ color: hitRate.avgHitRate >= 80 ? X.g : hitRate.avgHitRate >= 50 ? X.w : X.r, fontSize: 22, fontWeight: 900, fontFamily: fm }}>%{hitRate.avgHitRate}</div>
                </div>
                {hitRate.months.slice(-6).map(h => (
                  <div key={h.mk} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${X.border}`, fontSize: 12 }}>
                    <span style={{ color: X.t }}>{ml(h.mk).split(" ")[0]}</span>
                    <span style={{ color: X.tm, fontFamily: fm }}>{C(h.actual)} / {C(h.target)}</span>
                    <span style={{ color: h.rate >= 80 ? X.g : h.rate >= 50 ? X.w : X.r, fontWeight: 700, fontFamily: fm }}>%{Math.round(h.rate)}</span>
                  </div>
                ))}
              </Card>
            )}

            {savingsModal?.type === "buy" && <BuyAssetModal asset={savingsModal.asset} data={data} onClose={() => setSavingsModal(null)} onSave={tx => handleSavingsSave(savingsModal.asset, tx)} />}
            {savingsModal?.type === "sell" && <SellAssetModal asset={savingsModal.asset} data={data} onClose={() => setSavingsModal(null)} onSave={tx => handleSavingsSave(savingsModal.asset, tx)} />}
          </>
        );
      })()}

      {view === "csv" && (() => {
        const ves = data.settings.variableExpenses || [];
        const catName = id => {
          if (!id) return "Kategorisiz";
          const v = ves.find(x => x.id === id);
          return v ? `${v.icon || "📋"} ${v.name}` : "Kategorisiz";
        };
        const md2 = data.months[mk] || DM();
        const receipts = md2.receipts || [];
        const receiptAnalysis = analyzeReceipts(receipts);

        // Ekstre yazılı analiz
        const csvAnalysisLines = (() => {
          if (csvTotal <= 0) return null;
          const lines = [];
          const allStats = Object.entries(allCsvData).map(([, cd]) => cd.matchStats).filter(Boolean);
          const totalMatched = allStats.reduce((s, st) => s + (st.matched || 0), 0);
          const totalUnmatched = allStats.reduce((s, st) => s + (st.unmatched || 0), 0);
          const allTx = Object.values(allCsvData).flatMap(cd => cd.transactions || []);
          const unmatchedEntries = allStats.flatMap(st => st.unmatchedEntries || []);
          const matchRate = allTx.length > 0 ? Math.round((totalMatched / allTx.length) * 100) : 0;
          const appTotal = c.fixedTotal > 0 ? (data.settings.fixedExpenses.filter(e => e.paymentMethod === "cc").reduce((s, e) => s + e.amount, 0) + c.ccSingleTotal + c.installmentTotal) : (c.ccSingleTotal + c.installmentTotal);
          const diff = csvTotal - appTotal;
          if (diff > 0) lines.push({ icon: "⚠️", text: `Banka ekstresi toplamı (${C(csvTotal)}) uygulama kayıtlarından ${C(diff)} fazla. Uygulamaya girilmeyen harcamalar olabilir.`, color: X.w });
          else if (diff < -1000) lines.push({ icon: "ℹ️", text: `Uygulama kayıtları (${C(appTotal)}) ekstre toplamından ${C(Math.abs(diff))} fazla. Bazı işlemler henüz ekstreye yansımamış olabilir.`, color: X.b });
          else lines.push({ icon: "✅", text: `Ekstre toplamı (${C(csvTotal)}) ile uygulama kayıtları uyumlu.`, color: X.g });
          if (allTx.length > 0) {
            if (matchRate >= 80) lines.push({ icon: "✅", text: `Eşleşme oranı %${matchRate}. Harcamalarınızı düzenli kaydediyorsunuz.`, color: X.g });
            else if (matchRate >= 50) lines.push({ icon: "⚠️", text: `Eşleşme oranı %${matchRate}. ${totalUnmatched} işlem kayıtsız. Kayıt alışkanlığınızı güçlendirin.`, color: X.w });
            else lines.push({ icon: "🚨", text: `Eşleşme oranı sadece %${matchRate}. Kayıtsız harcamalar bütçe kontrolünü zorlaştırıyor.`, color: X.r });
          }
          const uncatCount = allTx.filter(t => !t.categoryId).length;
          if (uncatCount > 0) lines.push({ icon: "📋", text: `${uncatCount} işlem kategorisiz. Kategori atayarak gelecek ekstrelerde otomatik tanıma sağlayın.`, color: X.b });
          if (totalUnmatched > 0) {
            const unmatchedTotal = allTx.filter(t => !t.matchedEntryId).reduce((s, t) => s + t.amount, 0);
            lines.push({ icon: "💡", text: `Ekstre'de ${totalUnmatched} kayıtsız işlem (toplam ${C(unmatchedTotal)}). Bunları girmeyi unutmuş olabilirsiniz.`, color: X.o });
          }
          if (unmatchedEntries.length > 0) lines.push({ icon: "ℹ️", text: `Uygulamada ${unmatchedEntries.length} kayıt ekstre'de bulunamadı. Henüz yansımamış veya farklı karta ait olabilir.`, color: X.td });
          const catTotals = {};
          allTx.forEach(t => { const cat = t.categoryId || "_unc"; catTotals[cat] = (catTotals[cat] || 0) + t.amount; });
          const sortedCats = Object.entries(catTotals).filter(([k]) => k !== "_unc").sort((a, b) => b[1] - a[1]);
          if (sortedCats.length > 0) {
            const topVe = ves.find(v => v.id === sortedCats[0][0]);
            const topPct = Math.round((sortedCats[0][1] / csvTotal) * 100);
            if (topVe) lines.push({ icon: "📊", text: `En büyük kalem: ${topVe.icon || "📋"} ${topVe.name} (${C(sortedCats[0][1])}, %${topPct}).${topPct > 40 ? " Tasarruf fırsatlarını değerlendirin." : ""}`, color: X.b });
          }
          const prevCsvData = data.months[pmk(mk)]?.csvByCard || {};
          const prevCsvTotal = Object.values(prevCsvData).reduce((s, cd) => (cd.transactions || []).reduce((s2, t) => s2 + t.amount, s), 0);
          if (prevCsvTotal > 0) {
            const csvChange = Math.round(((csvTotal - prevCsvTotal) / prevCsvTotal) * 100);
            if (csvChange > 10) lines.push({ icon: "📈", text: `Ekstre toplamı geçen aya göre %${csvChange} arttı (${C(prevCsvTotal)} → ${C(csvTotal)}).`, color: X.r });
            else if (csvChange < -10) lines.push({ icon: "📉", text: `Ekstre toplamı geçen aya göre %${Math.abs(csvChange)} azaldı. Tasarruf çabalarınız sonuç veriyor.`, color: X.g });
          }
          return lines;
        })();

        return (
          <>
            {/* ALT SEKMELER */}
            <div style={{ display: "flex", gap: 0, marginBottom: 14, borderRadius: 10, overflow: "hidden", border: `1px solid ${X.border}` }}>
              <button onClick={() => setCsvSub("analysis")} style={{ flex: 1, padding: "10px 0", background: csvSub === "analysis" ? X.g : "transparent", color: csvSub === "analysis" ? "#fff" : X.tm, border: "none", fontSize: 12, fontWeight: 700, fontFamily: ff, cursor: "pointer" }}>🧾 Banka Ekstresi</button>
              <button onClick={() => setCsvSub("category")} style={{ flex: 1, padding: "10px 0", background: csvSub === "category" ? X.g : "transparent", color: csvSub === "category" ? "#fff" : X.tm, border: "none", fontSize: 12, fontWeight: 700, fontFamily: ff, cursor: "pointer" }}>📊 Kategorik Analiz</button>
            </div>

            {/* ═══ BANKA EKSTRESİ ═══ */}
            {csvSub === "analysis" && (
              <>
                {csvAnalysisLines && csvAnalysisLines.length > 0 && (
                  <Card s={{ marginBottom: 12, borderLeft: `3px solid ${X.b}` }}>
                    <div style={{ color: X.tm, fontSize: 12, fontWeight: 700, marginBottom: 10 }}>📝 HARCAMA DEĞERLENDİRMESİ</div>
                    {csvAnalysisLines.map((line, i) => (
                      <div key={i} style={{ color: line.color, fontSize: 12, fontWeight: 600, lineHeight: 1.6, padding: "4px 0", borderBottom: i < csvAnalysisLines.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none" }}>{line.icon} {line.text}</div>
                    ))}
                  </Card>
                )}
                <Card s={{ marginBottom: 12 }}>
                  <div style={{ color: X.tm, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>EKSTRE DÖKÜMÜ YÜKLE</div>
                  {cards.length === 0 ? (
                    <div style={{ color: X.w, fontSize: 13, padding: 10, background: X.wd, borderRadius: 8 }}>⚠️ Önce Ayarlar → Kartlarım'dan kart ekleyin.</div>
                  ) : (
                    <>
                      <Sel label="Hangi Kartın Ekstresi?" value={csvCardId} onChange={setCsvCardId} options={[{ v: "", l: "— Seçin —" }, ...cards.map(c2 => ({ v: c2.id, l: c2.name }))]} />
                      <label style={{ display: "block", textAlign: "center" }}>
                        <span style={{ display: "inline-block", background: csvCardId ? X.g : X.td, color: "#000", borderRadius: 10, padding: "12px 24px", fontSize: 14, fontWeight: 700, cursor: csvCardId ? "pointer" : "not-allowed" }}>📂 CSV Dosyası Yükle</span>
                        <input type="file" accept=".csv" onChange={handleCSV} disabled={!csvCardId} style={{ display: "none" }} />
                      </label>
                    </>
                  )}
                  {Object.keys(allCsvData).length > 0 && <div style={{ marginTop: 12, fontSize: 11, color: X.td }}>Yüklenen: {Object.keys(allCsvData).map(cid => cards.find(c2 => c2.id === cid)?.name || "?").join(", ")}</div>}
                </Card>
                {csvTotal > 0 && (
                  <>
                    {(() => {
                      const allStats = Object.entries(allCsvData).map(([, cd]) => cd.matchStats).filter(Boolean);
                      const totalMatched = allStats.reduce((s, st) => s + (st.matched || 0), 0);
                      const totalUnmatched = allStats.reduce((s, st) => s + (st.unmatched || 0), 0);
                      const allUnmatchedEntries = allStats.flatMap(st => st.unmatchedEntries || []);
                      if (allStats.length === 0) return null;
                      return (
                        <Card s={{ marginBottom: 12, border: `1px solid ${totalUnmatched > 0 ? X.w : X.g}40` }}>
                          <div style={{ color: X.tm, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>EŞLEŞME SONUÇLARI</div>
                          <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                            <div style={{ flex: 1, background: X.gd, borderRadius: 8, padding: "8px 10px", textAlign: "center" }}><div style={{ color: X.g, fontSize: 18, fontWeight: 800, fontFamily: fm }}>{totalMatched}</div><div style={{ color: X.g, fontSize: 10 }}>Eşleşen</div></div>
                            <div style={{ flex: 1, background: totalUnmatched > 0 ? X.wd : X.gd, borderRadius: 8, padding: "8px 10px", textAlign: "center" }}><div style={{ color: totalUnmatched > 0 ? X.w : X.g, fontSize: 18, fontWeight: 800, fontFamily: fm }}>{totalUnmatched}</div><div style={{ color: totalUnmatched > 0 ? X.w : X.g, fontSize: 10 }}>Kayıtsız</div></div>
                          </div>
                          {Object.entries(allCsvData).map(([, cd]) => (cd.transactions || []).filter(t => t.matchedEntryId).map(t => (<div key={t.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid rgba(0,0,0,0.03)", fontSize: 11 }}><div style={{ flex: 1, minWidth: 0 }}><span style={{ color: X.g }}>✓ </span><span style={{ color: X.t }}>{t.matchedNote}</span><span style={{ color: X.td }}> ↔ {t.desc.slice(0, 25)}</span></div><span style={{ color: X.g, fontFamily: fm, fontWeight: 700, flexShrink: 0 }}>{C(t.amount)}</span></div>)))}
                          {Object.entries(allCsvData).map(([, cd]) => (cd.transactions || []).filter(t => !t.matchedEntryId).map(t => (<div key={t.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid rgba(0,0,0,0.03)", fontSize: 11 }}><div style={{ flex: 1, minWidth: 0 }}><span style={{ color: X.w }}>? </span><span style={{ color: X.tm }}>{t.desc.slice(0, 30)}</span><span style={{ color: X.td }}> · {t.date}</span></div><span style={{ color: X.w, fontFamily: fm, fontWeight: 700, flexShrink: 0 }}>{C(t.amount)}</span></div>)))}
                          {allUnmatchedEntries.length > 0 && (<div style={{ marginTop: 8, borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: 6 }}><div style={{ color: X.b, fontSize: 10, fontWeight: 700, marginBottom: 4 }}>UYGULAMADA VAR, EKSTRE'DE YOK</div>{allUnmatchedEntries.map(e2 => (<div key={e2.id} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 11 }}><span style={{ color: X.b }}>↳ {e2.note || "?"} · {e2.date}</span><span style={{ color: X.b, fontFamily: fm }}>{C(e2.amount)}</span></div>))}</div>)}
                        </Card>
                      );
                    })()}
                    <Card s={{ marginBottom: 12 }}><div style={{ color: X.g, fontSize: 12, fontWeight: 700, marginBottom: 4 }}>TOPLAM</div><div style={{ color: X.t, fontSize: 28, fontWeight: 800, fontFamily: fm }}>{C(csvTotal)}</div></Card>
                    <Card s={{ marginBottom: 12 }}>
                      <div style={{ color: X.tm, fontSize: 12, fontWeight: 700, marginBottom: 10 }}>KATEGORİ DAĞILIMI</div>
                      {ves.map(ve => { const amt = csvCats[ve.id] || 0; if (amt === 0) return null; const pct2 = csvTotal > 0 ? (amt / csvTotal) * 100 : 0; return (<div key={ve.id} style={{ marginBottom: 10 }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ color: X.t, fontSize: 12 }}>{ve.icon || "📋"} {ve.name}</span><span style={{ color: X.t, fontSize: 12, fontWeight: 700, fontFamily: fm }}>{C(amt)} <span style={{ color: X.td, fontSize: 10 }}>%{Math.round(pct2)}</span></span></div><div style={{ height: 5, borderRadius: 2, background: X.border }}><div style={{ height: "100%", borderRadius: 2, background: X.b, width: `${pct2}%` }} /></div></div>); })}
                      {csvCats._uncategorized > 0 && (<div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${X.border}` }}><div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: X.td, fontSize: 12 }}>Kategorisiz</span><span style={{ color: X.td, fontSize: 12, fontWeight: 700, fontFamily: fm }}>{C(csvCats._uncategorized)}</span></div></div>)}
                    </Card>
                    {/* Fatura analizi — Banka Ekstresi sekmesinde */}
                    {(Object.keys(billBreakdown.byType).length > 0 || billBreakdown.otherCount > 0 || billBreakdown.billTypes.length > 0) && (
                      <BillAnalysisCard billBreakdown={billBreakdown} compact={true} />
                    )}
                    {Object.entries(allCsvData).map(([cardId, cardData]) => { const cardName = cards.find(c2 => c2.id === cardId)?.name || "?"; const txs = cardData.transactions || []; if (txs.length === 0) return null; const sorted = [...txs].sort((a, b) => { if (!a.categoryId && b.categoryId) return -1; if (a.categoryId && !b.categoryId) return 1; return b.amount - a.amount; }); return (<Card key={cardId} s={{ marginBottom: 12 }}><div style={{ color: X.tm, fontSize: 12, fontWeight: 700, marginBottom: 10, paddingBottom: 8, borderBottom: `1px solid ${X.border}` }}>💳 {cardName} — {txs.length} işlem</div>{sorted.map(tx => (<div key={tx.id} style={{ padding: "8px 0", borderBottom: `1px solid ${X.border}` }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}><span style={{ color: X.t, fontSize: 12, fontWeight: 600, flex: 1, marginRight: 8, wordBreak: "break-word" }}>{tx.desc || "—"}</span><span style={{ color: X.t, fontSize: 13, fontWeight: 700, fontFamily: fm, flexShrink: 0 }}>{C(tx.amount)}</span></div>{tx.date && <div style={{ color: X.td, fontSize: 10, marginBottom: 4 }}>{tx.date}</div>}<select value={tx.categoryId || ""} onChange={e => updateCsvTransaction(cardId, tx.id, e.target.value || null)} style={{ width: "100%", background: tx.categoryId ? X.bd : "rgba(255,255,255,0.5)", border: `1px solid ${tx.categoryId ? X.b : X.border}`, borderRadius: 6, padding: "6px 10px", color: tx.categoryId ? X.b : X.tm, fontSize: 11, fontFamily: ff, outline: "none", boxSizing: "border-box" }}><option value="">— Kategori Seçin —</option>{ves.map(ve => <option key={ve.id} value={ve.id}>{(ve.icon || "📋") + " " + ve.name}</option>)}</select></div>))}</Card>); })}
                    {Object.keys(data.merchantMap || {}).length > 0 && (<Card s={{ marginBottom: 12, border: `1px solid ${X.g}30` }}><div style={{ color: X.g, fontSize: 12, fontWeight: 700, marginBottom: 4 }}>🧠 Öğrenilen Eşleşmeler</div><div style={{ color: X.tm, fontSize: 11 }}>{Object.keys(data.merchantMap).length} merchant öğrenildi.</div></Card>)}
                  </>
                )}
              </>
            )}

            {/* ═══ KATEGORİK HARCAMA ANALİZİ ═══ */}
            {csvSub === "category" && (
              <>
                <Card s={{ marginBottom: 12 }}>
                  <div style={{ color: X.tm, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>📊 KATEGORİK HARCAMA ÖZETİ</div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <div style={{ flex: 1, background: X.bd, borderRadius: 10, padding: "10px", textAlign: "center" }}><div style={{ color: X.b, fontSize: 10, fontWeight: 700 }}>EKSTRE</div><div style={{ color: X.b, fontSize: 18, fontWeight: 800, fontFamily: fm }}>{C(csvTotal)}</div></div>
                    <div style={{ flex: 1, background: X.od, borderRadius: 10, padding: "10px", textAlign: "center" }}><div style={{ color: X.o, fontSize: 10, fontWeight: 700 }}>FİŞLER</div><div style={{ color: X.o, fontSize: 18, fontWeight: 800, fontFamily: fm }}>{C(receiptAnalysis?.grandTotal || 0)}</div><div style={{ color: X.td, fontSize: 9 }}>{receipts.length} fiş</div></div>
                  </div>
                </Card>

                {/* FATURA ANALİZİ — Kategorik Analiz sekmesi */}
                {(Object.keys(billBreakdown.byType).length > 0 || billBreakdown.otherCount > 0 || billBreakdown.billTypes.length > 0) && (
                  <BillAnalysisCard billBreakdown={billBreakdown} compact={false} />
                )}

                {receiptAnalysis ? (
                  <>
                    <Card s={{ marginBottom: 12 }}>
                      <div style={{ color: X.tm, fontSize: 12, fontWeight: 700, marginBottom: 10 }}>🛒 MARKET ALT KATEGORİ DAĞILIMI</div>
                      {receiptAnalysis.catBreakdown.map(cat => (<div key={cat.cat} style={{ marginBottom: 8 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}><span style={{ color: X.t, fontSize: 12, fontWeight: 600 }}>{cat.icon} {cat.cat}</span><span style={{ color: X.t, fontSize: 12, fontWeight: 700, fontFamily: fm }}>{C(cat.total)} <span style={{ color: X.td, fontSize: 10 }}>%{cat.pct}</span></span></div><div style={{ height: 5, borderRadius: 3, background: "rgba(0,0,0,0.06)", overflow: "hidden" }}><div style={{ height: "100%", borderRadius: 3, background: X.o, width: `${cat.pct}%`, opacity: 0.7 }} /></div></div>))}
                    </Card>
                    {receiptAnalysis.repeating.length > 0 && (<Card s={{ marginBottom: 12 }}><div style={{ color: X.tm, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>🔄 TEKRAR EDEN ÜRÜNLER</div>{receiptAnalysis.repeating.slice(0, 8).map((it, i) => (<div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid rgba(0,0,0,0.04)" }}><div style={{ flex: 1 }}><div style={{ color: X.t, fontSize: 12, fontWeight: 600 }}>{it.name}</div><div style={{ color: X.td, fontSize: 10 }}>{it.count} alışverişte {it.totalQty} adet{it.brand ? ` · ${it.brand}` : ""}</div></div><span style={{ color: X.w, fontSize: 12, fontWeight: 700, fontFamily: fm }}>{C(it.totalSpent)}</span></div>))}</Card>)}
                    {receiptAnalysis.topBrands.length > 0 && (<Card s={{ marginBottom: 12 }}><div style={{ color: X.tm, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>🏷️ MARKA TERCİHLERİ</div>{receiptAnalysis.topBrands.slice(0, 8).map((b, i) => (<div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid rgba(0,0,0,0.04)" }}><div><div style={{ color: X.t, fontSize: 12, fontWeight: 600 }}>{b.brand}</div><div style={{ color: X.td, fontSize: 10 }}>{b.category} · {b.count} kez</div></div><span style={{ color: X.p, fontSize: 12, fontWeight: 700, fontFamily: fm }}>{C(b.totalSpent)}</span></div>))}</Card>)}
                    <Card s={{ marginBottom: 12, borderLeft: `3px solid ${X.o}` }}>
                      <div style={{ color: X.tm, fontSize: 12, fontWeight: 700, marginBottom: 10 }}>💡 HARCAMA ALIŞKANLIKLARI & TAVSİYELER</div>
                      {(() => {
                        const tips = [];
                        const { catBreakdown, repeating, topBrands, grandTotal } = receiptAnalysis;
                        if (catBreakdown.length > 0 && catBreakdown[0].pct > 35) tips.push({ icon: "📊", text: `Market harcamanızın %${catBreakdown[0].pct}'i "${catBreakdown[0].cat}" kategorisinde. Bu alanda bilinçli alışveriş yaparak tasarruf edebilirsiniz.`, color: X.w });
                        if (repeating.length >= 3) tips.push({ icon: "🔄", text: `"${repeating[0].name}" en sık aldığınız ürün (${repeating[0].count} kez, ${C(repeating[0].totalSpent)}). Toplu alım ile tasarruf yapabilirsiniz.`, color: X.b });
                        if (topBrands.length > 0) { const brandTotal = topBrands.reduce((s, b) => s + b.totalSpent, 0); const brandPct = grandTotal > 0 ? Math.round((brandTotal / grandTotal) * 100) : 0; if (brandPct > 50) tips.push({ icon: "🏷️", text: `Markalı ürünler %${brandPct}. Market markası ile %15-25 tasarruf mümkün.`, color: X.g }); }
                        const snackCat = catBreakdown.find(c2 => c2.cat === "atıştırmalık");
                        if (snackCat && snackCat.pct > 10) tips.push({ icon: "🍫", text: `Atıştırmalık harcaması ${C(snackCat.total)} (%${snackCat.pct}). İsteğe bağlı kalem — kısıtlama ile doğrudan tasarruf.`, color: X.w });
                        if (c.effectiveBudget > 0) { const marketPct = Math.round((grandTotal / c.effectiveBudget) * 100); tips.push({ icon: "💰", text: `Market harcaması (${C(grandTotal)}) bütçenizin %${marketPct}'i.${marketPct > 15 ? " Küçük tasarruflar toplamda büyük fark yaratır." : ""}`, color: X.b }); }
                        if (tips.length === 0) tips.push({ icon: "ℹ️", text: "Daha fazla fiş yükledikçe detaylı analiz ve tasarruf önerileri burada oluşacak.", color: X.td });
                        return tips.map((tip, i) => (<div key={i} style={{ color: tip.color, fontSize: 12, fontWeight: 600, lineHeight: 1.6, padding: "5px 0", borderBottom: i < tips.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none" }}>{tip.icon} {tip.text}</div>));
                      })()}
                    </Card>
                  </>
                ) : (
                  <Card s={{ textAlign: "center", padding: "30px 0" }}>
                    <div style={{ fontSize: 36, marginBottom: 8, opacity: 0.5 }}>📷</div>
                    <div style={{ color: X.td, fontSize: 13 }}>Henüz market fişi yüklenmedi</div>
                    <div style={{ color: X.td, fontSize: 11, marginTop: 4 }}>Güncel Durum → 📷 Market Fişi'nden fiş yükleyin</div>
                  </Card>
                )}

                {(() => {
                  const { categories: cats, instByCategory } = categorizeMonthSpending(data, mk);
                  const totalCat = Object.entries(cats).filter(([k]) => k !== "_uncategorized").reduce((s, [, v]) => s + v, 0);
                  if (totalCat <= 0) return null;
                  return (
                    <Card s={{ marginBottom: 12 }}>
                      <div style={{ color: X.tm, fontSize: 12, fontWeight: 700, marginBottom: 10 }}>💳 UYGULAMA KAYITLI KATEGORİLER</div>
                      {ves.map(ve => { const amt = cats[ve.id] || 0; if (amt === 0) return null; const pct2 = totalCat > 0 ? (amt / totalCat) * 100 : 0; return (<div key={ve.id} style={{ marginBottom: 8 }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}><span style={{ color: X.t, fontSize: 12 }}>{ve.icon || "📋"} {ve.name}</span><span style={{ color: X.t, fontSize: 12, fontWeight: 700, fontFamily: fm }}>{C(amt)} <span style={{ color: X.td, fontSize: 10 }}>%{Math.round(pct2)}</span></span></div><div style={{ height: 4, borderRadius: 2, background: X.border }}><div style={{ height: "100%", borderRadius: 2, background: X.b, width: `${Math.min(pct2, 100)}%` }} /></div></div>); })}
                    </Card>
                  );
                })()}
              </>
            )}
          </>
        );
      })()}
      {view === "variable" && (() => {
        const { categories: cats, instByCategory } = categorizeMonthSpending(data, mk);
        const ves = data.settings.variableExpenses || [];
        const totalCat = Object.entries(cats).filter(([k]) => k !== "_uncategorized").reduce((s, [, v]) => s + v, 0);
        const uncat = cats._uncategorized || 0;
        const avg = getCategorizedAvg(data, mk);
        return (
          <>
            <Card s={{ marginBottom: 12 }}>
              <div style={{ color: X.b, fontSize: 13, fontWeight: 700, marginBottom: 4 }}>BU AY TOPLAM KATEGORİZE HARCAMA</div>
              <div style={{ color: X.t, fontSize: 28, fontWeight: 800, fontFamily: fm }}>{C(totalCat)}</div>
              {avg > 0 && <div style={{ color: X.td, fontSize: 11, marginTop: 4 }}>Son 3 ay ortalaması: {C(avg)}</div>}
            </Card>
            {ves.length === 0 ? (
              <Card s={{ textAlign: "center", padding: 24 }}>
                <div style={{ color: X.tm, fontSize: 13, marginBottom: 8 }}>Henüz kategori tanımlanmadı</div>
                <div style={{ color: X.td, fontSize: 11 }}>Ayarlar → Kategoriler'den kategori ve anahtar kelime ekleyin</div>
              </Card>
            ) : (
              <Card s={{ marginBottom: 12 }}>
                <div style={{ color: X.tm, fontSize: 13, fontWeight: 700, marginBottom: 10 }}>KATEGORİLER</div>
                {ves.map(ve => {
                  const amt = cats[ve.id] || 0;
                  const pct = totalCat > 0 ? (amt / totalCat) * 100 : 0;
                  const expectedOver = ve.expectedAmount > 0 && amt > ve.expectedAmount * 1.1;
                  return (
                    <div key={ve.id} style={{ marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ color: X.t, fontSize: 13 }}>{ve.icon || "📋"} {ve.name}</span>
                        <span style={{ color: expectedOver ? X.r : X.t, fontSize: 13, fontWeight: 700, fontFamily: fm }}>{C(amt)}</span>
                      </div>
                      {ve.expectedAmount > 0 && (
                        <div style={{ color: X.td, fontSize: 10, marginBottom: 4 }}>Beklenen: {C(ve.expectedAmount)} {expectedOver && <span style={{ color: X.r }}>⚠️ aşıldı</span>}</div>
                      )}
                      <div style={{ height: 5, borderRadius: 2, background: X.border }}>
                        <div style={{ height: "100%", borderRadius: 2, background: expectedOver ? X.r : X.b, width: `${Math.min(pct, 100)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </Card>
            )}
            {uncat > 0 && (
              <Card s={{ border: `1px solid ${X.td}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ color: X.tm, fontSize: 12, fontWeight: 700 }}>KATEGORİSİZ</div>
                    <div style={{ color: X.td, fontSize: 10 }}>Hiçbir anahtar kelimeye eşleşmeyen harcamalar</div>
                  </div>
                  <span style={{ color: X.td, fontSize: 18, fontWeight: 800, fontFamily: fm }}>{C(uncat)}</span>
                </div>
              </Card>
            )}
          </>
        );
      })()}

      {view === "debts" && (() => {
        const active = data.debts.filter(d => d.remainingMonths > 0);
        const byCurrency = { TRY: [], USD: [], EUR: [], XAU: [] };
        active.forEach(d => { if (byCurrency[d.currency]) byCurrency[d.currency].push(d); });
        const totalTL = active.reduce((s, d) => s + debtTLValue(d, data, mk), 0);
        const totalRemainingTL = active.reduce((s, d) => {
          const tlPerMonth = debtTLValue(d, data, mk);
          return s + tlPerMonth * d.remainingMonths;
        }, 0);
        return (
          <>
            <Card s={{ marginBottom: 12 }}>
              <div style={{ color: X.w, fontSize: 13, fontWeight: 700, marginBottom: 4 }}>BU AY TOPLAM BORÇ ÖDEMESİ</div>
              <div style={{ color: X.t, fontSize: 28, fontWeight: 800, fontFamily: fm }}>{C(totalTL)}</div>
              <div style={{ color: X.td, fontSize: 11, marginTop: 4 }}>Kalan toplam (anlık kur): {C(totalRemainingTL)}</div>
            </Card>

            {active.length === 0 && (
              <Card s={{ textAlign: "center", padding: 24 }}>
                <div style={{ color: X.g, fontSize: 14 }}>🎉 Aktif borç yok</div>
              </Card>
            )}

            {["TRY", "USD", "EUR", "XAU"].map(cur => {
              if (byCurrency[cur].length === 0) return null;
              const curLabel = cur === "TRY" ? "₺ Türk Lirası" : cur === "USD" ? "$ Dolar" : cur === "EUR" ? "€ Euro" : "🪙 Altın (gram)";
              const curTotal = byCurrency[cur].reduce((s, d) => s + d.monthlyPayment, 0);
              const curTotalTL = byCurrency[cur].reduce((s, d) => s + debtTLValue(d, data, mk), 0);
              return (
                <Card key={cur} s={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, paddingBottom: 8, borderBottom: `1px solid ${X.border}` }}>
                    <div style={{ color: X.w, fontSize: 12, fontWeight: 700 }}>{curLabel}</div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: X.t, fontSize: 14, fontWeight: 800, fontFamily: fm }}>{curTotal.toFixed(2)} {debtCurSymbol(cur)}</div>
                      {cur !== "TRY" && <div style={{ color: X.td, fontSize: 10, fontFamily: fm }}>{C(curTotalTL)}</div>}
                    </div>
                  </div>
                  {byCurrency[cur].map(d => {
                    const totalM = d.totalMonths || d.remainingMonths;
                    const paidCount = totalM - d.remainingMonths;
                    const tlPerMonth = debtTLValue(d, data, mk);
                    const progress = totalM > 0 ? (paidCount / totalM) * 100 : 0;
                    // Borç bitiş ayı
                    let endMonth = mk;
                    for (let i = 0; i < d.remainingMonths; i++) endMonth = nmk(endMonth);
                    return (
                      <div key={d.id} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: `1px solid ${X.border}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ color: X.t, fontSize: 13, fontWeight: 700 }}>{d.name}</span>
                          <span style={{ color: X.t, fontSize: 13, fontWeight: 700, fontFamily: fm }}>
                            {d.monthlyPayment.toFixed(2)} {debtCurSymbol(d.currency)}
                            {d.currency !== "TRY" && <span style={{ color: X.td, fontSize: 11 }}> ({C(tlPerMonth)})</span>}
                            /ay
                          </span>
                        </div>
                        <div style={{ color: X.td, fontSize: 10, marginBottom: 4 }}>
                          {paidCount}/{totalM} taksit ödendi • Bitiş: {ml(endMonth)}
                        </div>
                        <div style={{ height: 4, borderRadius: 2, background: X.border }}>
                          <div style={{ height: "100%", borderRadius: 2, background: X.w, width: `${progress}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </Card>
              );
            })}
          </>
        );
      })()}

      {view === "calendar" && (() => {
        const [y, mo] = mk.split("-").map(Number);
        const firstDay = new Date(y, mo - 1, 1);
        const lastDay = new Date(y, mo, 0);
        const daysInMonth = lastDay.getDate();
        const firstDayOfWeek = (firstDay.getDay() + 6) % 7; // Pazartesi=0

        // Bu aydaki tüm harcamaları tarihe göre grupla
        const md = data.months[mk] || DM();
        const byDate = {};
        const addTx = (date, kind, amt, note) => {
          if (!date) return;
          const d = date.slice(0, 10);
          if (!byDate[d]) byDate[d] = [];
          byDate[d].push({ kind, amt, note });
        };
        (md.ccSingle || []).forEach(e => addTx(e.date, "CC Tek Çekim", e.amount, e.note || e.merchantName));
        // Sabit zorunlu giderleri de ay başı varsayalım
        data.settings.fixedExpenses.forEach(f => {
          if (md.fixedPaid?.[f.id]?.paid) addTx(md.fixedPaid[f.id].date || (mk + "-01"), "Sabit", f.amount, f.name);
        });
        // Borç ödemelerini
        Object.entries(md.debtPayments || {}).forEach(([did, info]) => {
          if (info?.paid) {
            const debt = data.debts.find(x => x.id === did);
            if (debt) addTx(info.date || (mk + "-01"), "Borç", debtTLValue(debt, data, mk), debt.name);
          }
        });
        // Taksit ödemeleri (bu ayda aktif olanlar)
        data.installmentPlans.forEach(p => {
          let cur = p.startMonth;
          for (let i = 0; i < p.months; i++) {
            if (cur === mk) { addTx(p.createdDate || (mk + "-01"), "Taksit", p.monthlyPayment, p.note || "Taksit"); break; }
            cur = nmk(cur);
          }
        });
        // Kart yüklemeleri (tarih bilgisi yok, ay başı varsay)
        if ((md.cardLoaded || 0) > 0) addTx(mk + "-01", "Kart", md.cardLoaded, "Genel harcama kartı");

        const weekDays = ["Pz", "Sl", "Çr", "Pr", "Cm", "Ct", "Pa"];
        const cells = [];
        for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
        for (let d = 1; d <= daysInMonth; d++) cells.push(d);

        return (
          <>
            <Card s={{ marginBottom: 12 }}>
              <div style={{ color: X.tm, fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{ml(mk).toUpperCase()}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3, marginBottom: 8 }}>
                {weekDays.map(w => <div key={w} style={{ textAlign: "center", color: X.td, fontSize: 10, fontWeight: 700, padding: 4 }}>{w}</div>)}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
                {cells.map((d, i) => {
                  if (d === null) return <div key={i} />;
                  const dateStr = `${mk}-${String(d).padStart(2, "0")}`;
                  const txs = byDate[dateStr] || [];
                  const total = txs.reduce((s, t) => s + t.amt, 0);
                  const hasData = txs.length > 0;
                  return (
                    <div key={i} style={{ aspectRatio: "1", background: hasData ? X.bd : X.bg, border: `1px solid ${hasData ? X.b : X.border}`, borderRadius: 6, padding: 3, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative" }}>
                      <div style={{ color: X.t, fontSize: 11, fontWeight: 700 }}>{d}</div>
                      {hasData && <div style={{ color: X.b, fontSize: 8, fontFamily: fm, fontWeight: 700, marginTop: 1 }}>{Math.round(total / 1000)}k</div>}
                      {hasData && <div style={{ position: "absolute", bottom: 2, width: 4, height: 4, borderRadius: "50%", background: X.b }} />}
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card>
              <div style={{ color: X.tm, fontSize: 13, fontWeight: 700, marginBottom: 10 }}>BU AY GÜNLÜK ÖZETİ</div>
              {Object.keys(byDate).length === 0 && <div style={{ color: X.td, fontSize: 12, padding: 8, textAlign: "center" }}>Henüz harcama kaydı yok</div>}
              {Object.keys(byDate).sort().reverse().map(d => {
                const dayTxs = byDate[d];
                const total = dayTxs.reduce((s, t) => s + t.amt, 0);
                const day = parseInt(d.split("-")[2]);
                return (
                  <div key={d} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: `1px solid ${X.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ color: X.t, fontSize: 13, fontWeight: 700 }}>{day} {ml(mk).split(" ")[0]}</span>
                      <span style={{ color: X.t, fontSize: 13, fontWeight: 700, fontFamily: fm }}>{C(total)}</span>
                    </div>
                    {dayTxs.map((t, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: X.tm, padding: "2px 0" }}>
                        <span>{t.kind}{t.note ? ` • ${t.note}` : ""}</span>
                        <span style={{ fontFamily: fm }}>{C(t.amt)}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </Card>
          </>
        );
      })()}

      {view === "forecast" && (<><Card s={{ marginBottom: 12 }}><div style={{ color: X.tm, fontSize: 13, fontWeight: 700, marginBottom: 12 }}>GELECEK 6 AY</div>{forecast.map(f => (<div key={f.mk} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${X.border}` }}><div><div style={{ color: X.t, fontSize: 14, fontWeight: 600 }}>{ml(f.mk)}</div>{f.increases.length > 0 && <div style={{ color: X.b, fontSize: 11 }}>📈 {f.increases.map(i => i.name).join(", ")}</div>}</div><div style={{ textAlign: "right" }}><div style={{ color: f.remaining >= 0 ? X.g : X.r, fontWeight: 700, fontFamily: fm, fontSize: 14 }}>{C(f.remaining)}</div></div></div>))}</Card>{debtEnds.length > 0 && (<Card><div style={{ color: X.g, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>🎯 BORÇ BİTİŞ</div>{debtEnds.map((d, i) => (<div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${X.border}` }}><span style={{ color: X.t, fontSize: 14 }}>{d.name}</span><span style={{ color: X.g, fontSize: 13, fontWeight: 700 }}>{ml(d.endMonth)}</span></div>))}</Card>)}</>)}
    </div>
  );
}

/* ═══ SETTINGS ═══ */
/* ═══ PLANLAMA ═══ */
function PlanningScreen({ data, setData, mk }) {
  const [view, setView] = useState("map");
  const [expandedAsset, setExpandedAsset] = useState(null);
  const [savingsModal, setSavingsModal] = useState(null);
  const [incSim, setIncSim] = useState({});
  const [detail, setDetail] = useState(null); // {title, rows, total, totalLabel, totalColor, note}
  const c = calcMonth(data, mk, null);
  const assets = ["TRY", "XAU", "USD", "EUR"];
  const totalSavings = getTotalSavingsTL(data);

  // 12 Ay Haritası verileri (artış simülasyonu entegre)
  const expensesWithIncrease = data.settings.fixedExpenses.filter(e => e.increaseDate);

  const yearMap = useMemo(() => {
    const months = [];
    let m = mk;
    for (let i = 0; i < 12; i++) {
      const mc = calcMonth(data, m, null);
      const events = [];

      // Artış simülasyonu: bu ay veya öncesinde artış olan giderlerin ek yükünü hesapla
      let incImpact = 0;
      expensesWithIncrease.forEach(exp => {
        const pct = parseFloat(incSim[exp.id]) || 0;
        if (pct > 0 && exp.increaseDate && exp.increaseDate <= m) {
          const impact = Math.round(exp.amount * pct / 100);
          incImpact += impact;
        }
      });

      // Taksit başlama/bitiş
      data.installmentPlans.forEach(p => {
        if (p.startMonth === m) events.push({ icon: "📅", text: `Taksit başlangıcı: "${p.note || "Taksitli harcama açıklaması"}"`, color: X.p });
        let cur = p.startMonth;
        for (let j = 0; j < p.months; j++) cur = nmk(cur);
        if (pmk(cur) === m || cur === m) events.push({ icon: "✅", text: `Taksit son ayı: "${p.note || "Taksitli harcama açıklaması"}"`, sub: `Sonraki ay kullanılabilir limit artışı: +${C(p.monthlyPayment)}`, color: X.g });
      });
      // Borç bitiş
      data.debts.filter(d => d.remainingMonths > 0).forEach(d => {
        let em = mk;
        for (let j = 0; j < d.remainingMonths; j++) em = nmk(em);
        if (pmk(em) === m) {
          const tlVal = debtTLValue(d, data, mk);
          events.push({ icon: "🎯", text: `Borç bitti: ${d.name} (+${C(tlVal)}/ay)`, color: X.g });
        }
      });
      // Artışlar (simülasyonla zenginleştirilmiş)
      data.settings.fixedExpenses.forEach(exp => {
        if (exp.increaseDate && exp.increaseDate.startsWith(m)) {
          const pct = parseFloat(incSim[exp.id]) || 0;
          if (pct > 0) {
            const newAmt = exp.amount + Math.round(exp.amount * pct / 100);
            events.push({ icon: "📈", text: `${exp.name}: ${C(exp.amount)} → ${C(newAmt)} (%${pct})`, color: "#B8860B" });
          } else {
            events.push({ icon: "📈", text: `Artış bekleniyor: ${exp.name} (şu an ${C(exp.amount)})`, sub: "Tahmini artış oranı girilmedi", color: "#B8860B" });
          }
        }
      });

      // Artış etkisini düş
      const adjustedRemaining = mc.remaining - incImpact;
      const adjustedTotalSpent = mc.totalSpent + incImpact;

      months.push({ mk: m, ...mc, remaining: adjustedRemaining, totalSpent: adjustedTotalSpent, incImpact, events });
      m = nmk(m);
    }
    return months;
  }, [data, mk, incSim]);

  // Borç bitiş verileri
  const debtEnds = data.debts.filter(d => d.remainingMonths > 0).map(d => {
    let m2 = mk;
    for (let i = 0; i < d.remainingMonths; i++) m2 = nmk(m2);
    return { ...d, endMonth: m2, monthlyTL: debtTLValue(d, data, mk) };
  });

  const views = [
    { id: "map", l: "12 Ay Haritası", i: "🗺️" },
    { id: "debts", l: "Borçlar", i: "📌" },
    { id: "savings", l: "Birikim", i: "💰" },
  ];

  return (
    <div style={{ padding: "20px 16px 100px" }}>
      {/* SEKME SEÇİCİ */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${views.length}, 1fr)`, gap: 6, marginBottom: 12 }}>
        {views.map(v => (
          <button key={v.id} onClick={() => setView(v.id)} style={{ background: view === v.id ? X.gd : "transparent", border: `1px solid ${view === v.id ? X.g : X.border}`, borderRadius: 10, padding: "8px 4px", color: view === v.id ? X.g : X.tm, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: ff, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <span style={{ fontSize: 16 }}>{v.i}</span><span>{v.l}</span>
          </button>
        ))}
      </div>

      {/* 12 AY HARİTASI */}
      {view === "map" && (
        <>
          {/* ARTIŞ TAHMİNLERİ */}
          {expensesWithIncrease.length > 0 && (
            <Card s={{ marginBottom: 12, border: `1px solid ${X.o}40` }}>
              <div style={{ color: X.o, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>📈 ARTIŞ TAHMİNLERİ</div>
              <div style={{ color: X.td, fontSize: 10, marginBottom: 10 }}>Tahmini artış oranlarını girin — harita otomatik güncellenir.</div>
              {expensesWithIncrease.map(exp => {
                const pct = incSim[exp.id] || "";
                const impact = Math.round(exp.amount * (parseFloat(pct) || 0) / 100);
                return (
                  <div key={exp.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 0", borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: X.t, fontSize: 12, fontWeight: 600 }}>{exp.name}</div>
                      <div style={{ color: X.td, fontSize: 10 }}>{C(exp.amount)} · {ml(exp.increaseDate)}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ color: X.tm, fontSize: 11 }}>%</span>
                      <input type="number" value={pct} onChange={e => setIncSim(s => ({ ...s, [exp.id]: e.target.value }))} placeholder="0" style={{ width: 48, background: "rgba(200,220,232,0.65)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 6, padding: "4px 6px", color: X.t, fontSize: 13, fontFamily: fm, outline: "none", textAlign: "center" }} />
                    </div>
                    {impact > 0 && <div style={{ color: X.o, fontSize: 11, fontWeight: 700, fontFamily: fm, flexShrink: 0 }}>+{C(impact)}</div>}
                  </div>
                );
              })}
            </Card>
          )}

          {/* AY AY HARİTA */}
          <Card s={{ marginBottom: 12 }}>
            <div style={{ color: X.tm, fontSize: 13, fontWeight: 700, marginBottom: 12 }}>GELECEK 12 AY</div>
            {yearMap.map((m2, i) => {
              const showBreakdown = () => {
                const bd = getMonthBreakdown(data, m2.mk);
                const rows = [...bd.rows];
                if (m2.incImpact > 0) rows.push({ label: "Tahmini artış etkisi", value: m2.incImpact, sign: "−", color: X.o });
                setDetail({
                  title: `${ml(m2.mk)} — Bütçe Dökümü`,
                  rows,
                  total: m2.remaining,
                  totalLabel: "Kullanılabilir genel harcama limiti",
                  totalColor: m2.remaining > m2.effectiveBudget * 0.1 ? X.g : m2.remaining >= 0 ? X.w : X.r
                });
              };
              return (
              <div key={m2.mk} style={{ padding: "10px 0", borderBottom: i < 11 ? `1px solid rgba(0,0,0,0.06)` : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: X.t, fontSize: 14, fontWeight: i === 0 ? 800 : 600 }}>{ml(m2.mk)}{i === 0 ? " (bu ay)" : ""}</div>
                    <TapAmt onTap={showBreakdown} color={X.td}>
                      <span style={{ color: X.td, fontSize: 10 }}>Tahmini zorunlu gider: {C(m2.totalSpent)}</span>
                    </TapAmt>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <TapAmt onTap={showBreakdown} color={m2.remaining > m2.effectiveBudget * 0.1 ? X.g : m2.remaining >= 0 ? X.w : X.r}>
                      <span style={{ color: m2.remaining > m2.effectiveBudget * 0.1 ? X.g : m2.remaining >= 0 ? X.w : X.r, fontWeight: 800, fontFamily: fm, fontSize: 16 }}>{C(m2.remaining)}</span>
                    </TapAmt>
                    <div style={{ color: X.td, fontSize: 8 }}>kullanılabilir limit</div>
                  </div>
                </div>
                {m2.events.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    {m2.events.map((ev, j) => (
                      <div key={j} style={{ padding: "2px 0" }}>
                        <div style={{ color: ev.color, fontSize: 11, fontWeight: 600 }}>{ev.icon} {ev.text}</div>
                        {ev.sub && <div style={{ color: ev.color, fontSize: 10, fontWeight: 500, marginLeft: 20, opacity: 0.85 }}>{ev.sub}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              );
            })}
          </Card>

          {/* Özet bilgiler */}
          <Card s={{ marginBottom: 12, background: "rgba(15,118,110,0.32)", border: "1px solid rgba(15,118,110,0.30)" }}>
            <div style={{ color: X.g, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>📊 12 AY ÖZETİ</div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12 }}>
              <span style={{ color: X.tm }}>En düşük serbest bütçe</span>
              <span style={{ color: X.r, fontFamily: fm, fontWeight: 700 }}>{C(Math.min(...yearMap.map(m2 => m2.remaining)))} ({ml(yearMap.reduce((min, m2) => m2.remaining < min.remaining ? m2 : min, yearMap[0]).mk)})</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12 }}>
              <span style={{ color: X.tm }}>En yüksek serbest bütçe</span>
              <span style={{ color: X.g, fontFamily: fm, fontWeight: 700 }}>{C(Math.max(...yearMap.map(m2 => m2.remaining)))} ({ml(yearMap.reduce((max, m2) => m2.remaining > max.remaining ? m2 : max, yearMap[0]).mk)})</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12 }}>
              <span style={{ color: X.tm }}>Bütçe aşımı olan ay</span>
              <span style={{ color: yearMap.filter(m2 => m2.remaining < 0).length > 0 ? X.r : X.g, fontFamily: fm, fontWeight: 700 }}>{yearMap.filter(m2 => m2.remaining < 0).length} ay</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12 }}>
              <span style={{ color: X.tm }}>Sıkışık ay sayısı</span>
              <span style={{ color: yearMap.filter(m2 => m2.remaining < m2.effectiveBudget * 0.05).length > 0 ? X.w : X.g, fontFamily: fm, fontWeight: 700 }}>{yearMap.filter(m2 => m2.remaining < m2.effectiveBudget * 0.05).length} ay</span>
            </div>
          </Card>
        </>
      )}

      {/* BORÇLAR + BİTİŞ PLANLAYICISI */}
      {view === "debts" && (() => {
        const activeDebts = data.debts.filter(d => d.remainingMonths > 0);
        return (
          <>
            {activeDebts.length === 0 ? (
              <Card s={{ textAlign: "center", padding: 24 }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>🎉</div>
                <div style={{ color: X.g, fontSize: 14, fontWeight: 700 }}>Aktif borcunuz yok!</div>
              </Card>
            ) : (
              <>
                <Card s={{ marginBottom: 12 }}>
                  <div style={{ color: X.tm, fontSize: 13, fontWeight: 700, marginBottom: 12 }}>AKTİF BORÇLAR</div>
                  {activeDebts.map(d => {
                    const sym = debtCurSymbol(d.currency);
                    const tlVal = debtTLValue(d, data, mk);
                    const totalM = d.totalMonths || d.remainingMonths;
                    const paidCount = totalM - d.remainingMonths;
                    const end = debtEnds.find(de => de.id === d.id);
                    const progressPct = totalM > 0 ? (paidCount / totalM) * 100 : 0;
                    return (
                      <div key={d.id} style={{ padding: "12px 0", borderBottom: `1px solid rgba(0,0,0,0.06)` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <div style={{ color: X.t, fontSize: 14, fontWeight: 700 }}>{d.name}</div>
                          <div style={{ color: X.w, fontSize: 15, fontWeight: 800, fontFamily: fm }}>{C(tlVal)}<span style={{ fontSize: 10, color: X.td }}>/ay</span></div>
                        </div>
                        {d.currency !== "TRY" && <div style={{ color: X.td, fontSize: 11 }}>{d.monthlyPayment} {sym} × {d.remainingMonths} ay kaldı</div>}
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: X.tm, marginTop: 4, marginBottom: 4 }}>
                          <span>{paidCount}/{totalM} ödendi</span>
                          <span>Bitiş: {end ? ml(end.endMonth) : "?"}</span>
                        </div>
                        <div style={{ height: 5, borderRadius: 3, background: "rgba(0,0,0,0.06)" }}>
                          <div style={{ height: "100%", borderRadius: 3, background: X.g, width: `${progressPct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </Card>

                {/* BORÇ BİTİŞ PLANLAYICISI */}
                {debtEnds.length > 0 && (
                  <Card s={{ border: `1px solid ${X.g}`, background: "rgba(22,163,74,0.06)" }}>
                    <div style={{ color: X.g, fontSize: 13, fontWeight: 700, marginBottom: 10 }}>🎯 BORÇ BİTİŞ PLANLAYICISI</div>
                    {debtEnds.sort((a, b) => a.endMonth.localeCompare(b.endMonth)).map(d => {
                      const sym = debtCurSymbol(d.currency);
                      const amtText = d.currency === "TRY" ? C(d.monthlyTL) : `${C(d.monthlyTL)} (${d.monthlyPayment} ${sym})`;
                      // Kalan ay hesapla
                      let monthsAway = 0; let m2 = mk;
                      while (m2 < d.endMonth && monthsAway < 60) { m2 = nmk(m2); monthsAway++; }
                      return (
                        <div key={d.id} style={{ padding: "10px 0", borderBottom: `1px solid rgba(0,0,0,0.06)` }}>
                          <div style={{ color: X.t, fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{d.name}</div>
                          <div style={{ color: X.g, fontSize: 12 }}>
                            {monthsAway} ay sonra ({ml(d.endMonth)}) bitecek → her ay {amtText} serbest kalacak.
                          </div>
                          <div style={{ color: X.tm, fontSize: 11, marginTop: 6, lineHeight: 1.5 }}>
                            💡 Bu tutar serbest kalınca: acil durum fonuna yönlendirebilir, yeni birikim başlatabilir veya sabit gider artışlarını absorbe edebilirsiniz.
                          </div>
                        </div>
                      );
                    })}
                    {(() => {
                      const totalFree = debtEnds.reduce((s, d) => s + d.monthlyTL, 0);
                      const emTarget = data.settings.emergencyFundTarget || 0;
                      const remaining = emTarget - totalSavings;
                      const monthsToTarget = totalFree > 0 && remaining > 0 ? Math.ceil(remaining / totalFree) : 0;
                      return emTarget > 0 && remaining > 0 ? (
                        <div style={{ marginTop: 10, padding: "8px 10px", background: "rgba(15,118,110,0.32)", borderRadius: 8 }}>
                          <div style={{ color: X.g, fontSize: 11, fontWeight: 700 }}>
                            Tüm borçlar bitince aylık {C(totalFree)} serbest kalacak. Bu tutarı acil durum fonuna yönlendirirseniz {monthsToTarget} ayda hedefe ulaşırsınız.
                          </div>
                        </div>
                      ) : null;
                    })()}
                  </Card>
                )}
              </>
            )}
          </>
        );
      })()}

      {/* BİRİKİM */}
      {view === "savings" && (() => {
        return (
          <>
            <Card s={{ marginBottom: 12, background: "rgba(15,118,110,0.35)", border: "1px solid rgba(15,118,110,0.30)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div><div style={{ color: X.g, fontSize: 14, fontWeight: 800 }}>💰 Birikim Havuzu</div><div style={{ color: X.tm, fontSize: 11, marginTop: 2 }}>Tüm varlıklarınızın güncel TL karşılığı</div></div>
                <span style={{ color: X.g, fontSize: 24, fontWeight: 800, fontFamily: fm }}>{C(totalSavings)}</span>
              </div>
            </Card>

            {data.settings.emergencyFundTarget > 0 && (() => {
              const target = data.settings.emergencyFundTarget;
              const progress = Math.min((totalSavings / target) * 100, 100);
              const reached = totalSavings >= target;
              return (
                <Card s={{ marginBottom: 12, border: `1px solid ${reached ? X.g : X.w}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ color: reached ? X.g : X.w, fontSize: 13, fontWeight: 700 }}>🛡️ Acil Durum Fonu {reached && "✓"}</div>
                    <div style={{ color: reached ? X.g : X.t, fontSize: 13, fontWeight: 700, fontFamily: fm }}>%{progress.toFixed(1)}</div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ color: X.tm, fontSize: 11, fontFamily: fm }}>{C(totalSavings)}</span>
                    <span style={{ color: X.td, fontSize: 11, fontFamily: fm }}>/ {C(target)}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: "rgba(0,0,0,0.06)", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 3, background: reached ? X.g : X.w, width: `${progress}%`, transition: "width 0.5s" }} />
                  </div>
                  {!reached && target - totalSavings > 0 && (
                    <div style={{ color: X.tm, fontSize: 11, marginTop: 6 }}>Hedefe kalan: {C(target - totalSavings)}</div>
                  )}
                </Card>
              );
            })()}

            {assets.map(asset => {
              const info = ASSET_INFO[asset];
              const { qty, totalCost, txs } = getAssetBalance(data, asset);
              const tlValue = getAssetTLValue(data, asset);
              const profit = asset === "TRY" ? 0 : tlValue - totalCost;
              const profitPct = totalCost > 0 ? (profit / totalCost) * 100 : 0;
              const expanded = expandedAsset === asset;
              const isEmpty = qty === 0 && txs.length === 0;
              return (
                <Card key={asset} s={{ marginBottom: 8, borderColor: expanded ? info.color : X.border }}>
                  <div onClick={() => setExpandedAsset(expanded ? null : asset)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 22 }}>{info.icon}</span>
                      <div>
                        <div style={{ color: X.t, fontWeight: 700 }}>{info.label}</div>
                        <div style={{ color: X.tm, fontSize: 12, fontFamily: fm }}>{qty > 0 ? `${qty.toFixed(asset === "TRY" ? 0 : 4)} ${info.unit}` : "—"}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {qty > 0 && <div style={{ color: info.color, fontWeight: 800, fontFamily: fm, fontSize: 16 }}>{C(tlValue)}</div>}
                      {profit !== 0 && <div style={{ color: profit > 0 ? X.g : X.r, fontSize: 11, fontFamily: fm }}>{profit > 0 ? "+" : ""}{profitPct.toFixed(1)}%</div>}
                    </div>
                  </div>
                  {expanded && (
                    <div style={{ marginTop: 10, borderTop: `1px solid rgba(0,0,0,0.06)`, paddingTop: 10 }}>
                      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                        <button onClick={e => { e.stopPropagation(); setSavingsModal({ type: "buy", asset }); }} style={{ background: X.gd, border: "none", borderRadius: 6, padding: "6px 10px", color: X.g, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: ff }}>+ Al</button>
                        {qty > 0 && <button onClick={e => { e.stopPropagation(); setSavingsModal({ type: "sell", asset }); }} style={{ background: X.rd, border: "none", borderRadius: 6, padding: "6px 10px", color: X.r, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: ff }}>− Sat</button>}
                      </div>
                      {txs.length > 0 && txs.map((tx, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid rgba(0,0,0,0.04)`, fontSize: 11, color: X.tm }}>
                          <span>{tx.date} · {tx.type === "buy" ? "Alım" : "Satım"}{tx.note ? ` · ${tx.note}` : ""}</span>
                          <span style={{ fontFamily: fm, color: tx.type === "buy" ? X.g : X.r }}>{tx.type === "buy" ? "+" : "-"}{tx.amount} {info.unit}</span>
                        </div>
                      ))}
                      {isEmpty && <div style={{ color: X.td, fontSize: 12 }}>Henüz işlem yok</div>}
                    </div>
                  )}
                </Card>
              );
            })}
          </>
        );
      })()}

      {/* Savings modals */}
      {savingsModal?.type === "buy" && <BuyAssetModal asset={savingsModal.asset} data={data} onClose={() => setSavingsModal(null)} onSave={tx => { setData(d => ({ ...d, savings: { ...d.savings, [savingsModal.asset]: [...(d.savings[savingsModal.asset] || []), tx] } })); setSavingsModal(null); }} />}
      {savingsModal?.type === "sell" && <SellAssetModal asset={savingsModal.asset} data={data} onClose={() => setSavingsModal(null)} onSave={tx => { setData(d => ({ ...d, savings: { ...d.savings, [savingsModal.asset]: [...(d.savings[savingsModal.asset] || []), tx] } })); setSavingsModal(null); }} />}
      {detail && <DetailModal {...detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function FamilyManagement({ isAdmin, family, onBack }) {
  const [members, setMembers] = useState({});
  const [loading, setLoading] = useState(true);
  const [addMode, setAddMode] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [generatedCode, setGeneratedCode] = useState(null);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (family?.familyId) {
      getFamilyMembers(family.familyId).then(m => { setMembers(m); setLoading(false); });
    }
  }, [family]);

  const handleAddMember = async () => {
    if (!newName || !newEmail) { setMsg({ type: "error", text: "İsim ve e-posta gerekli" }); return; }
    try {
      const code = await createInvitation(family.familyId, newName, newEmail);
      setGeneratedCode(code);
      setMsg({ type: "success", text: "Davet kodu oluşturuldu!" });
    } catch (e) { setMsg({ type: "error", text: "Hata: " + e.message }); }
  };

  const handleResetMember = async (memberUid, memberName, memberEmail) => {
    if (!confirm(`"${memberName}" için mevcut erişimi iptal edip yeni davet kodu oluşturulsun mu?`)) return;
    try {
      const code = await resetMemberAccess(family.familyId, memberUid, memberName, memberEmail);
      setGeneratedCode(code);
      setMsg({ type: "success", text: `${memberName} için yeni kod: ${code}` });
      // Üye listesini güncelle
      const m = await getFamilyMembers(family.familyId);
      setMembers(m);
    } catch (e) { setMsg({ type: "error", text: "Hata: " + e.message }); }
  };

  const memberList = Object.entries(members).map(([uid2, m]) => ({ uid: uid2, ...m }));

  return (
    <div style={{ padding: "20px 16px 100px" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: X.g, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: ff, padding: 0, marginBottom: 16 }}>← Geri</button>

      {msg && <div style={{ background: msg.type === "success" ? X.gd : X.rd, border: `1px solid ${msg.type === "success" ? X.g : X.r}`, borderRadius: 10, padding: "8px 12px", marginBottom: 12, color: msg.type === "success" ? X.g : X.r, fontSize: 12, fontWeight: 600 }}>{msg.text}</div>}

      <Card s={{ marginBottom: 12 }}>
        <div style={{ color: X.tm, fontSize: 12, fontWeight: 700, marginBottom: 12 }}>AİLE BİLGİLERİ</div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
          <span style={{ color: X.tm, fontSize: 13 }}>Giriş adınız</span>
          <span style={{ color: X.t, fontSize: 13, fontWeight: 700 }}>{family?.name || "—"}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
          <span style={{ color: X.tm, fontSize: 13 }}>Rolünüz</span>
          <span style={{ color: isAdmin ? X.g : X.b, fontSize: 13, fontWeight: 700 }}>{isAdmin ? "👑 Yönetici" : "👤 Üye"}</span>
        </div>
      </Card>

      <Card s={{ marginBottom: 12 }}>
        <div style={{ color: X.tm, fontSize: 12, fontWeight: 700, marginBottom: 12 }}>ÜYELER</div>
        {loading ? <div style={{ color: X.td, fontSize: 12 }}>Yükleniyor...</div> :
          memberList.map(m => (
            <div key={m.uid} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
              <div>
                <div style={{ color: X.t, fontSize: 13, fontWeight: 700 }}>{m.name || m.email}</div>
                <div style={{ color: X.td, fontSize: 10 }}>{m.role === "admin" ? "👑 Yönetici" : "👤 Üye"} · {m.email}</div>
              </div>
              {isAdmin && m.role !== "admin" && (
                <button onClick={() => handleResetMember(m.uid, m.name, m.email)} style={{ background: X.wd, border: `1px solid ${X.w}`, borderRadius: 6, padding: "4px 8px", color: X.w, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>Yeni Kod Ver</button>
              )}
            </div>
          ))
        }
      </Card>

      {isAdmin && !addMode && !generatedCode && (
        <Btn onClick={() => setAddMode(true)} v="outline" c={X.g}>+ Yeni Üye Ekle</Btn>
      )}

      {isAdmin && addMode && !generatedCode && (
        <Card s={{ border: `1px solid ${X.g}` }}>
          <div style={{ color: X.g, fontSize: 13, fontWeight: 700, marginBottom: 10 }}>YENİ ÜYE</div>
          <Inp label="İsim Soyisim" value={newName} onChange={setNewName} placeholder="Örn: Kadriye Huca" />
          <Inp label="E-posta" value={newEmail} onChange={setNewEmail} placeholder="ornek@gmail.com" />
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={handleAddMember} c={X.g} s={{ flex: 1 }}>Davet Kodu Oluştur</Btn>
            <Btn onClick={() => { setAddMode(false); setNewName(""); setNewEmail(""); }} v="outline" c={X.td} s={{ flex: 1 }}>İptal</Btn>
          </div>
        </Card>
      )}

      {generatedCode && (
        <Card s={{ border: `1px solid ${X.g}`, background: X.gd, textAlign: "center" }}>
          <div style={{ color: X.g, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Davet Kodu:</div>
          <div style={{ color: X.t, fontSize: 36, fontWeight: 800, fontFamily: fm, letterSpacing: 6 }}>{generatedCode}</div>
          <div style={{ color: X.tm, fontSize: 11, marginTop: 8 }}>Bu kodu üyeyle paylaşın. Tek seferlik kullanılır.</div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Btn onClick={() => navigator.clipboard?.writeText(generatedCode)} s={{ flex: 1 }}>📋 Kopyala</Btn>
            <Btn onClick={() => { setGeneratedCode(null); setAddMode(false); setNewName(""); setNewEmail(""); }} v="outline" c={X.td} s={{ flex: 1 }}>Tamam</Btn>
          </div>
        </Card>
      )}

      <div style={{ color: X.td, fontSize: 11, marginTop: 12, lineHeight: 1.6 }}>
        {isAdmin ? "Yönetici olarak yeni üye ekleyebilir ve mevcut üyelerin erişimini sıfırlayabilirsiniz. Yedekleme sorumluluğu sizdedir." : "Aile yöneticisi üye ekleme ve erişim yönetimi yapabilir."}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// GELİŞMİŞ FATURA ANALİZ KARTI
// ═══════════════════════════════════════════════════════════
function BillAnalysisCard({ billBreakdown, compact }) {
  const [expanded, setExpanded] = useState(null);
  const { byType, otherTotal, otherCount, otherItems, grandTotal, typeStats, billTypes, history, totalBudget } = billBreakdown;

  const hasBudgets = billTypes.some(bt => bt.budget > 0);
  const hasHistory = history.length > 0;
  const anomalies = billTypes.filter(bt => typeStats[bt.id]?.isAnomaly);

  const totalDiff = grandTotal - totalBudget;
  const totalColor = totalBudget === 0 ? X.b : totalDiff > 0 ? X.r : X.g;
  const totalBg = totalBudget === 0 ? X.bd : totalDiff > 0 ? X.rd : X.gd;

  // Fatura türü yoksa boş durum
  if (billTypes.length === 0 && grandTotal === 0) return null;

  return (
    <Card s={{ marginBottom: 12, border: `1px solid ${X.b}20` }}>
      {/* Başlık + toplam */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ color: X.tm, fontSize: 12, fontWeight: 700 }}>🧾 FATURA ANALİZİ</div>
          {anomalies.length > 0 && (
            <div style={{ color: X.r, fontSize: 10, fontWeight: 700, marginTop: 2 }}>⚠️ {anomalies.length} anormal fatura</div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: X.b, fontSize: 17, fontWeight: 800, fontFamily: fm }}>{C(grandTotal)}</div>
          {totalBudget > 0 && (
            <div style={{ fontSize: 10, color: totalColor, fontWeight: 700 }}>{totalDiff > 0 ? "+" : ""}{C(totalDiff)} bütçeye göre</div>
          )}
        </div>
      </div>

      {/* Toplam bütçe progress bar */}
      {totalBudget > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "8px 10px", borderRadius: 8, background: totalBg }}>
          <div style={{ flex: 1 }}>
            <div style={{ height: 6, borderRadius: 3, background: "rgba(0,0,0,0.08)", overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 3, background: totalColor, width: `${Math.min(100, (grandTotal / totalBudget) * 100)}%`, transition: "width 0.4s" }} />
            </div>
          </div>
          <span style={{ color: totalColor, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>%{Math.round((grandTotal / totalBudget) * 100)}</span>
        </div>
      )}

      {/* Tanımlı fatura türleri */}
      {billTypes.map(bt => {
        const grp = byType[bt.id];
        const stats = typeStats[bt.id] || {};
        const { budget, current, avg, isAnomaly, spark } = stats;
        const hasBudget = budget > 0;
        const pctOfBudget = hasBudget && current > 0 ? Math.min(150, (current / budget) * 100) : 0;
        const barColor = !hasBudget ? X.b : current > budget ? X.r : current > budget * 0.85 ? X.w : X.g;
        const isOpen = expanded === bt.id;
        const hasData = current > 0;

        return (
          <div key={bt.id} style={{ marginBottom: 10, borderBottom: `1px solid ${X.border}`, paddingBottom: 10, opacity: hasData ? 1 : 0.45 }}>
            <div
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: hasBudget && hasData ? 5 : 0, cursor: hasData ? "pointer" : "default" }}
              onClick={() => hasData && setExpanded(isOpen ? null : bt.id)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{bt.icon || "📋"}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                    <span style={{ color: X.t, fontSize: 12, fontWeight: 700 }}>{bt.name}</span>
                    {grp && <span style={{ color: X.td, fontSize: 10 }}>({grp.count} adet)</span>}
                    {isAnomaly && <span style={{ background: `${X.r}20`, color: X.r, fontSize: 9, fontWeight: 800, padding: "1px 5px", borderRadius: 4 }}>⚠️ YÜKSEK</span>}
                  </div>
                  {!hasData && hasBudget && <div style={{ color: X.td, fontSize: 9 }}>Bu ay işlem yok</div>}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
                {hasData && <div style={{ color: isAnomaly ? X.r : X.t, fontSize: 13, fontWeight: 800, fontFamily: fm }}>{C(current)}</div>}
                {hasBudget && <div style={{ color: X.td, fontSize: 9 }}>Bütçe: {C(budget)}</div>}
              </div>
            </div>

            {/* Bütçe progress bar */}
            {hasBudget && hasData && (
              <div style={{ height: 5, borderRadius: 2, background: X.border, overflow: "hidden", marginBottom: 4 }}>
                <div style={{ height: "100%", borderRadius: 2, background: barColor, width: `${pctOfBudget}%`, transition: "width 0.4s" }} />
              </div>
            )}

            {/* Trend satırı */}
            {hasData && (hasHistory || avg > 0) && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {spark && <span style={{ color: X.td, fontSize: 13, letterSpacing: 1, fontFamily: "monospace" }}>{spark}</span>}
                {avg > 0 && <span style={{ color: X.td, fontSize: 9 }}>3ay ort: {C(Math.round(avg))}</span>}
              </div>
            )}

            {/* Genişletilmiş detay */}
            {isOpen && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${X.border}20` }}>
                {grp?.items?.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    {grp.items.sort((a, b) => b.amount - a.amount).map((item, idx) => (
                      <div key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 10 }}>
                        <span style={{ color: X.td, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: 8 }}>{item.desc}</span>
                        <span style={{ color: X.tm, fontWeight: 600, fontFamily: fm, flexShrink: 0 }}>{C(item.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {history.length > 0 && (
                  <div>
                    <div style={{ color: X.td, fontSize: 9, fontWeight: 700, marginBottom: 4 }}>SON {history.length} AY</div>
                    {history.map(h => {
                      const amt = h.byType[bt.id] || 0;
                      if (amt === 0) return null;
                      return (
                        <div key={h.mk} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 10 }}>
                          <span style={{ color: X.td }}>{ml(h.mk)}</span>
                          <span style={{ color: X.tm, fontFamily: fm, fontWeight: 600 }}>{C(amt)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {isAnomaly && avg > 0 && (
                  <div style={{ marginTop: 6, padding: "5px 8px", borderRadius: 6, background: `${X.r}10`, color: X.r, fontSize: 10 }}>
                    Bu ay geçmiş aylara göre %{Math.round((current / avg - 1) * 100)} yüksek (ort: {C(Math.round(avg))})
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Eşleşmeyen faturalar */}
      {otherTotal > 0 && (
        <div style={{ marginBottom: 10, borderBottom: `1px solid ${X.border}`, paddingBottom: 10 }}>
          <div
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
            onClick={() => setExpanded(expanded === "_other" ? null : "_other")}
          >
            <span style={{ color: X.td, fontSize: 12 }}>📋 Diğer Fatura <span style={{ fontSize: 10 }}>({otherCount} adet)</span></span>
            <span style={{ color: X.td, fontSize: 12, fontWeight: 700, fontFamily: fm }}>{C(otherTotal)}</span>
          </div>
          {expanded === "_other" && otherItems.map((item, idx) => (
            <div key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0 3px 20px", fontSize: 10 }}>
              <span style={{ color: X.td, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: 8 }}>{item.desc}</span>
              <span style={{ color: X.tm, fontFamily: fm, fontWeight: 600, flexShrink: 0 }}>{C(item.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Genel toplam */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span style={{ color: X.t, fontSize: 13, fontWeight: 700 }}>Toplam Fatura</span>
        <span style={{ color: X.b, fontSize: 15, fontWeight: 800, fontFamily: fm }}>{C(grandTotal)}</span>
      </div>

      {/* Fatura türü tanımlı değilse yönlendirme */}
      {billTypes.length === 0 && !compact && (
        <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 8, background: X.bd, color: X.b, fontSize: 11 }}>
          💡 Ayarlar → Fatura Bütçeleri'nden kendi fatura türlerinizi ekleyebilirsiniz.
        </div>
      )}
    </Card>
  );
}

function Settings({ data, setData, isAdmin, family }) {
  const [sec, setSec] = useState(null); const [form, setForm] = useState({}); const mk = cmk();
  const secs = [
    { id: "budget", l: "Aylık Bütçe", i: "💰", d: C(data.settings.monthlyBudget) },
    { id: "cards", l: "Kartlarım", i: "💳", d: `${(data.settings.cards || []).length} kart` },
    { id: "fixed", l: "Sabit Giderler", i: "🔒", d: `${data.settings.fixedExpenses.length} kalem` },
    { id: "variable", l: "Harcama Kategorileri", i: "🔄", d: `${data.settings.variableExpenses.length} kategori` },
    { id: "billbudgets", l: "Fatura Bütçeleri", i: "🧾", d: (() => { const bt = data.settings.billTypes || []; return bt.length > 0 ? `${bt.length} tür tanımlı` : "Henüz eklenmedi"; })() },
    { id: "debts", l: "Borçlar", i: "📌", d: `${data.debts.filter(d => d.remainingMonths > 0).length} aktif` },
    { id: "emergency", l: "Acil Durum Fonu", i: "🛡️", d: data.settings.emergencyFundTarget ? C(data.settings.emergencyFundTarget) : "Henüz belirlenmedi" },
    { id: "rates", l: "Güncel Kurlar", i: "💱", d: data.liveRates?.USD ? `$${data.liveRates.USD.toFixed(2)}` : "Henüz girilmedi" },
    ...(isAdmin ? [{ id: "backup", l: "Yedekleme", i: "💾", d: "Yedek Al / Geri Yükle" }] : []),
    { id: "calendar", l: "Takvim Hatırlatıcı", i: "📅", d: "Ödeme günlerini takvime ekle" },
    { id: "theme", l: "Tema", i: "🎨", d: THEMES[data.settings.theme || "default"]?.name || "Varsayılan" },
    { id: "family", l: "Aile Bilgileri", i: "👨‍👩‍👧‍👦", d: isAdmin ? "Yönetici" : "Üye" },
    ...(isAdmin ? [{ id: "reset", l: "Sıfırla", i: "🗑️", d: "Geri alınamaz" }] : []),
    { id: "logout", l: "Çıkış Yap", i: "🚪", d: auth.currentUser?.email || "" },
  ];
  const BackBtn = () => <button onClick={() => setSec(null)} style={{ background: "none", border: "none", color: X.g, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: ff, padding: 0, marginBottom: 16 }}>← Geri</button>;
  if (!sec) return (<div style={{ padding: "20px 16px 100px" }}><h2 style={{ color: X.t, fontSize: 20, margin: "0 0 16px", fontFamily: ff }}>Ayarlar</h2><div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{secs.map(s => (<Card key={s.id} onClick={() => { setSec(s.id); setForm({}); }} s={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}><span style={{ fontSize: 24 }}>{s.i}</span><div style={{ flex: 1 }}><div style={{ color: X.t, fontWeight: 700, fontSize: 15 }}>{s.l}</div><div style={{ color: X.td, fontSize: 12 }}>{s.d}</div></div><span style={{ color: X.td }}>›</span></Card>))}</div></div>);
  if (sec === "budget") return (<div style={{ padding: "20px 16px 100px" }}><BackBtn /><Inp label="Varsayılan (₺)" type="number" value={form.b ?? data.settings.monthlyBudget} onChange={v => setForm({ b: v })} suffix="₺" /><Btn onClick={() => { setData(d => ({ ...d, settings: { ...d.settings, monthlyBudget: parseFloat(form.b) || 0 } })); setSec(null); }}>Kaydet</Btn></div>);
  if (sec === "fixed") return <FixedSettings data={data} setData={setData} onBack={() => setSec(null)} />;
  if (sec === "cards") return <CardsSettings data={data} setData={setData} onBack={() => setSec(null)} />;
  if (sec === "variable") return <VariableSettings data={data} setData={setData} onBack={() => setSec(null)} />;
  if (sec === "billbudgets") return <BillBudgetsSettings data={data} setData={setData} onBack={() => setSec(null)} />;
  if (sec === "debts") return <DebtSettings data={data} setData={setData} onBack={() => setSec(null)} />;
  if (sec === "emergency") return <EmergencyFundSettings data={data} setData={setData} onBack={() => setSec(null)} />;
  if (sec === "rates") return <RatesSettings data={data} setData={setData} onBack={() => setSec(null)} />;
  if (sec === "backup") return <BackupSettings data={data} setData={setData} onBack={() => setSec(null)} />;
  if (sec === "calendar") {
    const hasPayDays = data.settings.fixedExpenses.some(e => e.paymentDay) || data.debts.some(d => d.paymentDay);
    return (
      <div style={{ padding: "20px 16px 100px" }}>
        <BackBtn />
        <h3 style={{ color: X.t, fontSize: 16, margin: "0 0 12px" }}>📅 Takvim Hatırlatıcı</h3>
        <p style={{ color: X.td, fontSize: 12, marginBottom: 16, lineHeight: 1.6 }}>
          Sabit giderler ve borçlar için ödeme günü tanımladıysanız, bu dosyayı indirip iPhone Takvim'e ekleyebilirsiniz. Her ödeme günü geldiğinde telefonunuz zil çalarak hatırlatır.
        </p>
        {!hasPayDays ? (
          <Card s={{ textAlign: "center", padding: 20 }}>
            <div style={{ color: X.w, fontSize: 13 }}>⚠️ Henüz ödeme günü tanımlanmış gider yok. Önce Ayarlar → Sabit Giderler veya Borçlar'dan ödeme günlerini girin.</div>
          </Card>
        ) : (
          <>
            <Card s={{ marginBottom: 12 }}>
              <div style={{ color: X.tm, fontSize: 12, fontWeight: 700, marginBottom: 10 }}>TAKVİME EKLENECEKLER</div>
              {data.settings.fixedExpenses.filter(e => e.paymentDay).map(e => (
                <div key={e.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(0,0,0,0.04)", fontSize: 12 }}>
                  <span style={{ color: X.t }}>{e.name}</span>
                  <span style={{ color: X.tm, fontFamily: fm }}>Her ayın {e.paymentDay}'i · {C(e.amount)}{e.autoPayment ? " ⚡" : ""}</span>
                </div>
              ))}
              {data.debts.filter(d => d.paymentDay && d.remainingMonths > 0).map(d => (
                <div key={d.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(0,0,0,0.04)", fontSize: 12 }}>
                  <span style={{ color: X.t }}>{d.name}</span>
                  <span style={{ color: X.tm, fontFamily: fm }}>Her ayın {d.paymentDay}'i · {d.remainingMonths} ay kaldı</span>
                </div>
              ))}
            </Card>
            <Btn onClick={() => downloadICS(data)} c={X.b}>📅 Takvim Dosyasını İndir (.ics)</Btn>
            <div style={{ color: X.td, fontSize: 11, marginTop: 10, lineHeight: 1.6 }}>
              İndirilen dosyaya tıkladığınızda iPhone otomatik olarak Takvim uygulamasını açar. "Tümünü Ekle" deyince her ödeme aylık tekrarlayan etkinlik olarak eklenir. Her ödeme günü 12 saat önce ve ödeme anında bildirim alırsınız.
            </div>
          </>
        )}
      </div>
    );
  }
  if (sec === "reset") {
    const mk = cmk();
    const resetItem = (label, icon, desc, action) => (
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 10, background: glassSolid.background, border: `1px solid ${X.border}`, marginBottom: 8, cursor: "pointer" }} onClick={() => { if (confirm(`"${label}" sıfırlansın mı? Bu işlem geri alınamaz.`)) { action(); } }}>
        <span style={{ fontSize: 20, flexShrink: 0 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: X.t, fontSize: 13, fontWeight: 700 }}>{label}</div>
          <div style={{ color: X.td, fontSize: 11, marginTop: 2 }}>{desc}</div>
        </div>
        <span style={{ color: X.r, fontSize: 12, fontWeight: 700, flexShrink: 0 }}>Sıfırla</span>
      </div>
    );
    const clearMonthField = (field, empty) => {
      setData(d => {
        const ms = { ...d.months };
        Object.keys(ms).forEach(m => { ms[m] = { ...ms[m], [field]: empty }; });
        return { ...d, months: ms };
      });
    };
    return (
      <div style={{ padding: "20px 16px 100px" }}>
        <BackBtn />
        <h3 style={{ color: X.t, fontSize: 16, margin: "0 0 6px" }}>🗑️ Sıfırlama Seçenekleri</h3>
        <p style={{ color: X.td, fontSize: 12, marginBottom: 16 }}>Seçtiğiniz veri grubunu sıfırlayabilirsiniz. Ayar ve yapılandırma verileri korunur.</p>

        <Card s={{ border: `1px solid ${X.g}`, background: X.gd, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 22 }}>🚀</span>
            <div>
              <div style={{ color: X.g, fontSize: 14, fontWeight: 800 }}>Temiz Başlat</div>
              <div style={{ color: X.tm, fontSize: 11, marginTop: 2 }}>Ayarları, kartları, sabit giderleri, taksitleri, borçları ve kurları korur. Sadece ay içi deneme verilerini (harcamalar, birikim, ekstre, fiş, kapanış) temizler.</div>
            </div>
          </div>
          <Btn c={X.g} onClick={() => { if (confirm("Temiz başlat: Tüm ay içi veriler, birikim havuzu ve kapanış bilgileri sıfırlanacak. Ayarlar ve yükümlülükler korunacak. Onaylıyor musunuz?")) { setData(d => ({ ...d, months: {}, savings: { TRY: [], USD: [], EUR: [], XAU: [] }, lastClosedMonth: null, lastBackup: null })); setSec(null); } }} s={{ marginTop: 4 }}>Temiz Başlat</Btn>
        </Card>

        {resetItem("Kredi Kartı Tek Çekim", "💳", "Tüm aylardaki CC tek çekim harcamaları", () => clearMonthField("ccSingle", []))}

        {resetItem("Kredi Kartı Taksitli", "📅", "Tüm taksit planları", () => setData(d => ({ ...d, installmentPlans: [] })))}

        {resetItem("Genel Harcama Kartı", "🛒", "Tüm aylardaki kart yüklemeleri", () => clearMonthField("cardLoaded", 0))}

        {resetItem("Sabit Gider Ödemeleri", "📌", "Ödendi işaretleri (giderler silinmez)", () => clearMonthField("fixedPaid", {}))}

        {resetItem("Borç Ödemeleri", "💸", "Ödeme işaretleri (borçlar silinmez)", () => clearMonthField("debtPayments", {}))}


        {resetItem("CSV Ekstre Verileri", "🧾", "Yüklenen banka ekstresi verileri", () => clearMonthField("csvByCard", {}))}

        {resetItem("CC Aktarım İşaretleri", "🔄", "Kredi kartı hesabına aktarım işaretleri", () => clearMonthField("ccTransferred", {}))}

        {resetItem("Market Fişi Kayıtları", "📷", "Tüm aylardaki fiş verileri", () => clearMonthField("receipts", []))}

        {resetItem("Birikim Havuzu", "💰", "TL, USD, EUR ve altın birikim kayıtları", () => setData(d => ({ ...d, savings: { TRY: [], USD: [], EUR: [], XAU: [] } })))}

        {resetItem("Mağaza Eşleştirme Hafızası", "🏪", "CSV'den öğrenilen mağaza→kategori eşleşmeleri", () => setData(d => ({ ...d, merchantMap: {} })))}

        {resetItem("Ay Kapanış & Yedekleme", "🔒", "Son kapatılan ay ve yedekleme tarihi", () => setData(d => ({ ...d, lastClosedMonth: null, lastBackup: null })))}

        <div style={{ marginTop: 16 }}>
          <Card s={{ border: `1px solid ${X.r}`, background: X.rd, textAlign: "center", padding: 20 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
            <div style={{ color: X.r, fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Tüm verileri siler. Ayarlar dahil her şey sıfırlanır.</div>
            <Btn c={X.r} onClick={async () => { if (confirm("TÜM VERİLER SİLİNECEK. Ayarlar, giderler, kartlar, borçlar dahil her şey. Emin misiniz?")) { await deleteDB(family?.familyId); setData({ ...DD }); setSec(null); } }}>Tümünü Sıfırla</Btn>
          </Card>
        </div>
      </div>
    );
  }
  if (sec === "theme") return (
    <div style={{ padding: "20px 16px 100px" }}>
      <BackBtn />
      <h3 style={{ color: X.t, fontSize: 16, margin: "0 0 12px" }}>🎨 Tema Seçimi</h3>
      <p style={{ color: X.td, fontSize: 12, marginBottom: 16 }}>Uygulamanın görünümünü değiştirin.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {Object.entries(THEMES).map(([id, th]) => {
          const active = (data.settings.theme || "default") === id;
          return (
            <div key={id} onClick={() => { setData(d => ({ ...d, settings: { ...d.settings, theme: id } })); }} style={{ background: active ? `${X.g}15` : X.card, border: `2px solid ${active ? X.g : X.border}`, borderRadius: 12, padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 48, height: 48, borderRadius: 10, overflow: "hidden", flexShrink: 0, border: `1px solid ${X.border}` }}>
                <div style={{ width: "100%", height: "100%", background: th.gradient }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: X.t, fontWeight: 700, fontSize: 14, fontFamily: th.ff }}>{th.name}</div>
                <div style={{ color: X.td, fontSize: 11, marginTop: 2, fontFamily: th.ff }}>
                  {id === "default" ? "Quicksand · Kum-teal tonlar · Cam efekti" : "DM Sans · Krem zemin · Beyaz kartlar · Profesyonel"}
                </div>
              </div>
              {active && <span style={{ color: X.g, fontSize: 18, fontWeight: 800 }}>✓</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
  if (sec === "family") return (<FamilyManagement isAdmin={isAdmin} family={family} onBack={() => setSec(null)} />);
  if (sec === "logout") return (<div style={{ padding: "20px 16px 100px" }}><BackBtn /><Card s={{ textAlign: "center", padding: 24 }}><div style={{ fontSize: 36, marginBottom: 8 }}>🚪</div><div style={{ color: X.t, fontSize: 14, marginBottom: 8 }}>Giriş: <strong>{family?.name || auth.currentUser?.email}</strong></div><div style={{ color: X.tm, fontSize: 12, marginBottom: 16 }}>Çıkış yaptığınızda verileriniz bulutta güvende kalır. İsminiz ve şifrenizle tekrar giriş yapabilirsiniz.</div><Btn c={X.r} onClick={() => signOut(auth)}>Çıkış Yap</Btn></Card></div>);
  return null;
}
function BillBudgetsSettings({ data, setData, onBack }) {
  const [editing, setEditing] = useState(null); // null | "new" | id
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📋");
  const [budget, setBudget] = useState("");

  const list = data.settings.billTypes || [];

  const startNew = () => { setName(""); setIcon("📋"); setBudget(""); setEditing("new"); };
  const startEdit = bt => { setName(bt.name); setIcon(bt.icon || "📋"); setBudget(bt.budget ? String(bt.budget) : ""); setEditing(bt.id); };
  const cancel = () => { setEditing(null); setName(""); setIcon("📋"); setBudget(""); };

  const save = () => {
    if (!name.trim()) return;
    const item = { name: name.trim(), icon: icon.trim() || "📋", budget: parseFloat(budget) || 0 };
    setData(d => {
      const cur = d.settings.billTypes || [];
      let next;
      if (editing === "new") {
        next = [...cur, { id: uid(), ...item }];
      } else {
        next = cur.map(bt => bt.id === editing ? { ...bt, ...item } : bt);
      }
      return { ...d, settings: { ...d.settings, billTypes: next } };
    });
    cancel();
  };

  const remove = id => {
    if (!confirm("Bu fatura türünü silmek istediğinize emin misiniz?")) return;
    setData(d => ({ ...d, settings: { ...d.settings, billTypes: (d.settings.billTypes || []).filter(bt => bt.id !== id) } }));
  };

  const BackBtn = () => <button onClick={onBack} style={{ background: "none", border: "none", color: X.g, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: ff, padding: 0, marginBottom: 16 }}>← Geri</button>;

  const totalBudget = list.reduce((s, bt) => s + (bt.budget || 0), 0);

  return (
    <div style={{ padding: "20px 16px 100px" }}>
      <BackBtn />
      <h3 style={{ color: X.t, fontSize: 16, margin: "0 0 6px", fontFamily: ff }}>🧾 Fatura Bütçeleri</h3>
      <p style={{ color: X.td, fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
        Düzenli ödediğiniz fatura türlerini ekleyin. Banka ekstresi yüklendiğinde her fatura otomatik eşleştirilir.
      </p>

      {/* Form */}
      {editing && (
        <Card s={{ marginBottom: 16, border: `1px solid ${X.b}30` }}>
          <div style={{ color: X.b, fontSize: 12, fontWeight: 700, marginBottom: 12 }}>
            {editing === "new" ? "Yeni Fatura Türü" : "Düzenle"}
          </div>
          {/* İkon + Ad yan yana */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <div style={{ flex: "0 0 64px" }}>
              <div style={{ color: X.td, fontSize: 11, fontWeight: 600, marginBottom: 4 }}>İkon</div>
              <input
                value={icon}
                onChange={e => setIcon(e.target.value)}
                placeholder="📋"
                style={{ width: "100%", background: X.card, border: `1px solid ${X.border}`, borderRadius: 8, padding: "10px 8px", color: X.t, fontSize: 20, fontFamily: ff, outline: "none", textAlign: "center", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: X.td, fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Fatura Adı</div>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Elektrik, Su, Turkcell..."
                style={{ width: "100%", background: X.card, border: `1px solid ${X.border}`, borderRadius: 8, padding: "10px 12px", color: X.t, fontSize: 14, fontFamily: ff, outline: "none", boxSizing: "border-box" }}
              />
            </div>
          </div>
          <Inp label="Aylık Bütçe (₺)" type="number" value={budget} onChange={setBudget} suffix="₺" />
          <div style={{ color: X.td, fontSize: 10, marginBottom: 12, marginTop: -8 }}>
            0 bırakırsanız bütçe karşılaştırması yapılmaz ama işlemler yine de eşleştirilir.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={save} s={{ flex: 1 }}>Kaydet</Btn>
            <button onClick={cancel} style={{ flex: 1, background: X.card, border: `1px solid ${X.border}`, borderRadius: 10, padding: "12px", color: X.tm, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: ff }}>İptal</button>
          </div>
        </Card>
      )}

      {/* Liste */}
      {list.length > 0 ? (
        <>
          {list.map(bt => (
            <Card key={bt.id} s={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 22, flexShrink: 0 }}>{bt.icon || "📋"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: X.t, fontWeight: 700, fontSize: 14 }}>{bt.name}</div>
                <div style={{ color: X.td, fontSize: 11 }}>{bt.budget > 0 ? `Bütçe: ${C(bt.budget)}/ay` : "Bütçe belirlenmedi"}</div>
              </div>
              <button onClick={() => startEdit(bt)} style={{ background: "none", border: "none", color: X.b, fontSize: 20, cursor: "pointer", padding: "6px", minWidth: 36, minHeight: 36 }}>✎</button>
              <button onClick={() => remove(bt.id)} style={{ background: "none", border: "none", color: X.r, fontSize: 20, cursor: "pointer", padding: "6px", minWidth: 36, minHeight: 36 }}>✕</button>
            </Card>
          ))}
          {totalBudget > 0 && (
            <div style={{ padding: "10px 14px", borderRadius: 10, background: X.bd, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: X.b, fontSize: 12, fontWeight: 700 }}>Toplam Fatura Bütçesi</span>
              <span style={{ color: X.t, fontSize: 16, fontWeight: 800, fontFamily: fm }}>{C(totalBudget)}/ay</span>
            </div>
          )}
        </>
      ) : (
        !editing && (
          <Card s={{ textAlign: "center", padding: 24, marginBottom: 16 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🧾</div>
            <div style={{ color: X.td, fontSize: 13 }}>Henüz fatura türü eklenmedi.</div>
            <div style={{ color: X.td, fontSize: 11, marginTop: 4 }}>Elektrik, su, telefon gibi faturalarınızı ekleyin.</div>
          </Card>
        )
      )}

      {!editing && (
        <Btn onClick={startNew}>+ Fatura Türü Ekle</Btn>
      )}
    </div>
  );
}

function FixedSettings({ data, setData, onBack }) {
  const [editing, setEditing] = useState(null);
  const [n, sn] = useState(""); const [a, sa] = useState(""); const [m, sm] = useState("account"); const [d, sd] = useState(""); const [cardId, setCardId] = useState("");
  const [pDay, setPDay] = useState(""); const [pDayEnd, setPDayEnd] = useState(""); const [autoPay, setAutoPay] = useState(false);
  const cards = data.settings.cards || [];

  const startNew = () => { sn(""); sa(""); sm("account"); sd(""); setCardId(cards[0]?.id || ""); setPDay(""); setPDayEnd(""); setAutoPay(false); setEditing("new"); };
  const startEdit = exp => { sn(exp.name); sa(String(exp.amount)); sm(exp.paymentMethod || "account"); sd(exp.increaseDate || ""); setCardId(exp.cardId || cards[0]?.id || ""); setPDay(exp.paymentDay ? String(exp.paymentDay) : ""); setPDayEnd(exp.paymentDayEnd ? String(exp.paymentDayEnd) : ""); setAutoPay(exp.autoPayment || false); setEditing(exp.id); };
  const cancel = () => { setEditing(null); sn(""); sa(""); sm("account"); sd(""); setCardId(""); setPDay(""); setPDayEnd(""); setAutoPay(false); };

  const save = () => {
    if (!n || !a) return;
    setData(dd => {
      const list = [...dd.settings.fixedExpenses];
      const newItem = { name: n, amount: parseFloat(a), paymentMethod: m, increaseDate: d || null, cardId: m === "cc" ? cardId : null, paymentDay: parseInt(pDay) || null, paymentDayEnd: parseInt(pDayEnd) || null, autoPayment: autoPay };
      if (editing === "new") {
        list.push({ id: uid(), ...newItem });
      } else {
        const idx = list.findIndex(x => x.id === editing);
        if (idx >= 0) list[idx] = { ...list[idx], ...newItem };
      }
      return { ...dd, settings: { ...dd.settings, fixedExpenses: list } };
    });
    cancel();
  };

  const rm = id => { if (confirm("Bu kalemi silmek istediğinize emin misiniz?")) setData(dd => ({ ...dd, settings: { ...dd.settings, fixedExpenses: dd.settings.fixedExpenses.filter(e => e.id !== id) } })); };

  const editForm = (
    <Card s={{ border: `1px solid ${X.g}`, marginBottom: 8 }}>
      <div style={{ color: X.g, fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{editing === "new" ? "Yeni Kalem" : "Düzenle"}</div>
      <Inp label="Ad" value={n} onChange={sn} />
      <Inp label="Tutar" type="number" value={a} onChange={sa} suffix="₺" />
      <Sel label="Ödeme" value={m} onChange={sm} options={PM.map(p => ({ v: p.id, l: p.icon + " " + p.label }))} />
      {m === "cc" && cards.length > 0 && <Sel label="Hangi Kart" value={cardId} onChange={setCardId} options={cards.map(c => ({ v: c.id, l: c.name }))} />}
      {m === "cc" && cards.length === 0 && <div style={{ color: X.w, fontSize: 12, marginBottom: 8 }}>⚠️ Önce Ayarlar → Kartlarım'dan kart ekleyin</div>}
      <Inp label="Artış Tarihi" type="month" value={d} onChange={sd} />
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}><Inp label="Ödeme Günü" type="number" value={pDay} onChange={setPDay} placeholder="Örn: 17" /></div>
        <div style={{ flex: 1 }}><Inp label="Son Gün (opsiyonel)" type="number" value={pDayEnd} onChange={setPDayEnd} placeholder="Örn: 20" /></div>
      </div>
      <div onClick={() => setAutoPay(!autoPay)} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, cursor: "pointer" }}>
        <div style={{ width: 20, height: 20, borderRadius: 4, border: `2px solid ${autoPay ? X.g : X.td}`, background: autoPay ? X.g : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>{autoPay && <span style={{ color: "#fff", fontSize: 12, fontWeight: 800 }}>✓</span>}</div>
        <span style={{ color: X.tm, fontSize: 12 }}>Otomatik ödeme talimatı var</span>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Btn onClick={save} s={{ flex: 1 }}>Kaydet</Btn>
        <Btn onClick={cancel} v="outline" c={X.td} s={{ flex: 1 }}>İptal</Btn>
      </div>
    </Card>
  );

  return (
    <div style={{ padding: "20px 16px 100px" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: X.g, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: ff, padding: 0, marginBottom: 16 }}>← Geri</button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ color: X.t, fontSize: 16, margin: 0 }}>🔒 Sabit Giderler</h3>
        {!editing && <button onClick={startNew} style={{ background: X.gd, border: `1px solid ${X.g}`, borderRadius: 8, padding: "6px 12px", color: X.g, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+ Ekle</button>}
      </div>
      {/* Yeni ekleme formu en üstte */}
      {editing === "new" && editForm}
      {data.settings.fixedExpenses.map(exp => {
        const cardName = exp.cardId ? cards.find(c => c.id === exp.cardId)?.name : null;
        return (
          <div key={exp.id}>
            <Card s={{ marginBottom: editing === exp.id ? 0 : 8, borderRadius: editing === exp.id ? "14px 14px 0 0" : 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: X.t, fontWeight: 700 }}>{exp.name}</div>
                  <div style={{ color: X.tm, fontSize: 12 }}>{C(exp.amount)} • {exp.paymentMethod === "cc" ? "💳" + (cardName ? " " + cardName : "") : "🏦"}{exp.paymentDay ? ` • ${exp.paymentDay}${exp.paymentDayEnd ? "-" + exp.paymentDayEnd : ""}'inde` : ""}{exp.autoPayment ? " • ⚡oto" : ""}{exp.increaseDate ? " • 📈" + exp.increaseDate : ""}</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => editing === exp.id ? cancel() : startEdit(exp)} style={{ background: X.bd, border: `1px solid ${X.b}`, borderRadius: 6, padding: "4px 10px", color: X.b, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{editing === exp.id ? "▲" : "✎"}</button>
                  <button onClick={() => rm(exp.id)} style={{ background: X.rd, border: `1px solid ${X.r}`, borderRadius: 6, padding: "4px 10px", color: X.r, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>✕</button>
                </div>
              </div>
            </Card>
            {/* Düzenleme formu kalemin hemen altında */}
            {editing === exp.id && <div style={{ marginBottom: 8 }}>{editForm}</div>}
          </div>
        );
      })}
    </div>
  );
}
function VariableSettings({ data, setData, onBack }) {
  const [editing, setEditing] = useState(null);
  const [n, sn] = useState(""); const [ic, sic] = useState("📋"); const [ex, se] = useState(""); const [kw, setKw] = useState("");
  const icons = ["⚡", "💧", "🌐", "📱", "⛽", "🍽️", "📋", "🔧", "🏥", "📺", "🛒", "🏪", "👶", "🐾", "📚", "🚗"];

  const startNew = () => { sn(""); sic("📋"); se(""); setKw(""); setEditing("new"); };
  const startEdit = ve => { sn(ve.name); sic(ve.icon || "📋"); se(String(ve.expectedAmount || "")); setKw((ve.keywords || []).join(", ")); setEditing(ve.id); };
  const cancel = () => { setEditing(null); sn(""); sic("📋"); se(""); setKw(""); };

  const save = () => {
    if (!n) return;
    const keywords = kw.split(",").map(k => k.trim()).filter(k => k.length > 0);
    setData(dd => {
      const list = [...dd.settings.variableExpenses];
      if (editing === "new") {
        list.push({ id: uid(), name: n, icon: ic, expectedAmount: parseFloat(ex) || 0, keywords });
      } else {
        const idx = list.findIndex(x => x.id === editing);
        if (idx >= 0) list[idx] = { ...list[idx], name: n, icon: ic, expectedAmount: parseFloat(ex) || 0, keywords };
      }
      return { ...dd, settings: { ...dd.settings, variableExpenses: list } };
    });
    cancel();
  };

  const rm = id => { if (confirm("Bu kategoriyi silmek istediğinize emin misiniz?")) setData(dd => ({ ...dd, settings: { ...dd.settings, variableExpenses: dd.settings.variableExpenses.filter(e => e.id !== id) } })); };

  const editForm = (
    <Card s={{ border: `1px solid ${X.g}`, marginBottom: 8 }}>
      <div style={{ color: X.g, fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{editing === "new" ? "Yeni Kategori" : "Düzenle"}</div>
      <Inp label="Ad" value={n} onChange={sn} placeholder="Örn: Akaryakıt, Market" />
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, color: X.tm, fontWeight: 600, marginBottom: 4, display: "block" }}>Simge</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {icons.map(i => (<button key={i} onClick={() => sic(i)} style={{ fontSize: 22, padding: "6px 8px", background: ic === i ? X.gd : X.bg, border: `1px solid ${ic === i ? X.g : X.border}`, borderRadius: 8, cursor: "pointer" }}>{i}</button>))}
        </div>
      </div>
      <Inp label="Beklenen Aylık Tutar" type="number" value={ex} onChange={se} suffix="₺" placeholder="Opsiyonel" />
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, color: X.tm, fontWeight: 600, marginBottom: 4, display: "block" }}>Anahtar Kelimeler (virgülle ayırın)</label>
        <textarea value={kw} onChange={e => setKw(e.target.value)} placeholder="shell, opet, bp, dizel, benzin, yakıt, akaryakıt" style={{ width: "100%", background: "rgba(200,220,232,0.65)", border: `1px solid ${X.border}`, borderRadius: 10, padding: "12px 14px", color: X.t, fontSize: 14, fontFamily: ff, outline: "none", boxSizing: "border-box", minHeight: 60, resize: "vertical" }} />
        <div style={{ color: X.td, fontSize: 10, marginTop: 4 }}>Bu kelimelerden biri harcamanın açıklaması veya işyeri adında geçerse bu kategoriye otomatik atanır.</div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Btn onClick={save} s={{ flex: 1 }}>Kaydet</Btn>
        <Btn onClick={cancel} v="outline" c={X.td} s={{ flex: 1 }}>İptal</Btn>
      </div>
    </Card>
  );

  return (
    <div style={{ padding: "20px 16px 100px" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: X.g, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: ff, padding: 0, marginBottom: 16 }}>← Geri</button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ color: X.t, fontSize: 16, margin: 0 }}>🔄 Harcama Kategorileri</h3>
        {!editing && <button onClick={startNew} style={{ background: X.gd, border: `1px solid ${X.g}`, borderRadius: 8, padding: "6px 12px", color: X.g, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+ Ekle</button>}
      </div>
      <p style={{ color: X.td, fontSize: 12, marginBottom: 16 }}>Kategori tanımlayın ve anahtar kelimeler atayın. Harcama girerken anahtar kelimelerinizden biri açıklamada veya işyeri adında geçerse bu kategoriye otomatik atanır.</p>
      {data.settings.variableExpenses.length === 0 && !editing && <Card s={{ textAlign: "center", padding: 20 }}><div style={{ color: X.tm, fontSize: 13 }}>Henüz kategori eklenmedi</div></Card>}
      {editing === "new" && editForm}
      {data.settings.variableExpenses.map(ve => (
        <div key={ve.id}>
          <Card s={{ marginBottom: editing === ve.id ? 0 : 8, borderRadius: editing === ve.id ? "14px 14px 0 0" : 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 20 }}>{ve.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: X.t, fontWeight: 700 }}>{ve.name}</div>
                  {ve.expectedAmount > 0 && <div style={{ color: X.tm, fontSize: 11 }}>Beklenen: {C(ve.expectedAmount)}</div>}
                  {(ve.keywords || []).length > 0 && (
                    <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 3 }}>
                      {ve.keywords.map((k, i) => <span key={i} style={{ background: X.bd, color: X.b, fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4 }}>{k}</span>)}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, marginLeft: 8 }}>
                <button onClick={() => editing === ve.id ? cancel() : startEdit(ve)} style={{ background: X.bd, border: `1px solid ${X.b}`, borderRadius: 6, padding: "4px 10px", color: X.b, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{editing === ve.id ? "▲" : "✎"}</button>
                <button onClick={() => rm(ve.id)} style={{ background: X.rd, border: `1px solid ${X.r}`, borderRadius: 6, padding: "4px 10px", color: X.r, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>✕</button>
              </div>
            </div>
          </Card>
          {editing === ve.id && <div style={{ marginBottom: 8 }}>{editForm}</div>}
        </div>
      ))}
    </div>
  );
}
function RatesSettings({ data, setData, onBack }) {
  const [usdManual, setUsdManual] = useState("");
  const [eurManual, setEurManual] = useState("");
  const [xauManual, setXauManual] = useState("");
  const lr = data.liveRates || {};
  const fetchedAgo = lr.fetchedAt ? Math.floor((Date.now() - lr.fetchedAt) / 60000) : null;

  const applyManual = () => {
    setData(d => ({
      ...d, liveRates: {
        ...d.liveRates,
        USD: usdManual ? parseFloat(usdManual) : d.liveRates?.USD,
        EUR: eurManual ? parseFloat(eurManual) : d.liveRates?.EUR,
        XAU: xauManual ? parseFloat(xauManual) : d.liveRates?.XAU,
        fetchedAt: Date.now()
      }
    }));
    setUsdManual(""); setEurManual(""); setXauManual("");
  };

  return (
    <div style={{ padding: "20px 16px 100px" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: X.g, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: ff, padding: 0, marginBottom: 16 }}>← Geri</button>
      <h3 style={{ color: X.t, fontSize: 16, margin: "0 0 12px" }}>💱 Döviz & Altın Kuru</h3>
      <p style={{ color: X.td, fontSize: 12, marginBottom: 16 }}>Kurlar manuel girilir. Altın için haremaltin.com sayfasını yeni sekmede açabilirsiniz.</p>

      <Card s={{ marginBottom: 12 }}>
        <div style={{ color: X.tm, fontSize: 12, fontWeight: 700, marginBottom: 12 }}>MEVCUT KURLAR</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${X.border}` }}>
          <span style={{ color: X.t }}>💵 Dolar (USD)</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: X.t, fontFamily: fm, fontWeight: 700 }}>{lr.USD ? `${lr.USD.toFixed(4)} ₺` : "—"}</span>
            <a href={HAREMALTIN_USD} target="_blank" rel="noopener noreferrer" style={{ background: X.wd, border: `1px solid ${X.w}`, borderRadius: 6, padding: "4px 8px", color: X.w, fontSize: 11, fontWeight: 700, textDecoration: "none" }}>🔗 haremaltin</a>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${X.border}` }}>
          <span style={{ color: X.t }}>💶 Euro (EUR)</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: X.t, fontFamily: fm, fontWeight: 700 }}>{lr.EUR ? `${lr.EUR.toFixed(4)} ₺` : "—"}</span>
            <a href={HAREMALTIN_EUR} target="_blank" rel="noopener noreferrer" style={{ background: X.wd, border: `1px solid ${X.w}`, borderRadius: 6, padding: "4px 8px", color: X.w, fontSize: 11, fontWeight: 700, textDecoration: "none" }}>🔗 haremaltin</a>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0" }}>
          <span style={{ color: X.t }}>🪙 Altın (gram)</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: X.t, fontFamily: fm, fontWeight: 700 }}>{lr.XAU ? `${lr.XAU.toFixed(2)} ₺` : "—"}</span>
            <a href={HAREMALTIN_XAU} target="_blank" rel="noopener noreferrer" style={{ background: X.wd, border: `1px solid ${X.w}`, borderRadius: 6, padding: "4px 8px", color: X.w, fontSize: 11, fontWeight: 700, textDecoration: "none" }}>🔗 haremaltin</a>
          </div>
        </div>
        {fetchedAgo !== null && <div style={{ color: X.td, fontSize: 11, marginTop: 8 }}>Son güncelleme: {fetchedAgo === 0 ? "az önce" : fetchedAgo + " dk önce"}</div>}
      </Card>

      <Card>
        <div style={{ color: X.tm, fontSize: 12, fontWeight: 700, marginBottom: 12 }}>MANUEL GÜNCELLEME</div>
        <Inp label="Dolar (₺)" type="number" value={usdManual} onChange={setUsdManual} suffix="₺" placeholder={lr.USD ? lr.USD.toFixed(4) : "Örn: 38.50"} />
        <Inp label="Euro (₺)" type="number" value={eurManual} onChange={setEurManual} suffix="₺" placeholder={lr.EUR ? lr.EUR.toFixed(4) : "Örn: 42.10"} />
        <Inp label="Altın gram (₺)" type="number" value={xauManual} onChange={setXauManual} suffix="₺/gr" placeholder={lr.XAU ? lr.XAU.toFixed(2) : "Örn: 4250"} />
        <Btn onClick={applyManual} disabled={!usdManual && !eurManual && !xauManual}>Kaydet</Btn>
      </Card>
    </div>
  );
}

function CardsSettings({ data, setData, onBack }) {
  const [editing, setEditing] = useState(null);
  const [n, sn] = useState("");
  const cards = data.settings.cards || [];

  const startNew = () => { sn(""); setEditing("new"); };
  const startEdit = c => { sn(c.name); setEditing(c.id); };
  const cancel = () => { setEditing(null); sn(""); };

  const save = () => {
    if (!n) return;
    setData(d => {
      const list = [...(d.settings.cards || [])];
      if (editing === "new") {
        list.push({ id: uid(), name: n });
      } else {
        const idx = list.findIndex(x => x.id === editing);
        if (idx >= 0) list[idx] = { ...list[idx], name: n };
      }
      return { ...d, settings: { ...d.settings, cards: list } };
    });
    cancel();
  };

  const rm = id => {
    if (!confirm("Bu kartı silmek istediğinize emin misiniz?")) return;
    setData(d => ({ ...d, settings: { ...d.settings, cards: (d.settings.cards || []).filter(c => c.id !== id) } }));
  };

  const editForm = (
    <Card s={{ border: `1px solid ${X.g}`, marginBottom: 8 }}>
      <div style={{ color: X.g, fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{editing === "new" ? "Yeni Kart" : "Düzenle"}</div>
      <Inp label="Kart Adı" value={n} onChange={sn} placeholder="Örn: Garanti Bonus, Yapı Kredi World" />
      <div style={{ display: "flex", gap: 8 }}>
        <Btn onClick={save} s={{ flex: 1 }}>Kaydet</Btn>
        <Btn onClick={cancel} v="outline" c={X.td} s={{ flex: 1 }}>İptal</Btn>
      </div>
    </Card>
  );

  return (
    <div style={{ padding: "20px 16px 100px" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: X.g, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: ff, padding: 0, marginBottom: 16 }}>← Geri</button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ color: X.t, fontSize: 16, margin: 0 }}>💳 Kartlarım</h3>
        {!editing && <button onClick={startNew} style={{ background: X.gd, border: `1px solid ${X.g}`, borderRadius: 8, padding: "6px 12px", color: X.g, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+ Ekle</button>}
      </div>
      <p style={{ color: X.td, fontSize: 12, marginBottom: 16 }}>Kredi kartlarınızı tanımlayın. Harcama girerken hangi karta ait olduğunu seçeceksiniz.</p>
      {cards.length === 0 && !editing && <Card s={{ textAlign: "center", padding: 20 }}><div style={{ color: X.tm, fontSize: 13 }}>Henüz kart eklenmedi</div></Card>}
      {editing === "new" && editForm}
      {cards.map(c => (
        <div key={c.id}>
          <Card s={{ marginBottom: editing === c.id ? 0 : 8, borderRadius: editing === c.id ? "14px 14px 0 0" : 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <div style={{ color: X.t, fontWeight: 700 }}>{c.name}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => editing === c.id ? cancel() : startEdit(c)} style={{ background: X.bd, border: `1px solid ${X.b}`, borderRadius: 6, padding: "4px 10px", color: X.b, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{editing === c.id ? "▲" : "✎"}</button>
                <button onClick={() => rm(c.id)} style={{ background: X.rd, border: `1px solid ${X.r}`, borderRadius: 6, padding: "4px 10px", color: X.r, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>✕</button>
              </div>
            </div>
          </Card>
          {editing === c.id && <div style={{ marginBottom: 8 }}>{editForm}</div>}
        </div>
      ))}
    </div>
  );
}

function DebtSettings({ data, setData, onBack }) {
  const [editing, setEditing] = useState(null);
  const [n, sn] = useState(""); const [c, sc] = useState("TRY");
  const [total, setTotal] = useState(""); const [months, setMonths] = useState("");
  const [pDay, setPDay] = useState(""); const [pDayEnd, setPDayEnd] = useState("");

  const startNew = () => { sn(""); sc("TRY"); setTotal(""); setMonths(""); setPDay(""); setPDayEnd(""); setEditing("new"); };
  const startEdit = debt => {
    sn(debt.name); sc(debt.currency);
    const t = debt.totalAmount || (debt.monthlyPayment * (debt.totalMonths || debt.remainingMonths));
    const m2 = debt.totalMonths || debt.remainingMonths;
    setTotal(String(t)); setMonths(String(m2));
    setPDay(debt.paymentDay ? String(debt.paymentDay) : ""); setPDayEnd(debt.paymentDayEnd ? String(debt.paymentDayEnd) : "");
    setEditing(debt.id);
  };
  const cancel = () => { setEditing(null); sn(""); sc("TRY"); setTotal(""); setMonths(""); setPDay(""); setPDayEnd(""); };

  const totalNum = parseFloat(total) || 0;
  const monthsNum = parseInt(months) || 0;
  const monthlyCalc = monthsNum > 0 ? totalNum / monthsNum : 0;

  const save = () => {
    if (!n || !totalNum || !monthsNum) return;
    setData(d => {
      const list = [...d.debts];
      if (editing === "new") {
        list.push({ id: uid(), name: n, currency: c, totalAmount: totalNum, totalMonths: monthsNum, remainingMonths: monthsNum, monthlyPayment: monthlyCalc, paymentDay: parseInt(pDay) || null, paymentDayEnd: parseInt(pDayEnd) || null });
      } else {
        const idx = list.findIndex(x => x.id === editing);
        if (idx >= 0) {
          const old = list[idx];
          const paidCount = (old.totalMonths || old.remainingMonths) - old.remainingMonths;
          const newRemaining = Math.max(0, monthsNum - paidCount);
          list[idx] = { ...old, name: n, currency: c, totalAmount: totalNum, totalMonths: monthsNum, remainingMonths: newRemaining, monthlyPayment: monthlyCalc, paymentDay: parseInt(pDay) || null, paymentDayEnd: parseInt(pDayEnd) || null };
        }
      }
      return { ...d, debts: list };
    });
    cancel();
  };

  const rm = id => { if (confirm("Bu borcu silmek istediğinize emin misiniz?")) setData(dd => ({ ...dd, debts: dd.debts.filter(x => x.id !== id) })); };

  const editForm = (
    <Card s={{ border: `1px solid ${X.w}`, marginBottom: 8 }}>
      <div style={{ color: X.w, fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{editing === "new" ? "Yeni Borç" : "Düzenle"}</div>
      <Inp label="Ad" value={n} onChange={sn} placeholder="Örn: Ahmet Abi" />
      <Sel label="Birim" value={c} onChange={sc} options={[{ v: "TRY", l: "₺ Türk Lirası" }, { v: "USD", l: "$ Dolar" }, { v: "EUR", l: "€ Euro" }, { v: "XAU", l: "🪙 Altın (gram)" }]} />
      {(c === "XAU" || c === "USD" || c === "EUR") && (
        <div style={{ marginBottom: 12 }}>
          <a href={c === "XAU" ? HAREMALTIN_XAU : c === "USD" ? HAREMALTIN_USD : HAREMALTIN_EUR} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", background: X.wd, border: `1px solid ${X.w}`, borderRadius: 6, padding: "6px 12px", color: X.w, fontSize: 12, fontWeight: 700, textDecoration: "none" }}>🔗 Haremaltin'den fiyat kontrol</a>
        </div>
      )}
      <Inp label="Toplam Borç" type="number" value={total} onChange={setTotal} suffix={debtCurSymbol(c)} placeholder="Örn: 24" />
      <Inp label="Geri Ödeme Süresi (ay)" type="number" value={months} onChange={setMonths} placeholder="Örn: 12" />
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}><Inp label="Ödeme Günü" type="number" value={pDay} onChange={setPDay} placeholder="Örn: 28" /></div>
        <div style={{ flex: 1 }}><Inp label="Son Gün (opsiyonel)" type="number" value={pDayEnd} onChange={setPDayEnd} placeholder="Örn: 31" /></div>
      </div>
      {totalNum > 0 && monthsNum > 0 && (
        <Card s={{ background: X.wd, border: `1px solid ${X.w}`, marginBottom: 12, padding: "10px 14px" }}>
          <div style={{ color: X.tm, fontSize: 11, fontWeight: 700, marginBottom: 4 }}>HESAPLANAN AYLIK TAKSİT</div>
          <div style={{ color: X.w, fontSize: 18, fontWeight: 800, fontFamily: fm }}>
            {monthlyCalc.toFixed(2)} {debtCurSymbol(c)}
            {c !== "TRY" && data.liveRates && (
              <span style={{ color: X.td, fontSize: 12, marginLeft: 6 }}>
                ({c === "USD" && data.liveRates.USD ? C(monthlyCalc * data.liveRates.USD) : ""}
                {c === "EUR" && data.liveRates.EUR ? C(monthlyCalc * data.liveRates.EUR) : ""}
                {c === "XAU" && data.liveRates.XAU ? C(monthlyCalc * data.liveRates.XAU) : ""})
              </span>
            )}
          </div>
        </Card>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <Btn onClick={save} c={X.w} s={{ flex: 1 }} disabled={!n || !totalNum || !monthsNum}>Kaydet</Btn>
        <Btn onClick={cancel} v="outline" c={X.td} s={{ flex: 1 }}>İptal</Btn>
      </div>
    </Card>
  );

  const activeDebts = data.debts.filter(d => d.remainingMonths > 0);

  return (
    <div style={{ padding: "20px 16px 100px" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: X.g, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: ff, padding: 0, marginBottom: 16 }}>← Geri</button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ color: X.t, fontSize: 16, margin: 0 }}>📌 Borçlar</h3>
        {!editing && <button onClick={startNew} style={{ background: X.gd, border: `1px solid ${X.g}`, borderRadius: 8, padding: "6px 12px", color: X.g, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+ Ekle</button>}
      </div>
      {editing === "new" && editForm}
      {activeDebts.map(d => {
        const sym = debtCurSymbol(d.currency);
        const tlVal = debtTLValue(d, data, cmk());
        const totalM = d.totalMonths || d.remainingMonths;
        const paidCount = totalM - d.remainingMonths;
        return (
          <div key={d.id}>
            <Card s={{ marginBottom: editing === d.id ? 0 : 8, borderRadius: editing === d.id ? "14px 14px 0 0" : 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: X.t, fontWeight: 700 }}>{d.name}</div>
                  <div style={{ color: X.tm, fontSize: 12 }}>
                    <span style={{ fontFamily: fm }}>{d.monthlyPayment.toFixed(2)} {sym}</span>
                    {d.currency !== "TRY" && <span style={{ color: X.td }}> ({C(tlVal)})</span>}
                    <span> /ay</span>
                  </div>
                  <div style={{ color: X.td, fontSize: 11, marginTop: 2 }}>
                    {paidCount}/{totalM} taksit ödendi • {d.remainingMonths} ay kaldı
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => editing === d.id ? cancel() : startEdit(d)} style={{ background: X.bd, border: `1px solid ${X.b}`, borderRadius: 6, padding: "4px 10px", color: X.b, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{editing === d.id ? "▲" : "✎"}</button>
                  <button onClick={() => rm(d.id)} style={{ background: X.rd, border: `1px solid ${X.r}`, borderRadius: 6, padding: "4px 10px", color: X.r, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>✕</button>
                </div>
              </div>
            </Card>
            {editing === d.id && <div style={{ marginBottom: 8 }}>{editForm}</div>}
          </div>
        );
      })}
    </div>
  );
}

function MonthCloseRitual({ data, setData, prevMk, onClose }) {
  const prev = calcMonth(data, prevMk, null);
  const risk = useMemo(() => calcRisk(data, prevMk), [data, prevMk]);
  const riskInfo = getRiskInfo(risk.score);
  const newMk = nmk(prevMk);
  const [newBudget, setNewBudget] = useState(String(prev.baseBudget));
  const hasSurplus = prev.remaining > 0;

  const motivation = hasSurplus
    ? risk.score < 30 ? "Tebrikler! Bütçenizi iyi yönettiniz ve birikim yaptınız." : "Birikim yaptınız, ancak risk skoru dikkat gerektiriyor."
    : "Bu ay açık verdiniz. Önümüzdeki ay daha dikkatli olmak gerekiyor.";

  const finalize = () => {
    const budget = parseFloat(newBudget) || data.settings.monthlyBudget;
    setData(d => {
      const newSavings = { ...d.savings };
      if (hasSurplus) {
        const list = [...(newSavings.TRY || [])];
        // Ayın son günü tarihi
        const [y, mo] = prevMk.split("-").map(Number);
        const lastDay = new Date(y, mo, 0).toISOString().slice(0, 10);
        list.push({
          id: uid(),
          type: "buy",
          amount: prev.remaining,
          unitPrice: 1,
          date: lastDay,
          source: "monthly_close",
          note: `${ml(prevMk)} ayından otomatik`
        });
        newSavings.TRY = list;
      }
      // Yeni ay bütçesini tanımla
      const newMonths = { ...d.months };
      if (!newMonths[newMk]) newMonths[newMk] = DM();
      newMonths[newMk] = { ...newMonths[newMk], budget };
      return { ...d, savings: newSavings, months: newMonths, lastClosedMonth: prevMk };
    });
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", backdropFilter: "blur(12px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16 }}>
      <div style={{ ...glassSolid, borderRadius: 20, width: "100%", maxWidth: 440, maxHeight: "90vh", overflow: "auto", padding: 24, boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📅</div>
          <div style={{ color: X.t, fontSize: 18, fontWeight: 800, fontFamily: ff }}>Ay Kapatma</div>
          <div style={{ color: X.tm, fontSize: 12, marginTop: 4 }}>{ml(prevMk)} ayını kapatıp {ml(newMk)} ayını başlatın</div>
        </div>

        <Card s={{ marginBottom: 12, background: "rgba(160,190,200,0.50)", border: `1px solid ${X.border}` }}>
          <div style={{ color: X.tm, fontSize: 12, fontWeight: 700, marginBottom: 10 }}>ÖNCEKİ AY ÖZETİ</div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
            <span style={{ color: X.t }}>Bütçe</span>
            <span style={{ color: X.t, fontFamily: fm, fontWeight: 700 }}>{C(prev.baseBudget)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
            <span style={{ color: X.t }}>Harcama</span>
            <span style={{ color: X.t, fontFamily: fm, fontWeight: 700 }}>{C(prev.totalSpent)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13, borderTop: `1px solid ${X.border}`, marginTop: 4, paddingTop: 8 }}>
            <span style={{ color: X.t, fontWeight: 700 }}>Kalan</span>
            <span style={{ color: prev.remaining >= 0 ? X.g : X.r, fontFamily: fm, fontWeight: 800, fontSize: 15 }}>{C(prev.remaining)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
            <span style={{ color: X.t }}>Risk Skoru</span>
            <span style={{ color: riskInfo.color, fontFamily: fm, fontWeight: 700 }}>{risk.score} ({riskInfo.label})</span>
          </div>
        </Card>

        {hasSurplus ? (
          <Card s={{ marginBottom: 12, background: "rgba(15,118,110,0.35)", border: "1px solid rgba(15,118,110,0.30)" }}>
            <div style={{ color: X.g, fontSize: 13, fontWeight: 700, marginBottom: 4 }}>💰 TL Birikiminize Eklendi</div>
            <div style={{ color: X.t, fontSize: 20, fontWeight: 800, fontFamily: fm }}>+{C(prev.remaining)}</div>
            <div style={{ color: X.tm, fontSize: 11, marginTop: 4 }}>{motivation}</div>
          </Card>
        ) : (
          <Card s={{ marginBottom: 12, background: X.od, border: `1px solid ${X.o}` }}>
            <div style={{ color: X.o, fontSize: 13, fontWeight: 700, marginBottom: 4 }}>⚠️ Bu Ay Birikim Yok</div>
            <div style={{ color: X.tm, fontSize: 11 }}>{motivation}</div>
          </Card>
        )}

        <Card s={{ marginBottom: 16 }}>
          <div style={{ color: X.tm, fontSize: 12, fontWeight: 700, marginBottom: 10 }}>YENİ AY BÜTÇESİ ({ml(newMk)})</div>
          <Inp label="Bu ay için bütçeniz" type="number" value={newBudget} onChange={setNewBudget} suffix="₺" />
        </Card>

        <Btn onClick={finalize} c={X.g}>✓ Kapat ve Yeni Ayı Başlat</Btn>
      </div>
    </div>
  );
}

/* ═══ MAIN ═══ */
function LoginScreen({ pendingInvite, setPendingInvite }) {
  const [name, setName] = useState("");
  const [pass, setPass] = useState("");
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [invCode, setInvCode] = useState("");
  const [invData, setInvData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!name || !pass) { setErr("İsim ve şifre gerekli"); return; }
    setLoading(true); setErr("");
    try {
      const found = await lookupName(name);
      if (found) {
        await signInWithEmailAndPassword(auth, found.email, pass);
      } else if (name.includes("@")) {
        // E-posta ile giriş (eski hesaplarla uyumluluk)
        setPendingInvite({ type: "migrateName", name });
        await signInWithEmailAndPassword(auth, name, pass);
      } else {
        setErr("Bu isimle kayıtlı hesap yok. İlk girişte e-postanızı kullanın.");
      }
    } catch (e) {
      if (e.code === "auth/wrong-password" || e.code === "auth/invalid-credential") setErr("Şifre yanlış.");
      else if (e.code === "auth/user-not-found") setErr("Hesap bulunamadı.");
      else setErr(e.message);
      setPendingInvite(null);
    }
    setLoading(false);
  };

  const handleRegister = async () => {
    if (!name || !email || !pass) { setErr("Tüm alanları doldurun"); return; }
    if (pass.length < 6) { setErr("Şifre en az 6 karakter olmalı"); return; }
    setLoading(true); setErr("");
    try {
      const existing = await lookupName(name);
      if (existing) { setErr("Bu isim zaten kayıtlı. Giriş yapın."); setLoading(false); return; }
      setPendingInvite({ type: "newAdmin", name, email });
      await createUserWithEmailAndPassword(auth, email, pass);
    } catch (e) {
      if (e.code === "auth/email-already-in-use") setErr("Bu e-posta zaten kayıtlı.");
      else if (e.code === "auth/invalid-email") setErr("Geçersiz e-posta adresi.");
      else setErr(e.message);
      setPendingInvite(null);
    }
    setLoading(false);
  };

  const handleCheckInvite = async () => {
    if (!invCode || invCode.length !== 6) { setErr("6 haneli davet kodunu girin"); return; }
    setLoading(true); setErr("");
    try {
      const inv = await lookupInvitation(invCode);
      if (!inv) { setErr("Geçersiz veya kullanılmış davet kodu."); setLoading(false); return; }
      setInvData(inv);
      setName(inv.name);
      setEmail(inv.email);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  };

  const handleInviteRegister = async () => {
    if (!pass || pass.length < 6) { setErr("Şifre en az 6 karakter olmalı"); return; }
    setLoading(true); setErr("");
    try {
      setPendingInvite({ type: "invite", code: invCode, invData });
      await createUserWithEmailAndPassword(auth, invData.email, pass);
    } catch (e) {
      if (e.code === "auth/email-already-in-use") setErr("Bu e-posta zaten kayıtlı. Yöneticinizden yeni kod isteyin.");
      else setErr(e.message);
      setPendingInvite(null);
    }
    setLoading(false);
  };

  return (
    <div style={{ background: THEMES[_tid].gradient, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: ff, padding: 16 }}>
      <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <div style={{ ...glassSolid, borderRadius: 20, width: "100%", maxWidth: 380, padding: 28, boxShadow: neu }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>💰</div>
          <div style={{ color: X.t, fontSize: 22, fontWeight: 800 }}>EV BÜTÇESİ</div>
          <div style={{ color: X.tm, fontSize: 13, marginTop: 4 }}>{mode === "login" ? "Giriş yap" : mode === "register" ? "Yeni hesap oluştur" : "Davet ile katıl"}</div>
        </div>
        {err && <div style={{ background: X.rd, border: `1px solid ${X.r}`, borderRadius: 10, padding: "8px 12px", marginBottom: 12, color: X.r, fontSize: 12, fontWeight: 600 }}>{err}</div>}

        {mode === "login" && (<>
          <Inp label="İsim Soyisim" value={name} onChange={setName} placeholder="Örn: Abdullah Şehid Huca" />
          <Inp label="Şifre" type="password" value={pass} onChange={setPass} placeholder="••••••" />
          <Btn onClick={handleLogin} disabled={loading}>{loading ? "Giriş yapılıyor..." : "Giriş Yap"}</Btn>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginTop: 16 }}>
            <button onClick={() => { setMode("register"); setErr(""); }} style={{ background: "none", border: "none", color: X.b, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: ff }}>Hesabım yok → Kayıt Ol</button>
            <button onClick={() => { setMode("invite"); setErr(""); }} style={{ background: "none", border: "none", color: X.g, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: ff }}>🔑 Davet kodum var</button>
          </div>
        </>)}

        {mode === "register" && (<>
          <Inp label="İsim Soyisim" value={name} onChange={setName} placeholder="Örn: Abdullah Şehid Huca" />
          <Inp label="E-posta" value={email} onChange={setEmail} placeholder="ornek@gmail.com" />
          <Inp label="Şifre" type="password" value={pass} onChange={setPass} placeholder="En az 6 karakter" />
          <Btn onClick={handleRegister} disabled={loading}>{loading ? "Kayıt yapılıyor..." : "Kayıt Ol"}</Btn>
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <button onClick={() => { setMode("login"); setErr(""); }} style={{ background: "none", border: "none", color: X.b, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: ff }}>← Giriş Yap</button>
          </div>
        </>)}

        {mode === "invite" && !invData && (<>
          <Inp label="Davet Kodu" value={invCode} onChange={setInvCode} placeholder="6 haneli kod" />
          <Btn onClick={handleCheckInvite} disabled={loading} c={X.g}>{loading ? "Kontrol ediliyor..." : "Kodu Kontrol Et"}</Btn>
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <button onClick={() => { setMode("login"); setErr(""); setInvData(null); }} style={{ background: "none", border: "none", color: X.b, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: ff }}>← Giriş Yap</button>
          </div>
        </>)}

        {mode === "invite" && invData && (<>
          <div style={{ background: X.gd, border: `1px solid ${X.g}`, borderRadius: 10, padding: 12, marginBottom: 12, textAlign: "center" }}>
            <div style={{ color: X.g, fontSize: 13, fontWeight: 700 }}>Hoş geldiniz!</div>
            <div style={{ color: X.t, fontSize: 18, fontWeight: 800, marginTop: 4 }}>{invData.name}</div>
          </div>
          <Inp label="Şifrenizi belirleyin" type="password" value={pass} onChange={setPass} placeholder="En az 6 karakter" />
          <Btn onClick={handleInviteRegister} disabled={loading} c={X.g}>{loading ? "Hesap oluşturuluyor..." : "Hesap Oluştur ve Katıl"}</Btn>
        </>)}
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [family, setFamily] = useState(null);
  const [familyLoading, setFamilyLoading] = useState(true);
  const [pendingInvite, setPendingInvite] = useState(null);
  const [data, setData] = useState(DD);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("home");
  const [headerDetail, setHeaderDetail] = useState(null);
  const mk = cmk();
  applyTheme(data?.settings?.theme || "default");
  const _theme = THEMES[data?.settings?.theme] || THEMES.default;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => { setUser(u); setAuthLoading(false); });
    return unsub;
  }, []);

  // Kullanıcı giriş yaptığında: aile bilgisini kontrol et veya oluştur
  useEffect(() => {
    if (!user) { setFamily(null); setFamilyLoading(false); setLoaded(false); return; }
    setFamilyLoading(true);

    (async () => {
      // Önce mevcut aile kaydını kontrol et
      let f = await getUserFamily(user.uid);

      // Aile kaydı yoksa ve pendingInvite varsa: yeni aile oluştur veya davete katıl
      if (!f && pendingInvite) {
        if (pendingInvite.type === "newAdmin") {
          await migrateOldData(user.uid);
          f = await createFamily(user.uid, user.email, pendingInvite.name);
        } else if (pendingInvite.type === "invite") {
          f = await joinViaInvitation(user.uid, pendingInvite.code, pendingInvite.invData);
        } else if (pendingInvite.type === "migrateName") {
          const displayName = prompt("Giriş adınızı belirleyin (İsim Soyisim):");
          if (displayName && displayName.trim()) {
            await migrateOldData(user.uid);
            f = await createFamily(user.uid, user.email, displayName.trim());
          }
        }
        setPendingInvite(null);
      }

      setFamily(f);
      setFamilyLoading(false);
    })();
  }, [user]);

  useEffect(() => {
    if (!user || !family?.familyId) { setLoaded(false); return; }
    let unsubValue = null;
    loadDB(family.familyId).then(d => {
      if (d) setData({ ...DD, ...d, settings: { ...DD.settings, ...(d.settings || {}) }, liveRates: d.liveRates || DD.liveRates, savings: { ...DD.savings, ...(d.savings || {}) }, lastClosedMonth: d.lastClosedMonth || null, lastBackup: d.lastBackup || null });
      setLoaded(true);
      unsubValue = onValue(ref(rtdb, `families/${family.familyId}/data`), snap => {
        if (snap.exists()) {
          const r = snap.val();
          setData(prev => {
            if (JSON.stringify(r) !== JSON.stringify(prev)) {
              return { ...DD, ...r, settings: { ...DD.settings, ...(r.settings || {}) }, liveRates: r.liveRates || DD.liveRates, savings: { ...DD.savings, ...(r.savings || {}) }, lastClosedMonth: r.lastClosedMonth || null, lastBackup: r.lastBackup || null };
            }
            return prev;
          });
        }
      }, err => console.warn("Sync hatası:", err));
    });
    return () => { if (unsubValue) unsubValue(); };
  }, [user, family]);

  useEffect(() => { if (loaded && family?.familyId) saveDB(data, family.familyId); }, [data, loaded, family]);

  const isAdmin = family?.role === "admin";
  const gmd = useCallback(m => data.months[m] || DM(), [data.months]);
  const smf = useCallback((m, f, v) => { setData(d => { const ms = { ...d.months }; const md = { ...(ms[m] || DM()) }; md[f] = v; ms[m] = md; return { ...d, months: ms }; }); }, []);

  const pendingCloseMk = useMemo(() => {
    if (!loaded) return null;
    const last = data.lastClosedMonth;
    const prev = pmk(mk);
    if (!last) { if (data.months[prev]) return prev; return null; }
    const nextToClose = nmk(last);
    if (nextToClose < mk) return nextToClose;
    return null;
  }, [loaded, data.lastClosedMonth, data.months, mk]);

  if (authLoading || familyLoading) return <div style={{ background: _theme.gradientShort, height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: X.g, fontFamily: ff, fontSize: 16 }}>Yükleniyor...</div>;
  if (!user) return <LoginScreen pendingInvite={pendingInvite} setPendingInvite={setPendingInvite} />;
  if (!family) return <div style={{ background: _theme.gradientShort, height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: X.tm, fontFamily: ff, fontSize: 14, padding: 20, textAlign: "center" }}>Aile kaydı bulunamadı. Lütfen çıkış yapıp yeniden kayıt olun veya davet koduyla giriş yapın.<br/><button onClick={() => signOut(auth)} style={{ marginTop: 16, background: X.rd, border: "none", borderRadius: 8, padding: "8px 20px", color: X.r, fontWeight: 700, cursor: "pointer" }}>Çıkış Yap</button></div>;
  if (!loaded) return <div style={{ background: _theme.gradientShort, height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: X.g, fontFamily: ff, fontSize: 16 }}>Veriler yükleniyor...</div>;

  const backupNeeded = needsWeeklyBackup(data);
  const memberLocked = !isAdmin && backupNeeded;

    const c = calcMonth(data, mk, null);
  const headerRisk = useMemo(() => calcRisk(data, mk), [data, mk]);
  const headerRiskColor = (() => { const s = headerRisk.score; if (s >= 70) return "#DC2626"; if (s >= 50) return "#D97706"; if (s >= 30) return "#B45309"; if (s >= 15) return "#84CC16"; return "#0F766E"; })();
  const showHeaderDetail = () => { const bd = getMonthBreakdown(data, mk); setHeaderDetail({ title: `${ml(mk)} — Bütçe Dökümü`, rows: bd.rows, total: bd.mc.remaining, totalLabel: "Kalan bütçe", totalColor: bd.mc.remaining > bd.mc.effectiveBudget * 0.1 ? X.g : bd.mc.remaining >= 0 ? X.w : X.r }); };

  return (
    <div style={{ background: _theme.gradient, minHeight: "100vh", color: X.t, fontFamily: ff, maxWidth: 480, margin: "0 auto", position: "relative" }}>
      <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      {/* Renk lekeleri */}
      <div style={{ position: "fixed", top: 60, left: -50, width: 200, height: 200, borderRadius: "50%", background: "rgba(22,163,74,0.07)", filter: "blur(60px)", pointerEvents: "none" }} />
      <div style={{ position: "fixed", top: 280, right: -40, width: 170, height: 170, borderRadius: "50%", background: "rgba(37,99,235,0.06)", filter: "blur(50px)", pointerEvents: "none" }} />
      <div style={{ position: "fixed", bottom: 250, left: 10, width: 140, height: 140, borderRadius: "50%", background: "rgba(124,58,237,0.05)", filter: "blur(45px)", pointerEvents: "none" }} />
      <div style={{ ...glassSolid, borderBottom: "none", borderRadius: "0 0 18px 18px", padding: "calc(12px + env(safe-area-inset-top)) 16px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 50, boxShadow: "0 4px 16px rgba(0,0,0,0.06)" }}>
        <div><div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.3px", color: X.t }}>EV BÜTÇESİ</div><div style={{ fontSize: 11, color: X.td }}>{ml(mk)}</div></div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Risk Circle */}
          <div onClick={() => setTab("report")} style={{ position: "relative", width: 36, height: 36, cursor: "pointer", flexShrink: 0 }}>
            <svg width="36" height="36" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="3" />
              <circle cx="18" cy="18" r="15" fill="none" stroke={headerRiskColor} strokeWidth="3" strokeDasharray={`${94.2}`} strokeDashoffset={`${94.2 * (1 - headerRisk.score / 100)}`} strokeLinecap="round" transform="rotate(-90 18 18)" />
            </svg>
            <span style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", fontSize: 11, fontWeight: 800, color: headerRiskColor, fontFamily: fm }}>{headerRisk.score}</span>
          </div>
          {/* Bütçe rakamları */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }} onClick={showHeaderDetail}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 9, color: X.tm, fontWeight: 700, letterSpacing: 0.3, marginBottom: 2 }}>AYLIK BÜTÇE</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: X.t, fontFamily: fm }}>{C(c.effectiveBudget)}</div>
            </div>
            <div style={{ color: X.td, fontSize: 14, fontWeight: 300 }}>/</div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 9, color: X.tm, fontWeight: 700, letterSpacing: 0.3, marginBottom: 2 }}>KALAN BÜTÇE</div>
              <div style={{ fontSize: 14, fontWeight: 800, fontFamily: fm, borderBottom: "1px dotted rgba(0,0,0,0.2)", paddingBottom: 1, color: (() => { const pct = c.effectiveBudget > 0 ? c.remaining / c.effectiveBudget : 0; if (c.remaining < 0) return X.r; if (pct < 0.1) return X.r; if (pct < 0.2) return "#FF6B35"; if (pct < 0.35) return X.w; if (pct < 0.5) return "#84CC16"; return X.g; })() }}>{C(c.remaining)}</div>
            </div>
          </div>
        </div>
      </div>
      {/* Üye yedekleme kilidi */}
      {memberLocked && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ ...glassSolid, borderRadius: 16, padding: 24, maxWidth: 340, textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>⚠️</div>
            <div style={{ color: X.w, fontSize: 15, fontWeight: 800, marginBottom: 8 }}>Yedekleme Gerekli</div>
            <div style={{ color: X.tm, fontSize: 13, lineHeight: 1.6 }}>Haftalık yedekleme süresi doldu. Veri girişi yapabilmek için yöneticinin yedek alması gerekiyor.</div>
          </div>
        </div>
      )}
      {tab === "home" && <Dashboard data={data} mk={mk} gmd={gmd} setMonthField={smf} setData={setData} />}
      {tab === "report" && <AnalysisScreen data={data} setData={setData} mk={mk} />}
      {tab === "plan" && <PlanningScreen data={data} setData={setData} mk={mk} />}
      {tab === "settings" && <Settings data={data} setData={setData} isAdmin={isAdmin} family={family} />}
      <TabBar tab={tab} setTab={setTab} />
      {pendingCloseMk && <MonthCloseRitual data={data} setData={setData} prevMk={pendingCloseMk} onClose={() => { }} />}
      {!pendingCloseMk && isAdmin && needsWeeklyBackup(data) && <WeeklyBackupRitual data={data} setData={setData} />}
      {headerDetail && <DetailModal {...headerDetail} onClose={() => setHeaderDetail(null)} />}
    </div>
  );
}
