// Test ekranlarındaki giriş ve bütçe senaryoları için bellekte çalışan sahte hesap (testScenarios.js › cloud).
// useCloud ile aynı alanları, family.js ile aynı işlevleri (api) verir; HesapSheet ve AileSheet bu api ile çalışır.
// Firebase'i hiç yüklemez: hiçbir şey sunucuya gitmez, sayfa yenilenince ya da Baştan yükle ile ilk haline döner.
// Deneme kodları: K7M2QX yeni kişi (önce e-posta doğrulama adımı), H3P8WD üye hesabı olan kişi; diğer kodlar geçersiz.
import { useCallback, useMemo, useRef, useState } from "react";

const MAIN = { id: "b-ana", role: "admin", admin: true, name: "Ana bütçe", count: 2 };
const WORK = { id: "b-is", role: "member", admin: false, name: "İş yeri bütçesi", count: 3 };
const MEMBER_EMAIL = "uye@ornek.com";
const INVITES = {
  K7M2QX: { email: "yeni@ornek.com", name: "", familyId: WORK.id, budgetName: WORK.name },
  H3P8WD: { email: MEMBER_EMAIL, name: "", familyId: WORK.id, budgetName: WORK.name }
};

const person = (email, verified) => ({ uid: `test-${email}`, email, displayName: "Test üye", emailVerified: verified });
const budgetsOf = email => email === MEMBER_EMAIL ? [MAIN] : [MAIN, WORK];

// start: signedOut · noFamily · choose · synced
function initial(start) {
  if (start === "signedOut") return { user: null, budgets: [], familyId: null };
  if (start === "noFamily") return { user: person("yeni@ornek.com", true), budgets: [], familyId: null };
  return { user: person("test@ornek.com", true), budgets: [MAIN, WORK], familyId: start === "synced" ? MAIN.id : null };
}

const fail = (message, code) => Object.assign(new Error(message), code ? { code } : {});

// spec: { start } ya da yok (null döner, uygulama gerçek useCloud'u kullanır).
export function useTestCloud(spec) {
  const [world, setWorld] = useState(() => (spec ? initial(spec.start) : null));
  const ref = useRef(world);
  const verified = useRef(new Set());
  const put = useCallback(next => { ref.current = next; setWorld(next); }, []);
  const patch = useCallback(p => put({ ...ref.current, ...p }), [put]);
  const reset = useCallback(() => { verified.current = new Set(); put(initial(spec?.start)); }, [put, spec?.start]);
  const choose = useCallback(id => patch({ familyId: id || null }), [patch]);

  const api = useMemo(() => ({
    INVITE_DAYS: 7,
    authMessage: e => e?.message || "Bir sorun oluştu. Yeniden deneyin.",
    normalizeCode: c => String(c ?? "").toLocaleUpperCase("en-US").replace(/[^0-9A-Z]/g, ""),
    googleAvailable: () => false,
    signInGoogle: async () => {},
    signInEmail: async email => {
      const u = person(String(email).trim().toLowerCase(), true);
      patch({ user: u, budgets: budgetsOf(u.email), familyId: null });
      return u;
    },
    registerEmail: async (name, email) => {
      const mail = String(email).trim().toLowerCase();
      if (mail === MEMBER_EMAIL) throw fail("Bu e-postayla bir üye hesabı var.", "auth/email-already-in-use");
      const u = { ...person(mail, false), displayName: name || "Test üye" };
      patch({ user: u, budgets: [], familyId: null });
      return u;
    },
    sendPasswordReset: async () => {},
    // Yeni hesap ilk denemede doğrulanmamış sayılır (doğrulama adımı görünsün), "Doğruladım"da doğrulanmış olur.
    refreshVerified: async u => {
      if (u.emailVerified || verified.current.has(u.email)) return true;
      verified.current.add(u.email);
      return false;
    },
    resendVerification: async () => {},
    lookupInvitation: async code => INVITES[code] || null,
    joinFamily: async (u, code, inv) => {
      const has = ref.current.budgets.some(b => b.id === inv.familyId);
      patch({ budgets: has ? ref.current.budgets : [...ref.current.budgets, WORK] });
      return { familyId: inv.familyId };
    },
    createFamily: async (u, ownerName, budgetName) => {
      const b = { id: `b-test-${ref.current.budgets.length + 1}`, role: "admin", admin: true, name: String(budgetName).trim() || null, count: 1 };
      patch({ budgets: [...ref.current.budgets, b] });
      return { familyId: b.id };
    },
    renameBudget: async (id, name) => patch({ budgets: ref.current.budgets.map(b => b.id === id ? { ...b, name: String(name).trim() } : b) }),
    createInvitation: async () => "T4N9RB",
    logOut: async () => patch({ user: null, budgets: [], familyId: null })
  }), [patch]);

  if (!world) return null;
  const { user, budgets, familyId } = world;
  const status = !user ? "signedOut" : !budgets.length ? "noFamily" : !familyId ? "choose" : "synced";
  return {
    status, error: null, members: {}, user, familyId, hint: null, budgets,
    current: budgets.find(b => b.id === familyId) || null,
    push: () => {}, upload: () => {}, reload: () => {}, choose, reset, api
  };
}
