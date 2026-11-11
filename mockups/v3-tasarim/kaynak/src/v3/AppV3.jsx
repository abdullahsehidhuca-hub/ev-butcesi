// Ev Bütçesi v3 arayüzü. Veri durumunu (state) tutar, ekranlar arası geçişi ve
// kullanıcı işlemlerini (ekle, ödendi, uyarıyı çöz) core fonksiyonlarına iletir.
//
// Kullanım:
//   <AppV3 />                                  → örnek veriyle önizleme
//   <AppV3 initialState={state} today="…" members={…} onChange={s => kaydet(s)} />
//     → gerçek veriyle; her değişiklikte onChange yeni state ile çağrılır.

import { useCallback, useEffect, useState } from "react";
import "./v3.css";
import { quickAdd, payObligation, today as todayOf } from "../core/index.js";
import { TabBar } from "./components/ui.jsx";
import { buildSampleState, SAMPLE_TODAY, SAMPLE_MEMBERS } from "./sampleData.js";
import { mainAccountId, fmt } from "./selectors.js";
import Ozet from "./screens/Ozet.jsx";
import Odemeler from "./screens/Odemeler.jsx";
import Rapor from "./screens/Rapor.jsx";
import Ayarlar from "./screens/Ayarlar.jsx";
import EkleSheet from "./screens/EkleSheet.jsx";
import CozSheet from "./screens/CozSheet.jsx";

const PREVIEW_KEY = "evb-v3-onizleme";
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const readJSON = k => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } };
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* gizli sekme vb. */ } };

export default function AppV3({ initialState, today: todayProp, members = SAMPLE_MEMBERS, userId, onChange }) {
  const preview = !initialState;
  const [state, setState] = useState(() => initialState || readJSON(PREVIEW_KEY)?.state || buildSampleState());
  const [overrides, setOverrides] = useState(() => (preview && readJSON(PREVIEW_KEY)?.overrides) || {});
  const today = todayProp || (preview ? SAMPLE_TODAY : todayOf());
  const me = userId || Object.values(members).find(m => m.self)?.id || null;
  const [tab, setTab] = useState(() => location.hash.slice(1) || "ozet");
  const [sheet, setSheet] = useState(null); // "ekle" | "coz"
  const [toast, setToast] = useState(null);
  const [theme, setTheme] = useState(() => readJSON("evb-v3-tema") || "system");

  useEffect(() => { if (initialState) setState(initialState); }, [initialState]);
  useEffect(() => { if (theme === "system") document.documentElement.removeAttribute("data-theme"); else document.documentElement.dataset.theme = theme; writeJSON("evb-v3-tema", theme); }, [theme]);
  useEffect(() => { if (preview) writeJSON(PREVIEW_KEY, { state, overrides }); }, [state, overrides, preview]);
  useEffect(() => { const h = () => setTab(location.hash.slice(1) || "ozet"); addEventListener("hashchange", h); return () => removeEventListener("hashchange", h); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2200); return () => clearTimeout(t); }, [toast]);

  const commit = useCallback((next, message) => { setState(next); onChange?.(next); if (message) setToast(message); }, [onChange]);
  const run = (fn, message) => { try { commit(fn(), message); } catch (e) { setToast(e.errors?.[0] || e.message); } };
  const ctx = () => ({ id: uid(), now: new Date(`${today}T${new Date().toTimeString().slice(0, 8)}`), userId: me });
  const go = id => { location.hash = id; setTab(id); };

  const add = input => { run(() => quickAdd(state, input, ctx()).state, `${fmt(input.amount)} eklendi`); setSheet(null); };
  const pay = item => {
    if (item.type === "card") run(() => quickAdd(state, { type: "transfer", amount: item.open, accountId: mainAccountId(state), toAccountId: item.accountId, note: item.name }, ctx()).state, `${item.name} ödendi`);
    else run(() => payObligation(state, item.obligationId, item.period, {}, ctx()).state, `${item.name} ödendi`);
  };
  const apply = opt => {
    if (opt.id === "transfer") run(() => quickAdd(state, { type: "transfer", amount: opt.amount, accountId: opt.fromAccountId, toAccountId: mainAccountId(state), note: "Açığı kapatmak için aktarım" }, ctx()).state, `${fmt(opt.amount)} aktarıldı`);
    else { setOverrides(o => ({ ...o, [opt.key]: opt.id === "postpone" ? opt.date : opt.plan })); setToast("Plan kaydedildi"); }
    setSheet(null);
  };

  const common = { state, today, members, overrides };
  return (
    <div className="v3">
      <main className="v3-scroll" key={tab}>
        {tab === "ozet" && <Ozet {...common} onResolve={() => setSheet("coz")} onPay={pay} onOpenPayments={() => go("odemeler")} />}
        {tab === "odemeler" && <Odemeler {...common} onPay={pay} onAdd={() => setSheet("ekle")} />}
        {tab === "rapor" && <Rapor {...common} />}
        {tab === "ayarlar" && <Ayarlar {...common} theme={theme} onTheme={setTheme} onReset={preview ? () => { setState(buildSampleState()); setOverrides({}); setToast("Örnek veri yüklendi"); } : null} />}
      </main>
      <TabBar tab={tab} onTab={go} onAdd={() => setSheet("ekle")} />
      {sheet === "ekle" && <EkleSheet {...common} onClose={() => setSheet(null)} onAdd={add} />}
      {sheet === "coz" && <CozSheet {...common} onClose={() => setSheet(null)} onApply={apply} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
