// v3 bulut bağlantısı: eski uygulamayla aynı Firebase projesi ve oturumu (aynı adreste giriş bir kez yapılır).
// Veri families/{familyId}/v3 yolunda tutulur; eski uygulamanın families/{familyId}/data yoluna dokunulmaz.
// Birleştirme kuralları src/v3/sync.js'tedir; burada yalnız Firebase'e bağlanılır.
//
// Açılış hızı: Firebase kodu ilk çizimden sonra yüklenir (dinamik import) ve oturum durumunun gelmesi beklenmez;
// bu cihazda son bilinen durum (hint: "signedOut" | "family") hemen kullanılır, gerçek durum gelince düzeltilir.
// İpucu yalnız hangi ekranın önce çizileceğini seçer; veri erişimini Firebase kuralları denetler.

import { useCallback, useEffect, useRef, useState } from "react";
import { budgetEntries, chooseBudget, cloudPath, mergeRemote, pendingFor, toCloud } from "./sync.js";
import { emptyState } from "../core/index.js";
import { loadPref, savePref } from "./store.js";

const COLORS = ["indigo", "orange", "teal", "pink", "green"];
export const AUTH_HINT_KEY = "evb-v3-oturum-ipucu";

// status: off (örnek veri) · loading · signedOut · noFamily · choose · synced · offline · needsUpload · error
// Birden çok bütçe takip eden kişiye her açılışta hangisini açacağı sorulur (choose); seçim yalnız bu açılış için tutulur.
export function useCloud({ enabled, stateRef, replaceState, baseKey, localCopyKey }) {
  const [status, setStatus] = useState(enabled ? "loading" : "off");
  const [error, setError] = useState(null);
  const [members, setMembers] = useState({});
  const [user, setUser] = useState(null);
  const [familyId, setFamilyId] = useState(null);
  const [nonce, setNonce] = useState(0);
  const [budgets, setBudgets] = useState([]); // [{ id, role, name, count, admin }]
  const pick = useRef({ id: null, ask: false });
  const [hint] = useState(() => (enabled ? loadPref(AUTH_HINT_KEY, null)?.state || null : null));
  const base = useRef(null);
  const online = useRef(true);
  const target = useRef(null);
  const dbApi = useRef(null); // firebaseApp.js modülü (update / set; yüklenince)

  const fail = useCallback(e => { setError(e?.message || String(e)); setStatus("error"); }, []);
  const write = useCallback(patch => {
    if (!target.current || !dbApi.current || !Object.keys(patch).length) return;
    dbApi.current.update(target.current, patch).catch(fail);
  }, [fail]);

  useEffect(() => {
    if (!enabled) return;
    let stopAuth = () => {}; let stopData = () => {}; let stopConn = () => {}; let alive = true;
    (async () => {
      let fb;
      try { fb = await import("./firebaseApp.js"); }
      catch (e) { if (alive) fail(e); return; }
      if (!alive) return;
      const { onAuthStateChanged, ref, get, onValue, firebase } = fb;
      dbApi.current = fb;
      const { auth, db } = firebase();
      stopAuth = onAuthStateChanged(auth, async u => {
        stopData(); stopConn(); target.current = null; base.current = null;
        setUser(u);
        if (!u) { savePref(AUTH_HINT_KEY, { state: "signedOut" }); setStatus("signedOut"); return; }
        setStatus("loading");
        let list = [];
        try {
          // userBudgets yeni kuraldır; kurallar yayınlanmadan okunamazsa eski tek bütçe kaydıyla devam edilir.
          const [legacy, multi] = await Promise.all([
            get(ref(db, `userFamilies/${u.uid}`)).then(x => x.val()),
            get(ref(db, `userBudgets/${u.uid}`)).then(x => x.val(), () => null)
          ]);
          // Erişimi kaldırılmış bütçe okunamaz; listeden düşer.
          // Bütçe verisinin tamamı değil, yalnız adı, kurucusu ve üyeleri okunur.
          const info = id => Promise.all(["name", "admin", "members"].map(k => get(ref(db, `families/${id}/${k}`)).then(x => x.val())));
          list = (await Promise.all(budgetEntries(multi, legacy).map(b => info(b.id).then(([name, adminUid, mem]) => {
            const admin = b.id === u.uid || adminUid === u.uid;
            if (!admin && !mem?.[u.uid]) return null;
            return { id: b.id, role: admin ? "admin" : "member", admin, name: name || null, count: Object.keys(mem || {}).length || 1 };
          }, () => null)))).filter(Boolean);
        }
        catch (e) { if (alive) fail(e); return; }
        if (!alive) return;
        setBudgets(list);
        if (!list.length) { savePref(AUTH_HINT_KEY, null); setStatus("noFamily"); return; }
        savePref(AUTH_HINT_KEY, { state: "family" });
        const fid = chooseBudget(list, pick.current.id, pick.current.ask);
        if (!fid) { setFamilyId(null); setMembers({}); setStatus("choose"); return; }
        pick.current = { id: fid, ask: false };
        setFamilyId(fid);
        get(ref(db, `families/${fid}/members`)).then(s => {
          const list = Object.entries(s.val() || {});
          setMembers(Object.fromEntries(list.map(([id, m], i) => [id, { id, name: m.name || "Üye", initial: (m.name || "?").charAt(0).toLocaleUpperCase("tr-TR"), color: COLORS[i % COLORS.length], self: id === u.uid }])));
        }).catch(() => {});

        // Son görülen bulut (base) bu cihazda saklanır; çevrimdışı değişiklikler ona göre bulunur.
        const saved = loadPref(baseKey, null);
        base.current = saved?.familyId === fid ? saved.tree : null;
        // Başka bütçeye geçildi: bu cihazdaki veri önceki bütçenindir; yenisine karışmasın diye kopyası saklanıp boşaltılır.
        if (saved?.familyId && saved.familyId !== fid) {
          savePref(localCopyKey, { savedAt: new Date().toISOString(), familyId: saved.familyId, state: stateRef.current });
          replaceState(emptyState());
        }
        target.current = ref(db, cloudPath(fid));
        stopConn = onValue(ref(db, ".info/connected"), s => {
          online.current = !!s.val();
          setStatus(st => online.current ? (st === "offline" ? "synced" : st) : st === "synced" || st === "loading" ? "offline" : st);
        });
        stopData = onValue(target.current, snap => {
          const remote = snap.val();
          const r = mergeRemote({ remote, base: base.current, local: stateRef.current });
          if (r.needsUpload) { setStatus("needsUpload"); return; }
          if (r.keepLocalCopy) savePref(localCopyKey, { savedAt: new Date().toISOString(), state: stateRef.current });
          base.current = remote || {};
          savePref(baseKey, { familyId: fid, tree: base.current });
          if (r.state !== stateRef.current) replaceState(r.state);
          setError(null);
          setStatus(online.current ? "synced" : "offline");
          write(r.pending);
        }, fail);
      });
    })();
    return () => { alive = false; stopAuth(); stopData(); stopConn(); };
  }, [enabled, nonce]);

  // Aile kurulunca ya da katılınca oturum değişmez; bağlantı yeniden kurulup aile okunur.
  const reload = useCallback(() => setNonce(n => n + 1), []);
  // Bütçe seçimi: id verilirse o açılır; verilmezse seçim ekranı gösterilir (Ayarlar › Başka bütçeye geç).
  const choose = useCallback(id => { pick.current = id ? { id, ask: false } : { id: null, ask: true }; setNonce(n => n + 1); }, []);

  // Her yerel değişiklikten sonra çağrılır: son görülen buluttan farkı yazar.
  const push = useCallback(state => {
    if (base.current == null || !target.current) return;
    write(pendingFor(base.current, state));
  }, [write]);

  // Bulutta v3 verisi yokken bu cihazdakini aileye yükler (yalnız kullanıcı onayıyla).
  const upload = useCallback(() => {
    if (!target.current || !dbApi.current) return;
    // base boş kalır: yazma sonrası gelen bulut verisi bu cihazdakiyle aynı olduğu için olduğu gibi alınır.
    setStatus("loading");
    dbApi.current.set(target.current, toCloud(stateRef.current)).catch(fail);
  }, [fail]);

  const current = budgets.find(b => b.id === familyId) || null;
  return { status, error, members, user, familyId, hint, push, upload, reload, budgets, current, choose };
}
