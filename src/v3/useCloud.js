// v3 bulut bağlantısı: eski uygulamayla aynı Firebase projesi ve oturumu (aynı adreste giriş bir kez yapılır).
// Veri families/{familyId}/v3 yolunda tutulur; eski uygulamanın families/{familyId}/data yoluna dokunulmaz.
// Birleştirme kuralları src/v3/sync.js'tedir; burada yalnız Firebase'e bağlanılır.

import { useCallback, useEffect, useRef, useState } from "react";
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getDatabase, ref, get, onValue, update, set } from "firebase/database";
import { firebaseConfig } from "../firebaseConfig.js";
import { cloudPath, mergeRemote, pendingFor, toCloud } from "./sync.js";
import { loadPref, savePref } from "./store.js";

const COLORS = ["indigo", "orange", "teal", "pink", "green"];
const firebase = () => {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return { auth: getAuth(app), db: getDatabase(app) };
};

// status: off (örnek veri) · loading · signedOut · noFamily · synced · offline · needsUpload · error
export function useCloud({ enabled, stateRef, replaceState, baseKey, localCopyKey }) {
  const [status, setStatus] = useState(enabled ? "loading" : "off");
  const [error, setError] = useState(null);
  const [members, setMembers] = useState({});
  const [user, setUser] = useState(null);
  const [familyId, setFamilyId] = useState(null);
  const base = useRef(null);
  const online = useRef(true);
  const target = useRef(null);

  const write = useCallback(patch => {
    if (!target.current || !Object.keys(patch).length) return;
    update(target.current, patch).catch(e => { setError(e?.message || String(e)); setStatus("error"); });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const { auth, db } = firebase();
    let stopData = () => {}; let stopConn = () => {}; let alive = true;
    const stopAuth = onAuthStateChanged(auth, async u => {
      stopData(); stopConn(); target.current = null; base.current = null;
      setUser(u);
      if (!u) { setStatus("signedOut"); return; }
      setStatus("loading");
      let fid = null;
      try { fid = (await get(ref(db, `userFamilies/${u.uid}`))).val()?.familyId || null; }
      catch (e) { if (alive) { setError(e?.message || String(e)); setStatus("error"); } return; }
      if (!alive) return;
      if (!fid) { setStatus("noFamily"); return; }
      setFamilyId(fid);
      get(ref(db, `families/${fid}/members`)).then(s => {
        const list = Object.entries(s.val() || {});
        setMembers(Object.fromEntries(list.map(([id, m], i) => [id, { id, name: m.name || "Üye", initial: (m.name || "?").charAt(0).toLocaleUpperCase("tr-TR"), color: COLORS[i % COLORS.length], self: id === u.uid }])));
      }).catch(() => {});

      // Son görülen bulut (base) bu cihazda saklanır; çevrimdışı değişiklikler ona göre bulunur.
      const saved = loadPref(baseKey, null);
      base.current = saved?.familyId === fid ? saved.tree : null;
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
      }, e => { setError(e?.message || String(e)); setStatus("error"); });
    });
    return () => { alive = false; stopAuth(); stopData(); stopConn(); };
  }, [enabled]);

  // Her yerel değişiklikten sonra çağrılır: son görülen buluttan farkı yazar.
  const push = useCallback(state => {
    if (base.current == null || !target.current) return;
    write(pendingFor(base.current, state));
  }, [write]);

  // Bulutta v3 verisi yokken bu cihazdakini aileye yükler (yalnız kullanıcı onayıyla).
  const upload = useCallback(() => {
    if (!target.current) return;
    // base boş kalır: yazma sonrası gelen bulut verisi bu cihazdakiyle aynı olduğu için olduğu gibi alınır.
    setStatus("loading");
    set(target.current, toCloud(stateRef.current)).catch(e => { setError(e?.message || String(e)); setStatus("error"); });
  }, []);

  return { status, error, members, user, familyId, push, upload };
}
