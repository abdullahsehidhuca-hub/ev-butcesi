import { useState, useEffect, useMemo, useCallback } from "react";
import * as Papa from "papaparse";

const C = n => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const td = () => new Date().toISOString().slice(0, 10);
const cmk = () => td().slice(0, 7);
const MTR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const ml = mk => { const [y, m] = mk.split("-"); return MTR[+m - 1] + " " + y; };
const nmk = mk => { let [y, m] = mk.split("-").map(Number); m++; if (m > 12) { m = 1; y++; } return `${y}-${String(m).padStart(2, "0")}`; };
const pmk = mk => { let [y, m] = mk.split("-").map(Number); m--; if (m < 1) { m = 12; y--; } return `${y}-${String(m).padStart(2, "0")}`; };
const PM = [{ id: "account", label: "Hesaptan", icon: "🏦" }, { id: "cc", label: "Kredi Kartı", icon: "💳" }];

const CARD_LOAD_PER_TX_PCT = 0.10; // tek seferde %10
const CARD_LOAD_TOTAL_PCT = 0.15; // ay toplamı %15

const DD = { settings: { monthlyBudget: 450000, fixedExpenses: [], variableExpenses: [], cards: [], emergencyFundTarget: null }, months: {}, installmentPlans: [], debts: [], merchantMap: {}, goldRates: {}, usdRates: {}, eurRates: {}, liveRates: { USD: null, EUR: null, XAU: null, fetchedAt: null }, savings: { TRY: [], USD: [], EUR: [], XAU: [] }, lastClosedMonth: null, lastBackup: null };
const DM = () => ({ budget: null, fixedPaid: {}, variableEntries: {}, ccSingle: [], cardLoaded: 0, debtPayments: {}, csvByCard: {}, finalSavings: null });

const STORAGE_KEY = "ev-butce-v11";

async function loadDB() {
  // 1. Önce Claude window.storage dene (artifact ortamı)
  try {
    if (typeof window !== "undefined" && window.storage?.get) {
      const r = await window.storage.get(STORAGE_KEY);
      if (r) return JSON.parse(r.value);
    }
  } catch { }
  // 2. localStorage fallback (Vercel/GitHub/bağımsız deployment)
  try {
    if (typeof localStorage !== "undefined") {
      const r = localStorage.getItem(STORAGE_KEY);
      if (r) return JSON.parse(r);
    }
  } catch { }
  return null;
}

async function saveDB(d) {
  const json = JSON.stringify(d);
  let saved = false;
  // 1. Claude window.storage dene
  try {
    if (typeof window !== "undefined" && window.storage?.set) {
      await window.storage.set(STORAGE_KEY, json);
      saved = true;
    }
  } catch { }
  // 2. localStorage yedek (her zaman yedek olarak)
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, json);
      saved = true;
    }
  } catch { }
  return saved;
}

async function deleteDB() {
  try { if (window.storage?.delete) await window.storage.delete(STORAGE_KEY); } catch { }
  try { localStorage.removeItem(STORAGE_KEY); } catch { }
}

/* ═══ KUR SİSTEMİ (sadece manuel) ═══ */
const HAREMALTIN_XAU = "https://www.haremaltin.com/grafik?tip=altin&birim=ALTIN";
const HAREMALTIN_USD = "https://www.haremaltin.com/grafik?tip=doviz&birim=USDTRY";
const HAREMALTIN_EUR = "https://www.haremaltin.com/grafik?tip=doviz&birim=EURTRY";

const X = { bg: "#0C0E16", card: "#151823", border: "#252836", g: "#22C55E", gd: "rgba(34,197,94,0.12)", w: "#F59E0B", wd: "rgba(245,158,11,0.12)", r: "#EF4444", rd: "rgba(239,68,68,0.12)", b: "#3B82F6", bd: "rgba(59,130,246,0.12)", p: "#A855F7", pd: "rgba(168,85,247,0.12)", o: "#F97316", od: "rgba(249,115,22,0.12)", t: "#E2E8F0", tm: "#94A3B8", td: "#475569" };
const ff = `'DM Sans',sans-serif`;
const fm = `'JetBrains Mono','Fira Code',monospace`;

/* ═══ UI ═══ */
function Card({ children, s, onClick }) { return <div onClick={onClick} style={{ background: X.card, borderRadius: 14, padding: "14px 16px", border: `1px solid ${X.border}`, cursor: onClick ? "pointer" : "default", ...s }}>{children}</div>; }
function Btn({ children, c = X.g, v = "filled", onClick, s, disabled }) { return <button disabled={disabled} onClick={onClick} style={{ background: v === "filled" ? c : "transparent", color: v === "filled" ? "#000" : c, border: v === "filled" ? "none" : `2px solid ${c}`, borderRadius: 12, padding: "12px 20px", fontSize: 15, fontWeight: 700, fontFamily: ff, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? .5 : 1, width: "100%", ...s }}>{children}</button>; }
function Inp({ label, value, onChange, type = "text", placeholder, suffix, s }) { return (<div style={{ marginBottom: 12, ...s }}>{label && <label style={{ fontSize: 12, color: X.tm, fontWeight: 600, marginBottom: 4, display: "block", fontFamily: ff }}>{label}</label>}<div style={{ position: "relative" }}><input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ width: "100%", background: "#0C0E16", border: `1px solid ${X.border}`, borderRadius: 10, padding: "12px 14px", paddingRight: suffix ? 50 : 14, color: X.t, fontSize: 16, fontFamily: type === "number" ? fm : ff, outline: "none", boxSizing: "border-box" }} />{suffix && <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: X.td, fontSize: 13, fontWeight: 600 }}>{suffix}</span>}</div></div>); }
function Sel({ label, value, onChange, options }) { return (<div style={{ marginBottom: 12 }}>{label && <label style={{ fontSize: 12, color: X.tm, fontWeight: 600, marginBottom: 4, display: "block", fontFamily: ff }}>{label}</label>}<select value={value} onChange={e => onChange(e.target.value)} style={{ width: "100%", background: "#0C0E16", border: `1px solid ${X.border}`, borderRadius: 10, padding: "12px 14px", color: X.t, fontSize: 15, fontFamily: ff, outline: "none", boxSizing: "border-box" }}>{options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select></div>); }
function Modal({ title, onClose, children }) { return (<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 1000 }} onClick={onClose}><div onClick={e => e.stopPropagation()} style={{ background: X.card, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, maxHeight: "85vh", overflow: "auto", padding: 24 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}><h3 style={{ margin: 0, color: X.t, fontSize: 18, fontFamily: ff }}>{title}</h3><button onClick={onClose} style={{ background: "none", border: "none", color: X.tm, fontSize: 22, cursor: "pointer" }}>✕</button></div>{children}</div></div>); }

/* ═══ INFO POPUP ═══ */
function InfoBtn({ onClick }) {
  return <button onClick={e => { e.stopPropagation(); onClick(); }} style={{ position: "absolute", top: 6, right: 6, width: 18, height: 18, borderRadius: "50%", background: "rgba(255,255,255,0.1)", border: "none", color: X.tm, fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, fontFamily: ff }}>i</button>;
}
function InfoModal({ title, text, onClose }) {
  return <Modal title={`ℹ️ ${title}`} onClose={onClose}><div style={{ color: X.t, fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{text}</div><Btn onClick={onClose} s={{ marginTop: 16 }}>Anladım</Btn></Modal>;
}

function CatButton({ icon, label, total, color, dimColor, expanded, onToggle, children, onInfo }) {
  return (<div style={{ marginBottom: 8 }}><div onClick={onToggle} style={{ display: "flex", alignItems: "center", gap: 12, background: expanded ? dimColor : X.card, border: `1px solid ${expanded ? color : X.border}`, borderRadius: expanded ? "14px 14px 0 0" : 14, padding: "14px 16px", cursor: "pointer", position: "relative" }}><span style={{ fontSize: 28, lineHeight: 1 }}>{icon}</span><div style={{ flex: 1 }}><div style={{ color: X.t, fontWeight: 700, fontSize: 14, fontFamily: ff }}>{label}</div></div><div style={{ textAlign: "right", marginRight: 4 }}><div style={{ color, fontWeight: 800, fontSize: 17, fontFamily: fm }}>{C(total)}</div></div><span style={{ color: X.td, fontSize: 11, transform: expanded ? "rotate(180deg)" : "rotate(0)" }}>▼</span>{onInfo && <InfoBtn onClick={onInfo} />}</div>{expanded && <div style={{ background: X.card, border: `1px solid ${color}`, borderTop: "none", borderRadius: "0 0 14px 14px", padding: "8px 16px 14px" }}>{children}</div>}</div>);
}
function ItemRow({ label, value, sub, color = X.t, onAction, actionLabel }) { return (<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${X.border}` }}><div style={{ flex: 1, minWidth: 0 }}><div style={{ color: X.t, fontSize: 13, fontWeight: 600 }}>{label}</div>{sub && <div style={{ color: X.td, fontSize: 11 }}>{sub}</div>}</div><div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}><span style={{ color, fontWeight: 700, fontFamily: fm, fontSize: 14 }}>{typeof value === "number" ? C(value) : value}</span>{onAction && <button onClick={e => { e.stopPropagation(); onAction(); }} style={{ background: X.gd, border: `1px solid ${X.g}`, borderRadius: 6, padding: "4px 10px", color: X.g, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: ff }}>{actionLabel || "✓"}</button>}</div></div>); }

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

  (md.ccSingle || []).forEach(e => {
    const cat = tryMatch(e, (e.note || "") + " " + (e.merchantName || ""));
    if (cat && result[cat] !== undefined) result[cat] += e.amount;
    else result._uncategorized += e.amount;
  });

  data.installmentPlans.forEach(p => {
    let cur = p.startMonth;
    for (let i = 0; i < p.months; i++) {
      if (cur === mk) {
        const cat = tryMatch(p, (p.note || "") + " " + (p.merchantName || ""));
        if (cat && result[cat] !== undefined) result[cat] += p.monthlyPayment;
        else result._uncategorized += p.monthlyPayment;
        break;
      }
      cur = nmk(cur);
    }
  });

  return result;
}

// Geçmiş 3 ayın kategorize harcama ortalaması
function getCategorizedAvg(data, mk) {
  const past = [pmk(mk), pmk(pmk(mk)), pmk(pmk(pmk(mk)))];
  const totals = past.map(pm => {
    const cats = categorizeMonthSpending(data, pm);
    return Object.entries(cats).filter(([k]) => k !== "_uncategorized").reduce((s, [, v]) => s + v, 0);
  }).filter(t => t > 0);
  return totals.length > 0 ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0;
}

// Bir aydaki kategorize edilmiş toplam (analiz amaçlı, totalSpent'a EKLENMEZ)
function getCategorizedTotal(data, mk) {
  const cats = categorizeMonthSpending(data, mk);
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
  const variableTotal = getCategorizedTotal(data, m); // analiz amaçlı, totalSpent'a EKLENMEZ
  const variableCC = Object.values(md.variableEntries || {}).filter(e => e.method === "cc").reduce((s, e) => s + (e.amount || 0), 0);
  const ccSingleTotal = (md.ccSingle || []).reduce((s, e) => s + e.amount, 0);
  let installmentTotal = data.installmentPlans.reduce((s, p) => { let c = p.startMonth; for (let i = 0; i < p.months; i++) { if (c === m) return s + p.monthlyPayment; c = nmk(c); } return s; }, 0);
  if (extraInst) { let c = extraInst.startMonth; for (let i = 0; i < extraInst.months; i++) { if (c === m) { installmentTotal += extraInst.monthlyPayment; break; } c = nmk(c); } }
  const debtTotal = data.debts.filter(d => d.remainingMonths > 0).reduce((s, d) => {
    if (d.currency === "TRY") return s + d.monthlyPayment;
    if (d.currency === "USD") {
      const rate = data.liveRates?.USD || data.usdRates?.[m] || 0;
      return s + d.monthlyPayment * rate;
    }
    if (d.currency === "EUR") {
      const rate = data.liveRates?.EUR || data.eurRates?.[m] || 0;
      return s + d.monthlyPayment * rate;
    }
    if (d.currency === "XAU") {
      const rate = data.liveRates?.XAU || data.goldRates?.[m] || data.goldRates?.[cmk()] || 0;
      return s + d.monthlyPayment * rate;
    }
    return s;
  }, 0);
  const cardLoaded = md.cardLoaded || 0;

  // Card load limits
  const cardLoadMaxPerTx = Math.floor(baseBudget * CARD_LOAD_PER_TX_PCT);
  const cardLoadMaxTotal = Math.floor(baseBudget * CARD_LOAD_TOTAL_PCT);
  const cardLoadRemaining = Math.max(0, cardLoadMaxTotal - cardLoaded);

  // Total spent and remaining
  const totalSpent = fixedTotal + ccSingleTotal + installmentTotal + debtTotal + cardLoaded;
  const remaining = effectiveBudget - totalSpent;

  // Savings target = remaining - expected CC single - remaining card load capacity
  const expectedCCSingle = getCCSingleAvg(data, m);
  const savingsTarget = Math.max(0, remaining - expectedCCSingle - cardLoadRemaining);

  // CC transfer needed
  const ccTransferNeeded = fixedCC + variableCC + ccSingleTotal + installmentTotal;

  return { effectiveBudget, baseBudget, carryoverDeficit, fixedTotal, variableTotal, ccSingleTotal, installmentTotal, debtTotal, cardLoaded, cardLoadMaxPerTx, cardLoadMaxTotal, cardLoadRemaining, totalSpent, remaining, savingsTarget, expectedCCSingle, ccTransferNeeded };
}
function calcFlat(data, m, extraInst) { const md = data.months[m] || DM(); const b = md.budget || data.settings.monthlyBudget; const ft = data.settings.fixedExpenses.reduce((s, e) => s + e.amount, 0); const cc = (md.ccSingle || []).reduce((s, e) => s + e.amount, 0); let inst = data.installmentPlans.reduce((s, p) => { let c = p.startMonth; for (let i = 0; i < p.months; i++) { if (c === m) return s + p.monthlyPayment; c = nmk(c); } return s; }, 0); if (extraInst) { let c = extraInst.startMonth; for (let i = 0; i < extraInst.months; i++) { if (c === m) { inst += extraInst.monthlyPayment; break; } c = nmk(c); } } const dt = data.debts.filter(d => d.remainingMonths > 0).reduce((s, d) => { if (d.currency === "TRY") return s + d.monthlyPayment; if (d.currency === "USD") return s + d.monthlyPayment * (data.liveRates?.USD || data.usdRates?.[m] || 0); if (d.currency === "EUR") return s + d.monthlyPayment * (data.liveRates?.EUR || data.eurRates?.[m] || 0); if (d.currency === "XAU") return s + d.monthlyPayment * (data.liveRates?.XAU || data.goldRates?.[m] || data.goldRates?.[cmk()] || 0); return s; }, 0); const cl = md.cardLoaded || 0; return { remaining: b - (ft + cc + inst + dt + cl), totalSpent: ft + cc + inst + dt + cl }; }

/* ═══ RISK ═══ */
function calcRisk(data, mk) {
  let score = 0; const c = calcMonth(data, mk, null); const details = [];
  let f1 = 0;
  if (c.effectiveBudget > 0) { const rp = c.remaining / c.effectiveBudget; if (rp < 0) f1 = 35; else if (rp < 0.05) f1 = 30; else if (rp < 0.1) f1 = 22; else if (rp < 0.2) f1 = 14; else if (rp < 0.35) f1 = 7; }
  score += f1;
  details.push({ label: "Bu ay kalan bütçe oranı", score: f1, max: 35, desc: c.effectiveBudget > 0 ? `%${Math.round((c.remaining / c.effectiveBudget) * 100)} kaldı` : "Bütçe yok" });
  let f2 = 0, mudm = 99; let m = nmk(mk);
  for (let i = 0; i < 12; i++) { const fc = calcMonth(data, m, null); if (fc.remaining < 0) { mudm = i + 1; break; } m = nmk(m); }
  if (mudm <= 1) f2 = 35; else if (mudm <= 2) f2 = 28; else if (mudm <= 3) f2 = 22; else if (mudm <= 4) f2 = 16; else if (mudm <= 6) f2 = 10; else if (mudm <= 9) f2 = 5;
  score += f2;
  details.push({ label: "Gelecek projeksiyon", score: f2, max: 35, desc: mudm > 12 ? "12 ay içinde açık yok" : `${mudm} ay sonra açık oluşabilir` });
  let f3 = 0;
  const p3 = [pmk(pmk(mk)), pmk(mk), mk].map(m2 => calcMonth(data, m2, null).totalSpent).filter(t => t > 0);
  let trendPct = 0;
  if (p3.length >= 3) { const avg = (p3[0] + p3[1]) / 2; if (avg > 0) { trendPct = Math.round(((p3[2] - avg) / avg) * 100); if (trendPct > 25) f3 = 15; else if (trendPct > 15) f3 = 10; else if (trendPct > 8) f3 = 5; } }
  score += f3;
  details.push({ label: "Harcama trendi (3 ay)", score: f3, max: 15, desc: trendPct > 0 ? `%${trendPct} artış` : "Stabil veya azalıyor" });
  let f4 = 0, incCount = 0; let um = nmk(mk);
  for (let i = 0; i < 6; i++) { data.settings.fixedExpenses.forEach(exp => { if (exp.increaseDate && exp.increaseDate.startsWith(um)) incCount++; }); um = nmk(um); }
  if (incCount >= 3) f4 = 15; else if (incCount >= 2) f4 = 10; else if (incCount >= 1) f4 = 5;
  score += f4;
  details.push({ label: "Yaklaşan artışlar (6 ay)", score: f4, max: 15, desc: incCount > 0 ? `${incCount} kalem artacak` : "Artış yok" });
  return { score: Math.min(100, score), details, monthsUntilDeficit: mudm, trendPct };
}
function getRiskInfo(score) { if (score >= 70) return { label: "KRİTİK", sub: "Acil müdahale gerekli", color: X.r }; if (score >= 50) return { label: "YÜKSEK", sub: "Gözden geçirin", color: "#FF6B35" }; if (score >= 30) return { label: "ORTA", sub: "Dikkatli olun", color: X.w }; if (score >= 15) return { label: "DÜŞÜK", sub: "Kontrol altında", color: "#84CC16" }; return { label: "GÜVENLİ", sub: "Sağlıklı", color: X.g }; }

function genWarnings(data, mk) {
  const w = []; const up3 = [nmk(mk), nmk(nmk(mk)), nmk(nmk(nmk(mk)))];
  data.settings.fixedExpenses.forEach(exp => { if (exp.increaseDate) { const i = up3.indexOf(exp.increaseDate.slice(0, 7)); if (i >= 0) w.push({ icon: "📈", msg: `"${exp.name}" ${i + 1} ay sonra artış yapacak.`, color: X.o }); } });
  let m = nmk(mk); for (let i = 0; i < 6; i++) { const fc = calcMonth(data, m, null); if (fc.remaining < 0) { w.push({ icon: "🚨", msg: `${i + 1} ay sonra (${ml(m)}) bütçe ${C(Math.abs(fc.remaining))} açık verecek!`, color: X.r }); break; } m = nmk(m); }
  const c = calcMonth(data, mk, null); if (c.remaining < 0) w.push({ icon: "🚨", msg: `Bu ay ${C(Math.abs(c.remaining))} açık!`, color: X.r }); else if (c.remaining < c.effectiveBudget * 0.1) w.push({ icon: "⚠️", msg: "Kalan bütçe %10'un altında.", color: X.w });
  const md = data.months[mk] || DM(); Object.values(md.variableEntries || {}).forEach(entry => { const ve = data.settings.variableExpenses.find(v => v.id === entry.expenseId); if (ve && ve.expectedAmount > 0 && entry.amount > ve.expectedAmount * 1.1) w.push({ icon: "⚠️", msg: `${ve.name}: ${C(entry.amount)} (beklenen ${C(ve.expectedAmount)})`, color: X.w }); });
  if (c.carryoverDeficit > 0) w.push({ icon: "📉", msg: `Geçen aydan ${C(c.carryoverDeficit)} devir.`, color: X.o });
  return w;
}

/* ═══ INFO TEXTS ═══ */
const INFO = {
  ccSingle: { title: "Kredi Kartı Tek Çekim", text: "Kredi kartınızla tek seferde yaptığınız harcamaları buraya kaydedersiniz. Bu tutar anında bütçenizden düşer ve aynı zamanda ay sonunda kredi kartı hesabınıza aktarmanız gereken tutara eklenir.\n\nÖrnek: Marketten 500 ₺'lik bir alışveriş yaptınız, kredi kartıyla tek çekim ödediyseniz buraya 500 ₺ girersiniz." },
  ccInstall: { title: "Kredi Kartı Taksitli", text: "Kredi kartıyla taksitli yaptığınız harcamalarınızın toplam aylık taksit yükünü gösterir. Yeni bir taksitli alışveriş eklediğinizde, ilk taksit gelecek aydan itibaren bütçenize otomatik yansır.\n\nÖrnek: 30.000 ₺ × 6 taksit alırsanız, 6 ay boyunca her ay 5.000 ₺ bütçenizden düşülür." },
  cardLoad: { title: "Genel Harcama Kartı", text: "Eve dair zorunlu olmayan tüm harcamalar için kullandığımız ek banka kartı. Restoran, kıyafet, çocuk harcamaları, ufak tefek alımlar gibi günlük harcamalar buradan yapılır.\n\nKuralı: Tek seferde toplam bütçenin en fazla %10'u, ay toplamında en fazla %15'i bu karta yüklenebilir. Bu kuralın amacı, hesabınızda kredi kartı tek çekim harcamaları için tampon bırakmak.\n\nÖrnek: 450.000 ₺ bütçede tek seferde 45.000 ₺, ay toplamında 67.500 ₺." },
  debt: { title: "Borç Ödemeleri", text: "Aktif borçlarınızın bu ay ödemeniz gereken toplam tutarını gösterir. Türk Lirası, dolar veya altın bazlı borçlarınız olabilir. Dolar ve altın borçları için güncel kur kullanılır.\n\nHer borç ödemesi yaptığınızda 'Ödedim' butonuna basarak teyit edersiniz, kalan taksit sayısı azalır." },
  simulate: { title: "Taksit Simülasyonu", text: "Yeni bir taksitli alım yapmadan önce 'şu kadar X taksitle alırsam bütçem nasıl etkilenir' sorusunu test etmek için kullanılır.\n\nTutar ve taksit sayısını girin, 'Simüle Et' deyin. Uygulama gelecek 6-8 ayın bütçenizin durumunu hem mevcut hem de bu taksitli alımla birlikte gösterir. Güvenliyse 'Onayla ve Kaydet' diyerek doğrudan kredi kartı taksitli kısmına ekleyebilirsiniz." },
  savings: { title: "Birikim", text: "Bugüne kadar bu ay biriktirebildiğiniz para ile bu ayın birikim hedefini gösterir.\n\nBirikim Hedefi şöyle hesaplanır:\nKalan Para − Beklenen Kredi Kartı Tek Çekim (son 3 ay ortalaması) − Henüz Yüklenmemiş Kart Rezervi (toplam %15'in kalan kısmı)\n\nYani sistem size 'eğer beklenen harcamalarını yaparsan ay sonunda bu kadar birikim yapmış olursun' diyor. Hedefe ne kadar yakınsanız o kadar başarılı bir aydır." },
  fixed: { title: "Sabit Zorunlu Giderler", text: "Her ay sabit ve zorunlu olarak ödenen giderler. Kira, aidat, ev yardımcısı, burslar, sabit destek tutarları gibi.\n\nBu giderlerin tutarları belirli ve değişmez. Artış tarihleri tanımlanmışsa uygulama o tarih yaklaştığında uyarı verir. Her birini ödediğinizde 'Ödedim' butonuyla teyit edersiniz." },
  variable: { title: "Değişken Zorunlu Giderler", text: "Her ay ödemek zorunda olduğunuz ama tutarı değişen giderler. Elektrik, su, doğalgaz, internet, telefon, akaryakıt, yemek kartı yüklemesi gibi.\n\nHer kalem için bir 'beklenen tutar' belirlersiniz. Eğer girdiğiniz tutar beklenen tutarın %10'undan fazla aşarsa uygulama uyarı verir — böylece anormal faturaları erken yakalarsınız." },
  risk: { title: "Risk Skoru", text: "0-100 arası bir puan. 0 en güvenli, 100 en kritik durum. Dört faktöre bakarak hesaplanır:\n\n1. Bu ayın kalan bütçesinin yüzdesi (35 puan)\n2. Gelecek projeksiyon — kaç ay sonra açık oluşur (35 puan)\n3. Harcama trendi — son 3 ayda artıyor mu (15 puan)\n4. Yaklaşan sabit gider artışları (15 puan)\n\nSeviyeler: 0-14 GÜVENLİ, 15-29 DÜŞÜK, 30-49 ORTA, 50-69 YÜKSEK, 70-100 KRİTİK. Yeşilden kırmızıya gittikçe harcamalarınızı kısmanız ve önlem almanız gerekir." },
  ccTransfer: { title: "Kredi Kartına Aktarılacak Tutar", text: "Bu ay kredi kartından yapılan tüm ödemelerin (sabit, değişken, tek çekim, taksitler) toplamıdır. Ay sonunda bu tutarı bankada kredi kartı hesabınıza aktarmanız gerekiyor — böylece kredi kartı borcunuz hesabınızdaki kullanılabilir bakiyeyi yanıltmaz." },
};

/* ═══ RISK BAR ═══ */
function RiskBar({ score, onInfo }) {
  const info = getRiskInfo(score);
  return (
    <div style={{ margin: "0 0 12px", padding: "10px 14px", background: X.card, borderRadius: 12, border: `1px solid ${info.color}40`, display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
      <div style={{ color: info.color, fontSize: 22, fontWeight: 900, fontFamily: fm, minWidth: 32 }}>{score}</div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ color: info.color, fontSize: 12, fontWeight: 800 }}>{info.label}</span>
          <span style={{ color: X.td, fontSize: 10, marginRight: 18 }}>{info.sub}</span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: "linear-gradient(to right, #22C55E 0%, #84CC16 20%, #F59E0B 40%, #FF6B35 60%, #EF4444 80%, #DC2626 100%)", position: "relative", overflow: "visible" }}>
          <div style={{ position: "absolute", top: 0, right: 0, height: "100%", width: `${100 - score}%`, background: "rgba(12,14,22,0.75)", borderRadius: "0 3px 3px 0" }} />
          <div style={{ position: "absolute", top: -3, left: `${score}%`, transform: "translateX(-50%)", width: 12, height: 12, borderRadius: "50%", background: info.color, border: "2px solid #0C0E16" }} />
        </div>
      </div>
      <InfoBtn onClick={onInfo} />
    </div>
  );
}

/* ═══ TABS ═══ */
const TABS = [{ id: "home", label: "Özet", icon: "◉" }, { id: "report", label: "Analiz", icon: "▤" }, { id: "settings", label: "Ayar", icon: "⚙" }];
function TabBar({ tab, setTab }) { return (<div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: X.card, borderTop: `1px solid ${X.border}`, display: "flex", justifyContent: "space-around", padding: "6px 0 env(safe-area-inset-bottom, 8px)", zIndex: 100 }}>{TABS.map(t => (<button key={t.id} onClick={() => setTab(t.id)} style={{ background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "6px 20px", cursor: "pointer", color: tab === t.id ? X.g : X.td, fontFamily: ff }}><span style={{ fontSize: 20, lineHeight: 1 }}>{t.icon}</span><span style={{ fontSize: 10, fontWeight: 600 }}>{t.label}</span></button>))}</div>); }

/* ═══ MODALS ═══ */
function CCSingleModal({ cards, variableExpenses, onClose, onSave }) {
  const [a, sa] = useState(""); const [n, sn] = useState(""); const [mn, smn] = useState(""); const [d, sd] = useState(td());
  const [cardId, setCardId] = useState(cards[0]?.id || "");
  const [categoryId, setCategoryId] = useState("");
  const [userChanged, setUserChanged] = useState(false);

  // Otomatik eşleşme: kullanıcı manuel değiştirmediyse, n veya mn değiştiğinde kategori bulunur
  useEffect(() => {
    if (userChanged) return;
    const matched = matchCategory(n + " " + mn, variableExpenses || []);
    if (matched) setCategoryId(matched);
  }, [n, mn, userChanged, variableExpenses]);

  const handleCategoryChange = v => { setCategoryId(v); setUserChanged(true); };

  return (
    <Modal title="💳 Kredi Kartı Tek Çekim" onClose={onClose}>
      {cards.length === 0 ? (
        <div style={{ color: X.w, fontSize: 13, marginBottom: 12, padding: 10, background: X.wd, borderRadius: 8 }}>⚠️ Önce Ayarlar → Kartlarım'dan en az bir kart eklemelisiniz.</div>
      ) : (
        <Sel label="Hangi Kart" value={cardId} onChange={setCardId} options={cards.map(c => ({ v: c.id, l: c.name }))} />
      )}
      <Inp label="Tutar" type="number" value={a} onChange={sa} suffix="₺" />
      <Inp label="Harcama Adı" value={n} onChange={sn} placeholder="Örn: Shell Çumra" />
      <Inp label="Ekstrede Görünen İsim" value={mn} onChange={smn} placeholder="Opsiyonel" />
      {(variableExpenses || []).length > 0 && (
        <Sel label="Kategori" value={categoryId} onChange={handleCategoryChange} options={[{ v: "", l: "— Otomatik / Kategorisiz —" }, ...(variableExpenses || []).map(ve => ({ v: ve.id, l: (ve.icon || "📋") + " " + ve.name }))]} />
      )}
      {categoryId && !userChanged && <div style={{ color: X.g, fontSize: 11, marginTop: -8, marginBottom: 12 }}>✓ Anahtar kelime eşleşmesi bulundu</div>}
      <Inp label="Tarih" type="date" value={d} onChange={sd} />
      <Btn onClick={() => { if (!a || !cardId) return; onSave({ id: uid(), amount: parseFloat(a), note: n, merchantName: mn, date: d, cardId, categoryId: categoryId || null }); onClose(); }} disabled={!cardId}>💳 Kaydet</Btn>
    </Modal>
  );
}

function CardLoadModal({ currentLoaded, maxPerTx, maxTotal, onClose, onSave }) {
  const [a, sa] = useState("");
  const amt = parseFloat(a) || 0;
  const remaining = Math.max(0, maxTotal - currentLoaded);
  const wouldExceedTx = amt > maxPerTx;
  const wouldExceedTotal = (currentLoaded + amt) > maxTotal;
  const canSave = amt > 0 && !wouldExceedTx && !wouldExceedTotal;

  return (
    <Modal title="🛒 Kart Yükleme" onClose={onClose}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <div><div style={{ color: X.tm, fontSize: 11 }}>Yüklenen</div><div style={{ color: X.t, fontSize: 22, fontWeight: 800, fontFamily: fm }}>{C(currentLoaded)}</div></div>
        <div style={{ textAlign: "right" }}><div style={{ color: X.tm, fontSize: 11 }}>Ay Maks (%15)</div><div style={{ color: X.td, fontSize: 22, fontWeight: 800, fontFamily: fm }}>{C(maxTotal)}</div></div>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: X.border, marginBottom: 8 }}><div style={{ height: "100%", borderRadius: 2, background: X.g, width: `${maxTotal > 0 ? Math.min((currentLoaded / maxTotal) * 100, 100) : 0}%` }} /></div>
      <div style={{ color: X.tm, fontSize: 11, marginBottom: 12 }}>Tek seferde maks: {C(maxPerTx)} • Bu ay yüklenebilir: {C(remaining)}</div>
      <Inp label="Tutar" type="number" value={a} onChange={sa} suffix="₺" />
      {wouldExceedTx && <div style={{ color: X.r, fontSize: 12, marginBottom: 8 }}>⚠️ Tek seferde maksimum {C(maxPerTx)} yükleyebilirsiniz</div>}
      {!wouldExceedTx && wouldExceedTotal && <div style={{ color: X.r, fontSize: 12, marginBottom: 8 }}>⚠️ Bu ay toplam {C(maxTotal)} sınırını aşıyor</div>}
      <Btn onClick={() => { if (!canSave) return; onSave(amt); onClose(); }} disabled={!canSave}>🛒 Yükle</Btn>
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

function DebtPayModal({ debts, debtPayments, data, mk, onClose, onPay }) {
  const active = debts.filter(d => d.remainingMonths > 0);
  return (
    <Modal title="📌 Borç Ödemesi" onClose={onClose}>
      {active.length === 0 && <p style={{ color: X.tm }}>Aktif borç yok.</p>}
      {active.map(debt => {
        const paid = debtPayments?.[debt.id];
        const sym = debtCurSymbol(debt.currency);
        const tlVal = debtTLValue(debt, data, mk);
        return (
          <Card key={debt.id} s={{ marginBottom: 8, opacity: paid ? .5 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: X.t, fontWeight: 700 }}>{debt.name}</div>
                <div style={{ color: X.tm, fontSize: 12 }}>
                  <span style={{ fontFamily: fm }}>{debt.monthlyPayment} {sym}</span>
                  {debt.currency !== "TRY" && <span style={{ color: X.td }}> ({C(tlVal)})</span>}
                  <span> /ay • {debt.remainingMonths} ay</span>
                </div>
              </div>
              {paid ? <span style={{ color: X.g, fontWeight: 700 }}>✓</span> : <Btn onClick={() => onPay(debt.id)} s={{ width: "auto", padding: "8px 16px", fontSize: 13 }}>Ödedim</Btn>}
            </div>
          </Card>
        );
      })}
    </Modal>
  );
}
function EmergencyFundSettings({ data, setData, onBack }) {
  const fixedTotal = data.settings.fixedExpenses.reduce((s, e) => s + e.amount, 0);
  const suggested3x = fixedTotal * 3;
  const suggested6x = fixedTotal * 6;
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
        <Card s={{ marginBottom: 12, background: "#0D2818", border: "1px solid #1A5C2E" }}>
          <div style={{ color: X.g, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>HEDEFE İLERLEMEN</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <span style={{ color: X.t, fontSize: 22, fontWeight: 800, fontFamily: fm }}>{C(currentTotal)}</span>
            <span style={{ color: X.tm, fontSize: 13, fontFamily: fm }}>/ {C(target)}</span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.08)", overflow: "hidden", marginBottom: 6 }}>
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
        <textarea value={importData} onChange={e => setImportData(e.target.value)} placeholder="JSON içeriğini buraya yapıştırın..." style={{ width: "100%", background: "#0C0E16", border: `1px solid ${X.border}`, borderRadius: 10, padding: "12px 14px", color: X.t, fontSize: 12, fontFamily: fm, outline: "none", boxSizing: "border-box", minHeight: 100, resize: "vertical", marginBottom: 8 }} />
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
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", backdropFilter: "blur(12px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9998, padding: 16 }}>
      <div style={{ background: X.card, borderRadius: 20, width: "100%", maxWidth: 440, maxHeight: "90vh", overflow: "auto", padding: 24, border: `2px solid ${X.w}` }}>
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

        <Card s={{ marginBottom: 12, background: X.bg }}>
          <div style={{ color: X.tm, fontSize: 11, fontWeight: 700, marginBottom: 4 }}>DURUM</div>
          <div style={{ color: X.t, fontSize: 13 }}>{lastBackupText}</div>
          <div style={{ color: X.td, fontSize: 11, marginTop: 2 }}>Bu haftanın başlangıcı: {weekStart}</div>
        </Card>

        <Card s={{ marginBottom: 12 }}>
          <div style={{ color: X.tm, fontSize: 12, fontWeight: 700, marginBottom: 10 }}>1. DOSYA OLARAK İNDİR (ZORUNLU)</div>
          <p style={{ color: X.td, fontSize: 11, marginBottom: 10 }}>Yedek dosyası telefonunuza indirilecek. Dosya adı: <span style={{ fontFamily: fm, color: X.tm }}>ev-butcesi-{new Date().toISOString().slice(0, 10).replace(/-/g, ".")}.json</span></p>
          <Btn onClick={doDownload} c={downloaded ? X.g : X.w}>
            {downloaded ? "✓ İndirildi" : "📥 İndir"}
          </Btn>
        </Card>

        <Card s={{ marginBottom: 12 }}>
          <div style={{ color: X.tm, fontSize: 12, fontWeight: 700, marginBottom: 10 }}>2. KENDİNE MAIL AT (ÖNERİLEN)</div>
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

function CCInstallModal({ data, mk, cards, variableExpenses, onClose, onSave, startInSim }) {
  const [a, sa] = useState(""); const [mo, smo] = useState("3"); const [n, sn] = useState(""); const [mn, smn] = useState("");
  const [cardId, setCardId] = useState(cards[0]?.id || "");
  const [categoryId, setCategoryId] = useState("");
  const [userChanged, setUserChanged] = useState(false);
  const [sim, setSim] = useState(null);
  const t = parseFloat(a) || 0; const m2 = parseInt(mo) || 1; const mp = Math.ceil(t / m2);

  useEffect(() => {
    if (userChanged) return;
    const matched = matchCategory(n + " " + mn, variableExpenses || []);
    if (matched) setCategoryId(matched);
  }, [n, mn, userChanged, variableExpenses]);

  const handleCategoryChange = v => { setCategoryId(v); setUserChanged(true); };

  const doSim = () => {
    if (!t || !m2) return;
    const plan = { startMonth: nmk(mk), months: m2, monthlyPayment: mp, totalAmount: t };
    const without = [], withS = []; let m3 = nmk(mk);
    for (let i = 0; i < Math.min(m2 + 2, 8); i++) { without.push({ mk: m3, ...calcMonth(data, m3, null) }); withS.push({ mk: m3, ...calcMonth(data, m3, plan) }); m3 = nmk(m3); }
    let deficit = null; withS.forEach(ws => { if (ws.remaining < 0 && !deficit) deficit = ws.mk; });
    setSim({ plan, without, withS, deficit });
  };

  const save = () => { if (!t || !cardId) return; onSave({ id: uid(), totalAmount: t, monthlyPayment: mp, months: m2, rate: 0, startMonth: nmk(mk), remainingMonths: m2, note: n, merchantName: mn, cardId, categoryId: categoryId || null, createdDate: td() }); onClose(); };

  return (
    <Modal title={startInSim ? "🔮 Taksit Simülasyonu" : "📅 Kredi Kartı Taksitli"} onClose={onClose}>
      {cards.length === 0 ? (
        <div style={{ color: X.w, fontSize: 13, marginBottom: 12, padding: 10, background: X.wd, borderRadius: 8 }}>⚠️ Önce Ayarlar → Kartlarım'dan en az bir kart eklemelisiniz.</div>
      ) : (
        <Sel label="Hangi Kart" value={cardId} onChange={setCardId} options={cards.map(c => ({ v: c.id, l: c.name }))} />
      )}
      <Inp label="Toplam Tutar" type="number" value={a} onChange={v2 => { sa(v2); setSim(null); }} suffix="₺" placeholder="0" />
      <Inp label="Taksit Sayısı" type="number" value={mo} onChange={v2 => { smo(v2); setSim(null); }} />
      {t > 0 && m2 > 0 && <div style={{ color: X.tm, fontSize: 13, marginBottom: 12 }}>Aylık taksit: <span style={{ color: X.p, fontWeight: 800, fontFamily: fm, fontSize: 16 }}>{C(mp)}</span> × {m2} ay</div>}
      <Inp label="Harcama Adı" value={n} onChange={sn} placeholder="Örn: Salon Mobilyası" />
      <Inp label="Ekstrede Görünen İsim" value={mn} onChange={smn} placeholder="Opsiyonel" />
      {(variableExpenses || []).length > 0 && (
        <Sel label="Kategori" value={categoryId} onChange={handleCategoryChange} options={[{ v: "", l: "— Otomatik / Kategorisiz —" }, ...(variableExpenses || []).map(ve => ({ v: ve.id, l: (ve.icon || "📋") + " " + ve.name }))]} />
      )}
      {categoryId && !userChanged && <div style={{ color: X.g, fontSize: 11, marginTop: -8, marginBottom: 12 }}>✓ Anahtar kelime eşleşmesi bulundu</div>}
      {!sim && (
        <div style={{ display: "flex", gap: 8 }}>
          {!startInSim && <Btn onClick={save} c={X.p} s={{ flex: 1 }} disabled={!cardId}>📅 Direkt Kaydet</Btn>}
          <Btn onClick={doSim} v={startInSim ? "filled" : "outline"} c={X.p} s={{ flex: 1 }}>🔮 Simüle Et</Btn>
        </div>
      )}
      {sim && (
        <>
          <Card s={{ marginBottom: 10, background: X.bg, border: `1px solid ${X.border}` }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 4, fontSize: 11, marginBottom: 4 }}>
              <span style={{ color: X.td }}>Ay</span><span style={{ color: X.td, textAlign: "right" }}>Şimdi</span><span style={{ color: X.p, textAlign: "right" }}>Taksitle</span>
            </div>
            {sim.withS.map((ws, i) => { const wo = sim.without[i]; return (
              <div key={ws.mk} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 4, padding: "5px 0", borderBottom: `1px solid ${X.border}`, fontSize: 12 }}>
                <span style={{ color: X.t }}>{ml(ws.mk).split(" ")[0]}</span>
                <span style={{ color: wo.remaining >= 0 ? X.g : X.r, textAlign: "right", fontFamily: fm, fontWeight: 700 }}>{C(wo.remaining)}</span>
                <span style={{ color: ws.remaining >= 0 ? X.g : X.r, textAlign: "right", fontFamily: fm, fontWeight: 700 }}>{C(ws.remaining)}</span>
              </div>); })}
          </Card>
          {sim.deficit
            ? <div style={{ color: X.r, fontSize: 13, fontWeight: 700, marginBottom: 10 }}>🚨 {ml(sim.deficit)} ayında açık oluşur!</div>
            : <div style={{ color: X.g, fontSize: 13, fontWeight: 700, marginBottom: 10 }}>✅ Bütçeyi sarsmaz.</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={save} c={X.g} s={{ flex: 1 }} disabled={!cardId}>✓ Onayla ve Kaydet</Btn>
            <Btn onClick={() => setSim(null)} v="outline" c={X.td} s={{ flex: 1 }}>Geri</Btn>
          </div>
        </>
      )}
    </Modal>
  );
}

function CCTransferModal({ data, mk, onClose }) {
  const md = data.months[mk] || DM();
  const cards = data.settings.cards || [];

  // Calculate per-card breakdown
  const breakdown = {};
  cards.forEach(c => { breakdown[c.id] = { name: c.name, fixed: 0, variable: 0, single: 0, installment: 0, total: 0 }; });

  // Fixed expenses paid by CC
  data.settings.fixedExpenses.filter(e => e.paymentMethod === "cc").forEach(e => {
    const cid = e.cardId || cards[0]?.id;
    if (cid && breakdown[cid]) { breakdown[cid].fixed += e.amount; breakdown[cid].total += e.amount; }
  });
  // Variable CC entries
  Object.values(md.variableEntries || {}).filter(e => e.method === "cc").forEach(e => {
    const cid = e.cardId || cards[0]?.id;
    if (cid && breakdown[cid]) { breakdown[cid].variable += e.amount; breakdown[cid].total += e.amount; }
  });
  // CC singles
  (md.ccSingle || []).forEach(e => {
    const cid = e.cardId || cards[0]?.id;
    if (cid && breakdown[cid]) { breakdown[cid].single += e.amount; breakdown[cid].total += e.amount; }
  });
  // Installments active this month
  data.installmentPlans.forEach(p => {
    let cur = p.startMonth;
    for (let i = 0; i < p.months; i++) {
      if (cur === mk) {
        const cid = p.cardId || cards[0]?.id;
        if (cid && breakdown[cid]) { breakdown[cid].installment += p.monthlyPayment; breakdown[cid].total += p.monthlyPayment; }
        break;
      }
      cur = nmk(cur);
    }
  });

  const grandTotal = Object.values(breakdown).reduce((s, b) => s + b.total, 0);

  return (
    <Modal title="💳 Kredi Kartlarına Aktar" onClose={onClose}>
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <div style={{ color: X.tm, fontSize: 12 }}>Toplam Aktarılacak</div>
        <div style={{ color: X.b, fontSize: 32, fontWeight: 800, fontFamily: fm }}>{C(grandTotal)}</div>
      </div>
      {Object.values(breakdown).filter(b => b.total > 0).map((b, i) => (
        <Card key={i} s={{ marginBottom: 8, border: `1px solid ${X.b}40` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ color: X.t, fontWeight: 800, fontSize: 15 }}>{b.name}</div>
            <div style={{ color: X.b, fontWeight: 800, fontSize: 18, fontFamily: fm }}>{C(b.total)}</div>
          </div>
          {b.fixed > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: X.tm, padding: "3px 0" }}><span>Sabit zorunlu</span><span style={{ fontFamily: fm }}>{C(b.fixed)}</span></div>}
          {b.variable > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: X.tm, padding: "3px 0" }}><span>Değişken zorunlu</span><span style={{ fontFamily: fm }}>{C(b.variable)}</span></div>}
          {b.single > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: X.tm, padding: "3px 0" }}><span>Tek çekim</span><span style={{ fontFamily: fm }}>{C(b.single)}</span></div>}
          {b.installment > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: X.tm, padding: "3px 0" }}><span>Taksitler</span><span style={{ fontFamily: fm }}>{C(b.installment)}</span></div>}
        </Card>
      ))}
      {Object.values(breakdown).filter(b => b.total > 0).length === 0 && <div style={{ color: X.td, textAlign: "center", padding: 20 }}>Bu ay aktarılacak tutar yok</div>}
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
        <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Örn: Okul taksidi için, acil sağlık harcaması için..." style={{ width: "100%", background: "#0C0E16", border: `1px solid ${reason ? X.border : X.r}`, borderRadius: 10, padding: "12px 14px", color: X.t, fontSize: 14, fontFamily: ff, outline: "none", boxSizing: "border-box", minHeight: 60, resize: "vertical" }} />
      </div>
      <Btn onClick={save} disabled={!canSave} c={X.r}>{info.icon} Sat / Boz</Btn>
    </Modal>
  );
}

/* ═══ DASHBOARD ═══ */
function Dashboard({ data, mk, gmd, setMonthField, setData }) {
  const [expanded, setExpanded] = useState(null);
  const [modal, setModal] = useState(null);
  const [info, setInfo] = useState(null);
  const [msg, setMsg] = useState(null);

  const md = gmd(mk); const c = calcMonth(data, mk, null);
  const risk = useMemo(() => calcRisk(data, mk), [data, mk]);
  const pct = c.effectiveBudget > 0 ? (c.totalSpent / c.effectiveBudget) * 100 : 0;
  const toggle = id => setExpanded(expanded === id ? null : id);
  const flash = m2 => { setMsg(m2); setTimeout(() => setMsg(null), 2500); };
  const warnings = useMemo(() => genWarnings(data, mk), [data, mk]);

  const handleFixedPay = expId => { setMonthField(mk, "fixedPaid", { ...md.fixedPaid, [expId]: { paid: true, date: td() } }); };
  const handleCCSingle = entry => { setMonthField(mk, "ccSingle", [...md.ccSingle, entry]); flash("✓"); };
  const handleCardLoad = amt => { setMonthField(mk, "cardLoaded", (md.cardLoaded || 0) + amt); flash("✓"); };
  const handleDebtPay = debtId => { setMonthField(mk, "debtPayments", { ...md.debtPayments, [debtId]: { paid: true, date: td() } }); setData(d => ({ ...d, debts: d.debts.map(db => db.id === debtId ? { ...db, remainingMonths: Math.max(0, db.remainingMonths - 1) } : db) })); flash("✓"); };
  const handleInstSave = plan => { setData(d => ({ ...d, installmentPlans: [...d.installmentPlans, plan] })); flash("✓ Taksit kaydedildi"); };

  // Savings progress
  const savingsProgress = c.savingsTarget > 0 ? Math.min((c.remaining / c.savingsTarget) * 100, 100) : 0;

  return (
    <div style={{ padding: "12px 16px 100px" }}>
      {msg && <div style={{ background: X.gd, border: `1px solid ${X.g}`, borderRadius: 10, padding: 10, marginBottom: 10, color: X.g, fontSize: 14, fontWeight: 600, textAlign: "center" }}>{msg}</div>}

      <div style={{ margin: "8px 0 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: X.tm, marginBottom: 4 }}><span>{C(c.totalSpent)} harcandı</span><span>%{Math.min(Math.round(pct), 999)}</span></div>
        <div style={{ height: 6, borderRadius: 3, background: X.border, overflow: "hidden" }}><div style={{ height: "100%", borderRadius: 3, background: pct > 100 ? X.r : pct > 80 ? X.w : X.g, width: `${Math.min(pct, 100)}%`, transition: "width 0.5s" }} /></div>
      </div>

      <RiskBar score={risk.score} onInfo={() => setInfo("risk")} />

      {warnings.map((w, i) => (<Card key={i} s={{ marginBottom: 6, border: `1px solid ${w.color}`, background: w.color === X.r ? X.rd : w.color === X.o ? X.od : X.wd, padding: "10px 14px" }}><div style={{ color: w.color, fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>{w.icon} {w.msg}</div></Card>))}

      {/* QUICK ACTIONS */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, margin: "12px 0" }}>
        <div onClick={() => setModal("ccSingle")} style={{ background: X.bd, border: `1px solid ${X.b}`, borderRadius: 12, padding: "14px 12px", cursor: "pointer", textAlign: "center", position: "relative" }}>
          <InfoBtn onClick={() => setInfo("ccSingle")} />
          <div style={{ fontSize: 24, marginBottom: 4 }}>💳</div>
          <div style={{ color: X.b, fontSize: 12, fontWeight: 700 }}>Kredi Kartı Tek Çekim</div>
          <div style={{ color: X.t, fontSize: 16, fontWeight: 800, fontFamily: fm, marginTop: 2 }}>{C(c.ccSingleTotal)}</div>
        </div>
        <div onClick={() => setModal("ccInstall")} style={{ background: X.pd, border: `1px solid ${X.p}`, borderRadius: 12, padding: "14px 12px", cursor: "pointer", textAlign: "center", position: "relative" }}>
          <InfoBtn onClick={() => setInfo("ccInstall")} />
          <div style={{ fontSize: 24, marginBottom: 4 }}>📅</div>
          <div style={{ color: X.p, fontSize: 12, fontWeight: 700 }}>Kredi Kartı Taksitli</div>
          <div style={{ color: X.t, fontSize: 16, fontWeight: 800, fontFamily: fm, marginTop: 2 }}>{C(c.installmentTotal)}</div>
        </div>
        <div onClick={() => setModal("cardLoad")} style={{ background: X.gd, border: `1px solid ${X.g}`, borderRadius: 12, padding: "14px 12px", cursor: "pointer", textAlign: "center", position: "relative" }}>
          <InfoBtn onClick={() => setInfo("cardLoad")} />
          <div style={{ fontSize: 24, marginBottom: 4 }}>🛒</div>
          <div style={{ color: X.g, fontSize: 12, fontWeight: 700 }}>Genel Harcama Kartı</div>
          <div style={{ color: X.t, fontSize: 14, fontWeight: 800, fontFamily: fm, marginTop: 2 }}>{C(md.cardLoaded || 0)} <span style={{ color: X.td, fontSize: 10 }}>/ {C(c.cardLoadMaxTotal)}</span></div>
        </div>
        <div onClick={() => setModal("debtPay")} style={{ background: X.wd, border: `1px solid ${X.w}`, borderRadius: 12, padding: "14px 12px", cursor: "pointer", textAlign: "center", position: "relative" }}>
          <InfoBtn onClick={() => setInfo("debt")} />
          <div style={{ fontSize: 24, marginBottom: 4 }}>📌</div>
          <div style={{ color: X.w, fontSize: 12, fontWeight: 700 }}>Borç Ödemeleri</div>
          <div style={{ color: X.t, fontSize: 16, fontWeight: 800, fontFamily: fm, marginTop: 2 }}>{C(c.debtTotal)}</div>
        </div>

        {/* Simulation full width */}
        <div onClick={() => setModal("simulate")} style={{ gridColumn: "1 / -1", background: X.pd, border: `1px solid ${X.p}`, borderRadius: 12, padding: "14px 16px", cursor: "pointer", position: "relative", minHeight: 92, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <InfoBtn onClick={() => setInfo("simulate")} />
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: 24 }}>🔮</span>
            <div style={{ color: X.p, fontSize: 13, fontWeight: 700 }}>Taksit Simülasyonu</div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <span style={{ color: X.t, fontSize: 14, fontWeight: 600 }}>Alım öncesi bütçeye etkisini test et</span>
            <span style={{ color: X.p, fontSize: 18 }}>›</span>
          </div>
          <div style={{ color: X.tm, fontSize: 11 }}>
            {c.installmentTotal > 0 ? `Mevcut aylık taksit yükü: ${C(c.installmentTotal)}` : "Aktif taksit yok"}
          </div>
        </div>

        {/* Savings full width */}
        <div style={{ gridColumn: "1 / -1", background: "#0D2818", border: "1px solid #1A5C2E", borderRadius: 12, padding: "14px 16px", position: "relative", minHeight: 92, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <InfoBtn onClick={() => setInfo("savings")} />
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: 24 }}>💰</span>
            <div style={{ color: X.g, fontSize: 13, fontWeight: 700 }}>Bu Ayın Birikimi</div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <span style={{ color: c.remaining >= 0 ? X.g : X.r, fontSize: 22, fontWeight: 800, fontFamily: fm }}>{C(Math.max(0, c.remaining))}</span>
            <span style={{ color: X.tm, fontSize: 13, fontFamily: fm }}>/ {C(c.savingsTarget)} hedef</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 3, background: X.g, width: `${savingsProgress}%`, transition: "width 0.5s" }} />
          </div>
        </div>
      </div>

      {/* CC TRANSFER */}
      {c.ccTransferNeeded > 0 && (
        <Card onClick={() => setModal("ccTransfer")} s={{ marginBottom: 8, border: `1px solid ${X.b}`, background: X.bd, position: "relative", cursor: "pointer" }}>
          <InfoBtn onClick={() => setInfo("ccTransfer")} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ color: X.b, fontSize: 13, fontWeight: 700 }}>💳 CC Hesabına Aktar <span style={{ color: X.td, fontSize: 11, fontWeight: 500 }}>(detay için tıkla)</span></div>
            <span style={{ color: X.b, fontSize: 20, fontWeight: 800, fontFamily: fm, marginRight: 18 }}>{C(c.ccTransferNeeded)}</span>
          </div>
        </Card>
      )}

      {/* CATEGORIES */}
      <CatButton icon="🔒" label="Sabit Zorunlu Giderler" total={c.fixedTotal} color={X.w} dimColor={X.wd} expanded={expanded === "fixed"} onToggle={() => toggle("fixed")} onInfo={() => setInfo("fixed")}>
        {data.settings.fixedExpenses.length === 0 && <div style={{ color: X.td, fontSize: 12, padding: 8 }}>Ayarlar'dan ekleyin</div>}
        {data.settings.fixedExpenses.map(exp => { const paid = md.fixedPaid?.[exp.id]; return <ItemRow key={exp.id} label={exp.name} sub={`${exp.paymentMethod === "cc" ? "💳" : "🏦"}${exp.increaseDate ? " • Artış: " + exp.increaseDate : ""}`} value={exp.amount} color={paid ? X.g : X.t} onAction={!paid ? () => handleFixedPay(exp.id) : null} actionLabel="Ödedim" />; })}
      </CatButton>

      {modal === "ccSingle" && <CCSingleModal cards={data.settings.cards || []} variableExpenses={data.settings.variableExpenses || []} onClose={() => setModal(null)} onSave={handleCCSingle} />}
      {modal === "ccInstall" && <CCInstallModal data={data} mk={mk} cards={data.settings.cards || []} variableExpenses={data.settings.variableExpenses || []} onClose={() => setModal(null)} onSave={handleInstSave} />}
      {modal === "simulate" && <CCInstallModal data={data} mk={mk} cards={data.settings.cards || []} variableExpenses={data.settings.variableExpenses || []} onClose={() => setModal(null)} onSave={handleInstSave} startInSim={true} />}
      {modal === "ccTransfer" && <CCTransferModal data={data} mk={mk} onClose={() => setModal(null)} />}
      {modal === "cardLoad" && <CardLoadModal currentLoaded={md.cardLoaded || 0} maxPerTx={c.cardLoadMaxPerTx} maxTotal={c.cardLoadMaxTotal} onClose={() => setModal(null)} onSave={handleCardLoad} />}
      {modal === "debtPay" && <DebtPayModal debts={data.debts} debtPayments={md.debtPayments} data={data} mk={mk} onClose={() => setModal(null)} onPay={handleDebtPay} />}
      {modal === "budget" && <BudgetModal mk={mk} cur={md.budget || data.settings.monthlyBudget} def={data.settings.monthlyBudget} onSave={v => setMonthField(mk, "budget", v)} onClose={() => setModal(null)} />}
      {info && INFO[info] && <InfoModal title={INFO[info].title} text={INFO[info].text} onClose={() => setInfo(null)} />}
    </div>
  );
}

/* ═══ ANALYSIS ═══ */
function AnalysisScreen({ data, setData, mk: initialMk }) {
  const [view, setView] = useState("risk");
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
        // Her satırı transaction olarak sakla
        const transactions = r.data.map(row => {
          const desc = (row["Açıklama"] || row["Description"] || row["İşlem Açıklaması"] || Object.values(row)[1] || "").toString();
          const raw = row["Tutar"] || row["Amount"] || row["İşlem Tutarı"] || Object.values(row)[2] || "0";
          const date = (row["Tarih"] || row["Date"] || row["İşlem Tarihi"] || Object.values(row)[0] || "").toString();
          const amt = Math.abs(parseFloat(raw.toString().replace(/[^\d,.-]/g, "").replace(",", ".")) || 0);
          // 1. merchantMap öğrenilmiş eşleşmeyi ara
          let categoryId = null;
          const descLower = desc.toLowerCase();
          for (const [merchantKey, catId] of Object.entries(data.merchantMap || {})) {
            if (descLower.includes(merchantKey.toLowerCase())) { categoryId = catId; break; }
          }
          // 2. Anahtar kelime eşleşmesini dene
          if (!categoryId) {
            categoryId = matchCategory(desc, ves);
          }
          return { id: uid(), desc, amount: amt, date, categoryId };
        }).filter(t => t.amount > 0);

        setData(d => {
          const ms = { ...d.months };
          const md = { ...(ms[mk] || DM()) };
          const csvByCard = { ...(md.csvByCard || {}) };
          csvByCard[csvCardId] = { transactions, uploadedAt: td() };
          md.csvByCard = csvByCard;
          ms[mk] = md;
          return { ...d, months: ms };
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
  const debtEnds = data.debts.filter(d => d.remainingMonths > 0).map(d => { let m = mk; for (let i = 0; i < d.remainingMonths; i++) m = nmk(m); return { name: d.name, endMonth: m, monthly: d.monthlyPayment }; });

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
      tips.push({
        title: "🎯 Borç Bitiş Müjdesi",
        text: `"${nearest.name}" borcunuz ${monthsAway} ay sonra (${ml(nearest.endMonth)}) bitecek. O tarihten itibaren her ay ${C(nearest.monthly)} bütçenizde rahatlama olacak. Bu rahatlamayı planlayın — birikim havuzuna ekleyebilir, yeni bir hedefe yönlendirebilir ya da başka bir borcu erken kapatmak için kullanabilirsiniz.`,
        color: X.g
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

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
        {[
          { id: "risk", l: "Risk", i: "⚠️" },
          { id: "variable", l: "Kategoriler", i: "🔄" },
          { id: "debts", l: "Borçlar", i: "📌" },
          { id: "savings", l: "Birikim", i: "💰" },
          { id: "csv", l: "Ekstre Dökümleri", i: "🧾" },
          { id: "forecast", l: "Projeksiyon", i: "🔮" }
        ].map(t => (
          <button key={t.id} onClick={() => setView(t.id)} style={{ background: view === t.id ? X.gd : X.bg, border: `1px solid ${view === t.id ? X.g : X.border}`, borderRadius: 10, padding: "12px 6px", color: view === t.id ? X.g : X.tm, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: ff, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, lineHeight: 1.2 }}>
            <span style={{ fontSize: 20 }}>{t.i}</span>
            <span style={{ textAlign: "center" }}>{t.l}</span>
          </button>
        ))}
        <button onClick={() => setView("calendar")} style={{ gridColumn: "1 / -1", background: view === "calendar" ? X.gd : X.bg, border: `1px solid ${view === "calendar" ? X.g : X.border}`, borderRadius: 10, padding: "10px", color: view === "calendar" ? X.g : X.tm, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: ff, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>📅</span>
          <span>Takvim</span>
        </button>
      </div>

      {view === "risk" && (
        <>
          <Card s={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ color: X.tm, fontSize: 13, fontWeight: 700 }}>RİSK SKORU DETAYI</div>
              <div style={{ color: getRiskInfo(risk.score).color, fontSize: 24, fontWeight: 900, fontFamily: fm }}>{risk.score}<span style={{ fontSize: 12, color: X.td }}>/100</span></div>
            </div>
            {risk.details.map((d, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ color: X.t, fontSize: 13 }}>{d.label}</span>
                  <span style={{ color: X.tm, fontSize: 12, fontFamily: fm }}>{d.score}/{d.max}</span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: X.border }}>
                  <div style={{ height: "100%", borderRadius: 2, background: d.score > d.max * 0.6 ? X.r : d.score > d.max * 0.3 ? X.w : X.g, width: `${(d.score / d.max) * 100}%` }} />
                </div>
                <div style={{ color: X.td, fontSize: 11, marginTop: 2 }}>{d.desc}</div>
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
            <Card s={{ marginBottom: 12, background: "#0D2818", border: "1px solid #1A5C2E" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div><div style={{ color: X.g, fontSize: 14, fontWeight: 800 }}>💰 Birikim Havuzu</div><div style={{ color: X.tm, fontSize: 11, marginTop: 2 }}>Anlık toplam TL değeri</div></div>
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
        return (
          <>
            <Card s={{ marginBottom: 12 }}>
              <div style={{ color: X.tm, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>EKSTRE DÖKÜMÜ YÜKLE</div>
              {cards.length === 0 ? (
                <div style={{ color: X.w, fontSize: 13, padding: 10, background: X.wd, borderRadius: 8 }}>⚠️ Önce Ayarlar → Kartlarım'dan kart eklemelisiniz.</div>
              ) : (
                <>
                  <Sel label="Hangi Kartın Ekstresi?" value={csvCardId} onChange={setCsvCardId} options={[{ v: "", l: "— Seçin —" }, ...cards.map(c => ({ v: c.id, l: c.name }))]} />
                  <label style={{ display: "block", textAlign: "center" }}>
                    <span style={{ display: "inline-block", background: csvCardId ? X.g : X.td, color: "#000", borderRadius: 10, padding: "12px 24px", fontSize: 14, fontWeight: 700, cursor: csvCardId ? "pointer" : "not-allowed" }}>📂 Ekstre Yükle</span>
                    <input type="file" accept=".csv" onChange={handleCSV} disabled={!csvCardId} style={{ display: "none" }} />
                  </label>
                </>
              )}
              {Object.keys(allCsvData).length > 0 && (
                <div style={{ marginTop: 12, fontSize: 11, color: X.td }}>
                  Yüklenen: {Object.keys(allCsvData).map(cid => cards.find(c => c.id === cid)?.name || "?").join(", ")}
                </div>
              )}
            </Card>

            {csvTotal > 0 && (
              <>
                <Card s={{ marginBottom: 12 }}>
                  <div style={{ color: X.g, fontSize: 13, fontWeight: 700, marginBottom: 4 }}>TOPLAM (TÜM KARTLAR)</div>
                  <div style={{ color: X.t, fontSize: 28, fontWeight: 800, fontFamily: fm }}>{C(csvTotal)}</div>
                </Card>

                <Card s={{ marginBottom: 12 }}>
                  <div style={{ color: X.tm, fontSize: 13, fontWeight: 700, marginBottom: 10 }}>KATEGORİ DAĞILIMI</div>
                  {ves.map(ve => {
                    const amt = csvCats[ve.id] || 0;
                    if (amt === 0) return null;
                    const pct = csvTotal > 0 ? (amt / csvTotal) * 100 : 0;
                    return (
                      <div key={ve.id} style={{ marginBottom: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ color: X.t, fontSize: 13 }}>{ve.icon || "📋"} {ve.name}</span>
                          <span style={{ color: X.t, fontSize: 13, fontWeight: 700, fontFamily: fm }}>{C(amt)}</span>
                        </div>
                        <div style={{ height: 5, borderRadius: 2, background: X.border }}>
                          <div style={{ height: "100%", borderRadius: 2, background: X.b, width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  {csvCats._uncategorized > 0 && (
                    <div style={{ marginBottom: 10, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${X.border}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ color: X.td, fontSize: 13 }}>Kategorisiz</span>
                        <span style={{ color: X.td, fontSize: 13, fontWeight: 700, fontFamily: fm }}>{C(csvCats._uncategorized)}</span>
                      </div>
                      <div style={{ color: X.td, fontSize: 10 }}>Aşağıdaki listeden kategori atayabilirsiniz</div>
                    </div>
                  )}
                </Card>

                {Object.entries(allCsvData).map(([cardId, cardData]) => {
                  const cardName = cards.find(c => c.id === cardId)?.name || "?";
                  const txs = cardData.transactions || [];
                  if (txs.length === 0) return null;
                  // Kategorisiz olanları üste al
                  const sorted = [...txs].sort((a, b) => {
                    if (!a.categoryId && b.categoryId) return -1;
                    if (a.categoryId && !b.categoryId) return 1;
                    return b.amount - a.amount;
                  });
                  return (
                    <Card key={cardId} s={{ marginBottom: 12 }}>
                      <div style={{ color: X.tm, fontSize: 12, fontWeight: 700, marginBottom: 10, paddingBottom: 8, borderBottom: `1px solid ${X.border}` }}>
                        💳 {cardName} — {txs.length} işlem
                      </div>
                      {sorted.map(tx => (
                        <div key={tx.id} style={{ padding: "8px 0", borderBottom: `1px solid ${X.border}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                            <span style={{ color: X.t, fontSize: 12, fontWeight: 600, flex: 1, marginRight: 8, wordBreak: "break-word" }}>{tx.desc || "—"}</span>
                            <span style={{ color: X.t, fontSize: 13, fontWeight: 700, fontFamily: fm, flexShrink: 0 }}>{C(tx.amount)}</span>
                          </div>
                          {tx.date && <div style={{ color: X.td, fontSize: 10, marginBottom: 4 }}>{tx.date}</div>}
                          <select value={tx.categoryId || ""} onChange={e => updateCsvTransaction(cardId, tx.id, e.target.value || null)} style={{ width: "100%", background: tx.categoryId ? X.bd : "#0C0E16", border: `1px solid ${tx.categoryId ? X.b : X.border}`, borderRadius: 6, padding: "6px 10px", color: tx.categoryId ? X.b : X.tm, fontSize: 11, fontFamily: ff, outline: "none", boxSizing: "border-box" }}>
                            <option value="">— Kategorisiz —</option>
                            {ves.map(ve => <option key={ve.id} value={ve.id}>{(ve.icon || "📋")} {ve.name}</option>)}
                          </select>
                        </div>
                      ))}
                    </Card>
                  );
                })}

                {Object.keys(data.merchantMap || {}).length > 0 && (
                  <Card s={{ background: X.gd, border: `1px solid ${X.g}` }}>
                    <div style={{ color: X.g, fontSize: 12, fontWeight: 700, marginBottom: 4 }}>🧠 Öğrenilen Eşleşmeler</div>
                    <div style={{ color: X.tm, fontSize: 11 }}>
                      {Object.keys(data.merchantMap).length} merchant öğrenildi. Bir sonraki ekstrede bunlar otomatik kategorize olacak.
                    </div>
                  </Card>
                )}
              </>
            )}
          </>
        );
      })()}

      {view === "variable" && (() => {
        const cats = categorizeMonthSpending(data, mk);
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
function Settings({ data, setData }) {
  const [sec, setSec] = useState(null); const [form, setForm] = useState({}); const mk = cmk();
  const secs = [{ id: "budget", l: "Varsayılan Bütçe", i: "💰", d: C(data.settings.monthlyBudget) }, { id: "cards", l: "Kartlarım", i: "💳", d: `${(data.settings.cards || []).length} kart` }, { id: "fixed", l: "Sabit Zorunlu", i: "🔒", d: `${data.settings.fixedExpenses.length} kalem` }, { id: "variable", l: "Kategoriler", i: "🔄", d: `${data.settings.variableExpenses.length} kategori` }, { id: "debts", l: "Borçlar", i: "📌", d: `${data.debts.filter(d => d.remainingMonths > 0).length} aktif` }, { id: "emergency", l: "Acil Durum Fonu", i: "🛡️", d: data.settings.emergencyFundTarget ? C(data.settings.emergencyFundTarget) : "Hedef yok" }, { id: "rates", l: "Döviz & Altın Kuru", i: "💱", d: data.liveRates?.USD ? `$${data.liveRates.USD.toFixed(2)}` : "Manuel" }, { id: "backup", l: "Yedekleme", i: "💾", d: "Dışa/İçe aktarma" }, { id: "reset", l: "Sıfırla", i: "🗑️", d: "Geri alınamaz" }];
  const BackBtn = () => <button onClick={() => setSec(null)} style={{ background: "none", border: "none", color: X.g, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: ff, padding: 0, marginBottom: 16 }}>← Geri</button>;
  if (!sec) return (<div style={{ padding: "20px 16px 100px" }}><h2 style={{ color: X.t, fontSize: 20, margin: "0 0 16px", fontFamily: ff }}>Ayarlar</h2><div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{secs.map(s => (<Card key={s.id} onClick={() => { setSec(s.id); setForm({}); }} s={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}><span style={{ fontSize: 24 }}>{s.i}</span><div style={{ flex: 1 }}><div style={{ color: X.t, fontWeight: 700, fontSize: 15 }}>{s.l}</div><div style={{ color: X.td, fontSize: 12 }}>{s.d}</div></div><span style={{ color: X.td }}>›</span></Card>))}</div></div>);
  if (sec === "budget") return (<div style={{ padding: "20px 16px 100px" }}><BackBtn /><Inp label="Varsayılan (₺)" type="number" value={form.b ?? data.settings.monthlyBudget} onChange={v => setForm({ b: v })} suffix="₺" /><Btn onClick={() => { setData(d => ({ ...d, settings: { ...d.settings, monthlyBudget: parseFloat(form.b) || 0 } })); setSec(null); }}>Kaydet</Btn></div>);
  if (sec === "fixed") return <FixedSettings data={data} setData={setData} onBack={() => setSec(null)} />;
  if (sec === "cards") return <CardsSettings data={data} setData={setData} onBack={() => setSec(null)} />;
  if (sec === "variable") return <VariableSettings data={data} setData={setData} onBack={() => setSec(null)} />;
  if (sec === "debts") return <DebtSettings data={data} setData={setData} onBack={() => setSec(null)} />;
  if (sec === "emergency") return <EmergencyFundSettings data={data} setData={setData} onBack={() => setSec(null)} />;
  if (sec === "rates") return <RatesSettings data={data} setData={setData} onBack={() => setSec(null)} />;
  if (sec === "backup") return <BackupSettings data={data} setData={setData} onBack={() => setSec(null)} />;
  if (sec === "reset") return (<div style={{ padding: "20px 16px 100px" }}><BackBtn /><Card s={{ border: `1px solid ${X.r}`, background: X.rd, textAlign: "center", padding: 24 }}><div style={{ fontSize: 36, marginBottom: 8 }}>⚠️</div><Btn c={X.r} onClick={async () => { await deleteDB(); setData({ ...DD }); setSec(null); }}>Tüm Verileri Sil</Btn></Card></div>);
  return null;
}
function FixedSettings({ data, setData, onBack }) {
  const [editing, setEditing] = useState(null); // null | "new" | id
  const [n, sn] = useState(""); const [a, sa] = useState(""); const [m, sm] = useState("account"); const [d, sd] = useState(""); const [cardId, setCardId] = useState("");
  const cards = data.settings.cards || [];

  const startNew = () => { sn(""); sa(""); sm("account"); sd(""); setCardId(cards[0]?.id || ""); setEditing("new"); };
  const startEdit = exp => { sn(exp.name); sa(String(exp.amount)); sm(exp.paymentMethod || "account"); sd(exp.increaseDate || ""); setCardId(exp.cardId || cards[0]?.id || ""); setEditing(exp.id); };
  const cancel = () => { setEditing(null); sn(""); sa(""); sm("account"); sd(""); setCardId(""); };

  const save = () => {
    if (!n || !a) return;
    setData(dd => {
      const list = [...dd.settings.fixedExpenses];
      const newItem = { name: n, amount: parseFloat(a), paymentMethod: m, increaseDate: d || null, cardId: m === "cc" ? cardId : null };
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

  const rm = id => setData(dd => ({ ...dd, settings: { ...dd.settings, fixedExpenses: dd.settings.fixedExpenses.filter(e => e.id !== id) } }));

  return (
    <div style={{ padding: "20px 16px 100px" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: X.g, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: ff, padding: 0, marginBottom: 16 }}>← Geri</button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ color: X.t, fontSize: 16, margin: 0 }}>🔒 Sabit Zorunlu</h3>
        {!editing && <button onClick={startNew} style={{ background: X.gd, border: `1px solid ${X.g}`, borderRadius: 8, padding: "6px 12px", color: X.g, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+ Ekle</button>}
      </div>
      {data.settings.fixedExpenses.map(exp => {
        const cardName = exp.cardId ? cards.find(c => c.id === exp.cardId)?.name : null;
        return (
          <Card key={exp.id} s={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: X.t, fontWeight: 700 }}>{exp.name}</div>
                <div style={{ color: X.tm, fontSize: 12 }}>{C(exp.amount)} • {exp.paymentMethod === "cc" ? "💳" + (cardName ? " " + cardName : "") : "🏦"}{exp.increaseDate ? " • " + exp.increaseDate : ""}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => startEdit(exp)} style={{ background: X.bd, border: `1px solid ${X.b}`, borderRadius: 6, padding: "4px 10px", color: X.b, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>✎</button>
                <button onClick={() => rm(exp.id)} style={{ background: X.rd, border: `1px solid ${X.r}`, borderRadius: 6, padding: "4px 10px", color: X.r, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>✕</button>
              </div>
            </div>
          </Card>
        );
      })}
      {editing && (
        <Card s={{ border: `1px solid ${X.g}`, marginTop: 12 }}>
          <div style={{ color: X.g, fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{editing === "new" ? "Yeni Kalem" : "Düzenle"}</div>
          <Inp label="Ad" value={n} onChange={sn} />
          <Inp label="Tutar" type="number" value={a} onChange={sa} suffix="₺" />
          <Sel label="Ödeme" value={m} onChange={sm} options={PM.map(p => ({ v: p.id, l: p.icon + " " + p.label }))} />
          {m === "cc" && cards.length > 0 && <Sel label="Hangi Kart" value={cardId} onChange={setCardId} options={cards.map(c => ({ v: c.id, l: c.name }))} />}
          {m === "cc" && cards.length === 0 && <div style={{ color: X.w, fontSize: 12, marginBottom: 8 }}>⚠️ Önce Ayarlar → Kartlarım'dan kart ekleyin</div>}
          <Inp label="Artış Tarihi" type="month" value={d} onChange={sd} />
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={save} s={{ flex: 1 }}>Kaydet</Btn>
            <Btn onClick={cancel} v="outline" c={X.td} s={{ flex: 1 }}>İptal</Btn>
          </div>
        </Card>
      )}
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

  const rm = id => setData(dd => ({ ...dd, settings: { ...dd.settings, variableExpenses: dd.settings.variableExpenses.filter(e => e.id !== id) } }));

  return (
    <div style={{ padding: "20px 16px 100px" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: X.g, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: ff, padding: 0, marginBottom: 16 }}>← Geri</button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ color: X.t, fontSize: 16, margin: 0 }}>🔄 Kategoriler</h3>
        {!editing && <button onClick={startNew} style={{ background: X.gd, border: `1px solid ${X.g}`, borderRadius: 8, padding: "6px 12px", color: X.g, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+ Ekle</button>}
      </div>
      <p style={{ color: X.td, fontSize: 12, marginBottom: 16 }}>Kategori tanımlayın ve anahtar kelimeler atayın. Harcama girerken anahtar kelimelerinizden biri açıklamada veya işyeri adında geçerse bu kategoriye otomatik atanır.</p>
      {data.settings.variableExpenses.length === 0 && !editing && <Card s={{ textAlign: "center", padding: 20 }}><div style={{ color: X.tm, fontSize: 13 }}>Henüz kategori eklenmedi</div></Card>}
      {data.settings.variableExpenses.map(ve => (
        <Card key={ve.id} s={{ marginBottom: 8 }}>
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
              <button onClick={() => startEdit(ve)} style={{ background: X.bd, border: `1px solid ${X.b}`, borderRadius: 6, padding: "4px 10px", color: X.b, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>✎</button>
              <button onClick={() => rm(ve.id)} style={{ background: X.rd, border: `1px solid ${X.r}`, borderRadius: 6, padding: "4px 10px", color: X.r, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>✕</button>
            </div>
          </div>
        </Card>
      ))}
      {editing && (
        <Card s={{ border: `1px solid ${X.g}`, marginTop: 12 }}>
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
            <textarea value={kw} onChange={e => setKw(e.target.value)} placeholder="shell, opet, bp, dizel, benzin, yakıt, akaryakıt" style={{ width: "100%", background: "#0C0E16", border: `1px solid ${X.border}`, borderRadius: 10, padding: "12px 14px", color: X.t, fontSize: 14, fontFamily: ff, outline: "none", boxSizing: "border-box", minHeight: 60, resize: "vertical" }} />
            <div style={{ color: X.td, fontSize: 10, marginTop: 4 }}>Bu kelimelerden biri harcamanın açıklaması veya işyeri adında geçerse bu kategoriye otomatik atanır.</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={save} s={{ flex: 1 }}>Kaydet</Btn>
            <Btn onClick={cancel} v="outline" c={X.td} s={{ flex: 1 }}>İptal</Btn>
          </div>
        </Card>
      )}
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
    if (!confirm("Bu kartı silmek istediğinize emin misiniz? Bu karta bağlı geçmiş harcamalar etkilenmez ama hangi karta ait oldukları görünmez olur.")) return;
    setData(d => ({ ...d, settings: { ...d.settings, cards: (d.settings.cards || []).filter(c => c.id !== id) } }));
  };

  return (
    <div style={{ padding: "20px 16px 100px" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: X.g, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: ff, padding: 0, marginBottom: 16 }}>← Geri</button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ color: X.t, fontSize: 16, margin: 0 }}>💳 Kartlarım</h3>
        {!editing && <button onClick={startNew} style={{ background: X.gd, border: `1px solid ${X.g}`, borderRadius: 8, padding: "6px 12px", color: X.g, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+ Ekle</button>}
      </div>
      <p style={{ color: X.td, fontSize: 12, marginBottom: 16 }}>Kredi kartlarınızı tanımlayın. Harcama girerken hangi karta ait olduğunu seçeceksiniz.</p>
      {cards.length === 0 && !editing && <Card s={{ textAlign: "center", padding: 20 }}><div style={{ color: X.tm, fontSize: 13 }}>Henüz kart eklenmedi</div></Card>}
      {cards.map(c => (
        <Card key={c.id} s={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: X.t, fontWeight: 700 }}>{c.name}</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => startEdit(c)} style={{ background: X.bd, border: `1px solid ${X.b}`, borderRadius: 6, padding: "4px 10px", color: X.b, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>✎</button>
              <button onClick={() => rm(c.id)} style={{ background: X.rd, border: `1px solid ${X.r}`, borderRadius: 6, padding: "4px 10px", color: X.r, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>✕</button>
            </div>
          </div>
        </Card>
      ))}
      {editing && (
        <Card s={{ border: `1px solid ${X.g}`, marginTop: 12 }}>
          <div style={{ color: X.g, fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{editing === "new" ? "Yeni Kart" : "Düzenle"}</div>
          <Inp label="Kart Adı" value={n} onChange={sn} placeholder="Örn: Garanti Bonus, Yapı Kredi World" />
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={save} s={{ flex: 1 }}>Kaydet</Btn>
            <Btn onClick={cancel} v="outline" c={X.td} s={{ flex: 1 }}>İptal</Btn>
          </div>
        </Card>
      )}
    </div>
  );
}

function DebtSettings({ data, setData, onBack }) {
  const [editing, setEditing] = useState(null);
  const [n, sn] = useState(""); const [c, sc] = useState("TRY");
  const [total, setTotal] = useState(""); const [months, setMonths] = useState("");

  const startNew = () => { sn(""); sc("TRY"); setTotal(""); setMonths(""); setEditing("new"); };
  const startEdit = debt => {
    sn(debt.name); sc(debt.currency);
    // Geriye dönük uyum: eski borçlarda totalAmount yoksa monthly * remaining
    const t = debt.totalAmount || (debt.monthlyPayment * (debt.totalMonths || debt.remainingMonths));
    const m2 = debt.totalMonths || debt.remainingMonths;
    setTotal(String(t)); setMonths(String(m2));
    setEditing(debt.id);
  };
  const cancel = () => { setEditing(null); sn(""); sc("TRY"); setTotal(""); setMonths(""); };

  const totalNum = parseFloat(total) || 0;
  const monthsNum = parseInt(months) || 0;
  const monthlyCalc = monthsNum > 0 ? totalNum / monthsNum : 0;

  const save = () => {
    if (!n || !totalNum || !monthsNum) return;
    setData(d => {
      const list = [...d.debts];
      if (editing === "new") {
        list.push({
          id: uid(), name: n, currency: c,
          totalAmount: totalNum,
          totalMonths: monthsNum,
          remainingMonths: monthsNum,
          monthlyPayment: monthlyCalc
        });
      } else {
        const idx = list.findIndex(x => x.id === editing);
        if (idx >= 0) {
          const old = list[idx];
          // Düzenlemede ödenen taksitleri koru: ödenen = eski totalMonths - eski remainingMonths
          const paidCount = (old.totalMonths || old.remainingMonths) - old.remainingMonths;
          const newRemaining = Math.max(0, monthsNum - paidCount);
          list[idx] = {
            ...old, name: n, currency: c,
            totalAmount: totalNum,
            totalMonths: monthsNum,
            remainingMonths: newRemaining,
            monthlyPayment: monthlyCalc
          };
        }
      }
      return { ...d, debts: list };
    });
    cancel();
  };

  const rm = id => setData(dd => ({ ...dd, debts: dd.debts.filter(x => x.id !== id) }));

  const activeDebts = data.debts.filter(d => d.remainingMonths > 0);

  return (
    <div style={{ padding: "20px 16px 100px" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: X.g, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: ff, padding: 0, marginBottom: 16 }}>← Geri</button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ color: X.t, fontSize: 16, margin: 0 }}>📌 Borçlar</h3>
        {!editing && <button onClick={startNew} style={{ background: X.gd, border: `1px solid ${X.g}`, borderRadius: 8, padding: "6px 12px", color: X.g, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+ Ekle</button>}
      </div>
      {activeDebts.map(d => {
        const sym = debtCurSymbol(d.currency);
        const tlVal = debtTLValue(d, data, cmk());
        const totalM = d.totalMonths || d.remainingMonths;
        const paidCount = totalM - d.remainingMonths;
        return (
          <Card key={d.id} s={{ marginBottom: 8 }}>
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
                <button onClick={() => startEdit(d)} style={{ background: X.bd, border: `1px solid ${X.b}`, borderRadius: 6, padding: "4px 10px", color: X.b, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>✎</button>
                <button onClick={() => rm(d.id)} style={{ background: X.rd, border: `1px solid ${X.r}`, borderRadius: 6, padding: "4px 10px", color: X.r, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>✕</button>
              </div>
            </div>
          </Card>
        );
      })}
      {editing && (
        <Card s={{ border: `1px solid ${X.w}`, marginTop: 12 }}>
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
      )}
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
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(12px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16 }}>
      <div style={{ background: X.card, borderRadius: 20, width: "100%", maxWidth: 440, maxHeight: "90vh", overflow: "auto", padding: 24, border: `1px solid ${X.border}` }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📅</div>
          <div style={{ color: X.t, fontSize: 18, fontWeight: 800, fontFamily: ff }}>Ay Kapatma</div>
          <div style={{ color: X.tm, fontSize: 12, marginTop: 4 }}>{ml(prevMk)} ayını kapatıp {ml(newMk)} ayını başlatın</div>
        </div>

        <Card s={{ marginBottom: 12, background: X.bg, border: `1px solid ${X.border}` }}>
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
          <Card s={{ marginBottom: 12, background: "#0D2818", border: "1px solid #1A5C2E" }}>
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
export default function App() {
  const [data, setData] = useState(DD); const [loaded, setLoaded] = useState(false); const [tab, setTab] = useState("home"); const mk = cmk();
  useEffect(() => { loadDB().then(d => { if (d) setData({ ...DD, ...d, settings: { ...DD.settings, ...(d.settings || {}) }, liveRates: d.liveRates || DD.liveRates, savings: { ...DD.savings, ...(d.savings || {}) }, lastClosedMonth: d.lastClosedMonth || null, lastBackup: d.lastBackup || null }); setLoaded(true); }); }, []);
  useEffect(() => { if (loaded) saveDB(data); }, [data, loaded]);

  const gmd = useCallback(m => data.months[m] || DM(), [data.months]);
  const smf = useCallback((m, f, v) => { setData(d => { const ms = { ...d.months }; const md = { ...(ms[m] || DM()) }; md[f] = v; ms[m] = md; return { ...d, months: ms }; }); }, []);

  // Ay kapatma: Hangi önceki ay kapatılması gerekiyor?
  const pendingCloseMk = useMemo(() => {
    if (!loaded) return null;
    const last = data.lastClosedMonth;
    const prev = pmk(mk); // bu aydan önceki ay
    // Hiç kapatılmamışsa: sadece önceki ayda bir veri varsa kapat, yoksa işaretleme
    if (!last) {
      if (data.months[prev]) return prev;
      return null;
    }
    // Bir sonraki kapatılması gereken ay
    const nextToClose = nmk(last);
    if (nextToClose < mk) return nextToClose;
    return null;
  }, [loaded, data.lastClosedMonth, data.months, mk]);

  if (!loaded) return <div style={{ background: X.bg, height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: X.g, fontFamily: ff }}>Yükleniyor...</div>;
  const c = calcMonth(data, mk, null);

  return (
    <div style={{ background: X.bg, minHeight: "100vh", color: X.t, fontFamily: ff, maxWidth: 480, margin: "0 auto", position: "relative" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600;700;800&display=swap" rel="stylesheet" />
      <div style={{ background: X.card, borderBottom: `1px solid ${X.border}`, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 50 }}>
        <div><div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.3px" }}>EV BÜTÇESİ</div><div style={{ fontSize: 11, color: X.td }}>{ml(mk)}</div></div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: X.tm, letterSpacing: 0.5 }}>BÜTÇE / KALAN</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: X.td, fontFamily: fm }}>{C(c.effectiveBudget)}</span>
            <span style={{ color: X.td }}>/</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: c.remaining >= 0 ? X.g : X.r, fontFamily: fm }}>{C(c.remaining)}</span>
          </div>
        </div>
      </div>
      {tab === "home" && <Dashboard data={data} mk={mk} gmd={gmd} setMonthField={smf} setData={setData} />}
      {tab === "report" && <AnalysisScreen data={data} setData={setData} mk={mk} />}
      {tab === "settings" && <Settings data={data} setData={setData} />}
      <TabBar tab={tab} setTab={setTab} />
      {pendingCloseMk && <MonthCloseRitual data={data} setData={setData} prevMk={pendingCloseMk} onClose={() => { }} />}
      {!pendingCloseMk && needsWeeklyBackup(data) && <WeeklyBackupRitual data={data} setData={setData} />}
    </div>
  );
}
