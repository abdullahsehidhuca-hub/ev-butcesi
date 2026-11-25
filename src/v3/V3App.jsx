// Ev Bütçesi v3 arayüzü. Görsel düzen dış taslaktan (C tasarımı, 2026-11-08) uyarlandı.
// Yeni hesap motoruna (src/core) bağlıdır; eski uygulamadan (App.jsx) bağımsızdır ve /v3 adresinde açılır.
// Veri durumunu tutar, sekmeler arası geçişi ve kullanıcı işlemlerini çekirdek fonksiyonlarına iletir.

import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { computePeriod, periodOf, quickAdd, today, ValidationError, dueAllowances, applyAllowances, fundingNeeds, reconcileDue, eventCategoryName, deleteAccount, deleteObligation, deleteCategory } from "../core/index.js";
import { loadState, saveState, loadPref, savePref, newId, exportBackup, parseBackup, transactionsCsv, STORAGE_KEY, PLAN_KEY, THEME_KEY, BACKUP_KEY, CLOUD_BASE_KEY, LOCAL_COPY_KEY, SAMPLE_KEY, SAMPLE_PLAN_KEY } from "./store.js";
import { useCloud } from "./useCloud.js";
import { useTestCloud } from "./testCloud.js";
import { stampCreatedBy } from "./sync.js";
import { convertLegacy, isLegacyData } from "./legacyImport.js";
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
import EkstreSheet from "./screens/EkstreSheet.jsx";
import DevredenSheet from "./screens/DevredenSheet.jsx";
import BlokeSheet from "./screens/BlokeSheet.jsx";
import BirikimAktarSheet from "./screens/BirikimAktarSheet.jsx";
import KartOdemeSheet from "./screens/KartOdemeSheet.jsx";
import BirikimSheet, { AlSatSheet, HedefSheet } from "./screens/BirikimSheet.jsx";
import TaksitDeneSheet from "./screens/TaksitDeneSheet.jsx";
import DanismanSheet from "./screens/DanismanSheet.jsx";
import Giris, { BudgetPicker } from "./screens/Giris.jsx";
import { AccountEditSheet, CategoryEditSheet, ObligationEditSheet } from "./screens/TanimSheet.jsx";
import OdemeSecenekSheet from "./screens/OdemeSecenekSheet.jsx";
import KurulumBilgiSheet from "./screens/KurulumBilgiSheet.jsx";
import { PaySheet, AccountSheet, CategorySheet, ObligationSheet, InstallmentSheet, PayDaySheet, ResetSheet, ConfirmSheet } from "./Sheets.jsx";
import { isExpenseAccount } from "./setupGuide.js";
import "./v3.css";

// Hesap ve aile çekmeceleri Firebase'i doğrudan kullanır; tembel yüklenir ki Firebase kodu ilk çizimi geciktirmesin.
const HesapSheet = lazy(() => import("./screens/HesapSheet.jsx"));
const AileSheet = lazy(() => import("./screens/AileSheet.jsx"));
const BudgetNameSheet = lazy(() => import("./screens/AileSheet.jsx").then(m => ({ default: m.BudgetNameSheet })));
const EtkinlikSheet = lazy(() => import("./screens/EtkinlikSheet.jsx"));

const tabFromHash = () => {
  const id = typeof location !== "undefined" ? location.hash.slice(1) : "";
  return TABS.some(([t]) => t === id) ? id : "home";
};

// sample: yalnız geliştirmede /v3?ornek ile gelir (src/main.jsx). Örnek veri ayrı anahtarda tutulur,
// tarih örneğin senaryosuna sabitlenir; gerçek v3 verisi okunmaz ve yazılmaz.
export default function V3App({ sample }) {
  const stateKey = sample ? sample.STATE_KEY || SAMPLE_KEY : STORAGE_KEY;
  const planKey = sample ? sample.PLAN_KEY || SAMPLE_PLAN_KEY : PLAN_KEY;
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
  // Oturum durumu 5 sn içinde gelmezse (bağlantı ya da kabuk sorunu) ekran "Yükleniyor"da kalmaz; giriş ekranı açılır.
  const [authSlow, setAuthSlow] = useState(false);
  const scroll = useRef(null);
  const firstRender = useRef(true);
  const userRef = useRef(null);

  // Buluttan gelen veri (aile üyesinin değişikliği ya da ilk yükleme) durumun yerine geçer.
  const replaceState = useCallback(next => { stateRef.current = next; setState(next); }, []);
  // Örnek veri modunda bulut kapalıdır; örnek veri hiçbir zaman Firebase'e yazılmaz. Giriş ve bütçe senaryoları
  // (testScenarios.js › cloud) bellekteki sahte hesapla (testCloud.js) çalışır; cloudOn giriş ve hesap ekranlarını açar.
  const realCloud = useCloud({ enabled: !sample, stateRef, replaceState, baseKey: CLOUD_BASE_KEY, localCopyKey: LOCAL_COPY_KEY });
  const testCloud = useTestCloud(sample?.cloud);
  const cloud = testCloud || realCloud;
  const cloudOn = !sample || !!testCloud;
  userRef.current = cloud.user?.uid || null;
  const synced = cloud.status === "synced" || cloud.status === "offline";

  useEffect(() => { document.title = "Ev Bütçesi"; }, []);
  useEffect(() => { const t = setTimeout(() => setAuthSlow(true), 5000); return () => clearTimeout(t); }, []);

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
  // Haftalık yüklemeler (konfor kartı gibi): bekleyen yükleme aktarım olarak yazılır. Bulut verisi gelmeden yazılmaz;
  // kayıt kimliği hesap ve tarihten türediği için iki cihaz aynı yüklemeyi yazsa da tek kayıt olur.
  useEffect(() => {
    if (!sample && !synced) return;
    if (dueAllowances(state, todayDate).length) commit(s => applyAllowances(s, todayDate, { userId: userRef.current }));
  }, [state, todayDate, synced]);
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
    // v3 yedeği aynen; eski uygulamanın yedeği (ev-butcesi-YYYY.MM.DD.json) dönüştürülerek yüklenir.
    restore: async file => {
      let next, legacy = null;
      try {
        const text = await file.text();
        let raw = null;
        try { raw = JSON.parse(text); } catch { /* parseBackup anlaşılır hata verir */ }
        if (isLegacyData(raw)) { legacy = convertLegacy(raw, { today: todayDate, userId: userRef.current }); next = legacy.state; }
        else next = parseBackup(text);
      } catch (e) { setToast(e.message); return; }
      const n = Object.keys(next.transactions).length;
      const where = synced ? "Aile hesabındaki verinin (tüm üyeler için)" : "Bu cihazdaki verinin";
      const intro = legacy
        ? `Eski uygulamanın yedeği: ${legacy.counts.accounts} hesap, ${legacy.counts.obligations} düzenli ödeme / taksit ve ${n} işlem aktarılacak.${legacy.warnings.length ? ` ${legacy.warnings.length} kayıt aktarılamadı (${legacy.warnings[0]})` : ""}`
        : `Yedekte ${Object.keys(next.accounts).length} hesap ve ${n} işlem var.`;
      if (!confirm(`${intro} ${where} yerine geçsin mi?`)) return;
      commit(() => next);
      setToast(legacy ? "Eski uygulamanın verisi aktarıldı" : "Yedek geri yüklendi");
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
  // Bankayla karşılaştırma hatırlatması: tek hesap düzeninde ayda bir, diğerlerinde haftada bir; işlem yokken sorulmaz.
  const settingsPatch = patch => commit(s => ({ ...s, settings: { ...s.settings, ...patch } }));
  const dueChecks = Object.keys(state.transactions).length ? reconcileDue(state, todayDate, state.settings.trackingMode === "single" ? 30 : 7) : [];
  const reconcileReminder = dueChecks.length
    ? { names: dueChecks.map(a => a.name).join(", "), onSnooze: () => settingsPatch({ reconcileSnooze: addDays(todayDate, 3) }) }
    : null;
  // Talimat hesabı: talimatlı ödemeler için bu dönem eksik kalan tutar ana hesaptan tek dokunuşla aktarılır.
  const mainId = mainAccountId(state);
  const funding = mainId ? fundingNeeds(state, todayDate, mainId).map(n => ({
    ...n,
    onFund: () => {
      const errs = commit(s => quickAdd(s, { type: "transfer", amount: n.amount, accountId: mainId, toAccountId: n.accountId, note: `${n.name} talimat aktarımı` }, { id: newId(), now: new Date(`${todayDate}T${new Date().toTimeString().slice(0, 8)}`) }).state);
      setToast(errs ? errs[0] : `${fmt(n.amount)} ${n.name} hesabına aktarıldı`);
    },
    onSkip: () => settingsPatch({ fundingSkips: [...(state.settings.fundingSkips || []), n.key] })
  })) : [];
  // Kısa süreli bütçedeki kendi harcamalarını ev bütçesine ekler: kart harcaması ilk kredi kartına, nakit harcama
  // nakit hesabına (yoksa varsayılan hesaba) yazılır. Eklenenler settings.eventExports'ta tutulur, iki kez eklenmez.
  const exportEvent = (eventId, eventName, list) => {
    if (!confirm(`${list.length} harcama (${fmt(list.reduce((a, e) => a + e.amount, 0))}) ev bütçesine eklensin mi?`)) return;
    const errs = commit(s => {
      const accs = Object.values(s.accounts).filter(a => !a.archived && a.currency === "TRY");
      const fallback = s.settings.defaultAccountId || mainAccountId(s);
      const card = accs.find(a => a.type === "credit")?.id || fallback;
      const cash = accs.find(a => a.type === "cash")?.id || fallback;
      let next = s;
      for (const e of list) {
        next = quickAdd(next, { amount: e.amount, categoryId: null, accountId: e.method === "card" ? card : cash, note: `${eventName}: ${e.note || eventCategoryName(e.category)}` },
          { id: newId(), now: new Date(`${e.date}T12:00:00`) }).state;
      }
      const done = [...(s.settings.eventExports?.[eventId] || []), ...list.map(e => e.id)];
      return { ...next, settings: { ...next.settings, eventExports: { ...(next.settings.eventExports || {}), [eventId]: done } } };
    });
    setToast(errs ? errs[0] : `${list.length} harcama ev bütçesine eklendi`);
  };
  const reloadSample = () => { testCloud?.reset(); setSheet(null); commit(() => sample.buildSampleState()); setOverrides({}); setToast("Örnek veri yeniden yüklendi"); };
  // Yapay zekâ çağrıları oturum jetonuyla yapılır; örnek veri modunda kapalıdır (giriş çekmecesi de yoktur).
  const aiUser = sample ? null : cloud.user;
  const toLogin = cloudOn ? () => setSheet({ name: "login" }) : null;
  // Hesaptan çıkış (Ayarlar › Hesap): oturum kapanınca giriş ekranı açılır. Firebase kodu tembel yüklenir.
  const logOut = !cloudOn ? null : async () => {
    if (!confirm("Çıkış yapılsın mı? Verileriniz silinmez. Tekrar giriş yaptığınızda yerinde olur.")) return;
    try { await (testCloud ? testCloud.api : await import("./family.js")).logOut(); go("home"); }
    catch { setToast("Çıkış yapılamadı; bağlantınızı kontrol edip yeniden deneyin"); }
  };
  const props = { state, commit, onClose: close, today: todayDate, period, members, aiUser };
  // Karşılamadaki satırın × düğmesi: hesap, kategori ya da düzenli kalem onay çekmecesiyle (ConfirmSheet) silinir. Maaşı ya da
  // ödemesi bağlı hesap, ödemesi bağlı kategori silinmez.
  const recordOf = (kind, id) => kind === "account" ? state.accounts[id] : kind === "category" ? state.categories[id] : state.obligations[id];
  const setupRemove = (kind, id) => { if (recordOf(kind, id)) setSheet({ name: "remove", kind, id }); };
  const removeText = (kind, rec) => kind === "account" ? ["Hesabı sil", "Hesap ve bugünkü tutarı kurulumdan ve Ayarlar'dan kalkar. Geri alınamaz."]
    : kind === "category" ? ["Kategoriyi sil", "Kategori ve limiti listeden kalkar. Geri alınamaz."]
    : rec.kind === "income" ? ["Geliri sil", "Bu gelir artık dönem hesabına girmez. Geri alınamaz."] : ["Ödemeyi sil", "Bu ödeme artık yaklaşan ödemelerde görünmez. Geri alınamaz."];
  const removeNow = (kind, id) => {
    const rec = recordOf(kind, id);
    setSheet(null);
    if (!rec) return;
    const errs = commit(s => {
      if (kind === "category") return deleteCategory(s, id);
      if (kind !== "account") return deleteObligation(s, id);
      const next = deleteAccount(s, id);
      return next.settings.defaultAccountId === id ? { ...next, settings: { ...next.settings, defaultAccountId: null } } : next;
    });
    setToast(!errs ? `${rec.name} silindi` : kind === "account" ? "Bu hesaba bağlı maaş ya da ödeme var; önce onları silin"
      : kind === "category" ? "Bu kategoriye bağlı ödeme var; önce ödemeyi silin" : errs[0].charAt(0).toLocaleUpperCase("tr-TR") + errs[0].slice(1));
  };
  // Hesap düzeni kurulum bitene kadar değişir. Kartlı düzenden tek hesaba geçerken kart ya da gider takibi hesabı varsa önce
  // sorulur: hesaplar silinmez, yalnız kurulum adımlarında görünmez.
  const saveMode = mode => commit(s => ({ ...s, settings: { ...s.settings, trackingMode: mode } }));
  const setupMode = mode => {
    const hidden = mode === "single" && Object.values(state.accounts).some(a => a.type === "credit" || isExpenseAccount(a));
    if (hidden && state.settings.trackingMode !== "single") setSheet({ name: "modeSwitch" });
    else saveMode(mode);
  };
  const setupSetting = (key, value) => commit(s => ({ ...s, settings: { ...s.settings, [key]: value } }));
  // Yeni kurulan ya da katılınan bütçe (familyId) doğrudan açılır.
  const loginDone = (msg, familyId) => { setSheet(null); setToast(msg); if (familyId) cloud.choose(familyId); else cloud.reload(); };

  // İlk açılış ekranı: oturum ya da aile yoksa uygulama yerine giriş / kayıt / davet kodu seçenekleri gösterilir.
  // Oturum durumu daha bilinmiyorken (açılışın ilk anı) ekran zıplamasın diye yalnız "Yükleniyor" yazılır.
  // Oturum durumu gelene kadar bu cihazda son bilinen durum (cloud.hint) kullanılır: girişsizse giriş ekranı, aile
  // hesabındaysa uygulama hemen çizilir. İpucu yoksa (ilk kurulum) en çok 5 sn beklenir.
  // Örnek veri bandı: test ekranında giriş ekranından da Baştan yükle, Test ekranları ve Gerçek veriye geç'e ulaşılır.
  const sampleBand = sample && (
    <div className="v3-alert" role="status">
      <strong>{sample.SAMPLE_LABEL || "Örnek veri"} · bugün {new Date(`${todayDate}T12:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })} sayılıyor</strong>
      Yalnız bu cihazda, gerçek veriden ayrı tutulur. Değişiklikleri deneyebilirsiniz.
      {sample.SAMPLE_NOTE && <span>{sample.SAMPLE_NOTE}</span>}
      <span className="row" style={{ gap: 16, flexWrap: "wrap" }}>
        <button type="button" className="v3-link" style={{ padding: 0 }} onClick={reloadSample}>Baştan yükle</button>
        <a className="v3-link" href="/?test">Test ekranları</a>
        <a className="v3-link" href="/v3">Gerçek veriye geç</a>
      </span>
    </div>
  );

  const authWaiting = cloudOn && cloud.status === "loading" && !cloud.user;
  const gate = cloudOn && (cloud.status === "signedOut" || cloud.status === "noFamily" || cloud.status === "choose" || (authWaiting && (cloud.hint === "signedOut" || (!cloud.hint && authSlow))));
  const authPending = authWaiting && !cloud.hint && !authSlow;
  if (gate || authPending) {
    return (
      <div className="v3">
        <main className="v3-scroll is-gate">
          {sampleBand}
          {cloud.status === "choose"
            ? <BudgetPicker budgets={cloud.budgets} onPick={cloud.choose} open={start => setSheet({ name: "login", start })} />
            : <Giris status={authPending ? "loading" : cloud.status === "noFamily" ? "noFamily" : "signedOut"} email={cloud.user?.email} open={start => start === "events" && testCloud ? setToast("Kısa süreli bütçe kurmak gerçek veri gerektirdiği için test ekranlarında açılmıyor.") : setSheet(start === "events" ? { name: "events", start: "new" } : { name: "login", start })} />}
        </main>
        <Suspense fallback={null}>
          {sheet?.name === "login" && <HesapSheet key={sheet.start} cloud={cloud} api={testCloud?.api} start={sheet.start} onClose={close} onDone={loginDone} />}
          {sheet?.name === "events" && !sample && <EtkinlikSheet user={cloud.user} today={todayDate} start={sheet.start} onClose={close} onToast={setToast} />}
        </Suspense>
        {toast && <div className="toast" role="status">{toast}</div>}
      </div>
    );
  }

  return (
    <div className="v3">
      <main className="v3-scroll" ref={scroll} key={tab}>
        {sampleBand}
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
        {tab === "home" && <Ozet {...common} onResolve={() => setSheet({ name: "resolve" })} onPay={pay} onOpenPayments={() => go("plan")} onOpenSettings={() => go("settings")} backupDue={backupDue}
          onSetupDone={() => commit(s => ({ ...s, settings: { ...s.settings, setupDone: true } }))}
          onSetupMode={setupMode}
          onSetupRemove={setupRemove} onSetupSetting={setupSetting}
          reconcileReminder={reconcileReminder} funding={funding} />}
        {tab === "report" && <Rapor {...common} onCategory={(categoryId, p) => setSheet({ name: "txlist", filter: { period: p, categoryId } })}
          onGoal={id => setSheet({ name: "goal", id })} onSavings={() => setSheet({ name: "savings" })} onAdvisor={() => setSheet({ name: "advisor" })} />}
        {tab === "plan" && <Odemeler {...common} onPay={pay} onAdd={Object.keys(state.accounts).length ? () => setSheet({ name: "obligation", kind: "fixed" }) : null}
          onTrial={Object.keys(state.accounts).length ? () => setSheet({ name: "trial" }) : null}
          onItem={it => setSheet(it.type === "card" ? { name: "blocked" } : { name: "obligationEdit", id: it.obligationId })} />}
        {tab === "settings" && <Ayarlar {...common} theme={theme} onTheme={setTheme} backup={backup} cloud={cloudOn ? cloud : { status: "off" }} onLogOut={logOut} />}
      </main>

      <TabBar tab={tab} onTab={go} onAdd={() => setSheet({ name: "quick" })} />

      {sheet?.name === "quick" && <EkleSheet {...props} initialMethod={sheet.method} onNeedAccount={(type, method) => setSheet({ name: "account", type, payMethod: method, back: { name: "quick", method } })} onSaved={a => setToast(`${fmt(a)} eklendi`)} />}
      {sheet?.name === "resolve" && <CozSheet state={state} today={todayDate} overrides={overrides} onClose={close} onApply={apply} />}
      {sheet?.name === "balance" && <BakiyeSheet {...props} onToast={setToast} onStatement={() => setSheet({ name: "statement", back: { name: "balance" } })}
        onToBudget={() => setSheet({ name: "toBudget", back: { name: "balance" } })}
        onCarryover={p => setSheet({ name: "carryover", period: p, back: { name: "balance" } })} />}
      {sheet?.name === "statement" && <EkstreSheet {...props} onClose={closeTo(sheet.back)} onToast={setToast} onLogin={toLogin} />}
      {sheet?.name === "advisor" && <DanismanSheet {...props} onLogin={toLogin} />}
      {sheet?.name === "pay" && <PaySheet {...props} onClose={closeTo(sheet.back)} period={sheet.period} target={sheet.target} />}
      {sheet?.name === "txlist" && <TxListSheet state={state} members={members} initial={sheet.filter} onClose={close}
        onEdit={(id, filter) => setSheet({ name: "tx", id, back: { name: "txlist", filter } })} />}
      {sheet?.name === "tx" && <TxEditSheet {...props} key={sheet.id} id={sheet.id} onClose={closeTo(sheet.back)} onToast={setToast} />}
      {sheet?.name === "close" && <KapatSheet {...props} onToast={setToast}
        onPay={(item, p) => pay({ type: "obligation", obligationId: item.obligationId, period: p }, { name: "close" })}
        onCarryover={p => setSheet({ name: "carryover", period: p })} />}
      {sheet?.name === "carryover" && <DevredenSheet {...props} key={sheet.period} period={sheet.period} onToast={setToast} onClose={closeTo(sheet.back)}
        onFixRecords={p => setSheet({ name: "txlist", filter: { period: p } })} />}
      {sheet?.name === "blocked" && <BlokeSheet {...props} onClose={closeTo(sheet.back)} />}
      {sheet?.name === "toBudget" && <BirikimAktarSheet {...props} onClose={closeTo(sheet.back)} onToast={setToast} />}
      {sheet?.name === "cardmode" && <KartOdemeSheet {...props} onToast={setToast} />}
      {sheet?.name === "savings" && <BirikimSheet {...props} onToast={setToast} open={sh => setSheet({ ...sh, back: sh.back || { name: "savings" } })}
        onToBudget={() => setSheet({ name: "toBudget", back: { name: "savings" } })} />}
      {sheet?.name === "move" && <AlSatSheet {...props} mode={sheet.mode} onToast={setToast} onClose={closeTo(sheet.back)} />}
      {sheet?.name === "goal" && <HedefSheet {...props} key={sheet.id || "new"} id={sheet.id} preset={sheet.preset} onToast={setToast} onClose={closeTo(sheet.back)} />}
      {sheet?.name === "trial" && <TaksitDeneSheet {...props} onSave={initial => setSheet({ name: "installment", initial })} />}
      {sheet?.name === "account" && <AccountSheet {...props} key={sheet.side || "account"} initialType={sheet.type} payMethod={sheet.payMethod} side={sheet.side} onClose={closeTo(sheet.back)} />}
      {sheet?.name === "setupInfo" && <KurulumBilgiSheet key={sheet.topic} topic={sheet.topic} onClose={close} onNext={sheet.next ? () => setSheet(sheet.next) : null} />}
      {sheet?.name === "payMethods" && <OdemeSecenekSheet {...props} onToast={setToast} />}
      {sheet?.name === "category" && <CategorySheet {...props} key={sheet.group || "category"} group={sheet.group} />}
      {sheet?.name === "obligation" && <ObligationSheet {...props} kind={sheet.kind} setup={sheet.setup} />}
      {sheet?.name === "accountEdit" && <AccountEditSheet {...props} key={sheet.id} id={sheet.id} onToast={setToast} />}
      {sheet?.name === "categoryEdit" && <CategoryEditSheet {...props} key={sheet.id} id={sheet.id} onToast={setToast} />}
      {sheet?.name === "obligationEdit" && <ObligationEditSheet {...props} key={sheet.id} id={sheet.id} onToast={setToast} />}
      {sheet?.name === "installment" && <InstallmentSheet {...props} initial={sheet.initial} />}
      {sheet?.name === "payday" && <PayDaySheet {...props} />}
      {sheet?.name === "reset" && <ResetSheet {...props} synced={synced} />}
      {sheet?.name === "modeSwitch" && <ConfirmSheet title="Tek hesap düzenine geçilsin mi?" submit="Geç" onClose={close}
        text="Kredi kartlarınız ve gider takibi hesaplarınız silinmez. Kurulum adımlarında görünmez, Ayarlar'da durur."
        onConfirm={() => { saveMode("single"); close(); }} />}
      {sheet?.name === "remove" && recordOf(sheet.kind, sheet.id) && (() => {
        const rec = recordOf(sheet.kind, sheet.id);
        const [submit, text] = removeText(sheet.kind, rec);
        return <ConfirmSheet title={`${rec.name} silinsin mi?`} text={text} submit={submit} onClose={close} onConfirm={() => removeNow(sheet.kind, sheet.id)} />;
      })()}
      <Suspense fallback={null}>
        {sheet?.name === "login" && cloudOn && <HesapSheet cloud={cloud} api={testCloud?.api} start={sheet.start} onClose={close} onDone={loginDone} />}
        {sheet?.name === "family" && cloudOn && <AileSheet cloud={cloud} api={testCloud?.api} members={members} onClose={close} onToast={setToast} />}
        {sheet?.name === "budgetName" && cloudOn && <BudgetNameSheet cloud={cloud} api={testCloud?.api} onClose={close} onToast={setToast} />}
        {sheet?.name === "events" && !sample && <EtkinlikSheet user={cloud.user} today={todayDate} start={sheet.start} onClose={close} onToast={setToast}
          onExport={Object.keys(state.accounts).length ? exportEvent : null} exportedOf={id => new Set(state.settings.eventExports?.[id] || [])} />}
      </Suspense>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
