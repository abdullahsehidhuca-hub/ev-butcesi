import React, { useState, useEffect, useMemo, useCallback } from "react";
import * as Papa from "papaparse";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, get, onValue } from "firebase/database";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink, updatePassword } from "firebase/auth";

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

const MIN_TL_SAVINGS_PCT = 0.15;   // toplam birikimin en az %15'i TL olmalı

const DD = { settings: { monthlyBudget: 0, fixedExpenses: [], variableExpenses: [], cards: [], emergencyFundTarget: null, billTypes: [], generalCardBudget: 0, emergencyTampon: 0, ccPaymentMode: "instant", onboardingCompleted: null }, months: {}, installmentPlans: [], debts: [], savingsGoals: [], completedGoals: [], plannedEvents: [], completedEvents: [], merchantMap: {}, goldRates: {}, usdRates: {}, eurRates: {}, liveRates: { USD: null, EUR: null, XAU: null, fetchedAt: null }, savings: { TRY: [], USD: [], EUR: [], XAU: [] }, lastClosedMonth: null, lastBackup: null };
const DM = () => ({ budget: null, fixedPaid: {}, variableEntries: {}, ccSingle: [], accountEntries: [], accountTransferred: {}, cardLoaded: 0, cardEntries: [], debtPayments: {}, ccTransferred: {}, csvByCard: {}, finalSavings: null, receipts: [] });

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
  const lsKey = familyId ? `${STORAGE_KEY}_${familyId}` : STORAGE_KEY;
  try {
    if (familyId) {
      const snap = await get(ref(rtdb, `families/${familyId}/data`));
      if (snap.exists()) {
        const data = snap.val();
        try { localStorage.setItem(lsKey, JSON.stringify(data)); } catch {}
        return data;
      }
    }
  } catch (e) { console.warn("Firebase okuma hatası:", e); }
  try { const r = localStorage.getItem(lsKey); if (r) return JSON.parse(r); } catch {}
  return null;
}

async function saveDB(d, familyId) {
  const lsKey = familyId ? `${STORAGE_KEY}_${familyId}` : STORAGE_KEY;
  const clean = JSON.parse(JSON.stringify(d));
  if (clean.settings) delete clean.settings.claudeApiKey;
  try { if (familyId) await set(ref(rtdb, `families/${familyId}/data`), clean); } catch (e) { console.warn("Firebase kayıt hatası:", e); }
  try { localStorage.setItem(lsKey, JSON.stringify(d)); } catch {}
  // Günlük otomatik snapshot
  if (familyId) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const snapKey = `_autoBackup_${familyId}`;
      const lastSnap = localStorage.getItem(snapKey);
      if (lastSnap !== today) {
        await set(ref(rtdb, `backups/${familyId}/${today}`), clean);
        localStorage.setItem(snapKey, today);
        // Son 7 günden eski yedekleri temizle
        const snapsRef = ref(rtdb, `backups/${familyId}`);
        const snaps = await get(snapsRef);
        if (snaps.exists()) {
          const keys = Object.keys(snaps.val()).sort();
          if (keys.length > 7) {
            const toDelete = keys.slice(0, keys.length - 7);
            for (const k of toDelete) await set(ref(rtdb, `backups/${familyId}/${k}`), null);
          }
        }
      }
    } catch (e) { console.warn("Otomatik yedek hatası:", e); }
  }
}

async function listBackups(familyId) {
  try {
    const snap = await get(ref(rtdb, `backups/${familyId}`));
    if (snap.exists()) return Object.keys(snap.val()).sort().reverse();
  } catch {}
  return [];
}

async function restoreBackup(familyId, date) {
  try {
    const snap = await get(ref(rtdb, `backups/${familyId}/${date}`));
    if (snap.exists()) {
      const data = snap.val();
      await set(ref(rtdb, `families/${familyId}/data`), data);
      return data;
    }
  } catch (e) { console.warn("Yedek geri yükleme hatası:", e); }
  return null;
}

async function deleteDB(familyId) {
  const lsKey = familyId ? `${STORAGE_KEY}_${familyId}` : STORAGE_KEY;
  try { if (familyId) await set(ref(rtdb, `families/${familyId}/data`), null); } catch {}
  try { localStorage.removeItem(lsKey); } catch {}
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
function ItemRow({ label, value, sub, color = X.t, onAction, actionLabel, onEdit, onDelete, toggle: toggled, toggleOn, toggleOff, toggleLabelOn, toggleLabelOff }) { return (<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(0,0,0,0.06)" }}><div style={{ flex: 1, minWidth: 0 }}><div style={{ color: X.t, fontSize: 13, fontWeight: 600 }}>{label}</div>{sub && <div style={{ color: X.td, fontSize: 11 }}>{sub}</div>}</div><div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}><span style={{ color, fontWeight: 700, fontFamily: fm, fontSize: 14 }}>{typeof value === "number" ? C(value) : value}</span>{onEdit && <button onClick={e => { e.stopPropagation(); onEdit(); }} style={{ background: "none", border: "none", color: X.b, fontSize: 18, cursor: "pointer", padding: "6px 8px", minWidth: 36, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center" }}>✎</button>}{onDelete && <button onClick={e => { e.stopPropagation(); if(confirm("Bu kaydı silmek istediğinize emin misiniz?")) onDelete(); }} style={{ background: "none", border: "none", color: X.r, fontSize: 18, cursor: "pointer", padding: "6px 8px", minWidth: 36, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>}{toggleOn && toggleOff && (<button onClick={e => { e.stopPropagation(); toggled ? toggleOff() : toggleOn(); }} style={{ display: "flex", alignItems: "center", gap: 3, background: toggled ? "#F0FDF4" : "#FFF7ED", border: `1px solid ${toggled ? "#86EFAC" : "#FDBA74"}`, borderRadius: 5, padding: "3px 8px", cursor: "pointer", fontFamily: ff, fontSize: 11, color: toggled ? "#15803D" : "#C2410C", whiteSpace: "nowrap", lineHeight: 1.4 }}>{toggled && <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><polyline points="1,5.5 3.8,8.5 9,1.5" stroke="#15803D" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>}<span>{toggled ? (toggleLabelOn || "Tamam") : (toggleLabelOff || "Bekliyor")}</span></button>)}{onAction && !toggleOn && <button onClick={e => { e.stopPropagation(); onAction(); }} style={{ background: "rgba(22,163,74,0.1)", border: "none", borderRadius: 8, padding: "5px 10px", color: X.g, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: ff }}>{actionLabel || "✓"}</button>}</div></div>); }

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
    const md = data.months[m] || DM();
    const csvByCard = md.csvByCard || {};
    const byType = {};
    let total = 0;
    const processTx = (desc, amount) => {
      const btId = matchCustomBillType(desc, billTypes);
      if (!btId || btId === "_fatura_other") return;
      byType[btId] = (byType[btId] || 0) + amount;
      total += amount;
    };
    Object.values(csvByCard).forEach(cardData => {
      (cardData.transactions || []).forEach(t => processTx(t.desc, t.amount));
    });
    (md.accountEntries || []).forEach(e => processTx(e.note || "", e.amount));
    (md.ccSingle || []).forEach(e => processTx((e.note || "") + " " + (e.merchantName || ""), e.amount));
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

  // CC tek çekim harcamaları — taksitler SAYILMAZ (ayrı katman)
  (md.ccSingle || []).forEach(e => {
    const cat = tryMatch(e, (e.note || "") + " " + (e.merchantName || ""));
    if (cat && result[cat] !== undefined) result[cat] += e.amount;
    else result._uncategorized += e.amount;
  });

  // Hesaptan ödeme harcamaları
  (md.accountEntries || []).forEach(e => {
    const cat = tryMatch(e, (e.note || ""));
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

// Kategori bazlı nesne döndürür: { [veId]: tutar }
function getCategorizedByType(data, mk) {
  const { categories: cats } = categorizeMonthSpending(data, mk);
  const result = {};
  Object.entries(cats).filter(([k]) => k !== "_uncategorized").forEach(([k, v]) => { result[k] = v; });
  return result;
}


// Average CC single from past 3 months
function getCCSingleAvg(data, m) {
  const past = [pmk(m), pmk(pmk(m)), pmk(pmk(pmk(m)))];
  const vals = past.map(pm => { const pmd = data.months[pm]; if (!pmd) return 0; return (pmd.ccSingle || []).reduce((s, e) => s + e.amount, 0) + (pmd.accountEntries || []).reduce((s, e) => s + e.amount, 0); }).filter(t => t > 0);
  return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
}

function calcMonth(data, m, extraInst) {
  const md = data.months[m] || DM();
  const baseBudget = md.budget || data.settings.monthlyBudget;
  let carryoverDeficit = 0;
  if (data.months[pmk(m)]) { const pr = calcFlat(data, pmk(m), extraInst); if (pr.remaining < 0) carryoverDeficit = Math.abs(pr.remaining); }
  const effectiveBudget = baseBudget - carryoverDeficit;

  // Sabit giderler
  const fixedTotal = data.settings.fixedExpenses.reduce((s, e) => s + e.amount, 0);
  const fixedCC = data.settings.fixedExpenses.filter(e => e.paymentMethod === "cc").reduce((s, e) => s + e.amount, 0);

  // Taksitler
  let installmentTotal = data.installmentPlans.reduce((s, p) => { let c = p.startMonth; for (let i = 0; i < p.months; i++) { if (c === m) return s + p.monthlyPayment; c = nmk(c); } return s; }, 0);
  if (extraInst) { let c = extraInst.startMonth; for (let i = 0; i < extraInst.months; i++) { if (c === m) { installmentTotal += extraInst.monthlyPayment; break; } c = nmk(c); } }

  // Borçlar
  const debtTotal = data.debts.filter(d => d.remainingMonths > 0).reduce((s, d) => {
    if (d.currency === "TRY") return s + d.monthlyPayment;
    if (d.currency === "USD") { const rate = data.liveRates?.USD || data.usdRates?.[m] || 0; return s + d.monthlyPayment * rate; }
    if (d.currency === "EUR") { const rate = data.liveRates?.EUR || data.eurRates?.[m] || 0; return s + d.monthlyPayment * rate; }
    if (d.currency === "XAU") { const rate = data.liveRates?.XAU || data.goldRates?.[m] || data.goldRates?.[cmk()] || 0; return s + d.monthlyPayment * rate; }
    return s;
  }, 0);

  // Konfor harcaması kartı (sabit bütçe)
  const generalCardBudget = data.settings.generalCardBudget || 0;
  const cardLoaded = md.cardLoaded || 0;
  const cardLoadRemaining = Math.max(0, generalCardBudget - cardLoaded);
  const cardLoadMaxPerTx = generalCardBudget;
  const cardLoadMaxTotal = generalCardBudget;
  const cardUsable = generalCardBudget;
  const availableForCard = cardLoadRemaining;

  // Acil tampon (ayarlardan sabit)
  const emergencyBuffer = data.settings.emergencyTampon || 0;

  // Değişken gider tahmini: kategori bazında 3 aylık ortalama
  const ves = data.settings.variableExpenses || [];
  const variableEstimate = ves.reduce((s, ve) => {
    const past3 = [pmk(pmk(pmk(m))), pmk(pmk(m)), pmk(m)].map(pm => {
      const pmd = data.months[pm] || DM();
      const ccAmt = (pmd.ccSingle || []).filter(e => e.categoryId === ve.id).reduce((a, e) => a + e.amount, 0);
      const accAmt = (pmd.accountEntries || []).filter(e => e.categoryId === ve.id).reduce((a, e) => a + e.amount, 0);
      return ccAmt + accAmt;
    }).filter(t => t > 0);
    const avg = past3.length >= 2 ? Math.round(past3.reduce((a, b) => a + b, 0) / past3.length) : (ve.expectedAmount || 0);
    return s + avg;
  }, 0);

  // Fiili harcamalar
  const ccSingleTotal = (md.ccSingle || []).reduce((s, e) => s + e.amount, 0);
  const accountTotal = (md.accountEntries || []).reduce((s, e) => s + e.amount, 0);

  // Kategorize (ccSingle + accountEntries birlikte)
  const { categories: cats } = categorizeMonthSpending(data, m);
  const categorizedTotal = Object.entries(cats).filter(([k]) => k !== "_uncategorized").reduce((s, [, v]) => s + v, 0);
  const uncategorizedAcc = (md.accountEntries || []).filter(e => !e.categoryId || !ves.find(ve => ve.id === e.categoryId)).reduce((s, e) => s + e.amount, 0);
  const uncategorizedCC2 = (md.ccSingle || []).filter(e => !e.categoryId || !ves.find(ve => ve.id === e.categoryId)).reduce((s, e) => s + e.amount, 0);
  const categorizedCC = Object.entries(cats).filter(([k]) => k !== "_uncategorized").reduce((s, [, v]) => s + v, 0);
  const uncategorizedCC = cats._uncategorized || 0;
  const variableTotal = categorizedTotal;

  // Ekstre modu: KK harcamaları sonraki ayın bütçesinden düşülür
  const isEkstre = data.settings.ccPaymentMode === "ekstre";
  const prevMd = isEkstre ? (data.months[pmk(m)] || DM()) : null;

  // Ekstre modunda önceki ayın KK tek çekim toplamı (bu ay ödenmesi gereken)
  const ekstreCCSingleTotal = isEkstre ? (prevMd.ccSingle || []).reduce((s, e) => s + e.amount, 0) : 0;
  // Ekstre modunda önceki ayın taksit toplamı
  const ekstreInstTotal = isEkstre ? data.installmentPlans.reduce((s, p) => { let c = p.startMonth; for (let i = 0; i < p.months; i++) { if (c === pmk(m)) return s + p.monthlyPayment; c = nmk(c); } return s; }, 0) : 0;

  // === A GRUBU: Bankadan gerçekten çıkmış ===
  const paidFixedAcc = data.settings.fixedExpenses.filter(e => e.paymentMethod === "account" && md.fixedPaid?.[e.id]).reduce((s, e) => s + e.amount, 0);

  // Ekstre modunda: aktarımlar önceki ayın harcamalarına karşı yapılır
  const transferredCC = isEkstre
    ? (prevMd.ccSingle || []).filter(e => md.ccTransferred?.[`prev-single-${e.id}`]?.transferred).reduce((s, e) => s + e.amount, 0)
    : (md.ccSingle || []).filter(e => md.ccTransferred?.[`single-${e.id}`]?.transferred).reduce((s, e) => s + e.amount, 0);
  const transferredFixedCC = isEkstre
    ? data.settings.fixedExpenses.filter(e => e.paymentMethod === "cc" && md.ccTransferred?.[`prev-fixed-${e.id}`]?.transferred).reduce((s, e) => s + e.amount, 0)
    : data.settings.fixedExpenses.filter(e => e.paymentMethod === "cc" && md.ccTransferred?.[`fixed-${e.id}`]?.transferred).reduce((s, e) => s + e.amount, 0);

  const transferredInst = installmentTotal > 0 && md.ccTransferred?.["inst-all"]?.transferred ? installmentTotal : 0;
  const transferredInstByPlan = data.installmentPlans.reduce((s, p) => {
    let cur = p.startMonth;
    const targetMonth = isEkstre ? pmk(m) : m;
    for (let i = 0; i < p.months; i++) {
      if (cur === targetMonth) {
        const key = isEkstre ? `prev-inst-${p.id}` : `inst-${p.id}`;
        if (md.ccTransferred?.[key]?.transferred) return s + p.monthlyPayment;
        break;
      }
      cur = nmk(cur);
    }
    return s;
  }, 0);
  const totalTransferredInst = Math.max(transferredInst, transferredInstByPlan);
  const transferredAcc = (md.accountEntries || []).filter(e => md.accountTransferred?.[e.id]?.transferred).reduce((s, e) => s + e.amount, 0);
  const groupA = paidFixedAcc + transferredCC + transferredFixedCC + cardLoaded + transferredAcc + totalTransferredInst;

  // === B GRUBU: Kesin çıkacak ama henüz çıkmamış ===
  const unpaidFixedAcc = data.settings.fixedExpenses.filter(e => e.paymentMethod === "account" && !md.fixedPaid?.[e.id]).reduce((s, e) => s + e.amount, 0);

  // Ekstre modunda: bu ayki KK harcamaları bütçeyi etkilemez, önceki ayınkiler etkilir
  const untransferredCC = isEkstre
    ? (prevMd.ccSingle || []).filter(e => !md.ccTransferred?.[`prev-single-${e.id}`]?.transferred).reduce((s, e) => s + e.amount, 0)
    : (md.ccSingle || []).filter(e => !md.ccTransferred?.[`single-${e.id}`]?.transferred).reduce((s, e) => s + e.amount, 0);
  const untransferredFixedCC = isEkstre
    ? data.settings.fixedExpenses.filter(e => e.paymentMethod === "cc" && !md.ccTransferred?.[`prev-fixed-${e.id}`]?.transferred).reduce((s, e) => s + e.amount, 0)
    : data.settings.fixedExpenses.filter(e => e.paymentMethod === "cc" && !md.ccTransferred?.[`fixed-${e.id}`]?.transferred).reduce((s, e) => s + e.amount, 0);

  const untransferredAcc = (md.accountEntries || []).filter(e => !md.accountTransferred?.[e.id]?.transferred).reduce((s, e) => s + e.amount, 0);
  // Ekstre modunda taksitler de önceki aydan gelir
  const effectiveInstTotal = isEkstre ? ekstreInstTotal : installmentTotal;
  const untransferredInst = effectiveInstTotal - totalTransferredInst;
  const groupB = unpaidFixedAcc + untransferredCC + untransferredFixedCC + untransferredAcc + debtTotal + untransferredInst;

  // Planlı etkinlik kumbara aylık bloke
  const eventKumbaraBloke = (data.plannedEvents || []).reduce((s, ev) => {
    if (!ev.kumbara || !ev.date || ev.date <= m) return s;
    const remaining = ev.kumbara - (ev.kumbaraAccumulated || 0);
    if (remaining <= 0) return s;
    let cur = m, count = 0;
    for (let i = 0; i < 60; i++) { if (cur === ev.date) break; cur = nmk(cur); count++; }
    return s + (count > 0 ? Math.ceil(remaining / count) : remaining);
  }, 0);

  // === C GRUBU: Tahmin (bloke) ===
  const variableBlokeKalan = Math.max(0, variableEstimate - categorizedTotal);
  const cardBlokeKalan = Math.max(0, generalCardBudget - cardLoaded);
  const groupC = variableBlokeKalan + cardBlokeKalan + emergencyBuffer + eventKumbaraBloke;

  // Y = banka bakiyesiyle eşit (sadece A düşülmüş)
  const remainingY = effectiveBudget - groupA;
  // X = bekleyen kesin ödemeler de düşülmüş
  const remainingX = remainingY - groupB;
  // Bloke = B grubu (kesin çıkacak ödemeler)
  const bloke = groupB;
  // remaining (geriye uyumluluk) = X
  const remaining = remainingX;

  // totalSpent: analiz için
  const totalSpent = groupA + groupB;

  // CC transfer needed
  const ccTransferNeeded = data.settings.fixedExpenses.filter(e => e.paymentMethod === "cc").reduce((s, e) => s + e.amount, 0) + ccSingleTotal + installmentTotal;
  const hasActualSpending = ccSingleTotal > 0 || cardLoaded > 0 || accountTotal > 0;
  const expectedVariable = variableEstimate;
  const pendingVariable = variableBlokeKalan;
  const expectedCCSingle = hasActualSpending ? getCCSingleAvg(data, m) : 0;
  const savingsTarget = remainingX;
  const envelopeRemaining = variableBlokeKalan;
  const envelopeOverflow = Math.max(0, categorizedTotal - variableEstimate);
  const unpaidFixed = data.settings.fixedExpenses.filter(e => !md.fixedPaid?.[e.id]).reduce((s, e) => s + e.amount, 0);

  return { effectiveBudget, baseBudget, carryoverDeficit, fixedTotal, variableTotal, ccSingleTotal, accountTotal, installmentTotal, debtTotal, cardLoaded, cardLoadMaxPerTx, cardLoadMaxTotal, cardLoadRemaining, availableForCard, totalSpent, remaining, remainingX, remainingY, savingsTarget, expectedCCSingle, ccTransferNeeded, expectedVariable, pendingVariable, variableEstimate, categorizedCC, uncategorizedCC, envelopeRemaining, envelopeOverflow, emergencyBuffer, cardUsable, generalCardBudget, bloke, groupA, groupB, groupC, unpaidFixed, unpaidFixedAcc, untransferredCC, untransferredFixedCC, untransferredAcc, cardBlokeKalan, variableBlokeKalan, transferredAcc, paidFixedAcc, transferredCC, transferredFixedCC, eventKumbaraBloke };
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
  const generalCardBudget = data.settings.generalCardBudget || 0;
  const emergencyTampon = data.settings.emergencyTampon || 0;
  const ves2 = data.settings.variableExpenses || [];
  const variableEstimate2 = ves2.reduce((s, ve) => {
    const past3 = [pmk(pmk(pmk(m))), pmk(pmk(m)), pmk(m)].map(pm => {
      const pmd2 = data.months[pm] || DM();
      return (pmd2.ccSingle || []).filter(e => e.categoryId === ve.id).reduce((a, e) => a + e.amount, 0) +
             (pmd2.accountEntries || []).filter(e => e.categoryId === ve.id).reduce((a, e) => a + e.amount, 0);
    }).filter(t => t > 0);
    const avg = past3.length >= 2 ? Math.round(past3.reduce((a, b2) => a + b2, 0) / past3.length) : (ve.expectedAmount || 0);
    return s + avg;
  }, 0);
  // Ekstre modu (calcFlat)
  const isEkstreF = data.settings.ccPaymentMode === "ekstre";
  const prevMdF = isEkstreF ? (data.months[pmk(m)] || DM()) : null;
  const effectiveInstF = isEkstreF ? data.installmentPlans.reduce((s, p) => { let c2 = p.startMonth; for (let i2 = 0; i2 < p.months; i2++) { if (c2 === pmk(m)) return s + p.monthlyPayment; c2 = nmk(c2); } return s; }, 0) : inst;

  // A grubu: gerçek çıkışlar
  const paidFixedAccF = (data.settings.fixedExpenses || []).filter(e => e.paymentMethod === "account" && md.fixedPaid?.[e.id]).reduce((s, e) => s + e.amount, 0);
  const ccSourceF = isEkstreF ? prevMdF : md;
  const ccKeyPrefixF = isEkstreF ? "prev-" : "";
  const transferredCCF = (ccSourceF.ccSingle || []).filter(e => md.ccTransferred?.[`${ccKeyPrefixF}single-${e.id}`]?.transferred).reduce((s, e) => s + e.amount, 0);
  const transferredFixedCCF = (data.settings.fixedExpenses || []).filter(e => e.paymentMethod === "cc" && md.ccTransferred?.[`${ccKeyPrefixF}fixed-${e.id}`]?.transferred).reduce((s, e) => s + e.amount, 0);
  const transferredAccF = (md.accountEntries || []).filter(e => md.accountTransferred?.[e.id]?.transferred).reduce((s, e) => s + e.amount, 0);
  const transferredInstF = data.installmentPlans.reduce((s, p) => {
    let cur = p.startMonth;
    const targetMonthF = isEkstreF ? pmk(m) : m;
    for (let i2 = 0; i2 < p.months; i2++) {
      if (cur === targetMonthF) { const key = `${ccKeyPrefixF}inst-${p.id}`; if (md.ccTransferred?.[key]?.transferred || md.ccTransferred?.["inst-all"]?.transferred) return s + p.monthlyPayment; break; }
      cur = nmk(cur);
    }
    return s;
  }, 0);
  const groupAF = paidFixedAccF + transferredCCF + transferredFixedCCF + cl + transferredAccF + transferredInstF;
  const unpaidFixedAccF = (data.settings.fixedExpenses || []).filter(e => e.paymentMethod === "account" && !md.fixedPaid?.[e.id]).reduce((s, e) => s + e.amount, 0);
  const untransferredCCF = (ccSourceF.ccSingle || []).filter(e => !md.ccTransferred?.[`${ccKeyPrefixF}single-${e.id}`]?.transferred).reduce((s, e) => s + e.amount, 0);
  const untransferredFixedCCF = (data.settings.fixedExpenses || []).filter(e => e.paymentMethod === "cc" && !md.ccTransferred?.[`${ccKeyPrefixF}fixed-${e.id}`]?.transferred).reduce((s, e) => s + e.amount, 0);
  const untransferredAccF = (md.accountEntries || []).filter(e => !md.accountTransferred?.[e.id]?.transferred).reduce((s, e) => s + e.amount, 0);
  const untransferredInstF = effectiveInstF - transferredInstF;
  const groupBF = unpaidFixedAccF + untransferredCCF + untransferredFixedCCF + untransferredAccF + dt + untransferredInstF;
  const remainingX = b - groupAF - groupBF;
  const remaining = remainingX;
  return { remaining, totalSpent: groupAF + groupBF };
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
  // Hesaptan ödemeler
  if (mc.accountTotal > 0) {
    rows.push({ label: "Hesaptan ödemeler", value: mc.accountTotal, sign: "−", color: X.g });
  }
  // Kart yükleme
  if (mc.cardLoaded > 0) {
    rows.push({ label: "Konfor harcaması kartı", value: mc.cardLoaded, sign: "−", color: X.g });
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
   * F3: Konfor Harcaması Kartı Kapasitesi (20p) — aylık serbest bütçe kontrolü
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
  cardLoad: { title: "Konfor Harcaması Kartı", text: "Dışarıda yemek, kafe, etkinlik, kıyafet gibi konfor harcamalarınız için kullandığınız banka kartı.\n\nAyarlar'dan belirlediğiniz limit kadar bu karta yükleme yapabilirsiniz. Harcama yaptıkça kalan tutar azalır.\n\nKredi kartı yerine banka kartıyla yapılan konfor harcamaları, bütçenizde anında görünür — ekstre sürprizi olmaz." },
  debt: { title: "Borç Ödemeleri", text: "Aktif borçlarınızın bu ay ödemeniz gereken toplam tutarını gösterir. Türk Lirası, dolar veya altın bazlı borçlarınız olabilir. Dolar ve altın borçları için güncel kur kullanılır.\n\nHer borç ödemesi yaptığınızda 'Ödedim' butonuna basarak teyit edersiniz, kalan taksit sayısı azalır." },
  simulate: { title: "Taksit Simülasyonu", text: "Yeni bir taksitli alım yapmadan önce 'şu kadar X taksitle alırsam bütçem nasıl etkilenir' sorusunu test etmek için kullanılır.\n\nTutar ve taksit sayısını girin, 'Simüle Et' deyin. Uygulama gelecek 6-8 ayın bütçenizin durumunu hem mevcut hem de bu taksitli alımla birlikte gösterir. Güvenliyse 'Onayla ve Kaydet' diyerek doğrudan kredi kartı taksitli kısmına ekleyebilirsiniz." },
  savings: { title: "Birikim", text: "Bu ay bütçeden ne kadar birikim kalacağını gösterir.\n\nKalan Bütçe = Aylık Bütçe − Sabit Giderler − Borçlar − Genel Kart Limiti − Değişken Gider Tahmini − Beklenmeyen Gider Fonu\n\nBu tutar ay boyunca sabit kalır. Ay kapandığında kalan bütçe otomatik olarak TL birikim havuzuna eklenir.\n\nAcil tampon miktarını Ayarlar → Aylık Bütçe bölümünden değiştirebilirsiniz." },
  fixed: { title: "Sabit Zorunlu Giderler", text: "Her ay sabit ve zorunlu olarak ödenen giderler. Kira, aidat, ev yardımcısı, burslar, sabit destek tutarları gibi.\n\nBu giderlerin tutarları belirli ve değişmez. Artış tarihleri tanımlanmışsa uygulama o tarih yaklaştığında uyarı verir. Her birini ödediğinizde 'Ödedim' butonuyla teyit edersiniz." },
  variable: { title: "Değişken Zorunlu Giderler", text: "Her ay ödemek zorunda olduğunuz ama tutarı değişen giderler. Elektrik, su, doğalgaz, internet, telefon, akaryakıt, yemek kartı yüklemesi gibi.\n\nHer kalem için bir 'beklenen tutar' belirlersiniz. Eğer girdiğiniz tutar beklenen tutarın %10'undan fazla aşarsa uygulama uyarı verir — böylece anormal faturaları erken yakalarsınız." },
  risk: { title: "Risk Skoru", text: "0-100 arası bir puan. 0 en güvenli, 100 en kritik durum.\n\nBeş faktöre bakılarak hesaplanır:\n\n1. Bu Ay Kalan Bütçe Oranı (25 puan): Bu ayın kalan bütçesinin toplam bütçeye oranı. Beklenmedik harcamalara karşı tampon gücünüzü gösterir. %50 üstü güvenli, %10 altı kritik.\n\n2. 12 Aylık Sürdürülebilirlik Durumu (25 puan): Mevcut harcama düzeniyle gelecek 12 ay içinde bütçe aşımı oluşup oluşmayacağını hesaplar. Değişken gider tahminlerini de içerir.\n\n3. Konfor Harcaması Kartı Kapasitesi (20 puan): Tüm zorunlu çıkışlar düşüldükten sonra konfor harcaması kartına yüklenebilecek aylık tutarı ölçer. Alt limit: 40.000 ₺. Gelecek 6 ayın en kötü durumunu da hesaba katar.\n\n4. Harcama Eğilimi (15 puan): Son 3 ayın harcama ortalamasına göre bu ayın artış/azalış yönünü analiz eder. Sürekli artan harcama eğilimi bütçeyi tehdit eder.\n\n5. Yaklaşan Gider Artışları (15 puan): Önümüzdeki 6 ay içinde bilinen sabit gider artışlarını ve bunların bütçeye toplam etkisini değerlendirir.\n\nSeviyeler: 0-14 GÜVENLİ, 15-29 DÜŞÜK, 30-49 ORTA, 50-69 YÜKSEK, 70-100 KRİTİK." },
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
function TabBar({ tab, setTab }) { return (<div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, ...glassSolid, borderRadius: "16px 16px 0 0", display: "flex", justifyContent: "space-around", alignItems: "center", padding: "6px 0 env(safe-area-inset-bottom, 8px)", zIndex: 120, boxShadow: "0 -4px 16px rgba(0,0,0,0.06)" }}>{TABS.map((t, i) => (<React.Fragment key={t.id}>{i > 0 && <div style={{ width: 1, height: 22, background: "rgba(0,0,0,0.1)" }} />}<button onClick={() => setTab(t.id)} style={{ background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "6px 10px", cursor: "pointer", color: tab === t.id ? X.g : X.td, fontFamily: ff }}><span style={{ fontSize: 18, lineHeight: 1 }}>{t.icon}</span><span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "-0.2px" }}>{t.label}</span></button></React.Fragment>))}</div>); }

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

function CardLoadModal({ currentLoaded, maxTotal, entries, onClose, onSave, onDelete, onEdit }) {
  const [a, sa] = useState("");
  const [d, sd] = useState(td());
  const [listOpen, setListOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editAmt, setEditAmt] = useState("");
  const [editDate, setEditDate] = useState("");
  const amt = parseFloat(a) || 0;
  const remaining = Math.max(0, maxTotal - currentLoaded);
  const wouldExceedTotal = maxTotal > 0 && (currentLoaded + amt) > maxTotal;
  const canSave = amt > 0 && !wouldExceedTotal;
  const sorted = [...(entries || [])].sort((a2, b2) => (b2.date || "").localeCompare(a2.date || ""));

  return (
    <Modal title="🛒 Konfor Harcaması Kartı" onClose={onClose}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <div><div style={{ color: X.tm, fontSize: 11 }}>Bu Ay Yüklenen</div><div style={{ color: X.t, fontSize: 22, fontWeight: 800, fontFamily: fm }}>{C(currentLoaded)}</div></div>
        {maxTotal > 0 && <div style={{ textAlign: "right" }}><div style={{ color: X.tm, fontSize: 11 }}>Aylık Limit</div><div style={{ color: X.td, fontSize: 22, fontWeight: 800, fontFamily: fm }}>{C(maxTotal)}</div></div>}
      </div>
      {maxTotal > 0 && <div style={{ height: 4, borderRadius: 2, background: X.border, marginBottom: 12 }}><div style={{ height: "100%", borderRadius: 2, background: X.g, width: `${Math.min((currentLoaded / maxTotal) * 100, 100)}%` }} /></div>}
      <Inp label="Yüklenen Tutar" type="number" value={a} onChange={sa} suffix="₺" />
      <Inp label="Tarih" type="date" value={d} onChange={sd} />
      {wouldExceedTotal && <div style={{ color: X.r, fontSize: 12, marginBottom: 8 }}>⚠️ Bu ay toplam {C(maxTotal)} limitini aşıyor</div>}
      <Btn onClick={() => { if (!canSave) return; onSave(amt, d); sa(""); sd(td()); }} disabled={!canSave}>🛒 Yükle</Btn>
      <div style={{ marginTop: 14 }}>
        <div onClick={() => setListOpen(!listOpen)} style={{ ...glassSolid, borderRadius: listOpen ? "10px 10px 0 0" : 10, padding: "12px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: X.tm }}>Bu ayki yüklemeler</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {sorted.length > 0 && <span style={{ fontSize: 11, color: X.td }}>{sorted.length} yükleme</span>}
            <span style={{ fontSize: 10, color: X.td, transform: listOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
          </div>
        </div>
        {listOpen && (
          <div style={{ background: "rgba(160,190,200,0.35)", borderRadius: "0 0 10px 10px", borderTop: `1px solid ${X.border}`, padding: "6px 10px 10px" }}>
            {sorted.length === 0
              ? <div style={{ color: X.td, fontSize: 13, padding: "6px 0" }}>Bu ay henüz yükleme yapılmadı.</div>
              : sorted.map(e => editId === e.id ? (
                <div key={e.id} style={{ padding: 10, borderRadius: 8, marginBottom: 4, background: "rgba(15,118,110,0.07)", border: "1px solid rgba(15,118,110,0.2)" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: X.g, marginBottom: 8 }}>Düzenleniyor</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
                    <div><div style={{ fontSize: 12, color: X.td, marginBottom: 3 }}>Tutar</div><input type="number" value={editAmt} onChange={ev => setEditAmt(ev.target.value)} style={{ width: "100%", background: "rgba(255,255,255,0.7)", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 8, padding: "8px 10px", fontSize: 13, color: X.t, boxSizing: "border-box" }} /></div>
                    <div><div style={{ fontSize: 12, color: X.td, marginBottom: 3 }}>Tarih</div><input type="date" value={editDate} onChange={ev => setEditDate(ev.target.value)} style={{ width: "100%", background: "rgba(255,255,255,0.7)", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 8, padding: "8px 10px", fontSize: 13, color: X.t, boxSizing: "border-box" }} /></div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => { onEdit(e.id, { amount: parseFloat(editAmt) || e.amount, date: editDate }); setEditId(null); }} style={{ flex: 1, background: X.g, border: "none", borderRadius: 8, padding: "8px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: ff }}>✓ Kaydet</button>
                    <button onClick={() => setEditId(null)} style={{ flex: 1, background: "transparent", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 8, padding: "8px", color: X.td, fontSize: 13, cursor: "pointer", fontFamily: ff }}>İptal</button>
                  </div>
                </div>
              ) : (
                <div key={e.id} style={{ padding: "10px 6px", borderRadius: 8, marginBottom: 4, background: "rgba(255,255,255,0.35)", display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: X.t, flex: 1 }}>Kart yükleme</span>
                    <span style={{ fontSize: 13, color: X.td, whiteSpace: "nowrap" }}>{e.date}</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: X.g, fontFamily: fm, whiteSpace: "nowrap" }}>{C(e.amount)}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => { setEditId(e.id); setEditAmt(String(e.amount)); setEditDate(e.date || ""); }} style={{ background: "none", border: "none", color: X.b, fontSize: 22, cursor: "pointer", padding: 0, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>✎</button>
                    <button onClick={() => { if (confirm("Bu yüklemeyi silmek istiyor musunuz?")) onDelete(e.id); }} style={{ background: "none", border: "none", color: X.r, fontSize: 22, cursor: "pointer", padding: 0, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                  </div>
                </div>
              ))
            }
          </div>
        )}
      </div>
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
      {active.length === 0 && (
        <div style={{ textAlign: "center", padding: "20px 0", color: X.td }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📌</div>
          <div style={{ fontSize: 13 }}>Henüz borç kaydı yok</div>
          <div style={{ fontSize: 11, marginTop: 4 }}>Ayarlar → Borçlar bölümünden ekleyebilirsiniz</div>
        </div>
      )}
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

function BackupSettings({ data, setData, familyId, onBack }) {
  const [msg, setMsg] = useState(null);
  const [importData, setImportData] = useState("");
  const [autoBackups, setAutoBackups] = useState([]);
  const [loadingBackups, setLoadingBackups] = useState(false);

  useEffect(() => {
    if (familyId) {
      setLoadingBackups(true);
      listBackups(familyId).then(b => { setAutoBackups(b); setLoadingBackups(false); });
    }
  }, [familyId]);

  const handleRestore = async (date) => {
    if (!confirm(`${date} tarihli yedeğe dönmek istediğinize emin misiniz? Mevcut verilerinizin üzerine yazılacak.`)) return;
    const restored = await restoreBackup(familyId, date);
    if (restored) {
      setData({ ...DD, ...restored, settings: { ...DD.settings, ...(restored.settings || {}) }, liveRates: restored.liveRates || DD.liveRates, savings: { ...DD.savings, ...(restored.savings || {}) } });
      setMsg({ type: "success", text: `✓ ${date} tarihli yedek geri yüklendi` });
    } else {
      setMsg({ type: "error", text: "Yedek geri yüklenemedi" });
    }
    setTimeout(() => setMsg(null), 3000);
  };

  const exportData = (markBackup = false) => {
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
      if (markBackup) {
        setData(d => ({ ...d, lastBackup: new Date().toISOString().slice(0, 10) }));
      }
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

      <Card s={{ marginBottom: 12, background: X.gd, border: `1px solid ${X.g}` }}>
        <div style={{ color: X.g, fontSize: 13, fontWeight: 800, marginBottom: 4 }}>💾 Anlık Yedek Al</div>
        <div style={{ color: X.tm, fontSize: 11, marginBottom: 10, lineHeight: 1.5 }}>
          Son yedek: {data.lastBackup || "Henüz alınmadı"}
        </div>
        <Btn onClick={() => exportData(true)} c={X.g}>📥 Şimdi Yedek Al</Btn>
      </Card>

      <Card s={{ marginBottom: 12 }}>
        <div style={{ color: X.tm, fontSize: 12, fontWeight: 700, marginBottom: 4 }}>MEVCUT VERİ</div>
        <div style={{ color: X.t, fontSize: 14, fontFamily: fm }}>{sizeKB} KB</div>
        <div style={{ color: X.td, fontSize: 11, marginTop: 4 }}>
          {Object.keys(data.months).length} ay kaydı • {(data.settings.fixedExpenses || []).length} sabit gider • {(data.debts || []).length} borç • {(data.installmentPlans || []).length} taksit
        </div>
      </Card>

      <Card s={{ marginBottom: 12 }}>
        <div style={{ color: X.tm, fontSize: 12, fontWeight: 700, marginBottom: 10 }}>DIŞA AKTAR</div>
        <Btn onClick={() => exportData(true)} s={{ marginBottom: 8 }}>📥 JSON Dosyası Olarak İndir</Btn>
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

      {/* Otomatik Yedekler */}
      <Card s={{ marginBottom: 12, background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)" }}>
        <div style={{ color: X.p, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>🔄 Otomatik Yedekler (Son 7 Gün)</div>
        <div style={{ color: X.td, fontSize: 11, marginBottom: 10, lineHeight: 1.5 }}>Verileriniz her gün otomatik olarak yedeklenir. Sorun yaşarsanız buradan geri dönebilirsiniz.</div>
        {loadingBackups && <div style={{ color: X.td, fontSize: 12 }}>Yükleniyor...</div>}
        {!loadingBackups && autoBackups.length === 0 && <div style={{ color: X.td, fontSize: 12 }}>Henüz otomatik yedek yok. İlk yedek bugün oluşturulacak.</div>}
        {autoBackups.map(date => (
          <div key={date} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${X.border}` }}>
            <div style={{ color: X.t, fontSize: 13, fontWeight: 600 }}>📅 {date}</div>
            <button onClick={() => handleRestore(date)} style={{ background: X.bd, border: `1px solid ${X.b}`, borderRadius: 8, padding: "5px 12px", color: X.b, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: ff }}>Geri Yükle</button>
          </div>
        ))}
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

function CCInstallModal({ data, mk, cards, variableExpenses, onClose, onSave, onDeletePlan, onEditPlan, startInSim, onEventTaksit }) {
  const [a, sa] = useState(""); const [mo, smo] = useState("3"); const [n, sn] = useState("");
  const [cardId, setCardId] = useState(cards[0]?.id || "");
  const [categoryId, setCategoryId] = useState("");
  const [userChanged, setUserChanged] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState("");
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

  // %12 taksit güvenlik kilidi
  const budget12 = data.settings.monthlyBudget || 0;
  const currentInstTotal = data.installmentPlans.reduce((s, p) => {
    let c = p.startMonth; for (let i = 0; i < p.months; i++) { if (c === mk) return s + p.monthlyPayment; c = nmk(c); } return s;
  }, 0);
  const maxInstLimit = Math.round(budget12 * 0.12);
  const remainingInstHak = Math.max(0, maxInstLimit - currentInstTotal);
  const wouldExceed = mp > 0 && (currentInstTotal + mp) > maxInstLimit;

  // Seçilen etkinliğin taksit limiti kontrolü
  const selectedEvent = selectedEventId ? (data.plannedEvents || []).find(e => e.id === selectedEventId) : null;
  const eventTaksitKalan = selectedEvent ? Math.max(0, (selectedEvent.maxTaksit || 0) - (selectedEvent.taksitUsed || 0)) : null;
  const eventWouldExceed = selectedEvent && t > 0 && t > eventTaksitKalan;

  // Etkinlik için minimum taksit sayısı önerisi
  const suggestedMinMonths = selectedEvent && remainingInstHak > 0 && t > 0 ? Math.max(1, Math.ceil(t / remainingInstHak)) : null;

  const doSim = () => {
    if (!t || !m2) return;
    const plan = { startMonth: startMk, months: m2, monthlyPayment: mp, totalAmount: t };
    const without = [], withS = []; let m3 = startMk;
    for (let i = 0; i < Math.min(m2 + 2, 8); i++) { without.push({ mk: m3, ...calcMonth(data, m3, null) }); withS.push({ mk: m3, ...calcMonth(data, m3, plan) }); m3 = nmk(m3); }
    let deficit = null; withS.forEach(ws => { if (ws.remaining < 0 && !deficit) deficit = ws.mk; });
    setSim({ plan, without, withS, deficit });
  };

  const save = () => {
    if (!t || !cardId) return;
    if (wouldExceed) { alert(`Aylık taksit yükü bütçenizin %12'sini aşıyor (max ${C(maxInstLimit)}). Bu harcamayı daha fazla taksitle yapın.`); return; }
    if (eventWouldExceed) { alert(`Bu harcama, "${selectedEvent.name}" etkinliğinin taksit limitini aşıyor (kalan: ${C(eventTaksitKalan)})`); return; }
    onSave({ id: uid(), totalAmount: t, monthlyPayment: mp, months: m2, rate: 0, startMonth: startMk, remainingMonths: m2, note: n, merchantName: "", cardId, categoryId: categoryId || null, eventId: selectedEventId || null, createdDate: td() });
    if (selectedEventId && onEventTaksit) onEventTaksit(selectedEventId, t);
    onClose();
  };

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
      {/* Planlı etkinlik seçimi */}
      {(data.plannedEvents || []).length > 0 && (
        <Sel label="Planlı Etkinlik (opsiyonel)" value={selectedEventId} onChange={setSelectedEventId} options={[{ v: "", l: "— Etkinlik seçilmedi —" }, ...(data.plannedEvents || []).map(ev => ({ v: ev.id, l: `📅 ${ev.name} (taksit hakkı: ${C(Math.max(0, (ev.maxTaksit || 0) - (ev.taksitUsed || 0)))})` }))]} />
      )}
      {selectedEvent && suggestedMinMonths && t > 0 && (
        <div style={{ background: "rgba(99,102,241,0.08)", borderRadius: 8, padding: "8px 10px", marginBottom: 12, fontSize: 11, color: X.p, lineHeight: 1.4 }}>
          💡 Aylık taksit hakkınızı aşmamak için bu harcamayı <span style={{ fontWeight: 800 }}>en az {suggestedMinMonths} taksit</span> yapmanız önerilir.
          {eventWouldExceed && <div style={{ color: X.r, fontWeight: 700, marginTop: 4 }}>⚠️ Bu tutar etkinliğin taksit limitini aşıyor (kalan: {C(eventTaksitKalan)})</div>}
        </div>
      )}
      {/* Kalan taksit hakkı bilgisi */}
      <div style={{ background: wouldExceed ? "rgba(239,68,68,0.08)" : "rgba(99,102,241,0.06)", borderRadius: 8, padding: "8px 10px", marginBottom: 12, fontSize: 11, lineHeight: 1.4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: X.td }}>Kalan aylık taksit hakkı (bütçenin %12'si)</span>
          <span style={{ color: wouldExceed ? X.r : X.p, fontWeight: 800, fontFamily: fm }}>{C(remainingInstHak)}</span>
        </div>
        {mp > 0 && <div style={{ color: X.td, marginTop: 4 }}>Bu harcamanın aylık taksiti: <span style={{ fontWeight: 700, color: wouldExceed ? X.r : X.t }}>{C(mp)}</span></div>}
        {wouldExceed && <div style={{ color: X.r, fontWeight: 700, marginTop: 4 }}>⚠️ Taksit yükü bütçenizin %12'sini aşıyor. Daha fazla taksitle deneyin.</div>}
        <div style={{ color: X.tm, marginTop: 4, fontSize: 10 }}>Sonraki harcamanızı buna göre planlayın.</div>
      </div>
      {!sim && (
        <div style={{ display: "flex", gap: 8 }}>
          {!startInSim && <Btn onClick={save} c={X.p} s={{ flex: 1 }} disabled={!cardId || wouldExceed || eventWouldExceed}>📅 Direkt Kaydet</Btn>}
          <Btn onClick={doSim} v={startInSim ? "filled" : "outline"} c={X.p} s={{ flex: 1 }}>🔮 Hesapla</Btn>
        </div>
      )}
      {sim && (
        <>
          <Card s={{ marginBottom: 10, background: "rgba(160,190,200,0.50)", border: `1px solid ${X.border}` }}>
            <div style={{ background: "rgba(160,190,200,0.50)", borderRadius: 10, padding: "8px 10px", marginBottom: 10, fontSize: 11, color: X.tm, lineHeight: 1.5 }}><span style={{ fontWeight: 700, color: X.t }}>Harcanabilir bütçe: </span>Aylık bütçeden sabit giderler, taksitler ve borç ödemeleri düşüldükten sonra kalan tutardır.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 4, fontSize: 10, marginBottom: 6, paddingBottom: 8, borderBottom: `1px solid rgba(0,0,0,0.08)`, alignItems: "end" }}>
              <span style={{ color: X.td }}>Ay</span><span style={{ color: X.td, textAlign: "right" }}>Şu anki harcanabilir</span><span style={{ color: X.p, textAlign: "right" }}>Taksit sonrası harcanabilir</span>
            </div>
            {sim.withS.map((ws, i) => { const wo = sim.without[i]; return (
              <div key={ws.mk} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 4, padding: "5px 0", borderBottom: `1px solid ${X.border}`, fontSize: 12 }}>
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
              return <div style={{ color: budgetHard ? X.r : X.w, fontSize: 13, fontWeight: 600, marginBottom: 10, lineHeight: 1.5 }}>⚠️ Bu taksitli işlem serbest bütçenizi daraltır. {ml(minMonth.mk)} ayında kalan bütçe {C(minMonth.remaining)} olacak — beklenmeyen gider fonu ve genel harcama alanı çok daralıyor.</div>;
            }
            return <div style={{ color: X.g, fontSize: 13, fontWeight: 600, marginBottom: 10, lineHeight: 1.5 }}>✅ Bu taksitli işlemi yapabilirsiniz. Taksit sonrası en düşük aylık kalan: {C(minMonth.remaining)} ({ml(minMonth.mk)}). Hiçbir ayda bütçe açığı oluşmuyor.</div>;
          })()}
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={save} c={X.g} s={{ flex: 1 }} disabled={!cardId || wouldExceed || eventWouldExceed}>✓ Taksiti Onayla ve Kaydet</Btn>
            <Btn onClick={() => setSim(null)} v="outline" c={X.td} s={{ flex: 1 }}>Geri</Btn>
          </div>
        </>
      )}
    </Modal>
  );
}

function AccountPayModal({ variableExpenses, entries, transferred, onClose, onSave, onDelete, onEdit, onTransfer, onUndoTransfer }) {
  const [a, sa] = useState(""); const [n, sn] = useState(""); const [d, sd] = useState(td());
  const [categoryId, setCategoryId] = useState(""); const [userChanged, setUserChanged] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [editId, setEditId] = useState(null); const [editAmt, setEditAmt] = useState(""); const [editNote2, setEditNote2] = useState(""); const [editDate2, setEditDate2] = useState("");

  useEffect(() => {
    if (userChanged) return;
    const matched = matchCategory(n, variableExpenses || []);
    if (matched) setCategoryId(matched);
  }, [n, userChanged, variableExpenses]);

  const sorted = [...(entries || [])].sort((a2, b2) => (b2.date || "").localeCompare(a2.date || ""));

  return (
    <Modal title="🏦 Hesaptan Ödeme" onClose={onClose}>
      <Inp label="Tutar" type="number" value={a} onChange={sa} suffix="₺" />
      <Inp label="Açıklama" value={n} onChange={sn} placeholder="Örn: Elektrik faturası, Vodafone" />
      {(variableExpenses || []).length > 0 && (
        <Sel label="Kategori" value={categoryId} onChange={v => { setCategoryId(v); setUserChanged(true); }} options={[{ v: "", l: "— Otomatik / Kategorisiz —" }, ...(variableExpenses || []).map(ve => ({ v: ve.id, l: (ve.icon || "📋") + " " + ve.name }))]} />
      )}
      {categoryId && !userChanged && <div style={{ color: X.g, fontSize: 11, marginTop: -8, marginBottom: 12 }}>✓ Anahtar kelime eşleşmesi bulundu</div>}
      <Inp label="Tarih" type="date" value={d} onChange={sd} />
      <Btn onClick={() => { if (!a) return; onSave({ id: uid(), amount: parseFloat(a), note: n, date: d, categoryId: categoryId || null }); sa(""); sn(""); sd(td()); setCategoryId(""); setUserChanged(false); setListOpen(true); }}>🏦 Kaydet</Btn>
      <div style={{ marginTop: 14 }}>
        <div onClick={() => setListOpen(!listOpen)} style={{ ...glassSolid, borderRadius: listOpen ? "10px 10px 0 0" : 10, padding: "12px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: X.tm }}>Bu ayki hesaptan ödemeler</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {sorted.length > 0 && <span style={{ fontSize: 10, color: X.td }}>{sorted.length} giriş</span>}
            <span style={{ fontSize: 10, color: X.td, transform: listOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
          </div>
        </div>
        {listOpen && (
          <div style={{ background: "rgba(160,190,200,0.35)", borderRadius: "0 0 10px 10px", borderTop: `1px solid ${X.border}`, padding: "6px 10px 8px" }}>
            {sorted.length === 0
              ? <div style={{ color: X.td, fontSize: 12, padding: "4px 0" }}>Bu ay henüz ödeme girilmedi.</div>
              : sorted.map(e => editId === e.id ? (
                <div key={e.id} style={{ padding: 8, borderRadius: 7, marginBottom: 3, background: "rgba(15,118,110,0.07)", border: "1px solid rgba(15,118,110,0.2)" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: X.g, marginBottom: 8 }}>{e.note || "Hesaptan Ödeme"} — düzenleniyor</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
                    <div><div style={{ fontSize: 12, color: X.td, marginBottom: 3 }}>Tutar</div><input type="number" value={editAmt} onChange={ev => setEditAmt(ev.target.value)} style={{ width: "100%", background: "rgba(255,255,255,0.7)", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 8, padding: "8px 10px", fontSize: 13, color: X.t, boxSizing: "border-box" }} /></div>
                    <div><div style={{ fontSize: 12, color: X.td, marginBottom: 3 }}>Tarih</div><input type="date" value={editDate2} onChange={ev => setEditDate2(ev.target.value)} style={{ width: "100%", background: "rgba(255,255,255,0.7)", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 8, padding: "8px 10px", fontSize: 13, color: X.t, boxSizing: "border-box" }} /></div>
                  </div>
                  <div style={{ fontSize: 12, color: X.td, marginBottom: 3 }}>Açıklama</div>
                  <input value={editNote2} onChange={ev => setEditNote2(ev.target.value)} style={{ width: "100%", background: "rgba(255,255,255,0.7)", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 8, padding: "8px 10px", fontSize: 13, color: X.t, boxSizing: "border-box", marginBottom: 8 }} />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => { onEdit(e.id, { amount: parseFloat(editAmt) || e.amount, note: editNote2, date: editDate2 }); setEditId(null); }} style={{ flex: 1, background: X.g, border: "none", borderRadius: 8, padding: "8px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: ff }}>✓ Kaydet</button>
                    <button onClick={() => setEditId(null)} style={{ flex: 1, background: "transparent", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 8, padding: "8px", color: X.td, fontSize: 13, cursor: "pointer", fontFamily: ff }}>İptal</button>
                  </div>
                </div>
              ) : (
                <div key={e.id} style={{ padding: "10px 10px", borderRadius: 10, marginBottom: 4, background: "rgba(255,255,255,0.35)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: X.t, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.note || "Hesaptan Ödeme"}</span>
                    <span style={{ fontSize: 13, color: X.td, whiteSpace: "nowrap", flexShrink: 0 }}>{e.date}</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: X.g, fontFamily: fm, whiteSpace: "nowrap", flexShrink: 0 }}>{C(e.amount)}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {transferred?.[e.id]?.transferred
                      ? <button onClick={() => onUndoTransfer(e.id)} style={{ background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 6, padding: "4px 8px", color: "#15803D", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 3 }}><svg width="9" height="9" viewBox="0 0 10 10" fill="none"><polyline points="1,5.5 3.8,8.5 9,1.5" stroke="#15803D" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>Aktarıldı</button>
                      : <button onClick={() => onTransfer(e.id)} style={{ background: "#FFF7ED", border: "1px solid #FDBA74", borderRadius: 6, padding: "4px 8px", color: "#C2410C", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>Aktar</button>
                    }
                    <button onClick={() => { setEditId(e.id); setEditAmt(String(e.amount)); setEditNote2(e.note || ""); setEditDate2(e.date || ""); }} style={{ background: "none", border: "none", color: X.b, fontSize: 22, cursor: "pointer", padding: 0, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>✎</button>
                    <button onClick={() => { if (confirm("Bu kaydı silmek istiyor musunuz?")) onDelete(e.id); }} style={{ background: "none", border: "none", color: X.r, fontSize: 22, cursor: "pointer", padding: 0, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                  </div>
                </div>
              ))
            }
          </div>
        )}
      </div>
    </Modal>
  );
}

function CCCombinedModal({ data, mk, cards, variableExpenses, ccSingleEntries, onClose, onSaveSingle, onDeleteSingle, onSaveInstall, onDeletePlan, onEditPlan, onEventTaksit }) {
  const [tab, setTab] = useState("single");
  const [a, sa] = useState(""); const [n, sn] = useState(""); const [d, sd] = useState(td());
  const [cardId, setCardId] = useState(cards[0]?.id || "");
  const [categoryId, setCategoryId] = useState(""); const [userChanged, setUserChanged] = useState(false);
  const [ia, sia] = useState(""); const [mo, smo] = useState("3");
  const [iCardId, setICardId] = useState(cards[0]?.id || "");
  const [iCategoryId, setICategoryId] = useState(""); const [iUserChanged, setIUserChanged] = useState(false);
  const [iNote, setINote] = useState("");
  const [iSelectedEventId, setISelectedEventId] = useState("");
  const [startMk, setStartMk] = useState(nmk(mk));
  const [sim, setSim] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editNote, setEditNote] = useState(""); const [editTotal, setEditTotal] = useState("");
  const [editMonths, setEditMonths] = useState(""); const [editStartMk, setEditStartMk] = useState("");
  const [editCardId, setEditCardId] = useState("");
  const [singleListOpen, setSingleListOpen] = useState(false);
  const [installListOpen, setInstallListOpen] = useState(false);
  const sortedSingle = [...(ccSingleEntries || [])].sort((a2, b2) => (b2.date || "").localeCompare(a2.date || ""));
  const [sEditId, setSEditId] = useState(null); const [sEditAmt, setSEditAmt] = useState(""); const [sEditNote, setSEditNote] = useState(""); const [sEditDate, setSEditDate] = useState("");

  const t = parseFloat(ia) || 0; const m2 = parseInt(mo) || 1; const mp = Math.ceil(t / m2);
  const startOptions = []; let sm = mk;
  for (let i = 0; i < 4; i++) { startOptions.push({ v: sm, l: ml(sm) + (i === 0 ? " (bu ay)" : "") }); sm = nmk(sm); }

  useEffect(() => {
    if (userChanged) return;
    const matched = matchCategory(n, variableExpenses || []);
    if (matched) setCategoryId(matched);
  }, [n, userChanged, variableExpenses]);

  useEffect(() => {
    if (iUserChanged) return;
    const matched = matchCategory(iNote, variableExpenses || []);
    if (matched) setICategoryId(matched);
  }, [iNote, iUserChanged, variableExpenses]);

  const doSim = () => {
    if (!t || !m2) return;
    const plan = { startMonth: startMk, months: m2, monthlyPayment: mp, totalAmount: t };
    const without = [], withS = []; let m3 = startMk;
    for (let i = 0; i < Math.min(m2 + 2, 8); i++) { without.push({ mk: m3, ...calcMonth(data, m3, null) }); withS.push({ mk: m3, ...calcMonth(data, m3, plan) }); m3 = nmk(m3); }
    let deficit = null; withS.forEach(ws => { if (ws.remaining < 0 && !deficit) deficit = ws.mk; });
    setSim({ plan, without, withS, deficit });
  };

  // %12 taksit güvenlik kilidi (CCCombined)
  const iBudget12 = data.settings.monthlyBudget || 0;
  const iCurrentInstTotal = data.installmentPlans.reduce((s, p) => {
    let c = p.startMonth; for (let i2 = 0; i2 < p.months; i2++) { if (c === mk) return s + p.monthlyPayment; c = nmk(c); } return s;
  }, 0);
  const iMaxInstLimit = Math.round(iBudget12 * 0.12);
  const iRemainingInstHak = Math.max(0, iMaxInstLimit - iCurrentInstTotal);
  const iWouldExceed = mp > 0 && (iCurrentInstTotal + mp) > iMaxInstLimit;
  const iSelectedEvent = iSelectedEventId ? (data.plannedEvents || []).find(e => e.id === iSelectedEventId) : null;
  const iEventTaksitKalan = iSelectedEvent ? Math.max(0, (iSelectedEvent.maxTaksit || 0) - (iSelectedEvent.taksitUsed || 0)) : null;
  const iEventWouldExceed = iSelectedEvent && t > 0 && t > iEventTaksitKalan;
  const iSuggestedMinMonths = iSelectedEvent && iRemainingInstHak > 0 && t > 0 ? Math.max(1, Math.ceil(t / iRemainingInstHak)) : null;

  const saveInstall = () => {
    if (!t || !iCardId) return;
    if (iWouldExceed) { alert(`Aylık taksit yükü bütçenizin %12'sini aşıyor (max ${C(iMaxInstLimit)}). Bu harcamayı daha fazla taksitle yapın.`); return; }
    if (iEventWouldExceed) { alert(`Bu harcama, "${iSelectedEvent.name}" etkinliğinin taksit limitini aşıyor (kalan: ${C(iEventTaksitKalan)})`); return; }
    onSaveInstall({ id: uid(), totalAmount: t, monthlyPayment: mp, months: m2, rate: 0, startMonth: startMk, remainingMonths: m2, note: iNote, merchantName: "", cardId: iCardId, categoryId: iCategoryId || null, eventId: iSelectedEventId || null, createdDate: td() });
    if (iSelectedEventId && onEventTaksit) onEventTaksit(iSelectedEventId, t);
    onClose();
  };

  const activePlans = data.installmentPlans.filter(p => {
    let cur = p.startMonth;
    for (let i = 0; i < p.months; i++) { if (cur >= mk) return true; cur = nmk(cur); }
    return false;
  });

  const tabStyle = (active, color) => ({
    flex: 1, padding: "8px", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700,
    cursor: "pointer", fontFamily: ff,
    background: active ? "#fff" : "transparent",
    color: active ? color : X.td,
    boxShadow: active ? "0 1px 4px rgba(0,0,0,0.1)" : "none"
  });

  return (
    <Modal title="💳 Kredi Kartı" onClose={onClose}>
      <div style={{ display: "flex", background: "rgba(160,190,200,0.50)", borderRadius: 10, padding: 3, marginBottom: 16, gap: 3 }}>
        <button onClick={() => setTab("single")} style={tabStyle(tab === "single", X.b)}>Tek Çekim</button>
        <button onClick={() => setTab("install")} style={tabStyle(tab === "install", X.p)}>Taksitli</button>
      </div>

      {tab === "single" && (
        <>
          {cards.length === 0
            ? <div style={{ color: X.w, fontSize: 13, marginBottom: 12, padding: 10, background: X.wd, borderRadius: 8 }}>⚠️ Önce Ayarlar → Kartlarım'dan en az bir kart eklemelisiniz.</div>
            : <Sel label="Hangi Kart" value={cardId} onChange={setCardId} options={cards.map(c => ({ v: c.id, l: c.name }))} />}
          <Inp label="Tutar" type="number" value={a} onChange={sa} suffix="₺" />
          <Inp label="Harcama Açıklaması" value={n} onChange={sn} placeholder="Örn: Shell Çumra, File market" />
          {(variableExpenses || []).length > 0 && (
            <Sel label="Kategori" value={categoryId} onChange={v => { setCategoryId(v); setUserChanged(true); }} options={[{ v: "", l: "— Otomatik / Kategorisiz —" }, ...(variableExpenses || []).map(ve => ({ v: ve.id, l: (ve.icon || "📋") + " " + ve.name }))]} />
          )}
          {categoryId && !userChanged && <div style={{ color: X.g, fontSize: 11, marginTop: -8, marginBottom: 12 }}>✓ Anahtar kelime eşleşmesi bulundu</div>}
          <Inp label="Tarih" type="date" value={d} onChange={sd} />
          <Btn onClick={() => { if (!a || !cardId) return; onSaveSingle({ id: uid(), amount: parseFloat(a), note: n, merchantName: "", date: d, cardId, categoryId: categoryId || null }); sa(""); sn(""); sd(td()); setCategoryId(""); setUserChanged(false); setSingleListOpen(true); }} disabled={!cardId}>💳 Kaydet</Btn>
          <div style={{ marginTop: 14 }}>
            <div onClick={() => setSingleListOpen(!singleListOpen)} style={{ ...glassSolid, borderRadius: singleListOpen ? "10px 10px 0 0" : 10, padding: "12px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: X.tm }}>Bu ayki tek çekim girişleri</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {sortedSingle.length > 0 && <span style={{ fontSize: 10, color: X.td }}>{sortedSingle.length} giriş</span>}
                <span style={{ fontSize: 10, color: X.td, transform: singleListOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
              </div>
            </div>
            {singleListOpen && (
              <div style={{ background: "rgba(160,190,200,0.35)", borderRadius: "0 0 10px 10px", borderTop: `1px solid ${X.border}`, padding: "6px 10px 8px" }}>
                {sortedSingle.length === 0
                  ? <div style={{ color: X.td, fontSize: 12, padding: "4px 0" }}>Bu ay henüz tek çekim girilmedi.</div>
                  : sortedSingle.map(e => sEditId === e.id ? (
                    <div key={e.id} style={{ padding: 8, borderRadius: 7, marginBottom: 3, background: "rgba(29,78,216,0.07)", border: "1px solid rgba(29,78,216,0.2)" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: X.b, marginBottom: 8 }}>{e.note || e.merchantName || "Kredi Kartı Harcaması"} — düzenleniyor</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
                        <div><div style={{ fontSize: 12, color: X.td, marginBottom: 3 }}>Tutar</div><input type="number" value={sEditAmt} onChange={ev => setSEditAmt(ev.target.value)} style={{ width: "100%", background: "rgba(255,255,255,0.7)", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 8, padding: "8px 10px", fontSize: 13, color: X.t, boxSizing: "border-box" }} /></div>
                        <div><div style={{ fontSize: 12, color: X.td, marginBottom: 3 }}>Tarih</div><input type="date" value={sEditDate} onChange={ev => setSEditDate(ev.target.value)} style={{ width: "100%", background: "rgba(255,255,255,0.7)", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 8, padding: "8px 10px", fontSize: 13, color: X.t, boxSizing: "border-box" }} /></div>
                      </div>
                      <div style={{ fontSize: 12, color: X.td, marginBottom: 3 }}>Açıklama</div>
                      <input value={sEditNote} onChange={ev => setSEditNote(ev.target.value)} style={{ width: "100%", background: "rgba(255,255,255,0.7)", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 8, padding: "8px 10px", fontSize: 13, color: X.t, boxSizing: "border-box", marginBottom: 8 }} />
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => { onDeleteSingle(e.id); onSaveSingle({ ...e, amount: parseFloat(sEditAmt) || e.amount, note: sEditNote, date: sEditDate }); setSEditId(null); }} style={{ flex: 1, background: X.b, border: "none", borderRadius: 8, padding: "8px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: ff }}>✓ Kaydet</button>
                        <button onClick={() => setSEditId(null)} style={{ flex: 1, background: "transparent", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 8, padding: "8px", color: X.td, fontSize: 13, cursor: "pointer", fontFamily: ff }}>İptal</button>
                      </div>
                    </div>
                  ) : (
                    <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 10px", borderRadius: 10, marginBottom: 4, background: "rgba(255,255,255,0.35)" }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: X.t, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.note || e.merchantName || "Kredi Kartı Harcaması"}</span>
                      <span style={{ fontSize: 13, color: X.td, whiteSpace: "nowrap", flexShrink: 0 }}>{e.date}</span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: X.b, fontFamily: fm, whiteSpace: "nowrap", flexShrink: 0 }}>{C(e.amount)}</span>
                      <button onClick={() => { setSEditId(e.id); setSEditAmt(String(e.amount)); setSEditNote(e.note || e.merchantName || ""); setSEditDate(e.date || ""); }} style={{ background: "none", border: "none", color: X.b, fontSize: 22, cursor: "pointer", padding: 0, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✎</button>
                      <button onClick={() => { if (confirm("Bu kaydı silmek istiyor musunuz?")) onDeleteSingle(e.id); }} style={{ background: "none", border: "none", color: X.r, fontSize: 22, cursor: "pointer", padding: 0, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✕</button>
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        </>
      )}

      {tab === "install" && (
        <>
          {/* Yeni taksit formu */}
          {cards.length === 0
            ? <div style={{ color: X.w, fontSize: 13, marginBottom: 12, padding: 10, background: X.wd, borderRadius: 8 }}>⚠️ Önce Ayarlar → Kartlarım'dan en az bir kart eklemelisiniz.</div>
            : <Sel label="Hangi Kart" value={iCardId} onChange={setICardId} options={cards.map(c => ({ v: c.id, l: c.name }))} />}
          <Inp label="Toplam Tutar" type="number" value={ia} onChange={v2 => { sia(v2); setSim(null); }} suffix="₺" placeholder="0" />
          <Inp label="Taksit Sayısı" type="number" value={mo} onChange={v2 => { smo(v2); setSim(null); }} />
          <Sel label="İlk Taksit Ayı" value={startMk} onChange={v2 => { setStartMk(v2); setSim(null); }} options={startOptions} />
          {t > 0 && m2 > 0 && <div style={{ color: X.tm, fontSize: 13, marginBottom: 12 }}>Aylık taksit: <span style={{ color: X.p, fontWeight: 800, fontFamily: fm, fontSize: 16 }}>{C(mp)}</span> × {m2} ay · {ml(startMk)}'dan itibaren</div>}
          <Inp label="Harcama Açıklaması" value={iNote} onChange={setINote} placeholder="Örn: Saloni yatak odası" />
          {(variableExpenses || []).length > 0 && (
            <Sel label="Kategori" value={iCategoryId} onChange={v => { setICategoryId(v); setIUserChanged(true); }} options={[{ v: "", l: "— Otomatik / Kategorisiz —" }, ...(variableExpenses || []).map(ve => ({ v: ve.id, l: (ve.icon || "📋") + " " + ve.name }))]} />
          )}
          {iCategoryId && !iUserChanged && <div style={{ color: X.g, fontSize: 11, marginTop: -8, marginBottom: 12 }}>✓ Anahtar kelime eşleşmesi bulundu</div>}
          {/* Planlı etkinlik seçimi */}
          {(data.plannedEvents || []).length > 0 && (
            <Sel label="Planlı Etkinlik (opsiyonel)" value={iSelectedEventId} onChange={setISelectedEventId} options={[{ v: "", l: "— Etkinlik seçilmedi —" }, ...(data.plannedEvents || []).map(ev => ({ v: ev.id, l: `📅 ${ev.name} (taksit hakkı: ${C(Math.max(0, (ev.maxTaksit || 0) - (ev.taksitUsed || 0)))})` }))]} />
          )}
          {iSelectedEvent && iSuggestedMinMonths && t > 0 && (
            <div style={{ background: "rgba(99,102,241,0.08)", borderRadius: 8, padding: "8px 10px", marginBottom: 12, fontSize: 11, color: X.p, lineHeight: 1.4 }}>
              💡 Aylık taksit hakkınızı aşmamak için bu harcamayı <span style={{ fontWeight: 800 }}>en az {iSuggestedMinMonths} taksit</span> yapmanız önerilir.
              {iEventWouldExceed && <div style={{ color: X.r, fontWeight: 700, marginTop: 4 }}>⚠️ Bu tutar etkinliğin taksit limitini aşıyor (kalan: {C(iEventTaksitKalan)})</div>}
            </div>
          )}
          {/* Kalan taksit hakkı bilgisi */}
          <div style={{ background: iWouldExceed ? "rgba(239,68,68,0.08)" : "rgba(99,102,241,0.06)", borderRadius: 8, padding: "8px 10px", marginBottom: 12, fontSize: 11, lineHeight: 1.4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: X.td }}>Kalan aylık taksit hakkı (bütçenin %12'si)</span>
              <span style={{ color: iWouldExceed ? X.r : X.p, fontWeight: 800, fontFamily: fm }}>{C(iRemainingInstHak)}</span>
            </div>
            {mp > 0 && <div style={{ color: X.td, marginTop: 4 }}>Bu harcamanın aylık taksiti: <span style={{ fontWeight: 700, color: iWouldExceed ? X.r : X.t }}>{C(mp)}</span></div>}
            {iWouldExceed && <div style={{ color: X.r, fontWeight: 700, marginTop: 4 }}>⚠️ Taksit yükü bütçenizin %12'sini aşıyor. Daha fazla taksitle deneyin.</div>}
            <div style={{ color: X.tm, marginTop: 4, fontSize: 10 }}>Sonraki harcamanızı buna göre planlayın.</div>
          </div>
          {!sim && (
            <div style={{ display: "flex", gap: 8 }}>
              <Btn onClick={saveInstall} c={X.p} s={{ flex: 1 }} disabled={!iCardId || iWouldExceed || iEventWouldExceed}>📅 Direkt Kaydet</Btn>
              <Btn onClick={doSim} v="outline" c={X.p} s={{ flex: 1 }}>🔮 Hesapla</Btn>
            </div>
          )}
          {/* Aktif taksit planları akordiyonu */}
          {!sim && (
            <div style={{ marginTop: 14 }}>
              <div onClick={() => setInstallListOpen(!installListOpen)} style={{ ...glassSolid, borderRadius: installListOpen ? "10px 10px 0 0" : 10, padding: "12px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: X.tm }}>Aktif taksit planları</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {activePlans.length > 0 && <span style={{ fontSize: 10, color: X.td }}>{activePlans.length} plan</span>}
                  <span style={{ fontSize: 10, color: X.td, transform: installListOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
                </div>
              </div>
              {installListOpen && (
                <div style={{ background: "rgba(160,190,200,0.35)", borderRadius: "0 0 10px 10px", borderTop: `1px solid ${X.border}`, padding: "6px 10px 8px" }}>
                  {activePlans.length === 0
                    ? <div style={{ color: X.td, fontSize: 12, padding: "4px 0" }}>Henüz taksitli işlem yok.</div>
                    : activePlans.map(p => {
                        const cardName = cards.find(c2 => c2.id === p.cardId)?.name || "—";
                        let paidCount = 0; let cur = p.startMonth;
                        for (let i = 0; i < p.months; i++) { if (cur < mk) paidCount++; else break; cur = nmk(cur); }
                        const remainingCount = p.months - paidCount;
                        const isEditing = editingId === p.id;
                        const startEdit = () => { setEditingId(p.id); setEditNote(p.note || ""); setEditTotal(String(p.totalAmount || 0)); setEditMonths(String(p.months || 1)); setEditStartMk(p.startMonth || mk); setEditCardId(p.cardId || cards[0]?.id || ""); };
                        const cancelEdit = () => setEditingId(null);
                        const saveEdit = () => {
                          const newTotal = parseFloat(editTotal) || p.totalAmount;
                          const newMonths = parseInt(editMonths) || p.months;
                          const newMp = Math.ceil(newTotal / newMonths);
                          const newRemaining = (() => { let r = 0; let c2 = editStartMk; for (let i = 0; i < newMonths; i++) { if (c2 >= mk) r++; c2 = nmk(c2); } return r; })();
                          onEditPlan({ ...p, note: editNote, totalAmount: newTotal, months: newMonths, monthlyPayment: newMp, startMonth: editStartMk, cardId: editCardId, remainingMonths: newRemaining });
                          setEditingId(null);
                        };
                        return (
                          <div key={p.id} style={{ marginBottom: 6, background: "rgba(124,58,237,0.08)", borderRadius: 10, padding: "12px 14px", border: "1px solid rgba(124,58,237,0.15)" }}>
                            {isEditing ? (
                              <>
                                <Inp label="Açıklama" value={editNote} onChange={setEditNote} />
                                <Inp label="Toplam Tutar" type="number" value={editTotal} onChange={setEditTotal} suffix="₺" />
                                <Inp label="Taksit Sayısı" type="number" value={editMonths} onChange={setEditMonths} />
                                <Sel label="İlk Taksit Ayı" value={editStartMk} onChange={setEditStartMk} options={startOptions} />
                                <Sel label="Hangi Kart" value={editCardId} onChange={setEditCardId} options={cards.map(c => ({ v: c.id, l: c.name }))} />
                                <div style={{ display: "flex", gap: 8 }}>
                                  <Btn onClick={saveEdit} c={X.p} s={{ flex: 1 }}>Kaydet</Btn>
                                  <Btn onClick={cancelEdit} v="outline" c={X.td} s={{ flex: 1 }}>İptal</Btn>
                                </div>
                              </>
                            ) : (
                              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                                <span style={{ fontSize: 15, fontWeight: 700, color: X.t, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.note || "İsimsiz taksit"}</span>
                                <span style={{ fontSize: 13, color: X.td, whiteSpace: "nowrap", flexShrink: 0 }}>{paidCount}/{p.months}</span>
                                <span style={{ fontSize: 15, fontWeight: 700, color: X.p, fontFamily: fm, whiteSpace: "nowrap", flexShrink: 0 }}>{C(p.monthlyPayment)}<span style={{ fontSize: 11, fontWeight: 400, color: X.td }}>/ay</span></span>
                                <button onClick={startEdit} style={{ background: "none", border: "none", color: X.b, fontSize: 22, cursor: "pointer", padding: 0, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✎</button>
                                <button onClick={() => { if (confirm("Bu taksit planını silmek istiyor musunuz?")) { onDeletePlan(p.id); } }} style={{ background: "none", border: "none", color: X.r, fontSize: 22, cursor: "pointer", padding: 0, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✕</button>
                              </div>
                            )}
                          </div>
                        );
                      })
                  }
                </div>
              )}
            </div>
          )}
          {sim && (
            <>
              <Card s={{ marginBottom: 10, background: "rgba(160,190,200,0.50)", border: `1px solid ${X.border}` }}>
                <div style={{ background: "rgba(160,190,200,0.50)", borderRadius: 10, padding: "8px 10px", marginBottom: 10, fontSize: 11, color: X.tm, lineHeight: 1.5 }}><span style={{ fontWeight: 700, color: X.t }}>Harcanabilir bütçe: </span>Aylık bütçeden sabit giderler, taksitler ve borç ödemeleri düşüldükten sonra kalan tutardır.</div>
                <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 4, fontSize: 10, marginBottom: 6, paddingBottom: 8, borderBottom: `1px solid rgba(0,0,0,0.08)`, alignItems: "end" }}>
                  <span style={{ color: X.td }}>Ay</span><span style={{ color: X.td, textAlign: "right" }}>Şu anki harcanabilir</span><span style={{ color: X.p, textAlign: "right" }}>Taksit sonrası harcanabilir</span>
                </div>
                {sim.withS.map((ws, i) => { const wo = sim.without[i]; return (
                  <div key={ws.mk} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 4, padding: "5px 0", borderBottom: `1px solid ${X.border}`, fontSize: 12 }}>
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
                if (hasDeficit) { const defMonth = sim.withS.find(ws => ws.remaining < 0); return <div style={{ color: X.r, fontSize: 13, fontWeight: 600, marginBottom: 10, lineHeight: 1.5 }}>🚨 Bu taksitli işlem bütçenizi zorlar. {ml(sim.deficit)} ayında {C(Math.abs(defMonth?.remaining || 0))} açık oluşuyor.</div>; }
                if (budgetTight) { return <div style={{ color: budgetHard ? X.r : X.w, fontSize: 13, fontWeight: 600, marginBottom: 10, lineHeight: 1.5 }}>⚠️ Bu taksitli işlem serbest bütçenizi daraltır. {ml(minMonth.mk)} ayında kalan bütçe {C(minMonth.remaining)} olacak.</div>; }
                return <div style={{ color: X.g, fontSize: 13, fontWeight: 600, marginBottom: 10, lineHeight: 1.5 }}>✅ Bu taksitli işlemi yapabilirsiniz. En düşük aylık kalan: {C(minMonth.remaining)} ({ml(minMonth.mk)}).</div>;
              })()}
              <div style={{ display: "flex", gap: 8 }}>
                <Btn onClick={saveInstall} c={X.g} s={{ flex: 1 }} disabled={!iCardId || iWouldExceed || iEventWouldExceed}>✓ Taksiti Onayla ve Kaydet</Btn>
                <Btn onClick={() => setSim(null)} v="outline" c={X.td} s={{ flex: 1 }}>Geri</Btn>
              </div>
            </>
          )}
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

function ReceiptModal({ receipts, onClose, onSave, onDelete }) {
  const [step, setStep] = useState("list"); // list, capture, analyzing, result, analysis
  const [imgSrc, setImgSrc] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [editIdx, setEditIdx] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState(null); // cc, setcard, multinet

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
    setAnalyzing(true);
    setError(null);
    setStep("analyzing");
    try {
      const base64 = imgSrc.split(",")[1];
      const mediaType = imgSrc.split(";")[0].split(":")[1] || "image/jpeg";
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) { setError("Oturum bulunamadı. Tekrar giriş yapın."); setStep("capture"); setAnalyzing(false); return; }
      const resp = await fetch("/api/analyze-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
        body: JSON.stringify({ base64, mediaType })
      });
      const parsed = await resp.json();
      if (!resp.ok) { setError(parsed.error || "Fiş analiz edilemedi."); setStep("capture"); }
      else if (parsed.error) { setError(parsed.error); setStep("capture"); }
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
      paymentMethod,
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

          {/* Yükleme butonları */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            <label style={{ cursor: "pointer" }}>
              <input type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: "none" }} />
              <div style={{ ...glass, borderRadius: 14, padding: "20px 8px", textAlign: "center", border: `2px dashed ${X.g}40` }}>
                <div style={{ fontSize: 32, marginBottom: 6 }}>📷</div>
                <div style={{ color: X.g, fontSize: 13, fontWeight: 700 }}>Fotoğraf Çek</div>
              </div>
            </label>
            <label style={{ cursor: "pointer" }}>
              <input type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
              <div style={{ ...glass, borderRadius: 14, padding: "20px 8px", textAlign: "center", border: `2px dashed ${X.b}40` }}>
                <div style={{ fontSize: 32, marginBottom: 6 }}>🖼️</div>
                <div style={{ color: X.b, fontSize: 13, fontWeight: 700 }}>Galeriden Seç</div>
              </div>
            </label>
          </div>

          {/* Bu aydaki fişler */}
          {receipts.length === 0 && (
              <div style={{ color: X.td, fontSize: 13, textAlign: "center", padding: "20px 0" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📷</div>
                <div>Henüz market fişi yüklenmedi</div>
                <div style={{ fontSize: 11, marginTop: 4 }}>Güncel Durum → 📷 Market Fişi'nden fiş yükleyin</div>
              </div>
            )}
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
            <img src={imgSrc} alt="Fiş" style={{ width: "100%", display: "block", maxHeight: 200, objectFit: "cover" }} />
          </div>
          {/* ÖDEME YÖNTEMİ */}
          <div style={{ color: X.tm, fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>Ödeme Yöntemi</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
            {[{ v: "cc", l: "💳 Kredi Kartı" }, { v: "setcard", l: "🍽️ Setcard" }, { v: "multinet", l: "🏪 Multinet" }].map(opt => (
              <button key={opt.v} onClick={() => setPaymentMethod(opt.v)} style={{ padding: "7px 12px", borderRadius: 20, border: `1.5px solid ${paymentMethod === opt.v ? X.g : "rgba(0,0,0,0.1)"}`, background: paymentMethod === opt.v ? X.g : "white", color: paymentMethod === opt.v ? "white" : X.tm, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: ff, whiteSpace: "nowrap" }}>{opt.l}</button>
            ))}
          </div>
          {error && <div style={{ color: X.r, fontSize: 13, fontWeight: 600, marginBottom: 12, padding: "8px 12px", background: X.rd, borderRadius: 8 }}>⚠️ {error}</div>}
          <div style={{ display: "flex", gap: 10 }}>
            <Btn v="outline" c={X.tm} onClick={() => { setImgSrc(null); setStep("list"); setError(null); }}>İptal</Btn>
            <Btn onClick={doAnalyze} disabled={!paymentMethod}>🔍 Analiz Et</Btn>
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
          <div style={{ ...glass, borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div>
                <div style={{ color: X.t, fontSize: 15, fontWeight: 700 }}>🏪 {result.store || "Mağaza"}</div>
                <div style={{ color: X.td, fontSize: 11 }}>{td()} · {(result.items || []).length} ürün</div>
              </div>
              <div style={{ color: X.g, fontSize: 18, fontWeight: 800, fontFamily: fm }}>{C(result.totalAmount || 0)}</div>
            </div>
            {/* Ödeme yöntemi badge */}
            <div style={{ display: "inline-block", background: X.gd, border: `1px solid ${X.g}40`, borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 700, color: X.g }}>
              {{ cc: "💳 Kredi Kartı", setcard: "🍽️ Setcard", multinet: "🏪 Multinet" }[paymentMethod] || "💳"}
            </div>
          </div>

          {/* Setcard/Multinet uyumu kontrolü */}
          {(paymentMethod === "setcard" || paymentMethod === "multinet") && (() => {
            const cardName = paymentMethod === "setcard" ? "Setcard" : "Multinet";
            // Mağaza uygunluk kontrolü
            const storeName = (result.store || "").toLowerCase();
            const nonFoodStores = ["mado", "restoran", "restaurant", "cafe", "kafe", "fast food", "burger", "pizza", "döner", "kebap", "pastane", "patisserie", "starbucks", "mcdonalds", "kfc", "subway", "dominos", "popeyes"];
            const isNonFoodStore = nonFoodStores.some(s => storeName.includes(s));
            if (isNonFoodStore) {
              return (
                <div style={{ background: X.rd, borderLeft: `3px solid ${X.r}`, borderRadius: "0 8px 8px 0", padding: "10px 12px", marginBottom: 10, fontSize: 12, lineHeight: 1.6 }}>
                  <div style={{ color: X.r, fontWeight: 800, marginBottom: 3 }}>⚠️ Bu mağaza {cardName} kapsamında değil</div>
                  <div style={{ color: X.tm }}>"{result.store}" gıda/market kategorisinde değil. Bu alışverişi konfor harcaması kartıyla yapmak daha uygun.</div>
                </div>
              );
            }
            // Kalem bazlı uygunluk — uygun: süt ürünleri, et/tavuk, meyve/sebze, temel gıda, temizlik, kişisel bakım, bebek/çocuk
            // Uygun değil: atıştırmalık, içecek, diğer
            const unsuitableCats = ["atıştırmalık", "içecek", "diğer"];
            const unsuitable = (result.items || []).filter(it => unsuitableCats.includes(it.category));
            const unsuitableTotal = unsuitable.reduce((s, it) => s + (it.price * (it.qty || 1)), 0);
            if (unsuitable.length === 0) return (
              <div style={{ background: X.gd, borderLeft: `3px solid ${X.g}`, borderRadius: "0 8px 8px 0", padding: "8px 12px", marginBottom: 10, fontSize: 11, color: X.g, fontWeight: 600 }}>
                ✓ Tüm kalemler {cardName} kapsamında
              </div>
            );
            return (
              <div style={{ background: X.rd, borderLeft: `3px solid ${X.r}`, borderRadius: "0 8px 8px 0", padding: "10px 12px", marginBottom: 10, fontSize: 12, lineHeight: 1.6 }}>
                <div style={{ color: X.r, fontWeight: 800, marginBottom: 3 }}>⚠️ {C(unsuitableTotal)} tutarında {cardName} dışı kalem</div>
                <div style={{ color: X.tm }}>
                  {unsuitable.map(it => it.name).join(", ")} — atıştırmalık ve içecekler {cardName} kapsamında değil. Kategori dışı market alışverişlerinizi konfor harcaması kartıyla yapmanız, {cardName} bakiyenizin amacına uygun kullanımını sağlar.
                </div>
              </div>
            );
          })()}

          {/* Ürün listesi */}
          <div style={{ color: X.tm, fontSize: 11, fontWeight: 700, marginBottom: 6 }}>ÜRÜNLER</div>
          <div style={{ maxHeight: 300, overflow: "auto", marginBottom: 12 }}>
            {(result.items || []).map((it, idx) => {
              const unsuitableCats = ["atıştırmalık", "içecek", "diğer"];
              const isUnsuitable = (paymentMethod === "setcard" || paymentMethod === "multinet") && unsuitableCats.includes(it.category);
              return (
              <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(0,0,0,0.05)", background: isUnsuitable ? "rgba(220,38,38,0.04)" : "transparent", borderRadius: isUnsuitable ? 4 : 0 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 12 }}>{isUnsuitable ? "⚠️" : (RECEIPT_CAT_ICONS[it.category] || "📦")}</span>
                    {editIdx === idx ? (
                      <input value={it.name} onChange={e => editItem(idx, "name", e.target.value)} style={{ background: "rgba(200,220,232,0.65)", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 6, padding: "4px 8px", fontSize: 12, fontFamily: ff, width: "100%", outline: "none" }} />
                    ) : (
                      <span style={{ color: isUnsuitable ? X.r : X.t, fontSize: 12, fontWeight: 600 }} onClick={() => setEditIdx(idx)}>{it.name}</span>
                    )}
                  </div>
                  <div style={{ color: isUnsuitable ? X.r : X.td, fontSize: 10, marginLeft: 20 }}>
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
                      <span style={{ color: isUnsuitable ? X.r : X.t, fontSize: 13, fontWeight: 700, fontFamily: fm }}>{C(it.price * (it.qty || 1))}</span>
                      <button onClick={() => setEditIdx(idx)} style={{ background: "none", border: "none", color: X.b, fontSize: 16, cursor: "pointer", padding: "6px", minWidth: 32, minHeight: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>✎</button>
                      <button onClick={() => deleteItem(idx)} style={{ background: "none", border: "none", color: X.r, fontSize: 16, cursor: "pointer", padding: "6px", minWidth: 32, minHeight: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                    </>
                  )}
                </div>
              </div>
              );
            })}
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
  const [expandedCat, setExpandedCat] = useState(null);
  const [modal, setModal] = useState(null);
  const [info, setInfo] = useState(null);
  const [msg, setMsg] = useState(null);
  const [detail, setDetail] = useState(null);
  const [menuTab, setMenuTab] = useState(null); // "fixed" | "cc" | "variable" | "history"

  const md = gmd(mk); const c = calcMonth(data, mk, null);
  const showMonthDetail = () => { const bd = getMonthBreakdown(data, mk); setDetail({ title: `${ml(mk)} — Bütçe Dökümü`, rows: bd.rows, total: bd.mc.remaining, totalLabel: "Serbest bütçe", totalColor: bd.mc.remaining > bd.mc.effectiveBudget * 0.1 ? X.g : bd.mc.remaining >= 0 ? X.w : X.r }); };
  const risk = useMemo(() => calcRisk(data, mk), [data, mk]);
  const pct = c.effectiveBudget > 0 ? (c.totalSpent / c.effectiveBudget) * 100 : 0;
  const toggle = id => setExpanded(expanded === id ? null : id);
  const flash = m2 => { setMsg(m2); setTimeout(() => setMsg(null), 2500); };
  const warnings = useMemo(() => genWarnings(data, mk), [data, mk]);

  const handleFixedPay = expId => { setMonthField(mk, "fixedPaid", { ...md.fixedPaid, [expId]: { paid: true, date: td() } }); };
  const handleFixedUnpay = expId => { const fp = { ...md.fixedPaid }; delete fp[expId]; setMonthField(mk, "fixedPaid", fp); };

  useEffect(() => {
    const autoExps = (data.settings.fixedExpenses || []).filter(e => e.autoPayment);
    if (autoExps.length === 0) return;
    const current = md.fixedPaid || {};
    const needsMark = autoExps.filter(e => !current[e.id]);
    if (needsMark.length === 0) return;
    const updated = { ...current };
    needsMark.forEach(e => { updated[e.id] = { paid: true, date: mk + "-01" }; });
    setMonthField(mk, "fixedPaid", updated);
  }, [mk]);
  const handleCCSingle = entry => { setMonthField(mk, "ccSingle", [...(md.ccSingle || []), entry]); flash("✓ Tek çekim kaydedildi"); };
  const deleteCCSingle = id => { setMonthField(mk, "ccSingle", (md.ccSingle || []).filter(e => e.id !== id)); };
  const editCCSingle = id => {
    const entry = (md.ccSingle || []).find(e => e.id === id); if (!entry) return;
    const newAmt = prompt("Tutar:", String(entry.amount)); if (newAmt === null) return;
    const newNote = prompt("Açıklama:", entry.note || entry.merchantName || "");
    setMonthField(mk, "ccSingle", (md.ccSingle || []).map(e => e.id === id ? { ...e, amount: parseFloat(newAmt) || e.amount, note: newNote !== null ? newNote : e.note } : e));
  };
  const handleCardLoad = (amt, date) => { const entry = { id: uid(), amount: amt, date: date || td() }; setData(d => { const newMd = { ...(d.months[mk] || DM()), cardLoaded: ((d.months[mk] || DM()).cardLoaded || 0) + amt, cardEntries: [...((d.months[mk] || DM()).cardEntries || []), entry] }; return { ...d, months: { ...d.months, [mk]: newMd } }; }); flash("✓"); };
  const editCardLoad = () => {
    const newVal = prompt("Toplam yüklenen tutar:", String(md.cardLoaded || 0)); if (newVal === null) return;
    setMonthField(mk, "cardLoaded", parseFloat(newVal) || 0);
  };
  const deleteCardEntry = id => {
    const entries = (md.cardEntries || []).filter(e => e.id !== id);
    const newTotal = entries.reduce((s, e) => s + e.amount, 0);
    setData(d => { const newMd = { ...(d.months[mk] || DM()), cardLoaded: newTotal, cardEntries: entries }; return { ...d, months: { ...d.months, [mk]: newMd } }; });
  };
  const editCardEntry = (id, updates) => {
    const entries = (md.cardEntries || []).map(e => e.id === id ? { ...e, ...updates } : e);
    const newTotal = entries.reduce((s, e) => s + e.amount, 0);
    setData(d => { const newMd = { ...(d.months[mk] || DM()), cardLoaded: newTotal, cardEntries: entries }; return { ...d, months: { ...d.months, [mk]: newMd } }; });
  };
  const handleDebtPay = debtId => { setMonthField(mk, "debtPayments", { ...md.debtPayments, [debtId]: { paid: true, date: td() } }); setData(d => ({ ...d, debts: d.debts.map(db => db.id === debtId ? { ...db, remainingMonths: Math.max(0, db.remainingMonths - 1) } : db) })); flash("✓"); };
  const undoDebtPay = debtId => { const dp = { ...md.debtPayments }; delete dp[debtId]; setMonthField(mk, "debtPayments", dp); setData(d => ({ ...d, debts: d.debts.map(db => db.id === debtId ? { ...db, remainingMonths: db.remainingMonths + 1 } : db) })); };
  const handleInstSave = plan => { setData(d => ({ ...d, installmentPlans: [...d.installmentPlans, plan] })); flash("✓ Taksit kaydedildi"); };
  const handleEventTaksit = (eventId, totalAmount) => {
    setData(d => ({
      ...d,
      plannedEvents: (d.plannedEvents || []).map(ev => ev.id === eventId ? { ...ev, taksitUsed: (ev.taksitUsed || 0) + totalAmount } : ev)
    }));
  };
  const handleAccountPay = entry => { setMonthField(mk, "accountEntries", [...(md.accountEntries || []), entry]); flash("✓ Ödeme kaydedildi"); };
  const deleteAccountEntry = id => { setMonthField(mk, "accountEntries", (md.accountEntries || []).filter(e => e.id !== id)); };
  const editAccountEntry = (id, updates) => { setMonthField(mk, "accountEntries", (md.accountEntries || []).map(e => e.id === id ? { ...e, ...updates } : e)); };
  const handleAccountTransfer = id => { setMonthField(mk, "accountTransferred", { ...(md.accountTransferred || {}), [id]: { transferred: true, date: td() } }); };
  const undoAccountTransfer = id => { const at = { ...(md.accountTransferred || {}) }; delete at[id]; setMonthField(mk, "accountTransferred", at); };
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

  // Kredi kartı aktarım kalemleri
  const isEkstreMode = data.settings.ccPaymentMode === "ekstre";
  const prevMdDash = isEkstreMode ? (data.months[pmk(mk)] || DM()) : null;
  const ccTransferItems = useMemo(() => {
    const items = [];
    const cards = data.settings.cards || [];
    const keyPrefix = isEkstreMode ? "prev-" : "";
    const sourceMonth = isEkstreMode ? pmk(mk) : mk;
    const sourceMd = isEkstreMode ? prevMdDash : md;
    // 1. Sabit zorunlu giderler (kredi kartı ile ödenenler)
    data.settings.fixedExpenses.filter(e => e.paymentMethod === "cc").forEach(e => {
      const cid = e.cardId || cards[0]?.id;
      const cardName = cards.find(c2 => c2.id === cid)?.name;
      items.push({ key: `${keyPrefix}fixed-${e.id}`, label: e.name, sub: `Sabit zorunlu${cardName ? " • " + cardName : ""}${isEkstreMode ? " • " + ml(sourceMonth) : ""}`, amount: e.amount, cardId: cid, sortDate: sourceMonth + "-01" });
    });
    // 2. Tek çekim kredi kartı harcamaları
    (sourceMd?.ccSingle || []).forEach(e => {
      const cid = e.cardId || cards[0]?.id;
      const cardName = cards.find(c2 => c2.id === cid)?.name;
      items.push({ key: `${keyPrefix}single-${e.id}`, label: e.note || e.merchantName || "Tek çekim", sub: `${e.date || ""}${cardName ? " • " + cardName : ""}${isEkstreMode ? " • " + ml(sourceMonth) : ""}`, amount: e.amount, cardId: cid, sortDate: e.date || sourceMonth + "-01" });
    });
    // 3. Taksitler
    const targetMonth = isEkstreMode ? pmk(mk) : mk;
    data.installmentPlans.forEach(p => {
      let cur = p.startMonth;
      for (let i = 0; i < p.months; i++) {
        if (cur === targetMonth) {
          const cid = p.cardId || cards[0]?.id;
          const cardName = cards.find(c2 => c2.id === cid)?.name;
          items.push({ key: `${keyPrefix}inst-${p.id}`, label: p.note || "Taksit", sub: `${p.monthlyPayment > 0 ? `Taksit ${i + 1}/${p.months}` : ""}${cardName ? " • " + cardName : ""}${isEkstreMode ? " • " + ml(sourceMonth) : ""}`, amount: p.monthlyPayment, cardId: cid, sortDate: p.createdDate || sourceMonth + "-01" });
          break;
        }
        cur = nmk(cur);
      }
    });
    return items.sort((a, b) => (b.sortDate || "").localeCompare(a.sortDate || ""));
  }, [data, md, mk, isEkstreMode, prevMdDash]);
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
  const savingsProgress = c.effectiveBudget > 0 ? Math.min((c.remaining / c.effectiveBudget) * 100, 100) : 0;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", padding: "0 16px" }}>
      {msg && <div style={{ background: X.gd, border: `1px solid ${X.g}`, borderRadius: 10, padding: 10, marginBottom: 0, color: X.g, fontSize: 14, fontWeight: 600, textAlign: "center", flexShrink: 0 }}>{msg}</div>}

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
        const totalAmt = [...ccOverdue, ...filteredUpcoming].reduce((s, u) => s + (u.amountRaw || 0), 0);
        const topColor = ccOverdue.length > 0 ? X.r : allItems.length > 0 ? (filteredUpcoming[0]?.color || X.w) : X.td;
        const hasTodayOrOverdue = ccOverdue.length > 0 || filteredUpcoming.some(u => u.diff === 0);
        const subText = allItems.length === 0 ? "Yaklaşan ödeme yok" : ccOverdue.length > 0 ? `${ccOverdue.length} gecikmiş` : filteredUpcoming[0]?.diff === 0 ? "Bugün ödeme var" : `${filteredUpcoming[0]?.diff} gün içinde`;
        return (
          <div style={{ margin: "6px 0 0", flexShrink: 0 }}>
            <div onClick={() => toggle("payments")} style={{ background: allItems.length === 0 ? "rgba(0,0,0,0.04)" : hasTodayOrOverdue ? X.rd : X.wd, border: `1px solid ${topColor}40`, borderRadius: expanded === "payments" ? "14px 14px 0 0" : 14, padding: "10px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20 }}>📅</span>
                <div>
                  <div style={{ color: topColor, fontSize: 14, fontWeight: 800 }}>Ödeme Hatırlatıcı</div>
                  <div style={{ color: X.tm, fontSize: 11, marginTop: 1 }}>{allItems.length > 0 ? `${allItems.length} kalem · ` : ""}{subText}</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: topColor, fontSize: 16, fontWeight: 800, fontFamily: fm }}>{C(totalAmt)}</span>
                <span style={{ color: X.td, fontSize: 12, transform: expanded === "payments" ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
              </div>
            </div>
            {expanded === "payments" && (
              <div style={{ background: allItems.length === 0 ? "rgba(0,0,0,0.04)" : hasTodayOrOverdue ? X.rd : X.wd, border: `1px solid ${topColor}40`, borderTop: `1px solid ${topColor}20`, borderRadius: "0 0 14px 14px", padding: "6px 16px 12px", maxHeight: 100, overflowY: "auto" }}>
                {allItems.length === 0 && <div style={{ color: X.td, fontSize: 12, padding: "6px 0" }}>Önümüzdeki günlerde yaklaşan ödeme bulunmuyor.</div>}
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

      {/* WRAPPER: 6 kart + 4 sekme */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, padding: "6px 0 calc(52px + env(safe-area-inset-bottom, 8px) + 6px) 0", minHeight: 0 }}>

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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "repeat(3, minmax(0, 1fr))", gap: 6, flex: 5, minHeight: 0 }}>
        <div onClick={() => setModal("ccCombined")} style={{ background: "rgba(29,78,216,0.22)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: "1px solid rgba(29,78,216,0.28)", borderRadius: 16, padding: "16px 8px", cursor: "pointer", textAlign: "center", position: "relative", boxShadow: neu, overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <InfoBtn onClick={() => setInfo("ccSingle")} />
          <div style={{ fontSize: 18, marginBottom: 3 }}>💳</div>
          <div style={{ color: X.b, fontSize: 13, fontWeight: 800 }}>Kredi Kartı ile Ödeme</div>
          <div style={{ color: X.t, fontSize: 15, fontWeight: 800, fontFamily: fm, marginTop: 2 }}>{C(c.ccSingleTotal + c.installmentTotal)}</div>
          {activePlans.length > 0 && <div style={{ color: X.td, fontSize: 11, marginTop: 3 }}>{activePlans.length} taksit planı aktif</div>}
        </div>
        <div onClick={() => setModal("accountPay")} style={{ background: "rgba(15,118,110,0.22)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: "1px solid rgba(15,118,110,0.28)", borderRadius: 16, padding: "16px 8px", cursor: "pointer", textAlign: "center", position: "relative", boxShadow: neu, overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 18, marginBottom: 3 }}>🏦</div>
          <div style={{ color: X.g, fontSize: 13, fontWeight: 800 }}>Hesaptan Ödeme</div>
          <div style={{ color: X.t, fontSize: 15, fontWeight: 800, fontFamily: fm, marginTop: 2 }}>{C(c.accountTotal)}</div>
          {(md.accountEntries || []).length > 0 && <div style={{ color: X.td, fontSize: 11, marginTop: 3 }}>{(md.accountEntries || []).length} işlem</div>}
        </div>
        <div onClick={() => setModal("cardLoad")} style={{ background: "rgba(15,118,110,0.32)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: "1px solid rgba(15,118,110,0.30)", borderRadius: 16, padding: "16px 8px", cursor: "pointer", textAlign: "center", position: "relative", boxShadow: neu, overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <InfoBtn onClick={() => setInfo("cardLoad")} />
          <div style={{ fontSize: 18, marginBottom: 3 }}>🛒</div>
          <div style={{ color: X.g, fontSize: 13, fontWeight: 800 }}>Konfor Harcaması Kartı</div>
          <div style={{ color: X.t, fontSize: 15, fontWeight: 800, fontFamily: fm, marginTop: 2 }}>{isEkstreMode && c.generalCardBudget > 0 ? <>{C(c.generalCardBudget - (md.cardLoaded || 0))}<span style={{ color: X.td, fontSize: 11 }}> / {C(c.generalCardBudget)}</span></> : <>{C(md.cardLoaded || 0)}{c.generalCardBudget > 0 && <span style={{ color: X.td, fontSize: 11 }}> / {C(c.generalCardBudget)}</span>}</>}</div>
        </div>
        <div onClick={() => setModal("debtPay")} style={{ background: "rgba(180,83,9,0.28)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: "1px solid rgba(180,83,9,0.28)", borderRadius: 16, padding: "16px 8px", cursor: "pointer", textAlign: "center", position: "relative", boxShadow: neu, overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <InfoBtn onClick={() => setInfo("debt")} />
          <div style={{ fontSize: 18, marginBottom: 3 }}>📌</div>
          <div style={{ color: X.w, fontSize: 13, fontWeight: 800 }}>Borç Ödemeleri</div>
          <div style={{ color: X.t, fontSize: 15, fontWeight: 800, fontFamily: fm, marginTop: 2 }}>{C(c.debtTotal)}</div>
        </div>

        {/* Receipt + Simulation — konfor harcaması kartıyla aynı yükseklik */}
        <div onClick={() => setModal("receipt")} style={{ background: "rgba(194,65,12,0.20)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: "1px solid rgba(194,65,12,0.26)", borderRadius: 16, padding: "16px 8px", cursor: "pointer", textAlign: "center", position: "relative", boxShadow: neu, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 18, marginBottom: 3 }}>📷</div>
          <div style={{ color: X.o, fontSize: 13, fontWeight: 800 }}>Market Fişi</div>
          <div style={{ color: X.td, fontSize: 10, marginTop: 4 }}>Fotoğraf çek veya seç</div>
        </div>
        <div onClick={() => setModal("simulate")} style={{ background: "rgba(124,58,237,0.18)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: "1px solid rgba(124,58,237,0.24)", borderRadius: 16, padding: "16px 8px", cursor: "pointer", textAlign: "center", position: "relative", boxShadow: neu, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 18, marginBottom: 3 }}>🔮</div>
          <div style={{ color: X.p, fontSize: 13, fontWeight: 800 }}>Taksit Simülasyonu</div>
          <div style={{ color: X.td, fontSize: 10, marginTop: 4 }}>Harcama senaryosu test et</div>
        </div>

      </div>
        );
      })()}


      {/* 4 SEKME KUTUSU + SLIDE-UP PANEL */}
      {(() => {
        const totalFixed = data.settings.fixedExpenses.length;
        const paidFixed = data.settings.fixedExpenses.filter(e => md.fixedPaid?.[e.id]).length;
        const pendingCC = ccTransferItems.filter(i => !md.ccTransferred?.[i.key]?.transferred).length;
        const ves = data.settings.variableExpenses || [];
        const { categories: cats } = ves.length > 0 ? categorizeMonthSpending(data, mk) : { categories: {} };
        const totalBudget = ves.reduce((s, ve) => s + (ve.expectedAmount || 0), 0);
        const totalSpentEnv = Object.entries(cats).filter(([k]) => k !== "_uncategorized").reduce((s, [, v]) => s + v, 0);
        const uncat = cats._uncategorized || 0;
        const overBudgetTotal2 = ves.reduce((s, ve) => { const sp = cats[ve.id] || 0; const bg = ve.expectedAmount || 0; return s + (bg > 0 && sp > bg ? sp - bg : 0); }, 0);
        const ccTxsLen = (md.ccSingle || []).length;
        const accTxsLen = (md.accountEntries || []).length;
        const instTxsLen = data.installmentPlans.filter(p => { let cur = p.startMonth; for (let i = 0; i < p.months; i++) { if (cur === mk) return true; cur = nmk(cur); } return false; }).length;
        const totalTxs = ccTxsLen + accTxsLen + instTxsLen;

        const menus = [
          { id: "fixed", icon: "🔒", title: "Sabit Gider Onayları", sub: `${paidFixed}/${totalFixed} ödendi` },
          { id: "cc", icon: "💳", title: "Kredi Kartı Aktarımları", sub: pendingCC > 0 ? `${pendingCC} bekliyor` : "Tümü aktarıldı" },
          { id: "variable", icon: "📈", title: "Değişken Gider Takibi", sub: `${C(totalSpentEnv)} / ${C(totalBudget)}` },
          { id: "history", icon: "📋", title: "Aylık İşlem Geçmişi", sub: `${totalTxs} işlem` },
        ];

        const menuBoxStyle = (id) => ({
          background: menuTab === id ? "rgba(15,118,110,0.08)" : "white",
          borderRadius: 12,
          border: `1px solid ${menuTab === id ? "rgba(15,118,110,0.3)" : "rgba(0,0,0,0.07)"}`,
          overflow: "hidden",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
        });
        const menuHeadStyle = { padding: "10px 10px", display: "flex", alignItems: "center", gap: 8, width: "100%" };

        // Panel içerikleri
        const renderPanelContent = () => {
          if (menuTab === "fixed") return (
            <div style={{ padding: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ color: X.tm, fontSize: 10, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase" }}>Sabit Zorunlu Giderler</div>
                <span style={{ color: X.w, fontSize: 14, fontWeight: 800, fontFamily: fm }}>{C(c.fixedTotal)}</span>
              </div>
              {data.settings.fixedExpenses.length === 0 && <div style={{ color: X.td, fontSize: 12 }}>Ayarlar'dan sabit gider ekleyin.</div>}
              {data.settings.fixedExpenses.map(exp => {
                const paid = md.fixedPaid?.[exp.id];
                return <ItemRow key={exp.id} label={exp.name} sub={`${exp.paymentMethod === "cc" ? "💳" : "🏦"}${exp.autoPayment ? " ⚡oto" : ""}${exp.increaseDate ? " • Artış: " + exp.increaseDate : ""}`} value={exp.amount} color={paid ? X.g : X.t} toggle={!!paid} toggleOn={() => handleFixedPay(exp.id)} toggleOff={() => handleFixedUnpay(exp.id)} toggleLabelOn="Ödendi" toggleLabelOff="Öde" />;
              })}
            </div>
          );

          if (menuTab === "cc") return (
            <div style={{ padding: "14px 14px 90px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ color: X.tm, fontSize: 10, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase" }}>Kredi Kartı Aktarımları</div>
                <span style={{ color: X.b, fontSize: 14, fontWeight: 800, fontFamily: fm }}>{C(ccTransferTotal)}</span>
              </div>
              {ccTransferByCard.length > 0 && (
                <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                  {ccTransferByCard.map(card => (
                    <div key={card.name} style={{ background: X.bd, borderRadius: 8, padding: "4px 10px", display: "flex", gap: 6 }}>
                      <span style={{ color: X.b, fontSize: 12, fontWeight: 700 }}>💳 {card.name}</span>
                      <span style={{ color: X.b, fontSize: 12, fontWeight: 800, fontFamily: fm }}>{C(card.total)}</span>
                    </div>
                  ))}
                </div>
              )}
              {ccTransferItems.map(item => {
                const transferred = md.ccTransferred?.[item.key]?.transferred;
                const isSingle = item.key.startsWith("single-");
                const isInst = item.key.startsWith("inst-");
                const sourceId = item.key.split("-").slice(1).join("-");
                return <ItemRow key={item.key} label={item.label} sub={item.sub} value={item.amount} color={transferred ? X.g : X.t} toggle={!!transferred} toggleOn={() => handleCCTransfer(item.key)} toggleOff={() => undoCCTransfer(item.key)} toggleLabelOn="Aktarıldı" toggleLabelOff="Aktar" onEdit={isSingle ? () => editCCSingle(sourceId) : isInst ? () => editInstallment(sourceId) : null} onDelete={isSingle ? () => deleteCCSingle(sourceId) : isInst ? () => deleteInstallment(sourceId) : null} />;
              })}
            </div>
          );

          if (menuTab === "variable") return (
            <div style={{ padding: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ color: X.tm, fontSize: 10, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase" }}>Değişken Gider Takibi</div>
                <span style={{ color: X.t, fontSize: 14, fontWeight: 800, fontFamily: fm }}>{C(totalSpentEnv)} / {C(totalBudget)}</span>
              </div>
              {ves.length === 0 && <div style={{ color: X.td, fontSize: 12 }}>Ayarlar'dan kategori ekleyin.</div>}
              {ves.map(ve => {
                const spent = cats[ve.id] || 0;
                const budget = ve.expectedAmount || 0;
                const pct2 = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
                const over = budget > 0 && spent > budget;
                const isOpen = expandedCat === ve.id;
                const catEntries = [
                  ...(md.ccSingle || []).filter(e => e.categoryId === ve.id).map(e => ({ key: e.id, desc: e.note || e.merchantName || "KK", date: e.date, amount: e.amount, type: "cc" })),
                  ...(md.accountEntries || []).filter(e => e.categoryId === ve.id).map(e => ({ key: e.id, desc: e.note || "Hesaptan", date: e.date, amount: e.amount, type: "acc" })),
                ].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
                return (
                  <div key={ve.id}>
                    <div onClick={() => setExpandedCat(isOpen ? null : ve.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${X.border}`, cursor: "pointer" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <span style={{ fontSize: 14 }}>{ve.icon || "📋"}</span>
                          <span style={{ color: X.t, fontSize: 13, fontWeight: 700 }}>{ve.name}</span>
                          {over && <span style={{ fontSize: 10, background: X.rd, color: X.r, borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}>+{C(spent - budget)}</span>}
                        </div>
                        {budget > 0 && <div style={{ height: 3, borderRadius: 2, background: "rgba(0,0,0,0.06)" }}><div style={{ height: "100%", borderRadius: 2, background: over ? X.r : X.g, width: `${pct2}%` }} /></div>}
                      </div>
                      <div style={{ textAlign: "right", marginLeft: 10, flexShrink: 0 }}>
                        <div style={{ color: over ? X.r : X.t, fontSize: 13, fontWeight: 800, fontFamily: fm }}>{C(spent)}</div>
                        {budget > 0 && <div style={{ color: X.td, fontSize: 10 }}>/ {C(budget)}</div>}
                      </div>
                    </div>
                    {isOpen && catEntries.length > 0 && (
                      <div style={{ background: "rgba(0,0,0,0.02)", padding: "4px 0 8px" }}>
                        {catEntries.map(tx => (
                          <div key={tx.key} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0" }}>
                            <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: tx.type === "cc" ? "rgba(29,78,216,0.1)" : "rgba(15,118,110,0.1)", color: tx.type === "cc" ? X.b : X.g }}>{tx.type === "cc" ? "KK" : "Hesap"}</span>
                            <span style={{ fontSize: 12, color: X.t, flex: 1 }}>{tx.desc}</span>
                            <span style={{ fontSize: 10, color: X.td }}>{tx.date}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: X.t, fontFamily: fm }}>{C(tx.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {uncat > 0 && (() => {
                const isUncatOpen = expandedCat === "_uncat";
                const uncatEntries = [
                  ...(md.ccSingle || []).filter(e => !e.categoryId || !ves.find(ve => ve.id === e.categoryId)).map(e => ({ key: e.id, desc: e.note || e.merchantName || "KK", date: e.date, amount: e.amount, type: "cc" })),
                  ...(md.accountEntries || []).filter(e => !e.categoryId || !ves.find(ve => ve.id === e.categoryId)).map(e => ({ key: e.id, desc: e.note || "Hesaptan", date: e.date, amount: e.amount, type: "acc" })),
                ].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
                return (
                  <div>
                    <div onClick={() => setExpandedCat(isUncatOpen ? null : "_uncat")} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${X.border}`, cursor: "pointer" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontSize: 14 }}>⚠️</span><span style={{ color: X.r, fontSize: 13, fontWeight: 700 }}>Beklenmedik Giderler</span></div>
                      <span style={{ color: X.r, fontSize: 13, fontWeight: 800, fontFamily: fm }}>{C(uncat)}</span>
                    </div>
                    {isUncatOpen && uncatEntries.map(tx => (
                      <div key={tx.key} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0" }}>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: "rgba(220,38,38,0.1)", color: X.r }}>{tx.type === "cc" ? "KK" : "Hesap"}</span>
                        <span style={{ fontSize: 12, color: X.t, flex: 1 }}>{tx.desc}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: X.r, fontFamily: fm }}>{C(tx.amount)}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
              {/* Beklenmeyen Gider Fonu */}
              {(() => {
                const unexpFund = data.settings.emergencyTampon || 0;
                if (unexpFund === 0) return null;
                const fundUsedAmt = overBudgetTotal2 + uncat;
                const fundRem = Math.max(0, unexpFund - fundUsedAmt);
                const fundPct = Math.min(100, Math.round((fundUsedAmt / unexpFund) * 100));
                const isFundOpen = expandedCat === "_fund";
                return (
                  <div style={{ borderTop: `2px solid ${X.border}`, marginTop: 4 }}>
                    <div onClick={() => setExpandedCat(isFundOpen ? null : "_fund")} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", cursor: "pointer" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 14 }}>🛡️</span>
                          <span style={{ color: X.t, fontSize: 13, fontWeight: 700 }}>Beklenmeyen Gider Fonu</span>
                          <span style={{ fontSize: 10, background: fundPct >= 90 ? X.rd : fundPct >= 60 ? X.wd : X.gd, color: fundPct >= 90 ? X.r : fundPct >= 60 ? X.w : X.g, borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}>%{fundPct}</span>
                        </div>
                        <div style={{ height: 3, borderRadius: 2, background: "rgba(0,0,0,0.06)" }}><div style={{ height: "100%", borderRadius: 2, background: fundPct >= 90 ? X.r : fundPct >= 60 ? X.w : X.g, width: `${fundPct}%` }} /></div>
                      </div>
                      <div style={{ textAlign: "right", marginLeft: 10, flexShrink: 0 }}>
                        <div style={{ color: X.t, fontSize: 13, fontWeight: 800, fontFamily: fm }}>{C(fundRem)}</div>
                        <div style={{ color: X.td, fontSize: 10 }}>/ {C(unexpFund)}</div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          );

          if (menuTab === "history") return (
            <div style={{ padding: "14px" }}>
              <div style={{ color: X.tm, fontSize: 10, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 12 }}>Aylık İşlem Geçmişi</div>
              {(() => {
                const allTxs2 = [
                  ...(md.ccSingle || []).map(e => ({ id: "cc-" + e.id, type: "cc", date: e.date || mk + "-01", desc: e.note || e.merchantName || "Kredi Kartı", amount: e.amount })),
                  ...(md.accountEntries || []).map(e => ({ id: "acc-" + e.id, type: "acc", date: e.date || mk + "-01", desc: e.note || "Hesaptan Ödeme", amount: e.amount })),
                  ...data.installmentPlans.filter(p => { let cur = p.startMonth; for (let i = 0; i < p.months; i++) { if (cur === mk) return true; cur = nmk(cur); } return false; }).map(p => ({ id: "inst-" + p.id, type: "inst", date: mk + "-01", desc: p.note || "Taksitli", amount: p.monthlyPayment })),
                ].sort((a, b) => b.date.localeCompare(a.date));
                const rowBg = { cc: "rgba(29,78,216,0.08)", inst: "rgba(124,58,237,0.08)", acc: "rgba(15,118,110,0.08)" };
                const badgeColor = { cc: X.b, inst: X.p, acc: X.g };
                const badgeLabel = { cc: "Tek Çekim", inst: "Taksitli", acc: "Hesaptan" };
                if (allTxs2.length === 0) return <div style={{ color: X.td, fontSize: 12 }}>Bu ay henüz işlem girilmedi.</div>;
                return allTxs2.map(tx => (
                  <div key={tx.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${X.border}`, background: rowBg[tx.type] }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "rgba(0,0,0,0.08)", color: badgeColor[tx.type] }}>{badgeLabel[tx.type]}</span>
                      <div><div style={{ fontSize: 12, fontWeight: 600, color: X.t }}>{tx.desc}</div><div style={{ fontSize: 10, color: X.td }}>{tx.date}</div></div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: badgeColor[tx.type], fontFamily: fm }}>{C(tx.amount)}</div>
                  </div>
                ));
              })()}
            </div>
          );
          return null;
        };

        return (
          <div style={{ flex: 3, display: "flex", flexDirection: "column", minHeight: 0 }}>
            {/* 2x2 sekme kutuları */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 6, flex: 1, minHeight: 0 }}>
              {menus.map(m => (
                <div key={m.id} style={menuBoxStyle(m.id)} onClick={() => setMenuTab(m.id)}>
                  <div style={menuHeadStyle}>
                    <span style={{ fontSize: 20, flexShrink: 0 }}>{m.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: menuTab === m.id ? "#0F766E" : "#141008", lineHeight: 1.3 }}>{m.title}</div>
                      <div style={{ fontSize: 10, color: "#5A5045", marginTop: 3 }}>{m.sub}</div>
                    </div>
                    <span style={{ color: menuTab === m.id ? X.g : X.td, fontSize: 9, flexShrink: 0 }}>▼</span>
                  </div>
                </div>
              ))}
            </div>

            {/* SLIDE-UP PANEL */}
            {menuTab && (
              <div style={{ position: "fixed", top: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, height: "100%", background: "#EBE3DB", zIndex: 110, display: "flex", flexDirection: "column" }}>
                {/* Üst: geri + 2x2 sekme grid */}
                <div style={{ background: "white", padding: "12px 12px 10px", borderBottom: "1px solid rgba(0,0,0,0.07)", flexShrink: 0 }}>
                  <div onClick={() => setMenuTab(null)} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, cursor: "pointer" }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#F0F0EB", border: "1px solid rgba(0,0,0,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#5A5045" }}>←</div>
                    <div style={{ fontSize: 12, color: "#5A5045", fontWeight: 600 }}>Güncel Durum'a Dön</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    {menus.map(m => (
                      <div key={m.id} onClick={() => setMenuTab(m.id)} style={{ background: menuTab === m.id ? "rgba(15,118,110,0.08)" : "white", borderRadius: 12, border: `1px solid ${menuTab === m.id ? "rgba(15,118,110,0.3)" : "rgba(0,0,0,0.07)"}`, padding: "11px 12px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", minHeight: 58 }}>
                        <span style={{ fontSize: 20, flexShrink: 0 }}>{m.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: menuTab === m.id ? "#0F766E" : "#141008", lineHeight: 1.3 }}>{m.title}</div>
                          <div style={{ fontSize: 10, color: "#5A5045", marginTop: 3 }}>{m.sub}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Kaydırılabilir içerik */}
                <div style={{ flex: 1, overflowY: "auto" }}>
                  {renderPanelContent()}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      </div>{/* WRAPPER KAPANIŞ */}

      {modal === "ccCombined" && <CCCombinedModal data={data} mk={mk} cards={data.settings.cards || []} variableExpenses={data.settings.variableExpenses || []} ccSingleEntries={md.ccSingle || []} onClose={() => setModal(null)} onSaveSingle={handleCCSingle} onDeleteSingle={deleteCCSingle} onSaveInstall={handleInstSave} onDeletePlan={deleteInstallment} onEditPlan={editInstallment} onEventTaksit={handleEventTaksit} />}
      {modal === "accountPay" && <AccountPayModal variableExpenses={data.settings.variableExpenses || []} entries={md.accountEntries || []} transferred={md.accountTransferred || {}} onClose={() => setModal(null)} onSave={handleAccountPay} onDelete={deleteAccountEntry} onEdit={editAccountEntry} onTransfer={handleAccountTransfer} onUndoTransfer={undoAccountTransfer} />}
      {modal === "simulate" && <CCCombinedModal data={data} mk={mk} cards={data.settings.cards || []} variableExpenses={data.settings.variableExpenses || []} ccSingleEntries={md.ccSingle || []} onClose={() => setModal(null)} onSaveSingle={handleCCSingle} onDeleteSingle={deleteCCSingle} onSaveInstall={handleInstSave} onDeletePlan={deleteInstallment} onEditPlan={editInstallment} onEventTaksit={handleEventTaksit} />}
      {modal === "cardLoad" && <CardLoadModal currentLoaded={md.cardLoaded || 0} maxTotal={c.generalCardBudget} entries={md.cardEntries || []} onClose={() => setModal(null)} onSave={handleCardLoad} onDelete={deleteCardEntry} onEdit={editCardEntry} />}
      {modal === "debtPay" && <DebtPayModal debts={data.debts} debtPayments={md.debtPayments} data={data} mk={mk} onClose={() => setModal(null)} onPay={handleDebtPay} onUndo={undoDebtPay} />}
      {modal === "budget" && <BudgetModal mk={mk} cur={md.budget || data.settings.monthlyBudget} def={data.settings.monthlyBudget} onSave={v => setMonthField(mk, "budget", v)} onClose={() => setModal(null)} />}
      {modal === "receipt" && <ReceiptModal receipts={md.receipts || []} onClose={() => setModal(null)} onSave={handleReceiptSave} onDelete={handleReceiptDelete} />}
      {info && info === "cardLoad" && (
        <Modal title="ℹ️ Konfor Harcaması Kartı" onClose={() => setInfo(null)}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ color: X.tm, fontSize: 11, fontWeight: 700, marginBottom: 10 }}>BU AY KART DURUMU</div>
            <div style={{ borderRadius: 10, padding: "12px 14px", background: "rgba(160,190,200,0.35)" }}>
              {[
                { label: "Aylık kart limiti (sabit)", value: c.generalCardBudget, sign: "", hl: true },
                { label: "Bu ay yüklenen", value: md.cardLoaded || 0, sign: "−" },
              ].map((row, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: i === 0 ? "1px solid rgba(0,0,0,0.06)" : "none", fontSize: 13 }}>
                  <span style={{ color: row.hl ? X.t : X.tm }}>{row.sign} {row.label}</span>
                  <span style={{ color: row.hl ? X.g : X.tm, fontFamily: fm, fontWeight: 700 }}>{C(row.value)}</span>
                </div>
              ))}
              <div style={{ borderTop: "1px solid rgba(0,0,0,0.1)", marginTop: 6, paddingTop: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                  <span style={{ color: X.t, fontWeight: 800 }}>Kalan kapasite</span>
                  <span style={{ color: c.cardLoadRemaining > 0 ? X.g : X.r, fontFamily: fm, fontWeight: 800 }}>{C(c.cardLoadRemaining)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 0", color: X.td }}>
                  <span>Acil tampon</span>
                  <span style={{ fontFamily: fm }}>{C(c.emergencyBuffer)}</span>
                </div>
              </div>
            </div>
          </div>
          <div style={{ color: X.t, fontSize: 13, lineHeight: 1.6 }}>Konfor harcaması kartı limitini Ayarlar → Aylık Bütçe bölümünden güncelleyebilirsiniz.</div>
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
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const cards = data.settings.cards || [];
  const mk = selMk;
  const risk = useMemo(() => calcRisk(data, mk), [data, mk]);
  const c = calcMonth(data, mk, null);
  const isCurrentMonth = mk === initialMk;

  const handleSavingsSave = (asset, tx) => {
    // Çekim işleminde güvenlik eşiği kontrolü
    if (tx.type === "sell") {
      const totalSav = getTotalSavingsTL(data);
      const threshold = data.settings.emergencyFundTarget || 0;
      const afterSell = totalSav - (tx.amount * (tx.unitPrice || 1));
      if (threshold > 0 && afterSell < threshold) {
        if (!confirm(`⚠️ Birikim Güvenlik Eşiği\n\nBu çekim sonrası birikiminiz (${afterSell.toLocaleString("tr-TR")} ₺) güvenlik eşiğinizin (${threshold.toLocaleString("tr-TR")} ₺) altına düşecek.\n\nYine de devam etmek istiyor musunuz?`)) return;
      }
    }
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
    const md = data.months[mk] || DM();

    const processTx = (desc, amount, date, categoryId) => {
      if (categoryId && faturaVe && categoryId !== faturaVe.id) return;
      const btId = matchCustomBillType(desc, billTypes);
      if (!btId) return;
      if (btId === "_fatura_other") {
        otherTotal += amount; otherCount++; otherItems.push({ desc, amount, date });
        return;
      }
      if (!byType[btId]) byType[btId] = { total: 0, count: 0, items: [] };
      byType[btId].total += amount;
      byType[btId].count++;
      byType[btId].items.push({ desc, amount, date });
    };

    // 1. CSV ekstresi işlemleri
    Object.values(allCsvData).forEach(cardData => {
      (cardData.transactions || []).forEach(t => processTx(t.desc, t.amount, t.date, t.categoryId));
    });

    // 2. Hesaptan ödeme girişleri
    (md.accountEntries || []).forEach(e => processTx(e.note || "", e.amount, e.date, e.categoryId));

    // 3. CC tek çekim girişleri
    (md.ccSingle || []).forEach(e => processTx((e.note || "") + " " + (e.merchantName || ""), e.amount, e.date, e.categoryId));

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
        text: `Bütçeniz kırmızı alarmda. Bu ay konfor harcaması kartına en fazla ${C(reducedCardMax)} yükleyin (normalin %30'u). Restoran, kıyafet, eğlence gibi isteğe bağlı tüm harcamaları durdurun — sadece market ve zorunlu ihtiyaçlar. Değişken giderlerinizi ${C(variableCutTarget)} altında tutmayı hedefleyin (yani normalden ${C(c.variableTotal - variableCutTarget)} daha az). Yeni hiçbir taksitli alım yapmayın, simülasyon bile çalıştırmayın. Mevcut ${C(totalInstMonthly)} aylık taksit yükünüz var, bunlar kapanana kadar ek yük almayın. Borç ödemelerinizi (${C(totalDebtMonthly)}/ay) aksatmayın çünkü bunlar birikmesin. Birikim havuzunuza dokunmayın — açık kapatma için son çare olarak saklayın. Eğer açık çok büyükse ek gelir kaynakları düşünün ya da ailenize durumu açıkça anlatın.`,
        color: X.r
      });
    } else if (risk.score >= 50) {
      // YÜKSEK
      const reducedCardMax = Math.floor(fullCardMax * 0.5);
      const variableCutTarget = Math.floor(c.variableTotal * 0.92);
      tips.push({
        title: "🟠 Yüksek Risk — Sıkı Tasarruf",
        text: `Bu ay konfor harcaması kartına en fazla ${C(reducedCardMax)} yükleyin (normalin yarısı). Restoran ve eğlence harcamalarını minimum seviyeye çekin, kıyafet alımını erteleyebiliyorsanız erteleyin. Değişken zorunlu giderlerinizi ${C(variableCutTarget)} altında tutun — özellikle elektrik ve akaryakıtta tasarruf yapın. Yeni taksitli alım yapmayın, çok zorunluysa önce mutlaka simülasyon çalıştırıp güvenli olduğunu onaylayın. Mevcut ${C(totalInstMonthly)} aylık taksitlerinizi erken kapatabiliyorsanız kapatmayı düşünün. Borç ödemelerinizi (${C(totalDebtMonthly)}/ay) düzenli yapın. Birikim havuzunuza şimdilik dokunmayın, gelecek 2-3 ay zor geçebilir.`,
        color: "#FF6B35"
      });
    } else if (risk.score >= 30) {
      // ORTA
      const reducedCardMax = Math.floor(fullCardMax * 0.75);
      tips.push({
        title: "🟡 Orta Risk — Aktif Kontrol",
        text: `Bu ay konfor harcaması kartına en fazla ${C(reducedCardMax)} yükleyin (normalin %75'i). Lüks alımları erteleyin, dışarıda yemek sayısını azaltın. Değişken zorunlu giderlerinizde dikkatli olun, beklenen tutarların üstüne çıkmayın. Yeni taksitli alımlardan önce mutlaka simülasyon çalıştırın — en az 6 ay ilerisini test edin, açık çıkıyorsa vazgeçin. Mevcut ${C(totalInstMonthly)} aylık taksit ve ${C(totalDebtMonthly)} aylık borç ödemenizi düzenli yapın, ek yük almayın. Bu ay birikim hedefiniz ${C(c.savingsTarget)} — bu hedefe ulaşmaya çalışın, en azından ${C(Math.floor(c.savingsTarget * 0.7))} biriktirin.`,
        color: X.w
      });
    } else if (risk.score >= 15) {
      // DÜŞÜK
      tips.push({
        title: "🟢 Düşük Risk — Bilinçli Devam",
        text: `Bütçeniz iyi durumda ama bazı uyarıcı sinyaller var. Konfor harcaması kartına normal limitiniz olan ${C(fullCardMax)} kadar yükleyebilirsiniz ama tek seferde ${C(c.cardLoadMaxPerTx)} sınırını unutmayın. Değişken zorunlu giderlerinizi takip edin, beklenmedik artışlar olursa nedenini araştırın. Yeni taksitli alımlardan önce simülasyonu kullanmayı alışkanlık haline getirin — özellikle 3 taksitten uzun olanlar için. Mevcut ${C(totalInstMonthly)} taksit ve ${C(totalDebtMonthly)} borç yükünüz makul seviyede. Bu ay birikim hedefiniz ${C(c.savingsTarget)} — bu hedefin altına düşmemeye çalışın çünkü gelecek ay artışlar geliyor olabilir.`,
        color: "#84CC16"
      });
    } else {
      // GÜVENLİ
      tips.push({
        title: "✅ Güvenli — Sağlıklı Bütçe",
        text: `Bütçeniz sağlıklı, normal hayatınıza devam edebilirsiniz. Konfor harcaması kartına bu ay ${C(fullCardMax)} kadar yükleyebilirsiniz (tek seferde ${C(c.cardLoadMaxPerTx)} sınırı geçerli). Değişken zorunlu giderlerinizi normal seviyede tutun, anormal bir şey görürseniz uyarı alacaksınız. Yeni taksitli alımlar yapabilirsiniz fakat alışkanlık olarak simülasyonu çalıştırın — geleceği görmek faydalı. Mevcut ${C(totalInstMonthly)} taksit ve ${C(totalDebtMonthly)} borç yükünüz kontrol altında. Bu ay birikim hedefiniz ${C(c.savingsTarget)} — bu hedefe ulaşırsanız birikim havuzunuza ${C(c.savingsTarget)} eklenmiş olacak. Lüks bir alım, tatil planı veya hediye alımı için uygun bir dönem.`,
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
        text: `Mevcut harcama düzeninde ${risk.monthsUntilDeficit} ay sonra bütçe açık verecek ve önümüzdeki 12 ay içinde toplam ${C(totalDeficit)} açık birikecek. Bunu önlemek için bu aydan itibaren her ay en az ${C(monthlySaveTarget)} fazladan tasarruf etmelisiniz — yani konfor harcaması kartına yüklediğiniz tutarı bu kadar azaltın ya da değişken giderlerinizi bu kadar kısın.`,
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
          ? `Konfor harcaması kartına bu ay yükleyebileceğiniz tutar ${C(cardLoadCapacity)} seviyesine düştü. Bu, ₺15.000 alt limitinin altında. Aylık zorunlu harcamalarınız (market, akaryakıt, fatura) için yeterli alan kalmıyor. Kredi kartı tek çekim harcamalarınızı veya taksit yükünüzü gözden geçirin.`
          : `Konfor harcaması kartına bu ay yükleyebileceğiniz tutar ${C(cardLoadCapacity)} seviyesinde ve ₺15.000 alt limitine yaklaşıyor. Yeni tek çekim veya taksitli işlem yapmadan önce bu dengeyi göz önünde bulundurun.`,
        color: isHard ? X.r : X.w
      });
    }

    return tips;
  }, [risk, data, c, debtEnds, mk]);

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "20px 16px 90px" }}>
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
          const curCats = getCategorizedByType(data, mk);
          const prevCats = getCategorizedByType(data, prevMk);
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

      {view === "risk" && (() => {
        const ves = data.settings.variableExpenses || [];
        const { categories: cats } = categorizeMonthSpending(data, mk);
        const uncategorized = cats._uncategorized || 0;
        const variableEstimate = ves.reduce((s, ve) => s + (ve.expectedAmount || 0), 0);
        const categorizedTotal = Object.entries(cats).filter(([k]) => k !== "_uncategorized").reduce((s, [, v]) => s + v, 0);
        const variableBlokeKalan = Math.max(0, variableEstimate - categorizedTotal);
        const unexpectedFund = data.settings.emergencyTampon || 0;
        const overBudgetTotal = ves.reduce((s, ve) => { const sp = cats[ve.id] || 0; const bg = ve.expectedAmount || 0; return s + (bg > 0 && sp > bg ? sp - bg : 0); }, 0);
        const fundUsed = overBudgetTotal + uncategorized;
        const fundRemaining = Math.max(0, unexpectedFund - fundUsed);
        const fundUsedPct = unexpectedFund > 0 ? Math.min(100, Math.round((fundUsed / unexpectedFund) * 100)) : 0;
        const overCategories = ves.filter(ve => { const sp = cats[ve.id] || 0; return ve.expectedAmount > 0 && sp > ve.expectedAmount; });

        // 12 ay sürdürülebilirlik
        let mudm = 99; let m12 = nmk(mk);
        for (let i = 0; i < 12; i++) { const fc = calcMonth(data, m12, null); if (fc.remainingX < 0) { mudm = i + 1; break; } m12 = nmk(m12); }

        // Yaklaşan artışlar
        let incCount = 0, incTotal = 0;
        let um = nmk(mk);
        for (let i = 0; i < 6; i++) {
          data.settings.fixedExpenses.forEach(exp => { if (exp.increaseDate && exp.increaseDate.startsWith(um)) { incCount++; incTotal += exp.amount * 0.20; } });
          um = nmk(um);
        }

        // F1: X durumu — bütçenin yüzde kaçı kaldı
        const xRatioOfBudget = c.effectiveBudget > 0 ? c.remainingX / c.effectiveBudget : 0;
        const f1Status = c.remainingX < 0 ? "alarm" : xRatioOfBudget < 0.05 ? "alarm" : xRatioOfBudget < 0.15 ? "dikkat" : "guvenli";
        const f1Desc = c.remainingX < 0
          ? `X = ${C(c.remainingX)} — bütçe açık veriyor. Bekleyen ödemeler bankadaki parayı aşıyor.`
          : xRatioOfBudget < 0.05
          ? `X = ${C(c.remainingX)} — bütçenin yalnızca %${Math.round(xRatioOfBudget*100)}'i kaldı. Kritik düşük.`
          : xRatioOfBudget < 0.15
          ? `X = ${C(c.remainingX)} — bütçenin %${Math.round(xRatioOfBudget*100)}'i kaldı. Manevra alanı dar.`
          : `X = ${C(c.remainingX)} — bütçenin %${Math.round(xRatioOfBudget*100)}'i kaldı. Sağlıklı seviye.`;
        const f1Oneri = c.remainingX < 0
          ? "Acil: hangi bekleyen ödemeleri erteleyebileceğinizi değerlendirin. Yeni harcama kesinlikle yapmayın."
          : xRatioOfBudget < 0.15
          ? `Konfor kartı yüklemesini ${C(Math.min(c.cardLoadRemaining, c.remainingX * 0.5))} ile sınırlı tutun.`
          : null;

        // F2: X < değişken kalan tahmin
        const f2Status = c.remainingX < variableBlokeKalan ? "alarm" : c.remainingX < variableBlokeKalan * 1.3 ? "dikkat" : "guvenli";
        const f2Desc = f2Status === "alarm"
          ? `Kalan X (${C(c.remainingX)}) bu ayın kalan değişken gider tahminini (${C(variableBlokeKalan)}) karşılamıyor. Fark: ${C(variableBlokeKalan - c.remainingX)}.`
          : f2Status === "dikkat"
          ? `X (${C(c.remainingX)}) değişken tahmine (${C(variableBlokeKalan)}) yakın. Tampon çok ince.`
          : `X (${C(c.remainingX)}), kalan değişken tahminin (${C(variableBlokeKalan)}) ${Math.round((c.remainingX/Math.max(variableBlokeKalan,1)-1)*100)}% üzerinde. Yeterli tampon var.`;
        const f2Oneri = f2Status === "alarm"
          ? `Değişken giderlerde ${C(variableBlokeKalan - c.remainingX)} tasarruf yapılmalı. Market ve akaryakıt harcamalarını ertelenebilecek kadar kısın.`
          : f2Status === "dikkat" ? "Bu ay büyük beklenmedik harcama yapmaktan kaçının." : null;

        // F3: 12 ay sürdürülebilirlik — daha anlamlı bağlam
        const f3Status = mudm <= 2 ? "alarm" : mudm <= 5 ? "dikkat" : "guvenli";
        const f3Desc = mudm > 12
          ? "Mevcut gelir-gider dengesinde önümüzdeki 12 ayda bütçe aşımı öngörülmüyor."
          : mudm <= 2
          ? `Kritik: ${mudm} ay içinde bütçe açığa düşebilir. Yaklaşan ${incCount > 0 ? "gider artışları ve " : ""}yüksek sabit giderler baskı yaratıyor.`
          : `${mudm}. ayda bütçe baskıya girebilir. ${incCount > 0 ? `${incCount} kalemde artış bekleniyor.` : "Sabit gider yükü yüksek."}`;
        const f3Oneri = f3Status !== "guvenli"
          ? `Taksit simülatöründe ${mudm}. ayı kontrol edin. Yeni taksitli alım yapmayı erteleyin.` : null;

        // F4: Kategori aşımları — hangi kategori ne kadar aştı
        const f4Status = overBudgetTotal > variableEstimate * 0.3 ? "alarm" : overCategories.length >= 2 ? "dikkat" : overCategories.length >= 1 ? "dikkat" : "guvenli";
        const f4Desc = overCategories.length === 0
          ? "Tüm kategoriler bütçe içinde. İyi iş!"
          : overCategories.map(ve => {
              const sp = cats[ve.id] || 0;
              const ov = sp - ve.expectedAmount;
              return `${ve.name}: ${C(sp)} / ${C(ve.expectedAmount)} (${C(ov)} aşım, %${Math.round((ov/ve.expectedAmount)*100)})`;
            }).join(" • ");
        const f4Oneri = overCategories.length > 0
          ? overBudgetTotal > variableEstimate * 0.3
            ? `Toplam ${C(overBudgetTotal)} aşım var — bu bütçenin ciddi bir kısmı. Aşan kategorilerin gerçek ortalamasına göre tahmini güncelleyin.`
            : `${overCategories[0].name} tahminini gerçek harcamaya göre revize etmeyi düşünün.`
          : null;

        // F5: Beklenmeyen fon — kalan para ayın kaçında
        const ayinKaciGecti = (() => { const now = new Date(); return now.getDate(); })();
        const gunKaldi = 30 - ayinKaciGecti;
        const fonGunlukYanik = ayinKaciGecti > 0 ? fundUsed / ayinKaciGecti : 0;
        const tahminiAySonuFon = Math.max(0, fundRemaining - fonGunlukYanik * gunKaldi);
        const f5Status = unexpectedFund === 0 ? "dikkat" : fundUsedPct >= 90 ? "alarm" : fundUsedPct >= 60 ? "dikkat" : "guvenli";
        const f5Desc = unexpectedFund === 0
          ? "Beklenmeyen Gider Fonu tanımlanmamış. Kategorisiz harcamalar kontrolsüz."
          : fundUsedPct >= 90
          ? `Fon neredeyse tükendi (%${fundUsedPct}). Sadece ${C(fundRemaining)} kaldı, ay sonu tahmini: ${C(tahminiAySonuFon)}.`
          : `%${fundUsedPct} kullanıldı. ${C(fundRemaining)} kaldı. Günlük yakma: ${C(Math.round(fonGunlukYanik))}.`;
        const f5Oneri = unexpectedFund === 0
          ? "Ayarlar'dan Beklenmeyen Gider Fonu tanımlayın. Önerilen: aylık değişken tahminin %25-30'u."
          : f5Status === "alarm"
          ? "Ay sonuna kadar yalnızca zorunlu kategorisiz harcama yapın."
          : f5Status === "dikkat"
          ? `Mevcut tempoda ay sonunda fon tükenebilir. ${C(Math.round(fonGunlukYanik * 5))} haftalık limite çekin.`
          : null;

        // F6: Yaklaşan artışlar — aylara göre detay
        const f6Status = incTotal > c.effectiveBudget * 0.05 ? "alarm" : incCount >= 1 ? "dikkat" : "guvenli";
        const f6Desc = incCount === 0
          ? "Önümüzdeki 6 ayda tanımlı gider artışı yok."
          : `${incCount} kalemde artış bekleniyor — aylık ek yük tahmini: ${C(incTotal)}. Bu bütçenin %${Math.round((incTotal/c.effectiveBudget)*100)}'i.`;
        const f6Oneri = incCount > 0
          ? incTotal > c.effectiveBudget * 0.05
            ? `Artışlar bütçenin %${Math.round((incTotal/c.effectiveBudget)*100)}'ini oluşturuyor. Şimdiden tasarruf planı yapın veya bütçeyi gözden geçirin.`
            : "Gelecek aylarda bütçe revizyonu yapın."
          : null;

        // F7: B grubunun Y'ye oranı
        const bRatio = c.remainingY > 0 ? c.groupB / c.remainingY : 0;
        const f7Status = bRatio > 0.85 ? "alarm" : bRatio > 0.65 ? "dikkat" : "guvenli";
        const f7Desc = `Bekleyen ödemeler (${C(c.groupB)}) bankadaki paranın %${Math.round(bRatio*100)}'ini oluşturuyor.${bRatio > 0.85 ? " Bankadaki paranın büyük çoğunluğu zaten bağlı." : ""}`;
        const f7Oneri = bRatio > 0.85
          ? "Likidite riski yüksek. Ödemeler tamamlandığında rahatlar, ama bu süreçte yeni harcama yapmayın."
          : bRatio > 0.65
          ? "Bekleyen ödemelerin çoğu tamamlanınca X düzelecek. Sabırlı olun."
          : null;

        const factors = [
          { id: "f1", label: "Bu Ay Kullanılabilir Bütçe", status: f1Status, desc: f1Desc, oneri: f1Oneri },
          { id: "f2", label: "Kalan Harcama Gücü", status: f2Status, desc: f2Desc, oneri: f2Oneri },
          { id: "f3", label: "Bütçe Sürdürülebilirliği", status: f3Status, desc: f3Desc, oneri: f3Oneri },
          { id: "f4", label: "Harcama Kategori Kontrolü", status: f4Status, desc: f4Desc, oneri: f4Oneri },
          { id: "f5", label: "Beklenmeyen Gider Fonu", status: f5Status, desc: f5Desc, oneri: f5Oneri },
          { id: "f6", label: "Yaklaşan Gider Artışları", status: f6Status, desc: f6Desc, oneri: f6Oneri },
          { id: "f7", label: "Nakit Akışı Durumu", status: f7Status, desc: f7Desc, oneri: f7Oneri },
        ];

        const past3Months = [pmk(pmk(mk)), pmk(mk)].map(pm => {
          const pmc2 = calcMonth(data, pm, null);
          return { mk: pm, remainingX: pmc2.remainingX, totalSpent: pmc2.totalSpent };
        });

        const callAI = async () => {
          setAiLoading(true); setAiText("");
          try {
            // Tarih ve döngü bilgisi
            const today = new Date();
            const dayOfMonth = today.getDate();
            const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
            const daysLeft = daysInMonth - dayOfMonth;
            const monthProgress = Math.round((dayOfMonth / daysInMonth) * 100);

            // Harcama hızı
            const dailySpend = dayOfMonth > 0 ? categorizedTotal / dayOfMonth : 0;
            const projectedMonthEnd = dailySpend * daysInMonth;

            // Beklenmeyen fon hızı
            const dailyUnexpected = dayOfMonth > 0 ? uncategorized / dayOfMonth : 0;
            const projectedUnexpected = dailyUnexpected * daysInMonth;
            const fundEndEstimate = Math.max(0, unexpectedFund - projectedUnexpected);

            // Kategori detayları
            const catDetails = ves.map(ve => {
              const spent = cats[ve.id] || 0;
              const budget = ve.expectedAmount || 0;
              const dailyCat = dayOfMonth > 0 ? spent / dayOfMonth : 0;
              const projected = Math.round(dailyCat * daysInMonth);
              return `  ${ve.name}: ${C(spent)} harcandı${budget > 0 ? ` / ${C(budget)} tahmin` : ""}${budget > 0 && projected > budget ? ` → ay sonu tahmini ${C(projected)} (${C(projected-budget)} aşım bekleniyor)` : ""}`;
            }).join("\n");

            // Hesaptan ödemeler detayı
            const md2 = data.months[mk] || {};
            const accEntries = (md2.accountEntries || []).map(e =>
              `  ${e.date || "-"} | ${e.note || "Ödeme"} | ${C(e.amount)}`
            ).join("\n");

            // KK tek çekim detayı
            const ccEntries = (md2.ccSingle || []).map(e =>
              `  ${e.date || "-"} | ${e.note || e.merchantName || "Harcama"} | ${C(e.amount)}${e.categoryId ? ` [${ves.find(v=>v.id===e.categoryId)?.name||"?"}]` : " [kategorisiz]"}`
            ).join("\n");

            // Fiş verisi — son 3 ayın fişleri
            const last3Months = [mk, pmk(mk), pmk(pmk(mk))];
            const receiptLines = [];
            last3Months.forEach(m => {
              const mData = data.months[m] || {};
              const receipts = mData.receipts || [];
              if (receipts.length === 0) return;
              receiptLines.push(`\n${ml(m)} fişleri (${receipts.length} fiş):`);
              receipts.forEach(r => {
                receiptLines.push(`  Mağaza: ${r.store || "?"} | Toplam: ${C(r.totalAmount || 0)} | Tarih: ${r.date || "-"}`);
                (r.items || []).forEach(item => {
                  const adet = item.qty ? `${item.qty} adet` : "";
                  receiptLines.push(`    - ${item.name}${item.brand ? " ("+item.brand+")" : ""}: ${C(item.price || 0)} ${adet} [${item.category || "?"}]`);
                });
              });
            });

            // CSV ekstresi verisi
            const csvLines = [];
            Object.entries(data.months[mk]?.csvData || {}).forEach(([cardId, cardData]) => {
              const cardName = (data.settings.cards || []).find(c2 => c2.id === cardId)?.name || cardId;
              const txs = (cardData.transactions || []).slice(0, 30); // max 30 işlem
              if (txs.length === 0) return;
              csvLines.push(`\n${cardName} ekstre (${txs.length} işlem):`);
              txs.forEach(tx => {
                csvLines.push(`  ${tx.date || "-"} | ${tx.desc || "?"} | ${C(tx.amount)}${tx.categoryId ? ` [${ves.find(v=>v.id===tx.categoryId)?.name||"?"}]` : ""}`);
              });
            });

            // Geçmiş ay karşılaştırması
            const historyLines = past3Months.filter(p => p).map(p => {
              const { categories: pcats } = categorizeMonthSpending(data, p.mk);
              const catBreakdown = ves.map(ve => `${ve.name}:${C(pcats[ve.id]||0)}`).join(", ");
              return `${ml(p.mk)}: kullanılabilir=${C(p.remainingX)}, harcama=${C(p.totalSpent)}, kategoriler=[${catBreakdown}]`;
            }).join("\n");

            // Borç TL değeri
            const debtLines = data.debts.filter(d2 => d2.remainingMonths > 0).map(d2 => {
              const rate = d2.currency === "XAU" ? (data.liveRates?.XAU || 0) : d2.currency === "USD" ? (data.liveRates?.USD || 0) : d2.currency === "EUR" ? (data.liveRates?.EUR || 0) : 1;
              return `  ${d2.name}: ${d2.monthlyPayment} ${debtCurSymbol(d2.currency)}/ay = ${C(d2.monthlyPayment * rate)} TL, ${d2.remainingMonths} ay kaldı`;
            }).join("\n");

            // Birikim hedefleri
            const goalLines = (data.savingsGoals || []).filter(g => !g.completed).map(g => {
              const totalAct = (g.transactions || []).reduce((s, t) => s + (t.tlAmount || 0), 0);
              const targetTL = g.currency === "TRY" ? g.targetAmount : g.targetAmount * (data.liveRates?.[g.currency] || 1);
              return `  ${g.name}${g.purpose ? " ("+g.purpose+")" : ""}: ${C(totalAct)} / ${C(targetTL)} TL hedef, öncelik #${g.priority}`;
            }).join("\n");

            // Dönem bilgisi — 15'lik döngü
            const periodStart = 15;
            const periodStartDate = new Date(today.getFullYear(), today.getMonth(), periodStart);
            if (today.getDate() < periodStart) periodStartDate.setMonth(periodStartDate.getMonth() - 1);
            const periodEndDate = new Date(periodStartDate.getFullYear(), periodStartDate.getMonth() + 1, periodStart - 1);
            const periodDays = Math.round((periodEndDate - periodStartDate) / 86400000) + 1;
            const daysIntoPeriod = Math.max(1, Math.round((today - periodStartDate) / 86400000));
            const daysLeftInPeriod = periodDays - daysIntoPeriod;
            const periodProgress = Math.round((daysIntoPeriod / periodDays) * 100);

            // Geçmiş dönem verileri — ilk dönemse boş, birikerek gelişir
            const pastPeriods = [pmk(mk), pmk(pmk(mk)), pmk(pmk(pmk(mk)))].map(m => {
              if (!data.months[m]) return null;
              const pmc = calcMonth(data, m, null);
              const { categories: pc } = categorizeMonthSpending(data, m);
              return { mk: m, label: ml(m), remainingX: pmc.remainingX, totalSpent: pmc.totalSpent, cats: pc };
            }).filter(Boolean);
            const hasPastData = pastPeriods.length > 0;

            // Kategori karşılaştırma
            const catDeltaLines = ves.map(ve => {
              const cur = cats[ve.id] || 0;
              if (!hasPastData) return `  ${ve.name}: ${C(cur)} (ilk dönem — karşılaştırma henüz yok)`;
              const pastAmts = pastPeriods.map(p => p.cats[ve.id] || 0).filter(v => v > 0);
              const avg3 = pastAmts.length > 0 ? Math.round(pastAmts.reduce((a,b) => a+b,0) / pastAmts.length) : 0;
              const prev = pastPeriods[0]?.cats[ve.id] || 0;
              const delta = prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;
              let trend = "";
              if (pastAmts.length >= 2) trend = pastAmts[0] < pastAmts[1] ? " [↑ artış trendi]" : pastAmts[0] > pastAmts[1] ? " [↓ düşüş trendi]" : " [→ sabit]";
              return `  ${ve.name}: bu dönem ${C(cur)}${prev > 0 ? `, önceki ${C(prev)} (${delta !== null ? (delta >= 0 ? "+" : "") + delta + "%" : ""})` : ""}${avg3 > 0 ? `, ${pastAmts.length} dönem ort: ${C(avg3)}` : ""}${trend}`;
            }).join("\n");

            // Aktarılmamış KK kalemleri (AnalysisScreen içinde hesapla)
            const _isEkstre = data.settings.ccPaymentMode === "ekstre";
            const _prevMd = _isEkstre ? (data.months[pmk(mk)] || DM()) : null;
            const _ccItems = (() => {
              const items = [];
              const _cards = data.settings.cards || [];
              const kp = _isEkstre ? "prev-" : "";
              const srcMonth = _isEkstre ? pmk(mk) : mk;
              const srcMd = _isEkstre ? _prevMd : md2;
              data.settings.fixedExpenses.filter(e => e.paymentMethod === "cc").forEach(e => {
                const cid = e.cardId || _cards[0]?.id;
                items.push({ key: `${kp}fixed-${e.id}`, label: e.name, amount: e.amount });
              });
              (srcMd?.ccSingle || []).forEach(e => {
                items.push({ key: `${kp}single-${e.id}`, label: e.note || e.merchantName || "Tek çekim", amount: e.amount });
              });
              const targetMonth = _isEkstre ? pmk(mk) : mk;
              data.installmentPlans.forEach(p => {
                let cur = p.startMonth;
                for (let i = 0; i < p.months; i++) {
                  if (cur === targetMonth) {
                    items.push({ key: `${kp}inst-${p.id}`, label: p.note || "Taksit", amount: p.monthlyPayment });
                    break;
                  }
                  cur = nmk(cur);
                }
              });
              return items;
            })();
            const untransferred = _ccItems.filter(i => !md2.ccTransferred?.[i.key]?.transferred);
            const untransferredLines = untransferred.map(i => `  ${i.label}: ${C(i.amount)}`).join("\n");

            // Dönem içi harcama yığılması
            const allTxDates2 = [...(md2.ccSingle || []), ...(md2.accountEntries || [])].map(e => e.date).filter(Boolean);
            const periodMidDay = new Date(periodStartDate); periodMidDay.setDate(periodStartDate.getDate() + Math.floor(periodDays / 2));
            const firstHalfTxCount = allTxDates2.filter(d => new Date(d) <= periodMidDay).length;
            const firstHalfPct = allTxDates2.length > 0 ? Math.round((firstHalfTxCount / allTxDates2.length) * 100) : 0;

            // Setcard/Multinet kullanım
            const setcardTotal = (md2.ccSingle || []).filter(e => (e.note||"").toLowerCase().includes("setcard") || (e.note||"").toLowerCase().includes("multinet")).reduce((s,e) => s + e.amount, 0);

            // Altın borcu kur riski
            const goldDebt = data.debts.find(d2 => d2.currency === "XAU" && d2.remainingMonths > 0);
            const goldRate = data.liveRates?.XAU || 0;
            const goldRiskLine = goldDebt && goldRate > 0 ? `  ${goldDebt.name}: ${goldDebt.monthlyPayment} gr/ay = ${C(Math.round(goldDebt.monthlyPayment * goldRate))} TL (kur: ${C(goldRate)}/gr), ${goldDebt.remainingMonths} ay kaldı, toplam kalan: ~${C(Math.round(goldDebt.monthlyPayment * goldDebt.remainingMonths * goldRate))} TL` : null;

            // Sabit gider yük oranı
            const fixedRatioPct = c.effectiveBudget > 0 ? Math.round((c.fixedTotal / c.effectiveBudget) * 100) : 0;
            const upcomingIncreaseCount = data.settings.fixedExpenses.filter(e => e.increaseDate && e.increaseDate > mk).length;

            const prompt = `Sen bir kişisel finans analistsin. Türkçe yaz. Teşvik edici veya motive edici olmaya çalışma — sadece gerçekçi analiz yap.

KURALLAR:
- Verilen sayıları TEKRARLAMA, yorumla
- "Tasarruf edin" gibi boş tavsiye VERME
- Olmayan veriyi UYDURMA
- Geçmiş dönem yoksa karşılaştırma yapma, "ilk dönem" olduğunu belirt
- MADDE MADDE yaz, paragraf değil — her başlık altında kısa maddeler

ÖDEME DÖNEMİ:
- Döngü: her ayın 15'inden takip eden ayın 14'üne
- Kart ekstre kapanışı: her ayın 15'i
- Mevcut dönem: ${mk} → ${periodStartDate.toLocaleDateString("tr-TR")} – ${periodEndDate.toLocaleDateString("tr-TR")}
- Dönemin ${daysIntoPeriod}. günü, ${daysLeftInPeriod} gün kaldı (%${periodProgress})

BÜTÇE:
- Bütçe: ${C(c.effectiveBudget)} | Bankada (Y): ${C(c.remainingY)} | Bloke (B): ${C(c.groupB)} | Kullanılabilir (X): ${C(c.remainingX)}
- Sabit giderler bütçenin %${fixedRatioPct}'i | Yaklaşan artış: ${upcomingIncreaseCount} kalem

HARCAMA HIZI:
- Değişken harcama: ${C(categorizedTotal)} / ${daysIntoPeriod} gün = günlük ${C(Math.round(categorizedTotal/daysIntoPeriod))}
- Dönem sonu tahmini: ${C(Math.round((categorizedTotal/daysIntoPeriod)*periodDays))} (bütçe: ${C(variableEstimate)})
- Kategorisiz: ${C(uncategorized)} | Beklenmeyen Fon: %${fundUsedPct} kullanıldı, ${C(fundRemaining)} kaldı
- Harcama yığılması: işlemlerin %${firstHalfPct}'i dönemin ilk yarısında
${setcardTotal > 0 ? `- Setcard/Multinet bu dönem: ${C(setcardTotal)}` : ""}

KATEGORİ (bu dönem${hasPastData ? " vs geçmiş" : " — ilk dönem"}):
${catDeltaLines}

HESAPTAN ÖDEMELER:
${accEntries || "  Kayıt yok"}

KREDİ KARTI TEK ÇEKİM:
${ccEntries || "  Kayıt yok"}

AKTARILMAMIŞ KK (henüz hesaba geçmedi):
${untransferredLines || "  Tümü aktarıldı"}
${receiptLines.length > 0 ? "\nMARKET FİŞİ:" + receiptLines.join("\n") : "\nMARKET FİŞİ: Yok"}
${csvLines.length > 0 ? "\nEKSTRE:" + csvLines.join("\n") : ""}
${pastPeriods.length > 0 ? "\nGEÇMİŞ DÖNEMLER:\n" + pastPeriods.map(p => `  ${p.label}: harcama=${C(p.totalSpent)}, X=${C(p.remainingX)}`).join("\n") : "\nGEÇMİŞ: İlk dönem, veri yok"}

BORÇLAR:
${goldRiskLine ? goldRiskLine : (debtLines || "  Aktif borç yok")}

BİRİKİM HEDEFLERİ:
${goalLines || "  Tanımlanmamış"}

BEKLEYEN ÖDEMELER:
${data.settings.fixedExpenses.filter(e => !data.months[mk]?.fixedPaid?.[e.id]).map(e => `  ${e.name}: ${C(e.amount)} — ${e.paymentDay || "?"}. günde`).join("\n") || "  Tümü ödendi"}

GÖREV — aşağıdaki başlıklar altında madde madde yaz:

## Dönem Seyri
- Harcama hızı dönem sonuna kadar ne getirir? Sayısal tahmin.
- Bütçeyi aşma riski var mı?

## Kategori Analizi  
- Hangi kategori beklenenden sapıyor?
- ${hasPastData ? "Geçmiş dönemlerle kıyasla, trend var mı?" : "İlk dönem olduğunu belirt, karşılaştırma yok."}

## Nakit Akışı
- Aktarılmamış ödemeler hesaba geçince X ne olur?
- Kritik sıkışma noktası var mı?

## Dönem Sonu Tahmini
- Birikim havuzuna ne kadar girecek? Alt ve üst tahmin.
${goldRiskLine ? "- Altın borcu kur değişiminin etkisini değerlendir." : ""}

## Aksiyonlar
- Bu döneme özel 2 somut aksiyon. Rakam ver, genel tavsiye verme.`;

            const idToken = await auth.currentUser?.getIdToken();
            if (!idToken) { setAiText("Oturum bulunamadı. Çıkış yapıp tekrar giriş yapın."); setAiLoading(false); return; }
            const res = await fetch("/api/ai-advisor", {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
              body: JSON.stringify({ prompt })
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || "Analiz yapılamadı");
            setAiText(d.text || "");
            if (typeof d.remaining === "number") setAiText(prev => prev + `\n\n---\n_Bugün ${d.remaining} AI danışman hakkınız kaldı._`);
          } catch(e) { setAiText("Analiz yüklenemedi: " + e.message); }
          setAiLoading(false);
        };

        const alarmCount = factors.filter(f => f.status === "alarm").length;
        const dikkatCount = factors.filter(f => f.status === "dikkat").length;
        const overallStatus = alarmCount >= 2 ? "alarm" : alarmCount >= 1 ? "dikkat" : dikkatCount >= 3 ? "dikkat" : "guvenli";
        const statusConfig = { alarm: { label: "🚨 Alarm", sub: "Acil önlem alınmalı", color: X.r, bg: "rgba(220,38,38,0.08)", border: "rgba(220,38,38,0.3)" }, dikkat: { label: "⚠️ Dikkat", sub: "Bazı kalemler izlenmeli", color: X.w, bg: "rgba(180,83,9,0.08)", border: "rgba(180,83,9,0.3)" }, guvenli: { label: "✅ Güvende", sub: "Bütçeniz sağlıklı görünüyor", color: X.g, bg: "rgba(15,118,110,0.08)", border: "rgba(15,118,110,0.3)" } };
        const sc = statusConfig[overallStatus];

        // Projeksiyon
        const proj = [];
        let pm6 = mk;
        for (let i2 = 0; i2 < 12; i2++) {
          pm6 = nmk(pm6);
          const pmc3 = calcMonth(data, pm6, null);
          const events = [];
          data.debts.filter(d2 => d2.remainingMonths > 0).forEach(d2 => {
            let em = mk; for (let j = 0; j < d2.remainingMonths; j++) em = nmk(em);
            if (em === pm6) events.push({ icon: "🎯", text: `${d2.name} borcu bitti`, color: X.g });
          });
          data.settings.fixedExpenses.forEach(exp => {
            if (exp.increaseDate && exp.increaseDate.startsWith(pm6)) events.push({ icon: "📈", text: `${exp.name} artışı`, color: X.w });
          });
          proj.push({ mk: pm6, mc: pmc3, events });
        }

        return (
          <>
            {/* AI TAVSİYE — üstte */}
            <Card s={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ color: X.t, fontSize: 14, fontWeight: 800 }}>🤖 AI Finans Danışmanı</div>
                <button onClick={callAI} disabled={aiLoading} style={{ background: X.gd, border: `1px solid ${X.g}`, borderRadius: 8, padding: "6px 12px", color: X.g, fontSize: 12, fontWeight: 700, cursor: aiLoading ? "default" : "pointer", fontFamily: ff, opacity: aiLoading ? 0.6 : 1 }}>
                  {aiLoading ? "⏳ Analiz ediliyor..." : aiText ? "🔄 Yenile" : "✨ Analiz Et"}
                </button>
              </div>
              {!aiText && !aiLoading && (
                <div style={{ color: X.td, fontSize: 13, textAlign: "center", padding: "16px 0" }}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>🤖</div>
                  <div>Tüm bütçe verileriniz analiz edilip kişisel tavsiye üretilecek</div>
                </div>
              )}
              {aiLoading && <div style={{ color: X.td, fontSize: 13, textAlign: "center", padding: "16px 0" }}><div style={{ fontSize: 28, marginBottom: 6 }}>⏳</div><div>Veriler işleniyor...</div></div>}
              {aiText && <div style={{ color: X.t, fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{aiText}</div>}
            </Card>

            {/* DURUM ÖZETİ */}
            <Card s={{ marginBottom: 12, background: sc.bg, border: `1px solid ${sc.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                  <div style={{ color: sc.color, fontSize: 20, fontWeight: 900 }}>{sc.label}</div>
                  <div style={{ color: X.tm, fontSize: 12, marginTop: 2 }}>{sc.sub}</div>
                </div>
                <div style={{ fontSize: 11, color: X.td }}>{alarmCount} alarm · {dikkatCount} dikkat · {factors.length - alarmCount - dikkatCount} iyi</div>
              </div>
              {factors.map(f => {
                const icon = { alarm: "🔴", dikkat: "🟡", guvenli: "🟢" }[f.status];
                const color = { alarm: X.r, dikkat: X.w, guvenli: X.g }[f.status];
                return (
                  <div key={f.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "7px 0", borderBottom: `1px solid ${X.border}` }}>
                    <span style={{ fontSize: 11, flexShrink: 0, marginTop: 2 }}>{icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: X.t, fontSize: 13, fontWeight: 700 }}>{f.label}</div>
                      <div style={{ color: X.td, fontSize: 11, marginTop: 1 }}>{f.desc}</div>
                      {f.oneri && <div style={{ color, fontSize: 11, fontWeight: 600, marginTop: 3 }}>→ {f.oneri}</div>}
                    </div>
                  </div>
                );
              })}
            </Card>
          </>
        );
      })()}

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
                    <div style={{ color: reached ? X.g : X.w, fontSize: 13, fontWeight: 700 }}>🛡️ Birikim Güvenlik Eşiği {reached && "✓"}</div>
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
                <Card key={asset} s={{ marginBottom: 8, borderColor: expanded ? info.color : X.border, opacity: isEmpty ? 0.6 : 1 }}>
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
        (md.ccSingle || []).forEach(e => addTx(e.date, "Kredi Kartı Tek Çekim", e.amount, e.note || e.merchantName));
        (md.accountEntries || []).forEach(e => addTx(e.date, "Hesaptan Ödeme", e.amount, e.note || "Hesaptan Ödeme"));
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
        if ((md.cardLoaded || 0) > 0) addTx(mk + "-01", "Kart", md.cardLoaded, "Konfor harcaması kartı");

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
  const [savSub, setSavSub] = useState("assets");
  const [incSim, setIncSim] = useState({});
  const [detail, setDetail] = useState(null);

  // Goals state — top level (hook kuralı gereği IIFE içinde olamaz)
  const [gEditing, setGEditing] = useState(null);
  const [gOpenAcc, setGOpenAcc] = useState("info");
  const [gName, setGName] = useState("");
  const [gPurpose, setGPurpose] = useState("");
  const [gPriority, setGPriority] = useState(1);
  const [gDeadline, setGDeadline] = useState("");
  const [gCurrency, setGCurrency] = useState("TRY");
  const [gAmount, setGAmount] = useState("");
  const [gNote, setGNote] = useState("");
  const [gTransferModal, setGTransferModal] = useState(null);
  const [gTransferAmt, setGTransferAmt] = useState("");
  const [gTransferFrom, setGTransferFrom] = useState("savings");

  // Planlı Etkinlik form state
  const [evEditing, setEvEditing] = useState(null);
  const [evName, setEvName] = useState("");
  const [evDate, setEvDate] = useState("");
  const [evBudget, setEvBudget] = useState("");
  const [evKumbara, setEvKumbara] = useState("");
  const [evNote, setEvNote] = useState("");

  // Borç form state
  const [debtEditing, setDebtEditing] = useState(null);
  const [debtOpenAcc, setDebtOpenAcc] = useState("info");
  const [debtN, setDebtN] = useState("");
  const [debtC, setDebtC] = useState("TRY");
  const [debtTotal, setDebtTotal] = useState("");
  const [debtMonths, setDebtMonths] = useState("");
  const [debtPDay, setDebtPDay] = useState("");
  const [debtPDayEnd, setDebtPDayEnd] = useState("");
  const [debtStartMonth, setDebtStartMonth] = useState(mk);
  const [debtPlanType, setDebtPlanType] = useState("equal");
  const [debtBorrowDate, setDebtBorrowDate] = useState(td());
  const [debtPurpose, setDebtPurpose] = useState("");
  const [debtNoteText, setDebtNoteText] = useState("");

  const debtStartNew = () => {
    setDebtN(""); setDebtC("TRY"); setDebtTotal(""); setDebtMonths("");
    setDebtPDay(""); setDebtPDayEnd(""); setDebtStartMonth(mk);
    setDebtPlanType("equal"); setDebtBorrowDate(td()); setDebtPurpose(""); setDebtNoteText("");
    setDebtOpenAcc("info"); setDebtEditing("new");
  };
  const debtStartEdit = d2 => {
    setDebtN(d2.name); setDebtC(d2.currency);
    const t = d2.totalAmount || (d2.monthlyPayment * (d2.totalMonths || d2.remainingMonths));
    setDebtTotal(String(t)); setDebtMonths(String(d2.totalMonths || d2.remainingMonths));
    setDebtPDay(d2.paymentDay ? String(d2.paymentDay) : "");
    setDebtPDayEnd(d2.paymentDayEnd ? String(d2.paymentDayEnd) : "");
    setDebtStartMonth(d2.startMonth || mk);
    setDebtPlanType(d2.planType || "equal");
    setDebtBorrowDate(d2.borrowDate || td());
    setDebtPurpose(d2.purpose || ""); setDebtNoteText(d2.noteText || "");
    setDebtOpenAcc("info"); setDebtEditing(d2.id);
  };
  const debtCancel = () => setDebtEditing(null);

  const debtTotalNum = parseFloat(debtTotal) || 0;
  const debtMonthsNum = parseInt(debtMonths) || 0;
  const debtMonthlyCalc = debtMonthsNum > 0 ? debtTotalNum / debtMonthsNum : 0;
  const debtLiveRate = debtC === "XAU" ? (data.liveRates?.XAU || 0) : debtC === "USD" ? (data.liveRates?.USD || 0) : debtC === "EUR" ? (data.liveRates?.EUR || 0) : 1;
  const debtTLTotal = debtC === "TRY" ? debtTotalNum : debtTotalNum * debtLiveRate;
  const debtTLMonthly = debtC === "TRY" ? debtMonthlyCalc : debtMonthlyCalc * debtLiveRate;

  const debtSave = () => {
    if (!debtN || !debtTotalNum) return;
    if (debtPlanType !== "lump" && !debtMonthsNum) return;
    setData(d => {
      const list = [...d.debts];
      const entry = {
        id: debtEditing === "new" ? uid() : debtEditing,
        name: debtN, currency: debtC,
        totalAmount: debtTotalNum,
        totalMonths: debtPlanType === "lump" ? 1 : debtMonthsNum,
        remainingMonths: debtPlanType === "lump" ? 1 : debtMonthsNum,
        monthlyPayment: debtPlanType === "lump" ? debtTotalNum : debtMonthlyCalc,
        paymentDay: parseInt(debtPDay) || null,
        paymentDayEnd: parseInt(debtPDayEnd) || null,
        startMonth: debtStartMonth, planType: debtPlanType,
        borrowDate: debtBorrowDate, purpose: debtPurpose, noteText: debtNoteText
      };
      if (debtEditing === "new") { list.push(entry); }
      else {
        const idx = list.findIndex(x => x.id === debtEditing);
        if (idx >= 0) {
          const old = list[idx];
          const paidCount = (old.totalMonths || old.remainingMonths) - old.remainingMonths;
          list[idx] = { ...entry, remainingMonths: Math.max(0, entry.totalMonths - paidCount) };
        }
      }
      return { ...d, debts: list };
    });
    debtCancel();
  };

  const debtRm = id => { if (confirm("Bu borcu silmek istediğinize emin misiniz?")) setData(d => ({ ...d, debts: d.debts.filter(x => x.id !== id) })); };

  const debtAccHead = (id, icon, title, sub, ok) => (
    <div onClick={() => setDebtOpenAcc(o => o === id ? null : id)} style={{ background: "white", padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", borderRadius: debtOpenAcc === id ? "12px 12px 0 0" : 12, border: `1px solid rgba(0,0,0,0.08)`, borderBottom: debtOpenAcc === id ? "1px solid rgba(0,0,0,0.06)" : undefined, marginBottom: debtOpenAcc === id ? 0 : 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <div>
          <div style={{ color: X.t, fontSize: 13, fontWeight: 700 }}>{title}</div>
          {sub && <div style={{ color: X.td, fontSize: 11, marginTop: 1 }}>{sub}</div>}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ width: 18, height: 18, borderRadius: "50%", background: ok ? X.g : X.border, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 10 }}>{ok ? "✓" : "–"}</div>
        <span style={{ color: X.td, fontSize: 10, transform: debtOpenAcc === id ? "rotate(180deg)" : "none" }}>▼</span>
      </div>
    </div>
  );

  const debtAccBody = children => (
    <div style={{ background: "#F5F0EB", padding: "12px 14px", borderRadius: "0 0 12px 12px", border: "1px solid rgba(0,0,0,0.08)", borderTop: "none", marginBottom: 6 }}>
      {children}
    </div>
  );

  const inpStyle = { width: "100%", background: "white", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10, padding: "10px 12px", fontSize: 14, color: X.t, boxSizing: "border-box" };
  const lblStyle = { color: X.td, fontSize: 12, marginBottom: 4, fontWeight: 600, display: "block" };

  const debtForm = debtEditing ? (
    <div style={{ background: "rgba(180,83,9,0.04)", border: `1px solid rgba(180,83,9,0.2)`, borderRadius: 14, padding: 12, marginBottom: 12 }}>
      <div style={{ color: X.w, fontSize: 14, fontWeight: 800, marginBottom: 10 }}>{debtEditing === "new" ? "➕ Yeni Borç" : "✎ Düzenle"}</div>
      {debtAccHead("info", "👤", "Borç Bilgileri", debtN ? `${debtN}${debtBorrowDate ? " · " + debtBorrowDate : ""}` : "Alacaklı ve tarih", !!debtN)}
      {debtOpenAcc === "info" && debtAccBody(<>
        <label style={lblStyle}>Borç Adı / Alacaklı</label>
        <input value={debtN} onChange={e => setDebtN(e.target.value)} placeholder="Örn: Dostlar Sandığı, Ahmet Abi..." style={{ ...inpStyle, marginBottom: 10 }} />
        <label style={lblStyle}>Alındığı Tarih</label>
        <input type="date" value={debtBorrowDate} onChange={e => setDebtBorrowDate(e.target.value)} style={{ ...inpStyle, marginBottom: 10 }} />
        <label style={lblStyle}>Amaç (opsiyonel)</label>
        <input value={debtPurpose} onChange={e => setDebtPurpose(e.target.value)} placeholder="Örn: Ev tadilatı, araba..." style={{ ...inpStyle, marginBottom: 10 }} />
        <label style={lblStyle}>Not (opsiyonel)</label>
        <input value={debtNoteText} onChange={e => setDebtNoteText(e.target.value)} placeholder="Ek detaylar..." style={inpStyle} />
      </>)}

      {debtAccHead("amount", "💰", "Tutar ve Birim", debtTotalNum > 0 ? `${debtTotalNum} ${debtCurSymbol(debtC)}${debtC !== "TRY" && debtLiveRate ? " · ≈ " + C(debtTLTotal) : ""}` : "Miktar ve para birimi", debtTotalNum > 0)}
      {debtOpenAcc === "amount" && debtAccBody(<>
        <label style={lblStyle}>Birim</label>
        <select value={debtC} onChange={e => setDebtC(e.target.value)} style={{ ...inpStyle, marginBottom: 10 }}>
          {[{ v: "TRY", l: "₺ Türk Lirası" }, { v: "USD", l: "$ Dolar" }, { v: "EUR", l: "€ Euro" }, { v: "XAU", l: "🪙 Altın (gram)" }].map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
        <label style={lblStyle}>Toplam Borç Miktarı</label>
        <input type="number" value={debtTotal} onChange={e => setDebtTotal(e.target.value)} placeholder={debtC === "XAU" ? "Örn: 56" : "Örn: 50000"} style={{ ...inpStyle, marginBottom: 10 }} />
        {debtC !== "TRY" && debtLiveRate > 0 && debtTotalNum > 0 && (
          <div style={{ background: "rgba(15,118,110,0.08)", border: "1px solid rgba(15,118,110,0.2)", borderRadius: 10, padding: "8px 12px", fontSize: 12, color: X.g, fontWeight: 600 }}>≈ {C(debtTLTotal)} (bugünkü kur)</div>
        )}
      </>)}

      {debtAccHead("plan", "📅", "Geri Ödeme Planı",
        (debtPlanType === "equal" && debtMonthsNum > 0 && debtPDay) ? `Eşit · ${debtMonthsNum} ay · ${debtPDay}'inde` :
        debtPlanType === "lump" ? "Toplu ödeme" : "Plan tipini seçin",
        debtPlanType === "lump" ? !!debtPDay : (debtMonthsNum > 0 && !!debtPDay))}
      {debtOpenAcc === "plan" && debtAccBody(<>
        <label style={lblStyle}>Plan Tipi</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 12 }}>
          {[{ v: "equal", l: "📅 Eşit" }, { v: "free", l: "🔄 Serbest" }, { v: "lump", l: "💰 Toplu" }].map(pt => (
            <button key={pt.v} onClick={() => setDebtPlanType(pt.v)} style={{ background: debtPlanType === pt.v ? X.g : "white", border: `1px solid ${debtPlanType === pt.v ? X.g : "rgba(0,0,0,0.08)"}`, borderRadius: 10, padding: "8px 4px", textAlign: "center", cursor: "pointer", fontSize: 11, fontWeight: 700, color: debtPlanType === pt.v ? "white" : X.td, fontFamily: ff }}>{pt.l}</button>
          ))}
        </div>
        {debtPlanType !== "lump" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            <div><label style={lblStyle}>Vade (ay)</label><input type="number" value={debtMonths} onChange={e => setDebtMonths(e.target.value)} placeholder="Örn: 8" style={inpStyle} /></div>
            <div><label style={lblStyle}>Başlangıç Ayı</label><input type="month" value={debtStartMonth} onChange={e => setDebtStartMonth(e.target.value)} style={inpStyle} /></div>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          <div><label style={lblStyle}>Ödeme Günü</label><input type="number" value={debtPDay} onChange={e => setDebtPDay(e.target.value)} placeholder="Örn: 28" style={inpStyle} /></div>
          <div><label style={lblStyle}>Son Gün (ops.)</label><input type="number" value={debtPDayEnd} onChange={e => setDebtPDayEnd(e.target.value)} placeholder="Örn: 31" style={inpStyle} /></div>
        </div>
        {debtTotalNum > 0 && (debtPlanType === "lump" || debtMonthsNum > 0) && (
          <div style={{ background: "rgba(180,83,9,0.08)", border: "1px solid rgba(180,83,9,0.25)", borderRadius: 12, padding: "10px 14px" }}>
            <div style={{ color: X.w, fontSize: 10, fontWeight: 700, marginBottom: 3 }}>{debtPlanType === "lump" ? "ÖDENECEK TUTAR" : "AYLIK TAKSİT"}</div>
            <div style={{ color: X.w, fontSize: 18, fontWeight: 800, fontFamily: fm }}>{debtPlanType === "lump" ? `${debtTotalNum} ${debtCurSymbol(debtC)}` : `${debtMonthlyCalc.toFixed(debtC === "TRY" ? 0 : 2)} ${debtCurSymbol(debtC)}`}</div>
            <div style={{ color: X.td, fontSize: 11, marginTop: 2 }}>
              {debtC !== "TRY" && debtLiveRate > 0 ? `≈ ${C(debtPlanType === "lump" ? debtTLTotal : debtTLMonthly)}${debtPlanType !== "lump" ? ` /ay · ${debtMonthsNum} ay · toplam ${C(debtTLTotal)}` : ""}` : debtPlanType !== "lump" ? `${debtMonthsNum} ay · toplam ${C(debtTotalNum)}` : ""}
            </div>
          </div>
        )}
      </>)}

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <Btn onClick={debtSave} c={X.w} s={{ flex: 1 }} disabled={!debtN || !debtTotalNum || (debtPlanType !== "lump" && !debtMonthsNum)}>💾 Kaydet</Btn>
        <Btn onClick={debtCancel} v="outline" c={X.td} s={{ flex: 1 }}>İptal</Btn>
      </div>
    </div>
  ) : null;

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
    { id: "events", l: "Planlı Etkinlikler", i: "📅" },
  ];

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "20px 16px 90px" }}>
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
            <div style={{ marginBottom: 12 }}>
              <div style={{ color: X.tm, fontSize: 13, fontWeight: 700, marginBottom: 10 }}>BORÇLAR</div>
              {!debtEditing && (
                <button onClick={debtStartNew} style={{ width: "100%", background: X.wd, border: `2px dashed ${X.w}`, borderRadius: 14, padding: "16px", color: X.w, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: ff, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <span style={{ fontSize: 20 }}>➕</span> Yeni Borç Ekle
                </button>
              )}
            </div>

            {debtEditing === "new" && debtForm}

            {activeDebts.length === 0 && !debtEditing ? (
              <Card s={{ textAlign: "center", padding: 24 }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>📌</div>
                <div style={{ color: X.td, fontSize: 13 }}>Henüz borç kaydı yok</div>
                <div style={{ color: X.td, fontSize: 11, marginTop: 4 }}>Yukarıdaki "+ Yeni Borç" ile ekleyin</div>
              </Card>
            ) : activeDebts.map(d => {
              const sym = debtCurSymbol(d.currency);
              const tlVal = debtTLValue(d, data, mk);
              const totalM = d.totalMonths || d.remainingMonths;
              const paidCount = totalM - d.remainingMonths;
              const end = debtEnds.find(de => de.id === d.id);
              const progressPct = totalM > 0 ? (paidCount / totalM) * 100 : 0;
              return (
                <div key={d.id}>
                  <Card s={{ marginBottom: debtEditing === d.id ? 0 : 8, borderRadius: debtEditing === d.id ? "14px 14px 0 0" : 14, borderLeft: `3px solid ${X.w}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: X.t, fontSize: 14, fontWeight: 700 }}>{d.name}</div>
                        {(d.borrowDate || d.purpose) && (
                          <div style={{ color: X.td, fontSize: 11, marginTop: 2 }}>
                            {d.borrowDate && <span>{d.borrowDate}</span>}
                            {d.purpose && <span>{d.borrowDate ? " · " : ""}{d.purpose}</span>}
                          </div>
                        )}
                        {d.noteText && <div style={{ color: X.td, fontSize: 11, fontStyle: "italic", marginTop: 2 }}>{d.noteText}</div>}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 8 }}>
                        <button onClick={() => debtEditing === d.id ? debtCancel() : debtStartEdit(d)} style={{ background: X.bd, border: `1px solid ${X.b}`, borderRadius: 6, padding: "4px 10px", color: X.b, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{debtEditing === d.id ? "▲" : "✎"}</button>
                        <button onClick={() => debtRm(d.id)} style={{ background: X.rd, border: `1px solid ${X.r}`, borderRadius: 6, padding: "4px 10px", color: X.r, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>✕</button>
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div style={{ color: X.tm, fontSize: 12 }}>
                        <span style={{ fontFamily: fm, fontWeight: 700 }}>{d.monthlyPayment.toFixed(d.currency === "TRY" ? 0 : 2)} {sym}</span>
                        {d.currency !== "TRY" && <span style={{ color: X.td }}> ({C(tlVal)})</span>}
                        <span style={{ color: X.td }}> /ay</span>
                      </div>
                      <div style={{ color: X.td, fontSize: 11 }}>{paidCount}/{totalM} · {end ? ml(end.endMonth) + "'de biter" : `${d.remainingMonths} ay kaldı`}</div>
                    </div>
                    <div style={{ height: 5, borderRadius: 3, background: "rgba(0,0,0,0.06)" }}>
                      <div style={{ height: "100%", borderRadius: 3, background: X.g, width: `${progressPct}%`, transition: "width 0.4s" }} />
                    </div>
                  </Card>
                  {debtEditing === d.id && <div style={{ marginBottom: 8 }}>{debtForm}</div>}
                </div>
              );
            })}

            {/* BORÇ BİTİŞ PLANLAYICISI */}
            {debtEnds.length > 0 && (
              <Card s={{ border: `1px solid ${X.g}`, background: "rgba(22,163,74,0.06)", marginTop: 8 }}>
                <div style={{ color: X.g, fontSize: 13, fontWeight: 700, marginBottom: 10 }}>🎯 BORÇ BİTİŞ PLANLAYICISI</div>
                {debtEnds.sort((a, b) => a.endMonth.localeCompare(b.endMonth)).map(d => {
                  const sym = debtCurSymbol(d.currency);
                  const amtText = d.currency === "TRY" ? C(d.monthlyTL) : `${C(d.monthlyTL)} (${d.monthlyPayment} ${sym})`;
                  let monthsAway = 0; let m2 = mk;
                  while (m2 < d.endMonth && monthsAway < 60) { m2 = nmk(m2); monthsAway++; }
                  return (
                    <div key={d.id} style={{ padding: "10px 0", borderBottom: `1px solid rgba(0,0,0,0.06)` }}>
                      <div style={{ color: X.t, fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{d.name}</div>
                      <div style={{ color: X.g, fontSize: 12 }}>{monthsAway} ay sonra ({ml(d.endMonth)}) bitecek → her ay {amtText} serbest kalacak.</div>
                      <div style={{ color: X.tm, fontSize: 11, marginTop: 6, lineHeight: 1.5 }}>💡 Bu tutar serbest kalınca: acil durum fonuna yönlendirebilir, yeni birikim başlatabilir veya sabit gider artışlarını absorbe edebilirsiniz.</div>
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
                      <div style={{ color: X.g, fontSize: 11, fontWeight: 700 }}>Tüm borçlar bitince aylık {C(totalFree)} serbest kalacak. Bu tutarı acil durum fonuna yönlendirirseniz {monthsToTarget} ayda hedefe ulaşırsınız.</div>
                    </div>
                  ) : null;
                })()}
              </Card>
            )}
          </>
        );
      })()}

      {/* BİRİKİM */}
      {view === "savings" && (() => {
        return (
          <>
            {/* Alt sekme seçici */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 12 }}>
              {[{ id: "assets", l: "Varlıklarım", i: "🏦" }, { id: "goals", l: "Hedeflerim", i: "🎯" }].map(s => (
                <button key={s.id} onClick={() => setSavSub(s.id)} style={{ background: savSub === s.id ? X.gd : "transparent", border: `1px solid ${savSub === s.id ? X.g : X.border}`, borderRadius: 8, padding: "7px 4px", color: savSub === s.id ? X.g : X.tm, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: ff, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                  <span style={{ fontSize: 14 }}>{s.i}</span>{s.l}
                </button>
              ))}
            </div>

            {/* VARLIKLARIM alt sekmesi */}
            {savSub === "assets" && <>
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
                    <div style={{ color: reached ? X.g : X.w, fontSize: 13, fontWeight: 700 }}>🛡️ Birikim Güvenlik Eşiği {reached && "✓"}</div>
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
                <Card key={asset} s={{ marginBottom: 8, borderColor: expanded ? info.color : X.border, opacity: isEmpty ? 0.6 : 1 }}>
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
            </>}

            {/* HEDEFLERİM alt sekmesi */}
            {savSub === "goals" && (() => {
        const goals = data.savingsGoals || [];
        const completedGoals = data.completedGoals || [];
        const activeGoals = goals.filter(g => !g.completed);
        const canAddMore = activeGoals.length < 5;

        const gRate = gCurrency === "XAU" ? (data.liveRates?.XAU || 0) : gCurrency === "USD" ? (data.liveRates?.USD || 0) : gCurrency === "EUR" ? (data.liveRates?.EUR || 0) : 1;
        const gAmtNum = parseFloat(gAmount) || 0;
        const gTLAmount = gCurrency === "TRY" ? gAmtNum : gAmtNum * gRate;

        const gStartNew = () => {
          setGName(""); setGPurpose(""); setGPriority(activeGoals.length + 1);
          setGDeadline(""); setGCurrency("TRY"); setGAmount(""); setGNote("");
          setGOpenAcc("info"); setGEditing("new");
        };
        const gStartEdit = g => {
          setGName(g.name); setGPurpose(g.purpose || ""); setGPriority(g.priority);
          setGDeadline(g.deadline || ""); setGCurrency(g.currency || "TRY");
          setGAmount(String(g.targetAmount)); setGNote(g.note || "");
          setGOpenAcc("info"); setGEditing(g.id);
        };
        const gCancel = () => setGEditing(null);
        const gSave = () => {
          if (!gName || !gAmtNum) return;
          setData(d => {
            const list = [...(d.savingsGoals || [])];
            const entry = { id: gEditing === "new" ? uid() : gEditing, name: gName, purpose: gPurpose, priority: gPriority, deadline: gDeadline, currency: gCurrency, targetAmount: gAmtNum, note: gNote, transactions: gEditing === "new" ? [] : (list.find(x => x.id === gEditing)?.transactions || []) };
            if (gEditing === "new") list.push(entry);
            else { const idx = list.findIndex(x => x.id === gEditing); if (idx >= 0) list[idx] = entry; }
            return { ...d, savingsGoals: list };
          });
          gCancel();
        };
        const gDelete = id => { if (confirm("Bu hedefi silmek istediğinize emin misiniz?")) setData(d => ({ ...d, savingsGoals: (d.savingsGoals || []).filter(x => x.id !== id) })); };
        const gComplete = id => {
          const goal = (data.savingsGoals || []).find(g => g.id === id);
          if (!goal) return;
          const totalAct = (goal.transactions || []).reduce((s, t) => s + (t.tlAmount || 0), 0);
          const months = (() => { if (!goal.transactions || goal.transactions.length === 0) return 0; const dates = goal.transactions.map(t => t.date).sort(); const first = new Date(dates[0]); const last = new Date(); return Math.max(1, Math.round((last - first) / (1000 * 60 * 60 * 24 * 30))); })();
          setData(d => ({
            ...d,
            savingsGoals: (d.savingsGoals || []).filter(x => x.id !== id),
            completedGoals: [...(d.completedGoals || []), { ...goal, completedDate: td(), totalTL: totalAct, months }]
          }));
        };
        const gDoTransfer = () => {
          const amt = parseFloat(gTransferAmt) || 0;
          if (!amt || !gTransferModal) return;
          setData(d => {
            const list = [...(d.savingsGoals || [])];
            const idx = list.findIndex(x => x.id === gTransferModal);
            if (idx < 0) return d;
            const tx = { id: uid(), date: td(), amount: amt, currency: "TRY", tlAmount: amt, from: gTransferFrom };
            list[idx] = { ...list[idx], transactions: [...(list[idx].transactions || []), tx] };
            return { ...d, savingsGoals: list };
          });
          setGTransferModal(null); setGTransferAmt("");
        };

        const inpS = { width: "100%", background: "white", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10, padding: "10px 12px", fontSize: 14, color: X.t, boxSizing: "border-box" };
        const lblS = { color: X.td, fontSize: 12, marginBottom: 4, fontWeight: 600, display: "block" };

        const accHead = (id, icon, title, sub, ok) => (
          <div onClick={() => setGOpenAcc(o => o === id ? null : id)} style={{ background: "white", padding: "11px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", borderRadius: gOpenAcc === id ? "12px 12px 0 0" : 12, border: "1px solid rgba(0,0,0,0.08)", borderBottom: gOpenAcc === id ? "1px solid rgba(0,0,0,0.06)" : undefined, marginBottom: gOpenAcc === id ? 0 : 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 15 }}>{icon}</span>
              <div><div style={{ color: X.t, fontSize: 13, fontWeight: 700 }}>{title}</div>{sub && <div style={{ color: X.td, fontSize: 10, marginTop: 1 }}>{sub}</div>}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 16, height: 16, borderRadius: "50%", background: ok ? X.g : X.border, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 9 }}>{ok ? "✓" : "–"}</div>
              <span style={{ color: X.td, fontSize: 9, transform: gOpenAcc === id ? "rotate(180deg)" : "none" }}>▼</span>
            </div>
          </div>
        );
        const accBody = children => <div style={{ background: "#F5F0EB", padding: "12px 14px", borderRadius: "0 0 12px 12px", border: "1px solid rgba(0,0,0,0.08)", borderTop: "none", marginBottom: 6 }}>{children}</div>;

        const gForm = gEditing ? (
          <div style={{ background: "rgba(15,118,110,0.05)", border: `1px solid rgba(15,118,110,0.2)`, borderRadius: 14, padding: 12, marginBottom: 12 }}>
            <div style={{ color: X.g, fontSize: 14, fontWeight: 800, marginBottom: 10 }}>{gEditing === "new" ? "🎯 Yeni Hedef" : "✎ Düzenle"}</div>
            {accHead("info", "📋", "Hedef Bilgileri", gName || "Ad ve öncelik", !!gName)}
            {gOpenAcc === "info" && accBody(<>
              <label style={lblS}>Hedef Adı</label>
              <input value={gName} onChange={e => setGName(e.target.value)} placeholder="Örn: Araba, Ev Peşinatı..." style={{ ...inpS, marginBottom: 10 }} />
              <label style={lblS}>Amaç (opsiyonel)</label>
              <input value={gPurpose} onChange={e => setGPurpose(e.target.value)} placeholder="Örn: Aile aracı yenileme..." style={{ ...inpS, marginBottom: 10 }} />
              <label style={lblS}>Öncelik Sırası</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 5, marginBottom: 10 }}>
                {[1,2,3,4,5].map(p => <button key={p} onClick={() => setGPriority(p)} style={{ background: gPriority === p ? X.g : "white", border: `1px solid ${gPriority === p ? X.g : "rgba(0,0,0,0.08)"}`, borderRadius: 8, padding: "8px 4px", fontSize: 13, fontWeight: 800, color: gPriority === p ? "white" : X.td, cursor: "pointer", fontFamily: ff }}>{p}</button>)}
              </div>
              <label style={lblS}>Hedef Tarihi (opsiyonel)</label>
              <input type="month" value={gDeadline} onChange={e => setGDeadline(e.target.value)} style={{ ...inpS, marginBottom: 0 }} />
            </>)}
            {accHead("amount", "💰", "Tutar ve Birim", gAmtNum > 0 ? `${gAmtNum} ${debtCurSymbol(gCurrency)}` : "Miktar ve para birimi", gAmtNum > 0)}
            {gOpenAcc === "amount" && accBody(<>
              <label style={lblS}>Para Birimi</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 5, marginBottom: 10 }}>
                {[{ v: "TRY", l: "₺ TL" }, { v: "USD", l: "$ USD" }, { v: "EUR", l: "€ EUR" }, { v: "XAU", l: "🪙 Altın" }].map(o => <button key={o.v} onClick={() => setGCurrency(o.v)} style={{ background: gCurrency === o.v ? X.g : "white", border: `1px solid ${gCurrency === o.v ? X.g : "rgba(0,0,0,0.08)"}`, borderRadius: 8, padding: "8px 4px", fontSize: 11, fontWeight: 700, color: gCurrency === o.v ? "white" : X.td, cursor: "pointer", fontFamily: ff }}>{o.l}</button>)}
              </div>
              <label style={lblS}>Hedef Tutar</label>
              <input type="number" value={gAmount} onChange={e => setGAmount(e.target.value)} placeholder={gCurrency === "XAU" ? "Örn: 100" : "Örn: 1200000"} style={{ ...inpS, marginBottom: 6 }} />
              {gCurrency !== "TRY" && gRate > 0 && gAmtNum > 0 && <div style={{ background: X.gd, borderRadius: 8, padding: "6px 10px", fontSize: 11, color: X.g, fontWeight: 600 }}>≈ {C(gTLAmount)} (bugünkü kur)</div>}
            </>)}
            {accHead("note", "📝", "Not (opsiyonel)", gNote || "Ek detaylar", false)}
            {gOpenAcc === "note" && accBody(<input value={gNote} onChange={e => setGNote(e.target.value)} placeholder="Ek notlar..." style={inpS} />)}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <Btn onClick={gSave} c={X.g} s={{ flex: 1 }} disabled={!gName || !gAmtNum}>💾 Kaydet</Btn>
              <Btn onClick={gCancel} v="outline" c={X.td} s={{ flex: 1 }}>İptal</Btn>
            </div>
          </div>
        ) : null;

        return (
          <>
            {/* Yeni hedef butonu */}
            {!gEditing && canAddMore && (
              <button onClick={gStartNew} style={{ width: "100%", background: "rgba(15,118,110,0.06)", border: `2px dashed rgba(15,118,110,0.3)`, borderRadius: 14, padding: "16px", color: X.g, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: ff, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 20 }}>＋</span> Yeni Hedef Ekle
                <span style={{ color: X.td, fontSize: 11, fontWeight: 400 }}>({activeGoals.length}/5)</span>
              </button>
            )}
            {!canAddMore && !gEditing && <div style={{ textAlign: "center", color: X.td, fontSize: 12, marginBottom: 10 }}>Maksimum 5 hedef eklenebilir.</div>}

            {gEditing === "new" && gForm}

            {activeGoals.length === 0 && !gEditing && (
              <Card s={{ textAlign: "center", padding: 24 }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>🎯</div>
                <div style={{ color: X.td, fontSize: 13 }}>Henüz birikim hedefi yok</div>
              </Card>
            )}

            {activeGoals.sort((a, b) => a.priority - b.priority).map(g => {
              const totalAct = (g.transactions || []).reduce((s, t) => s + (t.tlAmount || 0), 0);
              const rate = g.currency === "XAU" ? (data.liveRates?.XAU || 0) : g.currency === "USD" ? (data.liveRates?.USD || 0) : g.currency === "EUR" ? (data.liveRates?.EUR || 0) : 1;
              const targetTL = g.currency === "TRY" ? g.targetAmount : g.targetAmount * rate;
              const pct = targetTL > 0 ? Math.min(100, Math.round((totalAct / targetTL) * 100)) : 0;
              const priorityLabels = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];
              const isEditing = gEditing === g.id;
              return (
                <div key={g.id}>
                  <Card s={{ marginBottom: isEditing ? 0 : 8, borderRadius: isEditing ? "14px 14px 0 0" : 14, borderLeft: `3px solid ${X.g}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 11 }}>{priorityLabels[g.priority - 1] || g.priority}</span>
                          <span style={{ color: X.t, fontSize: 14, fontWeight: 800 }}>{g.name}</span>
                        </div>
                        {g.purpose && <div style={{ color: X.td, fontSize: 11, marginTop: 1 }}>{g.purpose}</div>}
                      </div>
                      <div style={{ display: "flex", gap: 5, flexShrink: 0, marginLeft: 8 }}>
                        <button onClick={() => isEditing ? gCancel() : gStartEdit(g)} style={{ background: X.bd, border: `1px solid ${X.b}`, borderRadius: 6, padding: "3px 8px", color: X.b, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{isEditing ? "▲" : "✎"}</button>
                        <button onClick={() => gDelete(g.id)} style={{ background: X.rd, border: `1px solid ${X.r}`, borderRadius: 6, padding: "3px 8px", color: X.r, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>✕</button>
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                      <span style={{ color: X.td, fontSize: 11 }}>Hedef</span>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ color: X.t, fontSize: 15, fontWeight: 800, fontFamily: fm }}>{g.targetAmount} {debtCurSymbol(g.currency)}</span>
                        {g.currency !== "TRY" && rate > 0 && <div style={{ color: X.td, fontSize: 10 }}>≈ {C(targetTL)}</div>}
                      </div>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: "rgba(0,0,0,0.06)", marginBottom: 4 }}>
                      <div style={{ height: "100%", borderRadius: 3, background: X.g, width: `${pct}%`, transition: "width 0.4s" }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: X.td, marginBottom: 10 }}>
                      <span>{C(totalAct)} birikti (%{pct})</span>
                      <span>{g.deadline ? `Hedef: ${ml(g.deadline)}` : `${C(Math.max(0, targetTL - totalAct))} kaldı`}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => { setGTransferModal(g.id); setGTransferAmt(""); }} style={{ flex: 1, background: X.gd, border: `1px solid ${X.g}`, borderRadius: 8, padding: "7px", color: X.g, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: ff }}>+ Aktarım Yap</button>
                      <button onClick={() => { if (confirm(`"${g.name}" hedefine ulaştınız mı?`)) gComplete(g.id); }} style={{ flex: 1, background: X.wd, border: `1px solid ${X.w}`, borderRadius: 8, padding: "7px", color: X.w, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: ff }}>✓ Tamamlandı</button>
                    </div>
                  </Card>
                  {isEditing && <div style={{ marginBottom: 8 }}>{gForm}</div>}
                </div>
              );
            })}

            {/* Tamamlanan hedefler */}
            {completedGoals.length > 0 && (
              <Card s={{ background: "rgba(15,118,110,0.06)", border: `1px solid rgba(15,118,110,0.15)`, marginTop: 8 }}>
                <div style={{ color: X.g, fontSize: 13, fontWeight: 700, marginBottom: 10 }}>🎉 Tamamlanan Hedefler</div>
                {completedGoals.map(g => (
                  <div key={g.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${X.border}` }}>
                    <div>
                      <div style={{ color: X.t, fontSize: 13, fontWeight: 700 }}>{g.name}</div>
                      <div style={{ color: X.td, fontSize: 10, marginTop: 1 }}>{C(g.totalTL || 0)} · {g.months || "?"} ayda tamamlandı</div>
                    </div>
                    <div style={{ background: X.g, color: "white", borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>✓ Tamam</div>
                  </div>
                ))}
              </Card>
            )}

            {/* Aktarım modal */}
            {gTransferModal && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "flex-end" }}>
                <div style={{ background: X.bg, borderRadius: "20px 20px 0 0", padding: 24, width: "100%", maxWidth: 480, margin: "0 auto" }}>
                  <div style={{ color: X.t, fontSize: 15, fontWeight: 800, marginBottom: 16 }}>+ Aktarım Yap</div>
                  <label style={lblS}>Tutar (TL)</label>
                  <input type="number" value={gTransferAmt} onChange={e => setGTransferAmt(e.target.value)} placeholder="Örn: 10000" style={{ ...inpS, marginBottom: 16 }} />
                  <div style={{ display: "flex", gap: 10 }}>
                    <Btn onClick={gDoTransfer} c={X.g} s={{ flex: 1 }} disabled={!parseFloat(gTransferAmt)}>💾 Kaydet</Btn>
                    <Btn onClick={() => setGTransferModal(null)} v="outline" c={X.td} s={{ flex: 1 }}>İptal</Btn>
                  </div>
                </div>
              </div>
            )}
          </>
        );
      })()}
            </>
        );
      })()}

      {/* PLANLI ETKİNLİKLER */}
      {view === "events" && (() => {
        const events = data.plannedEvents || [];
        const completedEvs = data.completedEvents || [];
        const budget = data.settings.monthlyBudget || 0;

        // Taksit yükü hesabı: tüm aktif taksitlerin bu ayki aylık toplamı
        const currentInstTotal = data.installmentPlans.reduce((s, p) => {
          let c = p.startMonth;
          for (let i = 0; i < p.months; i++) { if (c === mk) return s + p.monthlyPayment; c = nmk(c); }
          return s;
        }, 0);
        const maxInstLimit = Math.round(budget * 0.12);
        const remainingInstHak = Math.max(0, maxInstLimit - currentInstTotal);

        // Etkinliğe kalan ay hesabı
        const monthsUntil = (targetMk) => {
          let cur = mk, count = 0;
          for (let i = 0; i < 60; i++) { if (cur === targetMk) return count; cur = nmk(cur); count++; }
          return count;
        };

        const evStartNew = () => {
          setEvName(""); setEvDate(""); setEvBudget(""); setEvKumbara(""); setEvNote("");
          setEvEditing("new");
        };
        const evStartEdit = (ev) => {
          setEvName(ev.name); setEvDate(ev.date); setEvBudget(ev.budget ? String(ev.budget) : "");
          setEvKumbara(ev.kumbara ? String(ev.kumbara) : ""); setEvNote(ev.note || "");
          setEvEditing(ev.id);
        };
        const evCancel = () => setEvEditing(null);
        const evSave = () => {
          if (!evName || !evDate) return;
          const budgetNum = parseFloat(evBudget) || 0;
          const kumbaraNum = parseFloat(evKumbara) || 0;
          // Bütçe varsa kumbara min %30 kontrolü
          if (budgetNum > 0 && kumbaraNum > 0 && kumbaraNum < budgetNum * 0.3) {
            alert(`Kumbara tutarı, etkinlik bütçesinin en az %30'u olmalıdır (min ${C(Math.ceil(budgetNum * 0.3))})`);
            return;
          }
          const maxTaksit70 = budgetNum > 0 ? budgetNum * 0.7 : (kumbaraNum > 0 ? kumbaraNum * 7 / 3 : 0);
          const maxTaksitKalan = budgetNum > 0 && kumbaraNum > 0 ? budgetNum - kumbaraNum : maxTaksit70;
          const maxTaksit = Math.min(maxTaksit70, maxTaksitKalan);
          setData(d => {
            const list = [...(d.plannedEvents || [])];
            const prev = list.find(x => x.id === evEditing);
            const entry = {
              id: evEditing === "new" ? uid() : evEditing,
              name: evName, date: evDate, budget: budgetNum, kumbara: kumbaraNum,
              kumbaraAccumulated: evEditing === "new" ? 0 : (prev?.kumbaraAccumulated || 0),
              maxTaksit: Math.round(Math.max(0, maxTaksit)), taksitUsed: evEditing === "new" ? 0 : (prev?.taksitUsed || 0),
              note: evNote, createdDate: td()
            };
            if (evEditing === "new") list.push(entry);
            else { const idx = list.findIndex(x => x.id === evEditing); if (idx >= 0) list[idx] = { ...list[idx], ...entry }; }
            return { ...d, plannedEvents: list };
          });
          evCancel();
        };
        const evDelete = id => {
          if (confirm("Bu etkinliği silmek istediğinize emin misiniz?")) setData(d => ({ ...d, plannedEvents: (d.plannedEvents || []).filter(x => x.id !== id) }));
        };
        const evComplete = (id, success) => {
          const ev = (data.plannedEvents || []).find(e => e.id === id);
          if (!ev) return;
          const accumulated = ev.kumbaraAccumulated || 0;
          if (!success && accumulated > 0) {
            // Gerçekleşmedi: sadece biriken gerçek tutarı birikim havuzuna gönder
            setData(d => ({
              ...d,
              plannedEvents: (d.plannedEvents || []).filter(x => x.id !== id),
              completedEvents: [...(d.completedEvents || []), { ...ev, completedDate: td(), success: false }],
              savings: { ...d.savings, TRY: [...(d.savings.TRY || []), { type: "buy", amount: accumulated, unitPrice: 1, date: td(), note: `${ev.name} iptal — kumbara iadesi` }] }
            }));
          } else {
            setData(d => ({
              ...d,
              plannedEvents: (d.plannedEvents || []).filter(x => x.id !== id),
              completedEvents: [...(d.completedEvents || []), { ...ev, completedDate: td(), success }]
            }));
          }
        };
        const evTransferKumbara = (id) => {
          const ev = (data.plannedEvents || []).find(e => e.id === id);
          if (!ev || !ev.kumbara) return;
          const kAy = monthsUntil(ev.date);
          const remaining = ev.kumbara - (ev.kumbaraAccumulated || 0);
          const aylik = kAy > 0 ? Math.ceil(ev.kumbara / (kAy + 1)) : remaining;
          const transferAmt = Math.min(aylik, remaining);
          if (transferAmt <= 0) return;
          if (!confirm(`"${ev.name}" kumbarasına bu ay ${C(transferAmt)} aktarılsın mı?`)) return;
          setData(d => ({
            ...d,
            plannedEvents: (d.plannedEvents || []).map(x => x.id === id ? { ...x, kumbaraAccumulated: (x.kumbaraAccumulated || 0) + transferAmt } : x)
          }));
        };

        const inpS = { width: "100%", background: "white", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10, padding: "10px 12px", fontSize: 14, color: X.t, boxSizing: "border-box" };
        const lblS = { color: X.td, fontSize: 12, marginBottom: 4, fontWeight: 600, display: "block" };

        const budgetNum = parseFloat(evBudget) || 0;
        const kumbaraNum = parseFloat(evKumbara) || 0;
        const maxTaksit70 = budgetNum > 0 ? budgetNum * 0.7 : (kumbaraNum > 0 ? kumbaraNum * 7 / 3 : 0);
        const taksitKalanCalc = budgetNum > 0 && kumbaraNum > 0 ? budgetNum - kumbaraNum : maxTaksit70;
        const maxTaksitCalc = Math.max(0, Math.min(maxTaksit70, taksitKalanCalc));

        const evForm = evEditing ? (
          <div style={{ background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 14, padding: 12, marginBottom: 12 }}>
            <div style={{ color: X.p, fontSize: 14, fontWeight: 800, marginBottom: 10 }}>{evEditing === "new" ? "📅 Yeni Etkinlik" : "✎ Düzenle"}</div>
            <label style={lblS}>Etkinlik Adı *</label>
            <input value={evName} onChange={e => setEvName(e.target.value)} placeholder="Örn: Kurban Bayramı, Antalya Tatili" style={{ ...inpS, marginBottom: 10 }} />
            <label style={lblS}>Etkinlik Tarihi *</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <select value={evDate ? parseInt(evDate.split("-")[1]) || "" : ""} onChange={e => { const m = String(e.target.value).padStart(2, "0"); const y = evDate ? evDate.split("-")[0] : String(new Date().getFullYear()); setEvDate(`${y}-${m}`); }} style={{ ...inpS, flex: 1, appearance: "none", WebkitAppearance: "none", backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23999'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}>
                <option value="">Ay</option>
                {MTR.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
              </select>
              <select value={evDate ? parseInt(evDate.split("-")[0]) || "" : ""} onChange={e => { const y = e.target.value; const m = evDate ? evDate.split("-")[1] : "01"; setEvDate(`${y}-${m}`); }} style={{ ...inpS, flex: 0.7, appearance: "none", WebkitAppearance: "none", backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23999'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}>
                <option value="">Yıl</option>
                {[0, 1, 2, 3, 4].map(i => { const y = new Date().getFullYear() + i; return <option key={y} value={y}>{y}</option>; })}
              </select>
            </div>
            <label style={lblS}>Tahmini Bütçe (opsiyonel)</label>
            <input type="number" value={evBudget} onChange={e => setEvBudget(e.target.value)} placeholder="Örn: 50000" style={{ ...inpS, marginBottom: 4 }} />
            {budgetNum > 0 && <div style={{ color: X.td, fontSize: 10, marginBottom: 10 }}>Kumbara min: {C(Math.ceil(budgetNum * 0.3))} (%30) · Taksit max harcanabilir: {C(Math.round(budgetNum * 0.7))} (%70)</div>}
            <label style={lblS}>Kumbara Tutarı (nakit ayıracağınız tutar)</label>
            <input type="number" value={evKumbara} onChange={e => setEvKumbara(e.target.value)} placeholder="Örn: 20000" style={{ ...inpS, marginBottom: 4 }} />
            {kumbaraNum > 0 && evDate && (() => {
              const kAy = monthsUntil(evDate);
              const aylik = kAy > 0 ? Math.ceil(kumbaraNum / kAy) : kumbaraNum;
              return <div style={{ color: X.g, fontSize: 10, marginBottom: 4 }}>Aylık bloke: {C(aylik)} ({kAy} ay × {C(aylik)})</div>;
            })()}
            {budgetNum > 0 && kumbaraNum > 0 && <div style={{ color: X.p, fontSize: 10, marginBottom: 10 }}>Taksitli harcama için kalan: {C(Math.max(0, budgetNum - kumbaraNum))} · Max harcanabilir: {C(Math.round(budgetNum * 0.7))}</div>}
            {!budgetNum && kumbaraNum > 0 && <div style={{ color: X.td, fontSize: 10, marginBottom: 10 }}>Dinamik taksit limiti: {C(Math.round(kumbaraNum * 7 / 3))}</div>}
            <label style={lblS}>Not (opsiyonel)</label>
            <input value={evNote} onChange={e => setEvNote(e.target.value)} placeholder="Ek detaylar..." style={{ ...inpS, marginBottom: 10 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <Btn onClick={evSave} c={X.p} s={{ flex: 1 }} disabled={!evName || !evDate}>💾 Kaydet</Btn>
              <Btn onClick={evCancel} v="outline" c={X.td} s={{ flex: 1 }}>İptal</Btn>
            </div>
          </div>
        ) : null;

        return (
          <>
            {/* Genel taksit hakkı bilgisi */}
            <Card s={{ marginBottom: 12, background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ color: X.p, fontSize: 13, fontWeight: 700 }}>📊 Aylık Taksit Kapasitesi</div>
                  <div style={{ color: X.td, fontSize: 10, marginTop: 2 }}>Bütçenizin %12'si · max {C(maxInstLimit)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: remainingInstHak > 0 ? X.g : X.r, fontSize: 18, fontWeight: 800, fontFamily: fm }}>{C(remainingInstHak)}</div>
                  <div style={{ color: X.td, fontSize: 10 }}>kalan hak</div>
                </div>
              </div>
              <div style={{ height: 5, borderRadius: 3, background: "rgba(0,0,0,0.06)", marginTop: 8, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 3, background: currentInstTotal <= maxInstLimit ? X.p : X.r, width: `${Math.min(100, (currentInstTotal / maxInstLimit) * 100)}%`, transition: "width 0.4s" }} />
              </div>
            </Card>

            {/* Yeni etkinlik butonu */}
            {!evEditing && (
              <button onClick={evStartNew} style={{ width: "100%", background: "rgba(99,102,241,0.06)", border: "2px dashed rgba(99,102,241,0.3)", borderRadius: 14, padding: "16px", color: X.p, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: ff, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 20 }}>＋</span> Yeni Etkinlik Ekle
              </button>
            )}

            {evEditing === "new" && evForm}

            {events.length === 0 && !evEditing && (
              <Card s={{ textAlign: "center", padding: 24 }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>📅</div>
                <div style={{ color: X.td, fontSize: 13 }}>Henüz planlı etkinlik yok</div>
                <div style={{ color: X.tm, fontSize: 11, marginTop: 4 }}>Tatil, bayram, düğün gibi etkinliklerinizi planlayın</div>
              </Card>
            )}

            {/* Etkinlik kartları */}
            {events.map(ev => {
              const kAy = monthsUntil(ev.date);
              const aylikBloke = ev.kumbara > 0 && kAy > 0 ? Math.ceil(ev.kumbara / kAy) : ev.kumbara || 0;
              const taksitUsed = ev.taksitUsed || 0;
              const maxTaksit = ev.maxTaksit || 0;
              const taksitKalan = Math.max(0, maxTaksit - taksitUsed);
              const isEditing = evEditing === ev.id;
              const isPast = ev.date < mk;

              return (
                <div key={ev.id}>
                  <Card s={{ marginBottom: isEditing ? 0 : 8, borderRadius: isEditing ? "14px 14px 0 0" : 14, borderLeft: `3px solid ${X.p}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 14 }}>📅</span>
                          <span style={{ color: X.t, fontSize: 14, fontWeight: 800 }}>{ev.name}</span>
                        </div>
                        <div style={{ color: X.td, fontSize: 11, marginTop: 2 }}>
                          {ml(ev.date)} · {isPast ? <span style={{ color: X.w }}>Tarihi geçti</span> : <span style={{ color: X.g }}>{kAy} ay kaldı</span>}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 5, flexShrink: 0, marginLeft: 8 }}>
                        <button onClick={() => isEditing ? evCancel() : evStartEdit(ev)} style={{ background: X.bd, border: `1px solid ${X.b}`, borderRadius: 6, padding: "3px 8px", color: X.b, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{isEditing ? "▲" : "✎"}</button>
                        <button onClick={() => evDelete(ev.id)} style={{ background: X.rd, border: `1px solid ${X.r}`, borderRadius: 6, padding: "3px 8px", color: X.r, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>✕</button>
                      </div>
                    </div>

                    {/* Bütçe bilgisi */}
                    {ev.budget > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                        <span style={{ color: X.td }}>Tahmini bütçe</span>
                        <span style={{ color: X.t, fontWeight: 700, fontFamily: fm }}>{C(ev.budget)}</span>
                      </div>
                    )}

                    {/* Kumbara */}
                    {ev.kumbara > 0 && (() => {
                      const accumulated = ev.kumbaraAccumulated || 0;
                      const remaining = ev.kumbara - accumulated;
                      const pct = ev.kumbara > 0 ? Math.min(100, Math.round((accumulated / ev.kumbara) * 100)) : 0;
                      return (
                      <div style={{ background: "rgba(34,197,94,0.06)", borderRadius: 8, padding: "6px 10px", marginBottom: 6 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                          <span style={{ color: X.g, fontWeight: 700 }}>🏦 Kumbara</span>
                          <span style={{ color: X.g, fontWeight: 700, fontFamily: fm }}>{C(accumulated)} / {C(ev.kumbara)}</span>
                        </div>
                        <div style={{ height: 4, borderRadius: 2, background: "rgba(0,0,0,0.06)", marginTop: 4 }}>
                          <div style={{ height: "100%", borderRadius: 2, background: X.g, width: `${pct}%`, transition: "width 0.4s" }} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                          <div style={{ color: X.td, fontSize: 10 }}>
                            {kAy > 0 ? `Aylık bloke: ${C(aylikBloke)} · ${kAy} ay kaldı` : "Tarih geldi"}
                            {remaining <= 0 && " · ✓ Tamamlandı"}
                          </div>
                          {remaining > 0 && (
                            <button onClick={() => evTransferKumbara(ev.id)} style={{ background: X.gd, border: `1px solid ${X.g}`, borderRadius: 6, padding: "2px 8px", color: X.g, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: ff }}>+ Aktar</button>
                          )}
                        </div>
                      </div>
                      );
                    })()}

                    {/* Taksit durumu */}
                    {maxTaksit > 0 && (
                      <div style={{ background: "rgba(99,102,241,0.06)", borderRadius: 8, padding: "6px 10px", marginBottom: 6 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                          <span style={{ color: X.p, fontWeight: 700 }}>💳 Taksit hakkı</span>
                          <span style={{ color: X.p, fontWeight: 700, fontFamily: fm }}>{C(taksitKalan)} / {C(maxTaksit)}</span>
                        </div>
                        {taksitUsed > 0 && <div style={{ color: X.td, fontSize: 10, marginTop: 2 }}>Kullanılan: {C(taksitUsed)}</div>}
                      </div>
                    )}

                    {ev.note && <div style={{ color: X.td, fontSize: 11, marginTop: 4 }}>📝 {ev.note}</div>}

                    {/* Tamamla butonları */}
                    <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                      <button onClick={() => { if (confirm(`"${ev.name}" gerçekleşti mi?`)) evComplete(ev.id, true); }} style={{ flex: 1, background: X.gd, border: `1px solid ${X.g}`, borderRadius: 8, padding: "7px", color: X.g, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: ff }}>✓ Gerçekleşti</button>
                      <button onClick={() => { const acc = ev.kumbaraAccumulated || 0; if (confirm(`"${ev.name}" gerçekleşmedi mi?${acc > 0 ? ` Biriken ${C(acc)} birikim havuzuna aktarılacak.` : ""}`)) evComplete(ev.id, false); }} style={{ flex: 1, background: X.rd, border: `1px solid ${X.r}`, borderRadius: 8, padding: "7px", color: X.r, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: ff }}>✕ Gerçekleşmedi</button>
                    </div>
                  </Card>
                  {isEditing && <div style={{ marginBottom: 8 }}>{evForm}</div>}
                </div>
              );
            })}

            {/* Tamamlanan etkinlikler */}
            {completedEvs.length > 0 && (
              <Card s={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)", marginTop: 8 }}>
                <div style={{ color: X.p, fontSize: 13, fontWeight: 700, marginBottom: 10 }}>📋 Geçmiş Etkinlikler</div>
                {completedEvs.map(ev => (
                  <div key={ev.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${X.border}` }}>
                    <div>
                      <div style={{ color: X.t, fontSize: 13, fontWeight: 700 }}>{ev.name}</div>
                      <div style={{ color: X.td, fontSize: 10, marginTop: 1 }}>{ml(ev.date)} · {ev.budget > 0 ? C(ev.budget) : "Bütçesiz"}</div>
                    </div>
                    <div style={{ background: ev.success ? X.g : X.r, color: "white", borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{ev.success ? "✓ Yapıldı" : "✕ İptal"}</div>
                  </div>
                ))}
              </Card>
            )}
          </>
        );
      })()}
      {savingsModal?.type === "buy" && <BuyAssetModal asset={savingsModal.asset} data={data} onClose={() => setSavingsModal(null)} onSave={tx => { setData(d => ({ ...d, savings: { ...d.savings, [savingsModal.asset]: [...(d.savings[savingsModal.asset] || []), tx] } })); setSavingsModal(null); }} />}
      {savingsModal?.type === "sell" && <SellAssetModal asset={savingsModal.asset} data={data} onClose={() => setSavingsModal(null)} onSave={tx => { setData(d => ({ ...d, savings: { ...d.savings, [savingsModal.asset]: [...(d.savings[savingsModal.asset] || []), tx] } })); setSavingsModal(null); }} />}
      {detail && <DetailModal {...detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

/* ═══ ONBOARDING ═══ */
function OnboardingWizard({ data, setData, familyName }) {
  const _theme = THEMES[data?.settings?.theme] || THEMES.default;
  const [step, setStep] = useState(0);
  const [budget, setBudget] = useState("");
  const [payDay, setPayDay] = useState("15");
  const [fixedList, setFixedList] = useState([]);
  const [fixedName, setFixedName] = useState("");
  const [fixedAmount, setFixedAmount] = useState("");
  const [fixedMethod, setFixedMethod] = useState("account");
  const [cards, setCards] = useState([]);
  const [cardName, setCardName] = useState("");
  const [ccMode, setCcMode] = useState("instant");

  const totalSteps = 7;
  const inpS = { width: "100%", background: "white", border: "1px solid rgba(0,0,0,0.10)", borderRadius: 10, padding: "10px 12px", fontSize: 14, color: "#141008", boxSizing: "border-box", fontFamily: ff };
  const lblS = { color: "#5A5045", fontSize: 12, marginBottom: 4, fontWeight: 600, display: "block" };
  const hintS = { color: "#8B7E74", fontSize: 10, marginTop: 6, lineHeight: 1.4 };

  const addFixed = () => {
    if (!fixedName || !fixedAmount) return;
    setFixedList(l => [...l, { id: uid(), name: fixedName, amount: parseFloat(fixedAmount) || 0, paymentMethod: fixedMethod, autoPayment: false }]);
    setFixedName(""); setFixedAmount(""); setFixedMethod("account");
  };
  const removeFixed = id => setFixedList(l => l.filter(x => x.id !== id));

  const addCard = () => {
    if (!cardName) return;
    setCards(c => [...c, { id: uid(), name: cardName }]);
    setCardName("");
  };
  const removeCard = id => setCards(c => c.filter(x => x.id !== id));

  const finish = () => {
    setData(d => ({
      ...d,
      settings: {
        ...d.settings,
        monthlyBudget: parseFloat(budget) || 0,
        payDay: parseInt(payDay) || 15,
        ccPaymentMode: ccMode,
        fixedExpenses: [...(d.settings.fixedExpenses || []), ...fixedList],
        cards: [...(d.settings.cards || []), ...cards],
        onboardingCompleted: true
      }
    }));
  };

  const canNext = () => {
    if (step === 3) return parseFloat(budget) > 0;
    return true;
  };

  const suggestedFixed = [
    { name: "Kira", icon: "🏠" },
    { name: "Doğalgaz", icon: "🔥" },
    { name: "Elektrik", icon: "⚡" },
    { name: "Su", icon: "💧" },
    { name: "İnternet", icon: "🌐" },
    { name: "Telefon", icon: "📱" },
    { name: "Sigorta", icon: "🛡️" },
    { name: "Aidat", icon: "🏢" },
  ];

  return (
    <div style={{ background: _theme.gradientShort, height: "100dvh", display: "flex", flexDirection: "column", fontFamily: ff, overflow: "hidden" }}>
      {/* İlerleme çubuğu */}
      {step > 0 && (
        <div style={{ padding: "12px 16px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 4 }}>
            {Array.from({ length: totalSteps - 1 }, (_, i) => (
              <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i < step ? X.g : "rgba(0,0,0,0.08)", transition: "background 0.3s" }} />
            ))}
          </div>
          <div style={{ color: "#8B7E74", fontSize: 10, marginTop: 4, textAlign: "right" }}>{step}/{totalSteps - 1}</div>
        </div>
      )}

      <div style={{ flex: 1, overflow: "auto", WebkitOverflowScrolling: "touch", padding: "16px 20px env(safe-area-inset-bottom, 20px)", maxWidth: 480, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>

        {/* ADIM 0: Hoş geldiniz */}
        {step === 0 && (
          <div style={{ textAlign: "center", paddingTop: 40 }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>👋</div>
            <div style={{ color: "#141008", fontSize: 20, fontWeight: 800, marginBottom: 6 }}>Hoş geldiniz{familyName ? `, ${familyName}` : ""}!</div>
            <div style={{ color: "#5A5045", fontSize: 13, lineHeight: 1.5, marginBottom: 24 }}>Ev bütçenizi kolayca yönetmek için birkaç temel bilgiyle başlayalım. Bu işlem 2 dakikadan kısa sürecek.</div>
            <button onClick={() => setStep(1)} style={{ background: X.g, border: "none", borderRadius: 12, padding: "14px 32px", color: "white", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: ff, width: "100%" }}>Kuruluma Başla</button>
          </div>
        )}

        {/* ADIM 1: Maaş günü */}
        {step === 1 && (
          <div>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📅</div>
            <div style={{ color: "#141008", fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Maaş gününüz</div>
            <div style={{ color: "#5A5045", fontSize: 12, marginBottom: 12 }}>Maaşınız her ayın kaçında yatıyor? Bütçe döngünüz bu güne göre hesaplanır.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
              {["1", "15", "25"].map(d => (
                <button key={d} onClick={() => setPayDay(d)} style={{ background: payDay === d ? X.g : "white", border: `2px solid ${payDay === d ? X.g : "rgba(0,0,0,0.08)"}`, borderRadius: 10, padding: "10px", color: payDay === d ? "white" : "#141008", fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: ff }}>
                  {d}
                </button>
              ))}
            </div>
            <label style={lblS}>Farklı bir gün</label>
            <input type="number" value={!["1", "15", "25"].includes(payDay) ? payDay : ""} onChange={e => setPayDay(e.target.value)} placeholder="Örn: 10" style={{ ...inpS, marginBottom: 8 }} />
            <div style={hintS}>💡 Bunu daha sonra Ayarlar → Aylık Bütçe'den değiştirebilirsiniz.</div>
          </div>
        )}

        {/* ADIM 2: KK ödeme modu */}
        {step === 2 && (
          <div>
            <div style={{ fontSize: 28, marginBottom: 8 }}>💳</div>
            <div style={{ color: "#141008", fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Kredi kartı ödemeleriniz</div>
            <div style={{ color: "#5A5045", fontSize: 12, marginBottom: 12 }}>Kredi kartı harcamalarınızın karşılığını ne zaman ödüyorsunuz?</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
              <button onClick={() => setCcMode("instant")} style={{ background: ccMode === "instant" ? X.gd : "white", border: `2px solid ${ccMode === "instant" ? X.g : "rgba(0,0,0,0.08)"}`, borderRadius: 12, padding: "12px 14px", textAlign: "left", cursor: "pointer" }}>
                <div style={{ color: ccMode === "instant" ? X.g : "#141008", fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Bu ayın bütçesinden karşılıyorum</div>
                <div style={{ color: "#8B7E74", fontSize: 11, lineHeight: 1.4 }}>Kredi kartı harcamamın karşılığını aynı ay bütçemden ayırıp kredi kartı hesabına aktarıyorum</div>
              </button>
              <button onClick={() => setCcMode("ekstre")} style={{ background: ccMode === "ekstre" ? X.gd : "white", border: `2px solid ${ccMode === "ekstre" ? X.g : "rgba(0,0,0,0.08)"}`, borderRadius: 12, padding: "12px 14px", textAlign: "left", cursor: "pointer" }}>
                <div style={{ color: ccMode === "ekstre" ? X.g : "#141008", fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Gelecek ay maaşımdan ödüyorum</div>
                <div style={{ color: "#8B7E74", fontSize: 11, lineHeight: 1.4 }}>Bu ay kredi kartıyla yaptığım harcamalar gelecek ay maaşımdan kesilir (ekstre döngüsü)</div>
              </button>
            </div>
            {ccMode === "ekstre" && (
              <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
                <div style={{ color: "#B45309", fontSize: 11, fontWeight: 700, marginBottom: 4 }}>💡 Önemli tavsiye</div>
                <div style={{ color: "#8B7E74", fontSize: 11, lineHeight: 1.5 }}>Dışarıda yemek, kafe, etkinlik, atölye gibi konfor harcamalarınızı banka hesap kartınızla (konfor harcaması kartı) yapın. Bu sizi ekstre döneminde bilinmezlikten korur — ne kadar harcadığınızı anında görürsünüz.</div>
              </div>
            )}
            <div style={hintS}>💡 Bunu daha sonra Ayarlar → Aylık Bütçe'den değiştirebilirsiniz.</div>
          </div>
        )}

        {/* ADIM 3: Aylık bütçe */}
        {step === 3 && (
          <div>
            <div style={{ fontSize: 28, marginBottom: 8 }}>💰</div>
            <div style={{ color: "#141008", fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Aylık bütçeniz</div>
            <div style={{ color: "#5A5045", fontSize: 12, marginBottom: 12 }}>Evinize her ay giren toplam net gelir nedir? Maaş, ek gelir, kira geliri dahil.</div>
            <input type="number" value={budget} onChange={e => setBudget(e.target.value)} placeholder="Örn: 80000" style={{ ...inpS, fontSize: 20, textAlign: "center", fontWeight: 700, fontFamily: fm, marginBottom: 6 }} />
            {parseFloat(budget) > 0 && <div style={{ textAlign: "center", color: X.g, fontSize: 14, fontWeight: 700, fontFamily: fm }}>{C(parseFloat(budget))}</div>}
            <div style={hintS}>💡 Bunu daha sonra Ayarlar → Aylık Bütçe'den değiştirebilirsiniz.</div>
          </div>
        )}

        {/* ADIM 3: Sabit giderler */}
        {step === 4 && (
          <div>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🔒</div>
            <div style={{ color: "#141008", fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Sabit giderleriniz</div>
            <div style={{ color: "#5A5045", fontSize: 12, marginBottom: 10 }}>Her ay düzenli ödediğiniz giderleri ekleyin.</div>

            {/* Hazır öneriler */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
              {suggestedFixed.filter(s => !fixedList.find(f => f.name === s.name)).map(s => (
                <button key={s.name} onClick={() => { setFixedName(s.name); }} style={{ background: fixedName === s.name ? X.gd : "white", border: `1px solid ${fixedName === s.name ? X.g : "rgba(0,0,0,0.08)"}`, borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: ff, color: fixedName === s.name ? X.g : "#5A5045" }}>
                  {s.icon} {s.name}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input value={fixedName} onChange={e => setFixedName(e.target.value)} placeholder="Gider adı" style={{ ...inpS, flex: 1 }} />
              <input type="number" value={fixedAmount} onChange={e => setFixedAmount(e.target.value)} placeholder="Tutar" style={{ ...inpS, flex: 0.6 }} />
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <button onClick={() => setFixedMethod("account")} style={{ flex: 1, background: fixedMethod === "account" ? X.gd : "white", border: `1px solid ${fixedMethod === "account" ? X.g : "rgba(0,0,0,0.08)"}`, borderRadius: 8, padding: "8px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: ff, color: fixedMethod === "account" ? X.g : "#5A5045" }}>🏦 Hesaptan</button>
              <button onClick={() => setFixedMethod("cc")} style={{ flex: 1, background: fixedMethod === "cc" ? X.gd : "white", border: `1px solid ${fixedMethod === "cc" ? X.g : "rgba(0,0,0,0.08)"}`, borderRadius: 8, padding: "8px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: ff, color: fixedMethod === "cc" ? X.g : "#5A5045" }}>💳 Kredi Kartı</button>
            </div>
            <button onClick={addFixed} disabled={!fixedName || !fixedAmount} style={{ width: "100%", background: fixedName && fixedAmount ? X.g : "rgba(0,0,0,0.06)", border: "none", borderRadius: 10, padding: "10px", color: fixedName && fixedAmount ? "white" : "#8B7E74", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: ff, marginBottom: 12 }}>+ Ekle</button>

            {fixedList.length > 0 && fixedList.map(f => (
              <div key={f.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", marginBottom: 4, background: "white", borderRadius: 8, border: "1px solid rgba(0,0,0,0.06)" }}>
                <div>
                  <span style={{ color: "#141008", fontSize: 13, fontWeight: 700 }}>{f.name}</span>
                  <span style={{ color: "#8B7E74", fontSize: 11, marginLeft: 8 }}>{f.paymentMethod === "cc" ? "💳" : "🏦"}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "#141008", fontSize: 13, fontWeight: 700, fontFamily: fm }}>{C(f.amount)}</span>
                  <button onClick={() => removeFixed(f.id)} style={{ background: "none", border: "none", color: X.r, fontSize: 16, cursor: "pointer", padding: "2px 6px" }}>✕</button>
                </div>
              </div>
            ))}
            {fixedList.length > 0 && (
              <div style={{ textAlign: "right", color: X.g, fontSize: 13, fontWeight: 700, fontFamily: fm, marginTop: 6 }}>
                Toplam: {C(fixedList.reduce((s, f) => s + f.amount, 0))}
              </div>
            )}
            <div style={hintS}>💡 Bunu daha sonra Ayarlar → Sabit Giderler'den değiştirebilirsiniz. Şimdi atlayabilirsiniz.</div>
          </div>
        )}

        {/* ADIM 4: Kredi kartları */}
        {step === 5 && (
          <div>
            <div style={{ fontSize: 28, marginBottom: 8 }}>💳</div>
            <div style={{ color: "#141008", fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Kredi kartlarınız</div>
            <div style={{ color: "#5A5045", fontSize: 12, marginBottom: 12 }}>Kullandığınız kredi kartlarının adını ekleyin. Harcamalarınızı kart bazlı takip edebilirsiniz.</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input value={cardName} onChange={e => setCardName(e.target.value)} placeholder="Örn: Yapıkredi, Garanti" style={{ ...inpS, flex: 1 }} />
              <button onClick={addCard} disabled={!cardName} style={{ background: cardName ? X.g : "rgba(0,0,0,0.06)", border: "none", borderRadius: 10, padding: "10px 16px", color: cardName ? "white" : "#8B7E74", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: ff }}>+ Ekle</button>
            </div>

            {cards.map(c2 => (
              <div key={c2.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", marginBottom: 4, background: "white", borderRadius: 8, border: "1px solid rgba(0,0,0,0.06)" }}>
                <span style={{ color: "#141008", fontSize: 14, fontWeight: 700 }}>💳 {c2.name}</span>
                <button onClick={() => removeCard(c2.id)} style={{ background: "none", border: "none", color: X.r, fontSize: 16, cursor: "pointer", padding: "2px 6px" }}>✕</button>
              </div>
            ))}
            <div style={hintS}>💡 Bunu daha sonra Ayarlar → Kartlarım'dan değiştirebilirsiniz. Kredi kartınız yoksa atlayabilirsiniz.</div>
          </div>
        )}

        {/* ADIM 5: Özet */}
        {step === 6 && (
          <div>
            <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
            <div style={{ color: "#141008", fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Hazırsınız!</div>
            <div style={{ color: "#5A5045", fontSize: 12, marginBottom: 12 }}>Kurulum bilgileriniz:</div>

            <div style={{ background: "white", borderRadius: 14, border: "1px solid rgba(0,0,0,0.08)", overflow: "hidden", marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                <span style={{ color: "#5A5045", fontSize: 13 }}>Maaş günü</span>
                <span style={{ color: "#141008", fontSize: 13, fontWeight: 700 }}>Ayın {payDay}'i</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                <span style={{ color: "#5A5045", fontSize: 13 }}>KK ödeme</span>
                <span style={{ color: "#141008", fontSize: 13, fontWeight: 700 }}>{ccMode === "instant" ? "Bu aydan" : "Gelecek aydan"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                <span style={{ color: "#5A5045", fontSize: 13 }}>Aylık bütçe</span>
                <span style={{ color: X.g, fontSize: 13, fontWeight: 700, fontFamily: fm }}>{C(parseFloat(budget) || 0)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                <span style={{ color: "#5A5045", fontSize: 13 }}>Sabit giderler</span>
                <span style={{ color: "#141008", fontSize: 13, fontWeight: 700 }}>{fixedList.length > 0 ? `${fixedList.length} adet · ${C(fixedList.reduce((s, f) => s + f.amount, 0))}` : "Eklenmedi"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px" }}>
                <span style={{ color: "#5A5045", fontSize: 13 }}>Kredi kartları</span>
                <span style={{ color: "#141008", fontSize: 13, fontWeight: 700 }}>{cards.length > 0 ? `${cards.length} kart` : "Eklenmedi"}</span>
              </div>
            </div>

            {parseFloat(budget) > 0 && fixedList.length > 0 && (
              <div style={{ background: X.gd, borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
                <div style={{ color: X.g, fontSize: 12, fontWeight: 700 }}>Tahmini aylık kalan</div>
                <div style={{ color: X.g, fontSize: 20, fontWeight: 800, fontFamily: fm }}>{C((parseFloat(budget) || 0) - fixedList.reduce((s, f) => s + f.amount, 0))}</div>
              </div>
            )}

            <div style={{ color: "#8B7E74", fontSize: 10, lineHeight: 1.4, marginBottom: 12 }}>Tüm bilgileri daha sonra Ayarlar'dan değiştirebilirsiniz. Değişken giderler, borçlar ve birikim gibi detayları uygulamayı kullanırken ekleyebilirsiniz.</div>

            <button onClick={finish} style={{ width: "100%", background: X.g, border: "none", borderRadius: 12, padding: "14px", color: "white", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: ff, marginBottom: 20 }}>Bütçemi Oluştur</button>
          </div>
        )}

        {/* İleri / Geri butonları */}
        {step > 0 && step < 6 && (
          <div style={{ display: "flex", gap: 8, marginTop: 16, paddingBottom: 16 }}>
            <button onClick={() => setStep(s => s - 1)} style={{ flex: 0.4, background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10, padding: "12px", color: "#5A5045", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: ff }}>← Geri</button>
            <button onClick={() => setStep(s => s + 1)} disabled={!canNext()} style={{ flex: 0.6, background: canNext() ? X.g : "rgba(0,0,0,0.06)", border: "none", borderRadius: 10, padding: "12px", color: canNext() ? "white" : "#8B7E74", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: ff }}>{step === 5 ? "Özete Git →" : "İleri →"}</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══ TANITIM EKRANI ═══ */
function IntroScreen({ onDone }) {
  const _theme = THEMES[_tid] || THEMES.default;
  const [page, setPage] = useState(0);

  const pages = [
    {
      icon: "🏠",
      title: "Güncel Durum",
      desc: "Aylık bütçe özetinizi görün",
      items: [
        "Sabit gider ödemelerini takip edin",
        "Kredi kartı harcamalarını ve taksitleri yönetin",
        "Market fişi çekin, AI otomatik analiz etsin",
        "Hesap ve kart yükleme hareketlerini kaydedin",
        "Simülasyon ile \"ya şunu alsam?\" senaryoları deneyin"
      ]
    },
    {
      icon: "📊",
      title: "Analiz",
      desc: "Harcamalarınızı derinlemesine inceleyin",
      items: [
        "Ekstre analizi ve harcama trendi grafikleri",
        "Risk ve yönlendirme kartı (otomatik uyarılar)",
        "Birikim yönetimi (TL, dolar, euro, altın)",
        "AI Finans Danışmanı — kişisel analiz (günde 3 hak)",
        "12 aylık bütçe projeksiyonu"
      ]
    },
    {
      icon: "📅",
      title: "Planlama",
      desc: "Geleceği planlayın",
      items: [
        "Taksit ve ödeme takvimi",
        "Birikim alım/satım planlama",
        "Hedef belirleme ve ilerleme takibi",
        "Yaklaşan ödemelerin takvim görünümü"
      ]
    },
    {
      icon: "⚙️",
      title: "Ayarlar",
      desc: "Uygulamayı kendinize göre ayarlayın",
      items: [
        "Bütçe, kart, sabit/değişken gider tanımları",
        "Tema seçimi (klasik veya sıcak kurumsal)",
        "Aile yönetimi — eşinizi davet edin",
        "Otomatik yedekleme ve geri yükleme",
        "Fatura bütçeleri ve takvim hatırlatmaları"
      ]
    }
  ];

  const p = pages[page];
  const isLast = page === pages.length - 1;

  return (
    <div style={{ background: _theme.gradient, minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: ff, padding: 16 }}>
      <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <div style={{ ...glassSolid, borderRadius: 20, width: "100%", maxWidth: 380, padding: 28, boxShadow: neu }}>
        {/* İlerleme */}
        <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
          {pages.map((_, i) => (
            <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= page ? X.g : "rgba(0,0,0,0.08)", transition: "background 0.3s" }} />
          ))}
        </div>

        {/* İçerik */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>{p.icon}</div>
          <div style={{ color: X.t, fontSize: 20, fontWeight: 800 }}>{p.title}</div>
          <div style={{ color: X.tm, fontSize: 13, marginTop: 4 }}>{p.desc}</div>
        </div>

        <div style={{ background: "rgba(0,0,0,0.03)", borderRadius: 14, padding: "16px 18px", marginBottom: 20 }}>
          {p.items.map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 0", borderBottom: i < p.items.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none" }}>
              <span style={{ color: X.g, fontSize: 12, marginTop: 1, flexShrink: 0 }}>●</span>
              <span style={{ color: X.t, fontSize: 13, lineHeight: 1.5 }}>{item}</span>
            </div>
          ))}
        </div>

        {/* AI bilgilendirme (Analiz sayfasında) */}
        {page === 1 && (
          <div style={{ background: "rgba(15,118,110,0.06)", border: `1px solid rgba(15,118,110,0.2)`, borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
            <div style={{ color: X.g, fontSize: 11, fontWeight: 700, marginBottom: 4 }}>AI Danışman Hakkında</div>
            <div style={{ color: X.tm, fontSize: 11, lineHeight: 1.6 }}>
              AI Finans Danışmanı günde <strong style={{ color: X.t }}>3 kez</strong> kullanılabilir. Her kullanımda bütçenizi analiz eder ve kişisel öneriler sunar. Market fişi analizi ise sınırsızdır.
            </div>
          </div>
        )}

        {/* Butonlar */}
        <div style={{ display: "flex", gap: 8 }}>
          {page > 0 && (
            <button onClick={() => setPage(p2 => p2 - 1)} style={{ flex: 0.35, background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: "14px", color: X.tm, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: ff }}>← Geri</button>
          )}
          <button onClick={() => isLast ? onDone() : setPage(p2 => p2 + 1)} style={{ flex: 1, background: X.g, border: "none", borderRadius: 12, padding: "14px", color: "white", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: ff }}>
            {isLast ? "Uygulamaya Başla" : "İleri →"}
          </button>
        </div>

        {/* Atla */}
        {!isLast && (
          <div style={{ textAlign: "center", marginTop: 12 }}>
            <button onClick={onDone} style={{ background: "none", border: "none", color: X.td, fontSize: 12, cursor: "pointer", fontFamily: ff }}>Tanıtımı atla →</button>
          </div>
        )}
      </div>
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
    
    { id: "emergency", l: "Birikim Güvenlik Eşiği", i: "🛡️", d: data.settings.emergencyFundTarget ? C(data.settings.emergencyFundTarget) : "Henüz belirlenmedi" },
    { id: "rates", l: "Güncel Kurlar", i: "💱", d: data.liveRates?.USD ? `$${data.liveRates.USD.toFixed(2)}` : "Henüz girilmedi" },
    ...(isAdmin ? [{ id: "backup", l: "Yedekleme", i: "💾", d: "Yedek Al / Geri Yükle" }] : []),
    { id: "calendar", l: "Takvim Hatırlatıcı", i: "📅", d: "Ödeme günlerini takvime ekle" },
    { id: "theme", l: "Tema", i: "🎨", d: THEMES[data.settings.theme || "default"]?.name || "Varsayılan" },
    { id: "family", l: "Aile Bilgileri", i: "👨‍👩‍👧‍👦", d: isAdmin ? "Yönetici" : "Üye" },
    ...(isAdmin ? [{ id: "reset", l: "Sıfırla", i: "🗑️", d: "Geri alınamaz" }] : []),
    { id: "logout", l: "Çıkış Yap", i: "🚪", d: auth.currentUser?.email || "" },
  ];
  const BackBtn = () => <button onClick={() => setSec(null)} style={{ background: "none", border: "none", color: X.g, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: ff, padding: 0, marginBottom: 16 }}>← Geri</button>;
  if (!sec) return (<div style={{ flex: 1, overflow: "auto", padding: "20px 16px 90px" }}><h2 style={{ color: X.t, fontSize: 20, margin: "0 0 16px", fontFamily: ff }}>Ayarlar</h2><div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{secs.map(s => (<Card key={s.id} onClick={() => { setSec(s.id); setForm({}); }} s={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}><span style={{ fontSize: 24 }}>{s.i}</span><div style={{ flex: 1 }}><div style={{ color: X.t, fontWeight: 700, fontSize: 15 }}>{s.l}</div><div style={{ color: X.td, fontSize: 12 }}>{s.d}</div></div><span style={{ color: X.td }}>›</span></Card>))}</div></div>);
  if (sec === "budget") {
    const curMk = cmk();
    const ayBasladi = data.months[curMk] && (Object.keys(data.months[curMk].fixedPaid || {}).length > 0 || (data.months[curMk].ccSingle || []).length > 0 || (data.months[curMk].accountEntries || []).length > 0);
    const budgetChanged = form.b !== undefined && parseFloat(form.b) !== data.settings.monthlyBudget;
    return (
      <div style={{ padding: "20px 16px 90px" }}>
        <BackBtn />
        <Inp label="Aylık Bütçe (₺)" type="number" value={form.b ?? data.settings.monthlyBudget} onChange={v => setForm(f => ({ ...f, b: v }))} suffix="₺" />
        {ayBasladi && budgetChanged && (
          <div style={{ background: "rgba(180,83,9,0.12)", border: "1px solid rgba(180,83,9,0.3)", borderRadius: 10, padding: "10px 14px", marginTop: -8, marginBottom: 12 }}>
            <div style={{ color: X.w, fontSize: 13, fontWeight: 700, marginBottom: 4 }}>⚠️ Bu ay başladı</div>
            <div style={{ color: X.tm, fontSize: 12, lineHeight: 1.5 }}>Bu ayda zaten harcama kaydı var. Bütçeyi değiştirirseniz kalan bütçe ve banka bakiyesi hesaplamaları etkilenir, tutarsızlık oluşabilir.</div>
          </div>
        )}
        <Inp label="Konfor Harcaması Kartı Limiti (₺)" type="number" value={form.gcb ?? data.settings.generalCardBudget ?? 0} onChange={v => setForm(f => ({ ...f, gcb: v }))} suffix="₺" />
        <div style={{ color: X.td, fontSize: 12, marginTop: -8, marginBottom: 12, lineHeight: 1.5 }}>Ay başında konfor harcaması kartına yüklenecek sabit limit. Kalan bütçe hesabında bu tutar bloke edilir.</div>
        <Inp label="Beklenmeyen Gider Fonu (₺)" type="number" value={form.et ?? data.settings.emergencyTampon ?? 0} onChange={v => setForm(f => ({ ...f, et: v }))} suffix="₺" />
        <div style={{ color: X.td, fontSize: 12, marginTop: -8, marginBottom: 12, lineHeight: 1.5 }}>Kategorisiz ve tahmini aşan harcamalar buradan karşılanır. Ay sonunda kullanılmayan kısım birikime eklenir.</div>
        <div style={{ color: X.tm, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Kredi Kartı Ödeme Yöntemi</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          <button onClick={() => setForm(f => ({ ...f, ccm: "instant" }))} style={{ flex: 1, background: (form.ccm ?? data.settings.ccPaymentMode ?? "instant") === "instant" ? X.gd : "white", border: `1px solid ${(form.ccm ?? data.settings.ccPaymentMode ?? "instant") === "instant" ? X.g : "rgba(0,0,0,0.08)"}`, borderRadius: 8, padding: "8px 6px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: ff, color: (form.ccm ?? data.settings.ccPaymentMode ?? "instant") === "instant" ? X.g : X.td }}>Bu aydan</button>
          <button onClick={() => setForm(f => ({ ...f, ccm: "ekstre" }))} style={{ flex: 1, background: (form.ccm ?? data.settings.ccPaymentMode ?? "instant") === "ekstre" ? X.gd : "white", border: `1px solid ${(form.ccm ?? data.settings.ccPaymentMode ?? "instant") === "ekstre" ? X.g : "rgba(0,0,0,0.08)"}`, borderRadius: 8, padding: "8px 6px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: ff, color: (form.ccm ?? data.settings.ccPaymentMode ?? "instant") === "ekstre" ? X.g : X.td }}>Gelecek aydan</button>
        </div>
        <div style={{ color: X.td, fontSize: 11, marginBottom: 12, lineHeight: 1.5 }}>{(form.ccm ?? data.settings.ccPaymentMode ?? "instant") === "instant" ? "Kredi kartı harcamalarının karşılığı aynı ay bütçenizden düşülür." : "Kredi kartı harcamaları gelecek ayın bütçesinden düşülür (ekstre döngüsü)."}</div>
        <Btn onClick={() => { setData(d => ({ ...d, settings: { ...d.settings, monthlyBudget: form.b !== undefined ? (parseFloat(form.b) || d.settings.monthlyBudget) : d.settings.monthlyBudget, generalCardBudget: form.gcb !== undefined ? (parseFloat(form.gcb) || 0) : (d.settings.generalCardBudget || 0), emergencyTampon: form.et !== undefined ? (parseFloat(form.et) || 0) : (d.settings.emergencyTampon || 0), ccPaymentMode: form.ccm || d.settings.ccPaymentMode || "instant" } })); setSec(null); }}>Kaydet</Btn>
      </div>
    );
  }
  if (false) null;
  if (sec === "fixed") return <FixedSettings data={data} setData={setData} onBack={() => setSec(null)} />;
  if (sec === "cards") return <CardsSettings data={data} setData={setData} onBack={() => setSec(null)} />;
  if (sec === "variable") return <VariableSettings data={data} setData={setData} onBack={() => setSec(null)} />;
  if (sec === "billbudgets") return <BillBudgetsSettings data={data} setData={setData} onBack={() => setSec(null)} />;

  if (sec === "emergency") return <EmergencyFundSettings data={data} setData={setData} onBack={() => setSec(null)} />;
  if (sec === "rates") return <RatesSettings data={data} setData={setData} onBack={() => setSec(null)} />;
  if (sec === "backup") return <BackupSettings data={data} setData={setData} familyId={family?.familyId} onBack={() => setSec(null)} />;
  if (sec === "calendar") {
    const hasPayDays = data.settings.fixedExpenses.some(e => e.paymentDay) || data.debts.some(d => d.paymentDay);
    return (
      <div style={{ padding: "20px 16px 90px" }}>
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
      <div style={{ padding: "20px 16px 90px" }}>
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

        {resetItem("Kredi Kartı Tek Çekim", "💳", "Tüm aylardaki Kredi Kartı tek çekim harcamaları", () => clearMonthField("ccSingle", []))}

        {resetItem("Kredi Kartı Taksitli", "📅", "Tüm taksit planları", () => setData(d => ({ ...d, installmentPlans: [] })))}

        {resetItem("Konfor Harcaması Kartı", "🛒", "Tüm aylardaki kart yüklemeleri", () => clearMonthField("cardLoaded", 0))}

        {resetItem("Sabit Gider Ödemeleri", "📌", "Ödendi işaretleri (giderler silinmez)", () => clearMonthField("fixedPaid", {}))}

        {resetItem("Borç Ödemeleri", "💸", "Ödeme işaretleri (borçlar silinmez)", () => clearMonthField("debtPayments", {}))}


        {resetItem("CSV Ekstre Verileri", "🧾", "Yüklenen banka ekstresi verileri", () => clearMonthField("csvByCard", {}))}

        {resetItem("Kredi Kartı Aktarım İşaretleri", "🔄", "Kredi kartı hesabına aktarım işaretleri", () => clearMonthField("ccTransferred", {}))}

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
    <div style={{ padding: "20px 16px 90px" }}>
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
  if (sec === "logout") return (<div style={{ padding: "20px 16px 90px" }}><BackBtn /><Card s={{ textAlign: "center", padding: 24 }}><div style={{ fontSize: 36, marginBottom: 8 }}>🚪</div><div style={{ color: X.t, fontSize: 14, marginBottom: 8 }}>Giriş: <strong>{family?.name || auth.currentUser?.email}</strong></div><div style={{ color: X.tm, fontSize: 12, marginBottom: 16 }}>Çıkış yaptığınızda verileriniz bulutta güvende kalır. İsminiz ve şifrenizle tekrar giriş yapabilirsiniz.</div><Btn c={X.r} onClick={() => signOut(auth)}>Çıkış Yap</Btn></Card></div>);
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
    <div style={{ padding: "20px 16px 90px" }}>
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
    <div style={{ padding: "20px 16px 90px" }}>
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
    <div style={{ padding: "20px 16px 90px" }}>
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
    <div style={{ padding: "20px 16px 90px" }}>
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
    <div style={{ padding: "20px 16px 90px" }}>
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
  const [openAcc, setOpenAcc] = useState("info");
  const [n, sn] = useState("");
  const [c, sc] = useState("TRY");
  const [total, setTotal] = useState("");
  const [months, setMonths] = useState("");
  const [pDay, setPDay] = useState("");
  const [pDayEnd, setPDayEnd] = useState("");
  const [startMonth, setStartMonth] = useState(cmk());
  const [planType, setPlanType] = useState("equal");
  const [borrowDate, setBorrowDate] = useState(td());
  const [purpose, setPurpose] = useState("");
  const [noteText, setNoteText] = useState("");

  const toggleAcc = id => setOpenAcc(o => o === id ? null : id);

  const startNew = () => {
    sn(""); sc("TRY"); setTotal(""); setMonths(""); setPDay(""); setPDayEnd("");
    setStartMonth(cmk()); setPlanType("equal"); setBorrowDate(td()); setPurpose(""); setNoteText("");
    setOpenAcc("info"); setEditing("new");
  };

  const startEdit = debt => {
    sn(debt.name); sc(debt.currency);
    const t = debt.totalAmount || (debt.monthlyPayment * (debt.totalMonths || debt.remainingMonths));
    const m2 = debt.totalMonths || debt.remainingMonths;
    setTotal(String(t)); setMonths(String(m2));
    setPDay(debt.paymentDay ? String(debt.paymentDay) : "");
    setPDayEnd(debt.paymentDayEnd ? String(debt.paymentDayEnd) : "");
    setStartMonth(debt.startMonth || cmk());
    setPlanType(debt.planType || "equal");
    setBorrowDate(debt.borrowDate || td());
    setPurpose(debt.purpose || "");
    setNoteText(debt.noteText || "");
    setOpenAcc("info"); setEditing(debt.id);
  };

  const cancel = () => { setEditing(null); };

  const totalNum = parseFloat(total) || 0;
  const monthsNum = parseInt(months) || 0;
  const monthlyCalc = monthsNum > 0 ? totalNum / monthsNum : 0;

  const infoOk = !!n;
  const amountOk = totalNum > 0;
  const planOk = planType === "lump" ? !!pDay : (monthsNum > 0 && !!pDay);

  const liveRate = c === "XAU" ? (data.liveRates?.XAU || 0) : c === "USD" ? (data.liveRates?.USD || 0) : c === "EUR" ? (data.liveRates?.EUR || 0) : 1;
  const tlTotal = c === "TRY" ? totalNum : totalNum * liveRate;
  const tlMonthly = c === "TRY" ? monthlyCalc : monthlyCalc * liveRate;

  const save = () => {
    if (!n || !totalNum) return;
    if (planType !== "lump" && !monthsNum) return;
    setData(d => {
      const list = [...d.debts];
      const entry = {
        id: editing === "new" ? uid() : editing,
        name: n, currency: c,
        totalAmount: totalNum,
        totalMonths: planType === "lump" ? 1 : monthsNum,
        remainingMonths: planType === "lump" ? 1 : monthsNum,
        monthlyPayment: planType === "lump" ? totalNum : monthlyCalc,
        paymentDay: parseInt(pDay) || null,
        paymentDayEnd: parseInt(pDayEnd) || null,
        startMonth, planType, borrowDate, purpose, noteText
      };
      if (editing === "new") { list.push(entry); }
      else {
        const idx = list.findIndex(x => x.id === editing);
        if (idx >= 0) {
          const old = list[idx];
          const paidCount = (old.totalMonths || old.remainingMonths) - old.remainingMonths;
          const newRemaining = Math.max(0, entry.totalMonths - paidCount);
          list[idx] = { ...entry, remainingMonths: newRemaining };
        }
      }
      return { ...d, debts: list };
    });
    cancel();
  };

  const rm = id => { if (confirm("Bu borcu silmek istediğinize emin misiniz?")) setData(dd => ({ ...dd, debts: dd.debts.filter(x => x.id !== id) })); };

  const accHead = (id, icon, title, sub, ok) => (
    <div onClick={() => toggleAcc(id)} style={{ background: "white", padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", borderRadius: openAcc === id ? "14px 14px 0 0" : 14, border: `1px solid rgba(0,0,0,0.08)`, borderBottom: openAcc === id ? "1px solid rgba(0,0,0,0.06)" : undefined }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <div>
          <div style={{ color: X.t, fontSize: 14, fontWeight: 700 }}>{title}</div>
          {sub && <div style={{ color: X.td, fontSize: 11, marginTop: 1 }}>{sub}</div>}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ width: 20, height: 20, borderRadius: "50%", background: ok ? X.g : X.border, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 11, flexShrink: 0 }}>{ok ? "✓" : "–"}</div>
        <span style={{ color: X.td, fontSize: 11, transform: openAcc === id ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
      </div>
    </div>
  );

  const accBody = children => (
    <div style={{ background: "#F5F0EB", padding: "14px 16px", borderRadius: "0 0 14px 14px", border: "1px solid rgba(0,0,0,0.08)", borderTop: "none", marginBottom: 8 }}>
      {children}
    </div>
  );

  const editForm = editing ? (
    <div style={{ marginBottom: 16 }}>
      <div style={{ color: X.w, fontSize: 14, fontWeight: 800, marginBottom: 12 }}>{editing === "new" ? "➕ Yeni Borç" : "✎ Düzenle"}</div>

      {/* AKORDİYON 1: Borç Bilgileri */}
      {accHead("info", "👤", "Borç Bilgileri", n ? `${n}${borrowDate ? " · " + borrowDate : ""}` : "Alacaklı ve tarih", infoOk)}
      {openAcc === "info" && accBody(<>
        <div style={{ color: X.td, fontSize: 12, marginBottom: 4, fontWeight: 600 }}>Borç Adı / Alacaklı</div>
        <input value={n} onChange={e => sn(e.target.value)} placeholder="Örn: Dostlar Sandığı, Ahmet Abi..." style={{ width: "100%", background: "white", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10, padding: "10px 12px", fontSize: 14, color: X.t, marginBottom: 12 }} />
        <div style={{ color: X.td, fontSize: 12, marginBottom: 4, fontWeight: 600 }}>Alındığı Tarih</div>
        <input type="date" value={borrowDate} onChange={e => setBorrowDate(e.target.value)} style={{ width: "100%", background: "white", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10, padding: "10px 12px", fontSize: 14, color: X.t, marginBottom: 12 }} />
        <div style={{ color: X.td, fontSize: 12, marginBottom: 4, fontWeight: 600 }}>Amaç (opsiyonel)</div>
        <input value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="Örn: Ev tadilatı, araba, acil ihtiyaç..." style={{ width: "100%", background: "white", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10, padding: "10px 12px", fontSize: 14, color: X.t, marginBottom: 12 }} />
        <div style={{ color: X.td, fontSize: 12, marginBottom: 4, fontWeight: 600 }}>Not (opsiyonel)</div>
        <input value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Eklemek istediğiniz detaylar..." style={{ width: "100%", background: "white", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10, padding: "10px 12px", fontSize: 14, color: X.t }} />
      </>)}

      {/* AKORDİYON 2: Tutar ve Birim */}
      {accHead("amount", "💰", "Tutar ve Birim", amountOk ? `${totalNum} ${debtCurSymbol(c)}${c !== "TRY" && liveRate ? " · ≈ " + C(tlTotal) : ""}` : "Miktar ve para birimi", amountOk)}
      {openAcc === "amount" && accBody(<>
        <Sel label="Birim" value={c} onChange={sc} options={[{ v: "TRY", l: "₺ Türk Lirası" }, { v: "USD", l: "$ Dolar" }, { v: "EUR", l: "€ Euro" }, { v: "XAU", l: "🪙 Altın (gram)" }]} />
        <div style={{ color: X.td, fontSize: 12, marginBottom: 4, fontWeight: 600 }}>Toplam Borç Miktarı</div>
        <input type="number" value={total} onChange={e => setTotal(e.target.value)} placeholder={`Örn: ${c === "XAU" ? "56" : "50000"}`} style={{ width: "100%", background: "white", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10, padding: "10px 12px", fontSize: 14, color: X.t, marginBottom: 12 }} />
        {c !== "TRY" && liveRate > 0 && totalNum > 0 && (
          <div style={{ background: "rgba(15,118,110,0.08)", border: "1px solid rgba(15,118,110,0.2)", borderRadius: 10, padding: "10px 12px", fontSize: 12, color: X.g, fontWeight: 600 }}>
            ≈ {C(tlTotal)} ({totalNum} × {C(liveRate)}/{debtCurSymbol(c)} bugünkü kur)
          </div>
        )}
      </>)}

      {/* AKORDİYON 3: Geri Ödeme Planı */}
      {accHead("plan", "📅", "Geri Ödeme Planı",
        planOk ? (planType === "equal" ? `Eşit taksit · ${monthsNum} ay · ${pDay}'inde` : planType === "lump" ? `Toplu ödeme · ${pDay}'inde` : `Serbest · ${pDay}'inde`) : "Plan tipini seçin",
        planOk)}
      {openAcc === "plan" && accBody(<>
        <div style={{ color: X.td, fontSize: 12, marginBottom: 8, fontWeight: 600 }}>Plan Tipi</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 14 }}>
          {[{ v: "equal", l: "📅 Eşit Taksit" }, { v: "free", l: "🔄 Serbest" }, { v: "lump", l: "💰 Toplu Ödeme" }].map(pt => (
            <button key={pt.v} onClick={() => setPlanType(pt.v)} style={{ background: planType === pt.v ? X.g : "white", border: `1px solid ${planType === pt.v ? X.g : "rgba(0,0,0,0.08)"}`, borderRadius: 10, padding: "10px 4px", textAlign: "center", cursor: "pointer", fontSize: 11, fontWeight: 700, color: planType === pt.v ? "white" : X.td, fontFamily: ff }}>{pt.l}</button>
          ))}
        </div>
        {planType !== "lump" && <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            <div>
              <div style={{ color: X.td, fontSize: 12, marginBottom: 4, fontWeight: 600 }}>Vade (ay)</div>
              <input type="number" value={months} onChange={e => setMonths(e.target.value)} placeholder="Örn: 8" style={{ width: "100%", background: "white", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10, padding: "10px 12px", fontSize: 14, color: X.t }} />
            </div>
            <div>
              <div style={{ color: X.td, fontSize: 12, marginBottom: 4, fontWeight: 600 }}>Başlangıç Ayı</div>
              <input type="month" value={startMonth} onChange={e => setStartMonth(e.target.value)} style={{ width: "100%", background: "white", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10, padding: "10px 12px", fontSize: 14, color: X.t }} />
            </div>
          </div>
        </>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          <div>
            <div style={{ color: X.td, fontSize: 12, marginBottom: 4, fontWeight: 600 }}>Ödeme Günü</div>
            <input type="number" value={pDay} onChange={e => setPDay(e.target.value)} placeholder="Örn: 28" style={{ width: "100%", background: "white", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10, padding: "10px 12px", fontSize: 14, color: X.t }} />
          </div>
          <div>
            <div style={{ color: X.td, fontSize: 12, marginBottom: 4, fontWeight: 600 }}>Son Gün (ops.)</div>
            <input type="number" value={pDayEnd} onChange={e => setPDayEnd(e.target.value)} placeholder="Örn: 31" style={{ width: "100%", background: "white", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10, padding: "10px 12px", fontSize: 14, color: X.t }} />
          </div>
        </div>
        {totalNum > 0 && (planType === "lump" || monthsNum > 0) && (
          <div style={{ background: "rgba(180,83,9,0.08)", border: "1px solid rgba(180,83,9,0.25)", borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ color: X.w, fontSize: 10, fontWeight: 700, marginBottom: 4 }}>{planType === "lump" ? "ÖDENECEK TUTAR" : "AYLIK TAKSİT"}</div>
            <div style={{ color: X.w, fontSize: 20, fontWeight: 800, fontFamily: fm }}>
              {planType === "lump" ? `${totalNum} ${debtCurSymbol(c)}` : `${monthlyCalc.toFixed(c === "TRY" ? 0 : 2)} ${debtCurSymbol(c)}`}
            </div>
            {c !== "TRY" && liveRate > 0 && (
              <div style={{ color: X.td, fontSize: 11, marginTop: 2 }}>
                ≈ {C(planType === "lump" ? tlTotal : tlMonthly)}{planType !== "lump" ? `/ay · ${monthsNum} ay · toplam ${C(tlTotal)}` : ""}
              </div>
            )}
            {c === "TRY" && planType !== "lump" && monthsNum > 0 && (
              <div style={{ color: X.td, fontSize: 11, marginTop: 2 }}>{monthsNum} ay · toplam {C(totalNum)}</div>
            )}
          </div>
        )}
      </>)}

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <Btn onClick={save} c={X.w} s={{ flex: 1 }} disabled={!n || !totalNum || (planType !== "lump" && !monthsNum)}>💾 Kaydet</Btn>
        <Btn onClick={cancel} v="outline" c={X.td} s={{ flex: 1 }}>İptal</Btn>
      </div>
    </div>
  ) : null;

  return (
    <div style={{ padding: "20px 16px 90px" }}>
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
                  {(d.purpose || d.borrowDate) && (
                    <div style={{ color: X.td, fontSize: 11, marginTop: 1 }}>
                      {d.borrowDate && <span>{d.borrowDate}</span>}
                      {d.purpose && <span>{d.borrowDate ? " · " : ""}{d.purpose}</span>}
                    </div>
                  )}
                  <div style={{ color: X.tm, fontSize: 12, marginTop: 2 }}>
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
      const prevMd = d.months[prevMk] || DM();
      const [y, mo] = prevMk.split("-").map(Number);
      const lastDay = new Date(y, mo, 0).toISOString().slice(0, 10);

      // Beklenmeyen gider fonundan kalan hesapla
      const unexpectedFund = d.settings.emergencyTampon || 0;
      if (unexpectedFund > 0) {
        const { categories: cats } = categorizeMonthSpending(d, prevMk);
        const categorizedSpent = Object.entries(cats).filter(([k]) => k !== "_uncategorized").reduce((s, [, v]) => s + v, 0);
        const variableEst = (d.settings.variableExpenses || []).reduce((s, ve) => s + (ve.expectedAmount || 0), 0);
        const overBudget = Math.max(0, categorizedSpent - variableEst); // tahmini aşan kısım
        const uncategorized = cats._uncategorized || 0; // kategorisiz harcamalar
        const fundUsed = overBudget + uncategorized;
        const fundRemaining = Math.max(0, unexpectedFund - fundUsed);
        if (fundRemaining > 0) {
          const list = [...(newSavings.TRY || [])];
          list.push({ id: uid(), type: "buy", amount: fundRemaining, unitPrice: 1, date: lastDay, source: "monthly_close", note: `${ml(prevMk)} beklenmeyen gider fonu artığı` });
          newSavings.TRY = list;
        }
      }

      if (hasSurplus) {
        const list = [...(newSavings.TRY || [])];
        // Ayın son günü tarihi
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
  const [linkData, setLinkData] = useState(null); // email link'ten dönen kullanıcı bilgisi

  // Sayfa yüklendiğinde: URL'de email link var mı kontrol et
  useEffect(() => {
    if (isSignInWithEmailLink(auth, window.location.href)) {
      const params = new URLSearchParams(window.location.search);
      const urlEmail = params.get("email") || localStorage.getItem("emailForSignIn") || "";
      const urlName = params.get("name") || "";
      const urlType = params.get("type") || "newAdmin";
      const urlInvCode = params.get("invCode") || "";

      if (urlEmail) {
        setEmail(urlEmail);
        setName(urlName);
        setLinkData({ email: urlEmail, name: urlName, type: urlType, invCode: urlInvCode });
        setMode("setPassword");
      } else {
        setErr("E-posta bilgisi bulunamadı. Lütfen tekrar kayıt olun.");
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, []);

  // Giriş (mevcut kullanıcılar: isim + şifre)
  const handleLogin = async () => {
    if (!name || !pass) { setErr("İsim ve şifre gerekli"); return; }
    setLoading(true); setErr("");
    try {
      const found = await lookupName(name);
      if (found) {
        await signInWithEmailAndPassword(auth, found.email, pass);
      } else if (name.includes("@")) {
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

  // Kayıt: email doğrulama linki gönder (şifre yok henüz)
  const handleRegister = async () => {
    if (!name || !email) { setErr("İsim ve e-posta gerekli"); return; }
    setLoading(true); setErr("");
    try {
      const existing = await lookupName(name);
      if (existing) { setErr("Bu isim zaten kayıtlı. Giriş yapın."); setLoading(false); return; }
      const actionCodeSettings = {
        url: `${window.location.origin}${window.location.pathname}?name=${encodeURIComponent(name)}&type=newAdmin&email=${encodeURIComponent(email)}`,
        handleCodeInApp: true
      };
      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      localStorage.setItem("emailForSignIn", email);
      setMode("emailSent");
    } catch (e) {
      if (e.code === "auth/invalid-email") setErr("Geçersiz e-posta adresi.");
      else setErr(e.message);
    }
    setLoading(false);
  };

  // Davet kodu kontrol
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

  // Davetli: email doğrulama linki gönder
  const handleInviteSendLink = async () => {
    setLoading(true); setErr("");
    try {
      const actionCodeSettings = {
        url: `${window.location.origin}${window.location.pathname}?name=${encodeURIComponent(invData.name)}&type=invite&invCode=${invCode}&email=${encodeURIComponent(invData.email)}`,
        handleCodeInApp: true
      };
      await sendSignInLinkToEmail(auth, invData.email, actionCodeSettings);
      localStorage.setItem("emailForSignIn", invData.email);
      setMode("emailSent");
    } catch (e) {
      setErr(e.message);
    }
    setLoading(false);
  };

  // Email linkinden döndükten sonra: şifre belirle + hesap oluştur
  const handleSetPassword = async () => {
    if (!pass || pass.length < 6) { setErr("Şifre en az 6 karakter olmalı"); return; }
    setLoading(true); setErr("");
    try {
      // 1. Email link ile giriş yap (hesap yoksa oluşturulur)
      const result = await signInWithEmailLink(auth, linkData.email, window.location.href);
      // 2. Şifre belirle (sonraki girişlerde kullanılacak)
      await updatePassword(result.user, pass);
      // 3. Aile oluştur veya katıl (doğrudan Firebase'e yaz)
      if (linkData.type === "invite" && linkData.invCode) {
        const inv = await lookupInvitation(linkData.invCode);
        if (inv) {
          await joinViaInvitation(result.user.uid, linkData.invCode, inv);
        }
      } else {
        await migrateOldData(result.user.uid);
        await createFamily(result.user.uid, result.user.email, linkData.name);
      }
      // 4. URL'yi temizle
      window.history.replaceState({}, document.title, window.location.pathname);
      localStorage.removeItem("emailForSignIn");
    } catch (e) {
      if (e.code === "auth/invalid-action-code") setErr("Bu doğrulama linki geçersiz veya süresi dolmuş. Lütfen tekrar kayıt olun.");
      else if (e.code === "auth/email-already-in-use") setErr("Bu e-posta zaten kayıtlı. Giriş yapın.");
      else setErr(e.message);
    }
    setLoading(false);
  };

  const modeTitle = { login: "Giriş yap", register: "Yeni hesap oluştur", invite: "Davet ile katıl", emailSent: "E-posta gönderildi", setPassword: "Şifre belirleyin" };

  return (
    <div style={{ background: THEMES[_tid].gradient, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: ff, padding: 16 }}>
      <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <div style={{ ...glassSolid, borderRadius: 20, width: "100%", maxWidth: 380, padding: 28, boxShadow: neu }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>{mode === "emailSent" ? "📧" : mode === "setPassword" ? "🔐" : "💰"}</div>
          <div style={{ color: X.t, fontSize: 22, fontWeight: 800 }}>{mode === "emailSent" || mode === "setPassword" ? (modeTitle[mode]) : "EV BÜTÇESİ"}</div>
          <div style={{ color: X.tm, fontSize: 13, marginTop: 4 }}>{mode !== "emailSent" && mode !== "setPassword" && modeTitle[mode]}</div>
        </div>
        {err && <div style={{ background: X.rd, border: `1px solid ${X.r}`, borderRadius: 10, padding: "8px 12px", marginBottom: 12, color: X.r, fontSize: 12, fontWeight: 600 }}>{err}</div>}

        {mode === "login" && (<>
          <Inp label="İsim Soyisim" value={name} onChange={setName} placeholder="İsim Soyisim" />
          <Inp label="Şifre" type="password" value={pass} onChange={setPass} placeholder="••••••" />
          <Btn onClick={handleLogin} disabled={loading}>{loading ? "Giriş yapılıyor..." : "Giriş Yap"}</Btn>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginTop: 16 }}>
            <button onClick={() => { setMode("register"); setErr(""); }} style={{ background: "none", border: "none", color: X.b, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: ff }}>Hesabım yok → Kayıt Ol</button>
            <button onClick={() => { setMode("invite"); setErr(""); }} style={{ background: "none", border: "none", color: X.g, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: ff }}>🔑 Davet kodum var</button>
          </div>
        </>)}

        {mode === "register" && (<>
          <Inp label="İsim Soyisim" value={name} onChange={setName} placeholder="İsim Soyisim" />
          <Inp label="E-posta" value={email} onChange={setEmail} placeholder="ornek@gmail.com" />
          <div style={{ color: X.tm, fontSize: 11, marginBottom: 12, lineHeight: 1.5 }}>Bu adrese bir doğrulama linki gönderilecek. Gerçek bir e-posta adresi girin.</div>
          <Btn onClick={handleRegister} disabled={loading}>{loading ? "Gönderiliyor..." : "Doğrulama Linki Gönder"}</Btn>
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
            <div style={{ color: X.g, fontSize: 13, fontWeight: 700 }}>Davet doğrulandı</div>
            <div style={{ color: X.t, fontSize: 18, fontWeight: 800, marginTop: 4 }}>{invData.name}</div>
            <div style={{ color: X.tm, fontSize: 12, marginTop: 4 }}>{invData.email}</div>
          </div>
          <div style={{ color: X.tm, fontSize: 11, marginBottom: 12, lineHeight: 1.5 }}>Yukarıdaki e-posta adresine bir doğrulama linki göndereceğiz. Bu adrese erişiminiz olmalı.</div>
          <Btn onClick={handleInviteSendLink} disabled={loading} c={X.g}>{loading ? "Gönderiliyor..." : "Doğrulama Linki Gönder"}</Btn>
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <button onClick={() => { setMode("invite"); setErr(""); setInvData(null); setInvCode(""); }} style={{ background: "none", border: "none", color: X.b, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: ff }}>← Farklı kod gir</button>
          </div>
        </>)}

        {mode === "emailSent" && (<>
          <div style={{ textAlign: "center", padding: "8px 0" }}>
            <div style={{ color: X.t, fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Doğrulama e-postası gönderildi</div>
            <div style={{ color: X.tm, fontSize: 13, lineHeight: 1.6 }}>
              <strong style={{ color: X.t }}>{email || invData?.email}</strong> adresine bir doğrulama linki gönderdik.
            </div>
            <div style={{ background: X.bd, border: `1px solid ${X.b}`, borderRadius: 10, padding: 12, marginTop: 16, textAlign: "left" }}>
              <div style={{ color: X.b, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Yapmanız gerekenler:</div>
              <div style={{ color: X.tm, fontSize: 12, lineHeight: 1.8 }}>
                1. E-posta kutunuzu kontrol edin<br/>
                2. Spam/gereksiz klasörünü de kontrol edin<br/>
                3. Gelen linke tıklayın<br/>
                4. Şifrenizi belirleyin
              </div>
            </div>
            <div style={{ color: X.td, fontSize: 11, marginTop: 12 }}>Link 1 saat geçerlidir.</div>
          </div>
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <button onClick={() => { setMode("login"); setErr(""); setInvData(null); }} style={{ background: "none", border: "none", color: X.b, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: ff }}>← Giriş Ekranına Dön</button>
          </div>
        </>)}

        {mode === "setPassword" && linkData && (<>
          <div style={{ background: X.gd, border: `1px solid ${X.g}`, borderRadius: 10, padding: 12, marginBottom: 12, textAlign: "center" }}>
            <div style={{ color: X.g, fontSize: 13, fontWeight: 700 }}>E-posta doğrulandı</div>
            <div style={{ color: X.t, fontSize: 18, fontWeight: 800, marginTop: 4 }}>{linkData.name}</div>
            <div style={{ color: X.tm, fontSize: 12, marginTop: 4 }}>{linkData.email}</div>
          </div>
          <div style={{ color: X.tm, fontSize: 12, marginBottom: 12, textAlign: "center", lineHeight: 1.5 }}>Sonraki girişleriniz için bir şifre belirleyin.</div>
          <Inp label="Şifrenizi belirleyin" type="password" value={pass} onChange={setPass} placeholder="En az 6 karakter" />
          <Btn onClick={handleSetPassword} disabled={loading} c={X.g}>{loading ? "Hesap oluşturuluyor..." : "Şifreyi Belirle ve Devam Et"}</Btn>
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

  // Onboarding: yeni kullanıcı kontrolü
  // Mevcut kullanıcılarda onboardingCompleted yok (undefined) ve monthlyBudget > 0 — onları atla
  // Yeni kullanıcılarda onboardingCompleted yok ve monthlyBudget 0 — onboarding göster
  const needsOnboarding = !data.settings.onboardingCompleted && !data.settings.monthlyBudget;
  if (needsOnboarding) return <OnboardingWizard data={data} setData={setData} familyName={family?.name} />;

  // Tanıtım ekranı: onboarding sonrası bir kez gösterilir
  if (data.settings.onboardingCompleted && !data.settings.introSeen) return <IntroScreen onDone={() => setData(d => ({ ...d, settings: { ...d.settings, introSeen: true } }))} />;

  const backupNeeded = needsWeeklyBackup(data);
  const memberLocked = !isAdmin && backupNeeded;

    const c = calcMonth(data, mk, null);
  let headerRisk = { score: 0 }; try { headerRisk = calcRisk(data, mk); } catch(e) { console.warn("Risk hesaplama hatası:", e); }
  const headerRiskColor = (() => { const s = headerRisk.score; if (s >= 70) return "#DC2626"; if (s >= 50) return "#D97706"; if (s >= 30) return "#B45309"; if (s >= 15) return "#84CC16"; return "#0F766E"; })();
  const showHeaderDetail = () => { const bd = getMonthBreakdown(data, mk); setHeaderDetail({ title: `${ml(mk)} — Bütçe Dökümü`, rows: bd.rows, total: bd.mc.remaining, totalLabel: "Kalan bütçe", totalColor: bd.mc.remaining > bd.mc.effectiveBudget * 0.1 ? X.g : bd.mc.remaining >= 0 ? X.w : X.r }); };

  const showBlokeDetail = () => {
    const rows = [
      { label: "Ödenmemiş sabit giderler (hesaptan)", value: c.unpaidFixedAcc || 0, sign: "" },
      { label: "Aktarılmamış Kredi Kartı harcamaları", value: c.untransferredCC || 0, sign: "" },
      { label: "Aktarılmamış sabit Kredi Kartı ödemeleri", value: c.untransferredFixedCC || 0, sign: "" },
      { label: "Aktarılmamış hesaptan ödemeler", value: c.untransferredAcc || 0, sign: "" },
      { label: "Borç ödemeleri", value: c.debtTotal || 0, sign: "" },
      { label: "Taksit ödemeleri", value: c.installmentTotal || 0, sign: "" },
      { label: "Değişken gider kalan tahmini", value: c.variableBlokeKalan || 0, sign: "" },
      { label: "Konfor kartı kalan hakkı", value: c.cardBlokeKalan || 0, sign: "" },
      { label: "Beklenmeyen Gider Fonu", value: c.emergencyBuffer || 0, sign: "" },
      { label: "Etkinlik kumbara bloke", value: c.eventKumbaraBloke || 0, sign: "" },
    ].filter(r => r.value > 0);
    setHeaderDetail({ title: "Bloke Detayı", rows, total: c.groupB || 0, totalLabel: "Toplam bloke (kesin çıkacak ödemeler)", totalColor: X.w });
  };

  const showKalanDetail = () => {
    const rows = [
      { label: "Aylık bütçe", value: c.effectiveBudget, sign: "", hl: true },
      { label: "Ödenen sabit giderler (hesaptan)", value: c.paidFixedAcc || 0, sign: "−" },
      { label: "Aktarılan Kredi Kartı harcamaları", value: (c.transferredCC || 0) + (c.transferredFixedCC || 0), sign: "−" },
      { label: "Aktarılan hesaptan ödemeler", value: c.transferredAcc || 0, sign: "−" },
      { label: "Konfor kartı yükleme", value: c.cardLoaded || 0, sign: "−" },
    ].filter((r, i) => i === 0 || r.value > 0);
    setHeaderDetail({ title: "Kalan Bütçe Detayı", rows, total: c.remainingY || 0, totalLabel: `Bankadaki Reel Tutar: ${C(c.remainingY||0)}  |  Bloke Sonrası Kalan: ${C(c.remainingX||0)}`, totalColor: (c.remainingX||0) >= 0 ? X.g : X.r });
  };

  return (
    <div style={{ background: _theme.gradient, height: "100dvh", display: "flex", flexDirection: "column", color: X.t, fontFamily: ff, maxWidth: 480, margin: "0 auto", position: "relative", overflow: "hidden" }}>
      <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      {/* Renk lekeleri */}
      <div style={{ position: "fixed", top: 60, left: -50, width: 200, height: 200, borderRadius: "50%", background: "rgba(22,163,74,0.07)", filter: "blur(60px)", pointerEvents: "none" }} />
      <div style={{ position: "fixed", top: 280, right: -40, width: 170, height: 170, borderRadius: "50%", background: "rgba(37,99,235,0.06)", filter: "blur(50px)", pointerEvents: "none" }} />
      <div style={{ position: "fixed", bottom: 250, left: 10, width: 140, height: 140, borderRadius: "50%", background: "rgba(124,58,237,0.05)", filter: "blur(45px)", pointerEvents: "none" }} />
      {tab === "home" && (
        <div style={{ background: "linear-gradient(160deg,#0d2e2e 0%,#0F766E 60%,#16a34a 100%)", padding: "12px 14px 14px", position: "relative", overflow: "hidden", flexShrink: 0 }}>
          <div style={{ position: "absolute", top: -40, right: -20, width: 130, height: 130, borderRadius: "50%", background: "rgba(255,255,255,0.04)" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, position: "relative", zIndex: 1 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 900, letterSpacing: 1, color: "white" }}>EV BÜTÇESİ</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginTop: 1 }}>{ml(mk)}</div>
            </div>
            <div onClick={() => setTab("report")} style={{ position: "relative", width: 44, height: 44, cursor: "pointer", flexShrink: 0 }}>
              <svg width="44" height="44" viewBox="0 0 44 44" style={{ transform: "rotate(-90deg)" }}>
                <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3.5" />
                <circle cx="22" cy="22" r="18" fill="none" stroke="#6EE7B7" strokeWidth="3.5" strokeDasharray="113.1" strokeDashoffset={113.1 * (1 - headerRisk.score / 100)} strokeLinecap="round" />
              </svg>
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center" }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: "white", lineHeight: 1 }}>{headerRisk.score}</div>
                <div style={{ fontSize: 6, color: "rgba(255,255,255,0.55)", fontWeight: 600, letterSpacing: 0.5 }}>RİSK</div>
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, position: "relative", zIndex: 1 }}>
            {[
              { label: "Aylık Bütçe", val: C(c.effectiveBudget), color: "white", onClick: null },
              { label: "Bankadaki Tutar", val: C(c.remainingY || 0), color: "white", onClick: showKalanDetail },
              { label: "Bloke Edilen Tutar", val: C(c.groupB || 0), color: "#FCA5A5", onClick: showBlokeDetail },
              { label: "Bloke Sonrası Kalan Bütçe", val: C(c.remainingX || 0), color: "#6EE7B7", onClick: showKalanDetail },
            ].map((box, i) => (
              <div key={i} onClick={box.onClick} style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 11, padding: "8px 10px", cursor: box.onClick ? "pointer" : "default" }}>
                <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.07em", color: "rgba(255,255,255,0.75)", textTransform: "uppercase", marginBottom: 3 }}>{box.label}</div>
                <div style={{ fontSize: 15, fontWeight: 900, color: box.color, fontFamily: fm, lineHeight: 1 }}>{box.val}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {tab !== "home" && (
        <div style={{ ...glassSolid, borderBottom: "none", borderRadius: "0 0 18px 18px", padding: "calc(12px + env(safe-area-inset-top)) 16px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, boxShadow: "0 4px 16px rgba(0,0,0,0.06)" }}>
          <div><div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.3px", color: X.t }}>EV BÜTÇESİ</div><div style={{ fontSize: 11, color: X.td }}>{ml(mk)}</div></div>
          <div onClick={() => setTab("report")} style={{ position: "relative", width: 36, height: 36, cursor: "pointer", flexShrink: 0 }}>
            <svg width="36" height="36" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="3" />
              <circle cx="18" cy="18" r="15" fill="none" stroke={headerRiskColor} strokeWidth="3" strokeDasharray="94.2" strokeDashoffset={94.2 * (1 - headerRisk.score / 100)} strokeLinecap="round" transform="rotate(-90 18 18)" />
            </svg>
            <span style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", fontSize: 11, fontWeight: 800, color: headerRiskColor, fontFamily: fm }}>{headerRisk.score}</span>
          </div>
        </div>
      )}
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
