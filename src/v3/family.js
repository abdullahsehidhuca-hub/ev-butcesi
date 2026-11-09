// v3 hesap ve aile işlemleri. Veri biçimi kök uygulamayla aynıdır (userFamilies, families/{id}/members,
// invitations, nameIndex); veritabanı kuralları (database.rules.json) bu yazımlara göre yazılmıştır.
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification,
  GoogleAuthProvider, signInWithPopup, signOut, updateProfile
} from "firebase/auth";
import { getDatabase, ref, get, set, update } from "firebase/database";
import { firebaseConfig } from "../firebaseConfig.js";

export const firebase = () => {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return { auth: getAuth(app), db: getDatabase(app) };
};

const nameKey = n => n.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim().replace(/[.#$\[\]\/]/g, "_");

// Firebase hata kodlarını kullanıcıya anlaşılır Türkçe iletiye çevirir.
export function authMessage(e) {
  switch (e?.code) {
    case "auth/invalid-credential": case "auth/wrong-password": case "auth/user-not-found": return "E-posta ya da şifre yanlış.";
    case "auth/invalid-email": return "Geçerli bir e-posta adresi girin.";
    case "auth/email-already-in-use": return "Bu e-posta ile zaten bir hesap var; giriş yapın.";
    case "auth/weak-password": return "Şifre en az 6 karakter olmalı.";
    case "auth/too-many-requests": return "Çok fazla deneme yapıldı; biraz sonra tekrar deneyin.";
    case "auth/network-request-failed": return "İnternet bağlantısı yok; bağlantıyı kontrol edin.";
    case "auth/popup-blocked": return "Tarayıcı Google penceresini engelledi; açılır pencerelere izin verin.";
    case "PERMISSION_DENIED": case "permission-denied": return "Bu işlem için izniniz yok.";
    default: return e?.message || "Beklenmeyen bir hata oluştu.";
  }
}

async function registerName(db, name, email, familyId, uid) {
  const key = nameKey(name);
  if (!key) return;
  try {
    const existing = (await get(ref(db, `nameIndex/${key}`))).val();
    if (existing?.uid && existing.uid !== uid) return; // isim başkasına ait; ezilmez
    await set(ref(db, `nameIndex/${key}`), { email, familyId, uid });
  } catch { /* isimle giriş isteğe bağlıdır; hata aile kurulumunu durdurmaz */ }
}

// Yeni aile: kullanıcı yönetici olur, aile kimliği kendi uid'idir.
export async function createFamily(user, name) {
  const { db } = firebase();
  const familyId = user.uid;
  const result = { familyId, role: "admin", name };
  await set(ref(db, `families/${familyId}/admin`), user.uid);
  await set(ref(db, `families/${familyId}/members/${user.uid}`), { name, email: user.email, role: "admin", joinedAt: new Date().toISOString() });
  await set(ref(db, `userFamilies/${user.uid}`), result);
  await registerName(db, name, user.email, familyId, user.uid);
  return result;
}

// Davet kodu geçerliyse davet bilgisini döner; değilse null.
export async function lookupInvitation(code) {
  const { db } = firebase();
  const inv = (await get(ref(db, `invitations/${code}`))).val();
  return inv && inv.used === false && inv.familyId ? inv : null;
}

// Üye kaydı ve kodun kullanıldı işareti tek atomik yazımda gider (kurallar ikisini birlikte ister).
export async function joinFamily(user, code, inv, name) {
  const { db } = firebase();
  const memberName = name || inv.name || user.email.split("@")[0];
  await update(ref(db), {
    [`families/${inv.familyId}/members/${user.uid}`]: { name: memberName, email: user.email, role: "member", inviteCode: code, joinedAt: new Date().toISOString() },
    [`invitations/${code}/used`]: true,
  });
  await set(ref(db, `userFamilies/${user.uid}`), { familyId: inv.familyId, code, role: "member", name: memberName });
  await registerName(db, memberName, user.email, inv.familyId, user.uid);
  return { familyId: inv.familyId, role: "member", name: memberName };
}

export async function signInEmail(email, password) {
  return (await signInWithEmailAndPassword(firebase().auth, email.trim(), password)).user;
}

export async function registerEmail(name, email, password) {
  const { auth } = firebase();
  const user = (await createUserWithEmailAndPassword(auth, email.trim(), password)).user;
  try { await updateProfile(user, { displayName: name }); } catch {}
  try { await sendEmailVerification(user); } catch {}
  return user;
}

export async function signInGoogle() {
  return (await signInWithPopup(firebase().auth, new GoogleAuthProvider())).user;
}

export const logOut = () => signOut(firebase().auth);
