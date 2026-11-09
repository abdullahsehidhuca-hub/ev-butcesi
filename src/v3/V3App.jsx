// Ev Bütçesi v3 arayüzü. Görsel düzen Abdullah'ın dış taslağından (C tasarımı, 2026-11-08) uyarlandı.
// Yeni hesap motoruna (src/core) bağlıdır; eski uygulamadan (App.jsx) bağımsızdır ve /v3 adresinde açılır.
// Veri durumunu tutar, sekmeler arası geçişi ve kullanıcı işlemlerini çekirdek fonksiyonlarına iletir.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { computePeriod, periodOf, quickAdd, today, ValidationError } from "../core/index.js";
import { loadState, saveState, loadPref, savePref, newId, exportBackup, parseBackup, transactionsCsv, STORAGE_KEY, PLAN_KEY, THEME_KEY, BACKUP_KEY, CLOUD_BASE_KEY, LOCAL_COPY_KEY, SAMPLE_KEY, SAMPLE_PLAN_KEY } from "./store.js";
import { useCloud } from "./useCloud.js";
import { stampCreatedBy } from "./sync.js";
import { mainAccountId, daysBetween, addDays, fmt } from "./selectors.js";
import { TabBar, TABS } from "./components/ui.jsx";
import Ozet from "./screens/Ozet.jsx";
import Odemeler from "./screens/Odemeler.jsx";
import Rapor from "./screens/Rapor.jsx";
import Ayarlar from "./screens/Ayarlar.jsx";
import EkleSheet from "./screens/EkleSheet.jsx";
import CozSheet from "./screens/CozSheet.jsx";
import BakiyeSheet from "./screens/BakiyeSheet.jsx";
import KapatSheet from "./screens/KapatSheet.jsx";
import { TxListSheet, TxEditSheet } from "./screens/IslemlerSheet.jsx";
import HesapSheet from "./screens/HesapSheet.jsx";
import EkstreSheet from "./screens/EkstreSheet.jsx";
import { PaySheet, AccountSheet, CategorySheet, ObligationSheet, InstallmentSheet, PayDaySheet, ResetSheet } from "./Sheets.jsx";
import "./v3.css";

const tabFromHash = () => {
  const id = typeof location !== "undefined" ? location.hash.slice(1) : "";
  return TABS.some(([t]) => t === id) ? id : "home";
};

// sample: yalnız geliştirmede /v3?ornek ile gelir (src/main.jsx). Örnek veri ayrı anahtarda tutulur,
// tarih örneğin senaryosuna sabitlenir; gerçek v3 verisi okunmaz ve yazılmaz.
export default function V3App({ sample }) {
  const stateKey = sample ? SAMPLE_KEY : STORAGE_KEY;
  const planKey = sample ? SAMPLE_PLAN_KEY : PLAN_KEY;
  const [loaded] = useState(() => {
    const stored = loadState(undefined, stateKey);
    let fresh = false;
    try { fresh = !globalThis.localStorage?.getItem(stateKey); } catch { fresh = true; }
    return sample && fresh && !stored.error ? { state: sample.buildSampleState(), error: null } : stored;
  });
  const [state, setState] = useState(loaded.state);
  const stateRef = useRef(state);
  const [overrides, setOverrides] = useState(() => loadPref(planKey, {}));
  const [theme, setTheme] = useState(() => loadPref(THEME_KEY, "system"));
  const [backupInfo, setBackupInfo] = useState(() => loadPref(BACKUP_KEY, {}));
  const [tab, setTab] = useState(tabFromHash);
  const [sheet, setSheet] = useState(null);
  const [toast, setToast] = useState(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const scroll = useRef(null);
  const firstRender = useRef(true);
  const userRef = useRef(null);

  // Buluttan gelen veri (aile üyesinin değişikliği ya da ilk yükleme) durumun yerine geçer.
  const replaceState = useCallback(next => { stateRef.current = next; setState(next); }, []);
  // Örnek veri modunda bulut kapalıdır; örnek veri hiçbir zaman Firebase'e yazılmaz.
  const cloud = useCloud({ enabled: !sample, stateRef, replaceState, baseKey: CLOUD_BASE_KEY, localCopyKey: LOCAL_COPY_KEY });
  userRef.current = cloud.user?.uid || null;
  const synced = cloud.status === "synced" || cloud.status === "offline";

  useEffect(() => { document.title = "Ev Bütçesi"; }, []);

  // Her değişiklik bu cihaza yazılır; ilk açılışta yazılmaz.
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    setSaveFailed(!saveState(state, undefined, stateKey));
    cloud.push(state);
  }, [state]);
  useEffect(() => { savePref(planKey, overrides); }, [overrides]);
  useEffect(() => { if (!sample) savePref(BACKUP_KEY, backupInfo); }, [backupInfo]);
  useEffect(() => {
    if (theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.dataset.theme = theme;
    savePref(THEME_KEY, theme);
  }, [theme]);
  useEffect(() => {
    const h = () => setTab(tabFromHash());
    addEventListener("hashchange", h);
    return () => removeEventListener("hashchange", h);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  // Çekmeceler veriyi yalnız buradan değiştirir. Dönüş: null (başarılı) ya da hata listesi.
  const commit = useCallback(fn => {
    try {
      const next = stampCreatedBy(stateRef.current, fn(stateRef.current), userRef.current);
      stateRef.current = next;
      setState(next);
      return null;
    } catch (e) {
      if (e instanceof ValidationError) return e.errors;
      return [e?.message || "beklenmeyen bir hata oluştu"];
    }
  }, []);

  const todayDate = sample ? sample.SAMPLE_TODAY : today();
  const members = sample ? sample.SAMPLE_MEMBERS : cloud.members;
  const period = periodOf(todayDate, state.settings.payDay);
  const go = useCallback(id => {
    if (location.hash.slice(1) !== id) history.replaceState(null, "", `#${id}`);
    setTab(id);
    scroll.current?.scrollTo(0, 0);
  }, []);
  const close = useCallback(() => setSheet(null), []);
  // Bir çekmeceden açılan çekmece (liste → düzenle, ay kapatma → ödendi) kapanınca öncekine döner.
  const closeTo = back => () => setSheet(back || null);

  // Listedeki ✓ ödeme çekmecesini açar: tutar, hesap ve kısmi ödeme orada seçilir.
  const pay = (item, back) => {
    const s = computePeriod(stateRef.current, item.period);
    if (item.type === "card") {
      const card = s.cards.find(c => c.accountId === item.accountId);
      if (card?.due > 0) setSheet({ name: "pay", period: item.period, target: { type: "card", card }, back });
    } else {
      const found = s.obligations.items.find(i => i.obligationId === item.obligationId);
      if (found) setSheet({ name: "pay", period: item.period, target: { type: "obligation", item: found }, back });
    }
  };
  // Çöz penceresi: aktarım gerçek kayıttır; erteleme ve bölme yalnız tahmin planıdır.
  const apply = opt => {
    if (opt.id === "transfer") {
      const errs = commit(s => quickAdd(s, { type: "transfer", amount: opt.amount, accountId: opt.fromAccountId, toAccountId: mainAccountId(s), note: "Açığı kapatmak için aktarım" }, { id: newId(), now: new Date(`${todayDate}T${new Date().toTimeString().slice(0, 8)}`) }).state);
      setToast(errs ? errs[0] : `${fmt(opt.amount)} aktarıldı`);
    } else {
      setOverrides(o => ({ ...o, [opt.key]: opt.id === "postpone" ? opt.date : opt.plan }));
      setToast("Plan kaydedildi");
    }
    setSheet(null);
  };

  // Yedek ve dışa aktarma: dosya bu cihaza indirilir, hiçbir yere gönderilmez.
  const download = (name, text, type) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const backup = {
    exportJson: () => {
      download(`ev-butcesi-yedek-${todayDate}.json`, exportBackup(stateRef.current), "application/json");
      setBackupInfo({ last: todayDate });
      setToast("Yedek indirildi");
    },
    exportCsv: () => { download(`ev-butcesi-islemler-${todayDate}.csv`, transactionsCsv(stateRef.current), "text/csv;charset=utf-8"); setToast("CSV indirildi"); },
    restore: async file => {
      let next;
      try { next = parseBackup(await file.text()); } catch (e) { setToast(e.message); return; }
      const n = Object.keys(next.transactions).length;
      const where = synced ? "Aile hesabındaki verinin (tüm üyeler için)" : "Bu cihazdaki verinin";
      if (!confirm(`Yedekte ${Object.keys(next.accounts).length} hesap ve ${n} işlem var. ${where} yerine geçsin mi?`)) return;
      commit(() => next);
      setToast("Yedek geri yüklendi");
    }
  };
  const common = { state, today: todayDate, members, overrides, open: setSheet };
  // Haftalık yedek hatırlatması (eski uygulamadaki zorunlu yedek modalının yerine, engellemeyen bant).
  // Örnek veri modunda ve henüz işlem yokken gösterilmez.
  const backupDays = backupInfo.last ? daysBetween(backupInfo.last, todayDate) : null;
  // Aile hesabına eşitlenirken veri bulutta da durduğu için hatırlatılmaz.
  const backupDue = !sample && !synced && Object.keys(state.transactions).length > 0 && (backupDays == null || backupDays >= 7)
    && !(backupInfo.snooze && backupInfo.snooze > todayDate)
    ? { days: backupDays, onBackup: backup.exportJson, onSnooze: () => setBackupInfo(b => ({ ...b, snooze: addDays(todayDate, 1) })) }
    : null;
  const reloadSample = () => { commit(() => sample.buildSampleState()); setOverrides({}); setToast("Örnek veri yeniden yüklendi"); };
  const props = { state, commit, onClose: close, today: todayDate, period, members };

  return (
    <div className="v3">
      <main className="v3-scroll" ref={scroll} key={tab}>
        {sample && (
          <div className="v3-alert" role="status">
            <strong>Örnek veri · bugün 26 Kasım 2026 sayılıyor</strong>
            Yalnız bu cihazda, gerçek veriden ayrı tutulur. Değişiklikleri deneyebilirsiniz.
            <span className="row" style={{ gap: 16, flexWrap: "wrap" }}>
              <button type="button" className="v3-link" style={{ padding: 0 }} onClick={reloadSample}>Baştan yükle</button>
              <a className="v3-link" href="/v3">Gerçek veriye geç</a>
            </span>
          </div>
        )}
        {loaded.error && (
          <div className="v3-alert is-error" role="alert">
            <strong>Kayıtlı veri okunamadı</strong>
            Bozuk veri bu cihazda ayrıca saklandı; uygulama boş başladı.
          </div>
        )}
        {cloud.status === "needsUpload" && (
          <div className="v3-alert" role="status">
            <strong>Bu cihazdaki veri henüz aile hesabında değil</strong>
            Yüklerseniz aile üyeleriniz de görür ve değiştirebilir.
            <button type="button" className="v3-link" style={{ padding: 0 }}
              onClick={() => { if (confirm("Bu cihazdaki veri aile hesabına yüklensin mi?")) cloud.upload(); }}>Aile hesabına yükle</button>
          </div>
        )}
        {cloud.status === "error" && (
          <div className="v3-alert is-error" role="alert">
            <strong>Bulutla eşitlenemedi</strong>
            Değişiklikler bu cihazda saklanmaya devam ediyor. {/permission|izin/i.test(cloud.error || "") ? "Bu aile hesabına yazma izniniz yok; aile yöneticisine başvurun." : "Bağlantıyı kontrol edip sayfayı yenileyin."}
          </div>
        )}
        {saveFailed && (
          <div className="v3-alert is-error" role="alert">
            <strong>Son değişiklik kaydedilemedi</strong>
            Tarayıcı depolaması kapalı ya da dolu olabilir. Gizli sekmedeyseniz normal sekmede açın.
          </div>
        )}
        {tab === "home" && <Ozet {...common} onResolve={() => setSheet({ name: "resolve" })} onPay={pay} onOpenPayments={() => go("plan")} onOpenSettings={() => go("settings")} backupDue={backupDue} />}
        {tab === "report" && <Rapor {...common} />}
        {tab === "plan" && <Odemeler {...common} onPay={pay} onAdd={Object.keys(state.accounts).length ? () => setSheet({ name: "obligation", kind: "fixed" }) : null} />}
        {tab === "settings" && <Ayarlar {...common} theme={theme} onTheme={setTheme} backup={backup} cloud={sample ? { status: "off" } : cloud} />}
      </main>

      <TabBar tab={tab} onTab={go} onAdd={() => setSheet({ name: "quick" })} />

      {sheet?.name === "quick" && <EkleSheet {...props} onNeedAccount={() => setSheet({ name: "account" })} onSaved={a => setToast(`${fmt(a)} eklendi`)} />}
      {sheet?.name === "resolve" && <CozSheet state={state} today={todayDate} overrides={overrides} onClose={close} onApply={apply} />}
      {sheet?.name === "balance" && <BakiyeSheet {...props} onToast={setToast} onStatement={() => setSheet({ name: "statement", back: { name: "balance" } })} />}
      {sheet?.name === "statement" && <EkstreSheet {...props} onClose={closeTo(sheet.back)} onToast={setToast} />}
      {sheet?.name === "pay" && <PaySheet {...props} onClose={closeTo(sheet.back)} period={sheet.period} target={sheet.target} />}
      {sheet?.name === "txlist" && <TxListSheet state={state} members={members} initial={sheet.filter} onClose={close}
        onEdit={(id, filter) => setSheet({ name: "tx", id, back: { name: "txlist", filter } })} />}
      {sheet?.name === "tx" && <TxEditSheet {...props} key={sheet.id} id={sheet.id} onClose={closeTo(sheet.back)} onToast={setToast} />}
      {sheet?.name === "close" && <KapatSheet {...props} onToast={setToast}
        onPay={(item, p) => pay({ type: "obligation", obligationId: item.obligationId, period: p }, { name: "close" })} />}
      {sheet?.name === "account" && <AccountSheet {...props} />}
      {sheet?.name === "category" && <CategorySheet {...props} />}
      {sheet?.name === "obligation" && <ObligationSheet {...props} kind={sheet.kind} />}
      {sheet?.name === "installment" && <InstallmentSheet {...props} />}
      {sheet?.name === "payday" && <PayDaySheet {...props} />}
      {sheet?.name === "reset" && <ResetSheet {...props} synced={synced} />}
      {sheet?.name === "login" && !sample && <HesapSheet cloud={cloud} onClose={close} onDone={msg => { setSheet(null); setToast(msg); cloud.reload(); }} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
