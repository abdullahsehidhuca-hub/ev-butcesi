// v3 hesap ve aile işlemleri. Veri biçimi eski uygulamayla aynıdır (userFamilies, families/{id}/members, invitations);
// veritabanı kuralları (database.rules.json) bu yazımlara göre yazılmıştır. v3 isimle giriş kullanmaz ve herkese açık
// isim dizinine (nameIndex: ad → e-posta) yazmaz.
import {
  signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification,
  GoogleAuthProvider, signInWithPopup, signOut, updateProfile
} from "firebase/auth";
import { ref, get, set, update } from "firebase/database";
import { firebase, isNativeShell } from "./firebaseApp.js";

export { firebase };
// Google girişi açılır pencere ister; iOS / Android kabuğunda çalışmaz (yerel eklenti ya da Apple ile Giriş gerekir).
export const googleAvailable = () => !isNativeShell();

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

// Yeni aile: kullanıcı yönetici olur, aile kimliği kendi uid'idir.
export async function createFamily(user, name) {
  const { db } = firebase();
  const familyId = user.uid;
  const result = { familyId, role: "admin", name };
  await set(ref(db, `families/${familyId}/admin`), user.uid);
  await set(ref(db, `families/${familyId}/members/${user.uid}`), { name, email: user.email, role: "admin", joinedAt: new Date().toISOString() });
  await set(ref(db, `userFamilies/${user.uid}`), result);
  return result;
}

// Davet kodu: 6 karakter, harf ve rakam karışık (karışan 0/O, 1/I/L yok; 31^6 ≈ 887 milyon olasılık), güvenli rastgele
// üreteçle. Kod 7 gün geçerlidir ve bir kez kullanılır; kurallar ikisini de denetler.
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const INVITE_DAYS = 7;
export function inviteCode() {
  let code = "";
  while (code.length < 6) {
    for (const b of crypto.getRandomValues(new Uint8Array(12))) {
      if (b < 248 && code.length < 6) code += CODE_CHARS[b % 31]; // 248 = 31 × 8: her karakter eşit olasılıklı
    }
  }
  return code;
}
// Kullanıcının yazdığı kod: boşluk / tire atılır, küçük harf büyütülür (eski uygulamanın rakam kodları da geçer).
export const normalizeCode = c => String(c ?? "").toLocaleUpperCase("en-US").replace(/[^0-9A-Z]/g, "");

// Aileyi kuran kişi (aile kimliği kendi uid'i) üye için davet kodu üretir. Kurallar yalnız ona izin verir
// (invitations/$code: familyId === auth.uid). Kod başka bir ailenin davetiyle çakışırsa yenisi denenir.
export async function createInvitation(user, name, email) {
  const { db } = firebase();
  for (let i = 0; i < 5; i++) {
    const code = inviteCode();
    if ((await get(ref(db, `invitations/${code}`))).exists()) continue;
    const now = Date.now();
    await set(ref(db, `invitations/${code}`), { familyId: user.uid, name: name.trim(), email: email.trim().toLowerCase(), createdAt: new Date(now).toISOString(), expiresAt: now + INVITE_DAYS * 86400000, used: false });
    return code;
  }
  throw new Error("Davet kodu oluşturulamadı; yeniden deneyin.");
}

// Davet kodu geçerliyse (kullanılmamış, süresi dolmamış) davet bilgisini döner; değilse null.
export async function lookupInvitation(code) {
  const { db } = firebase();
  const inv = (await get(ref(db, `invitations/${code}`))).val();
  return inv && inv.used === false && inv.familyId && inv.expiresAt > Date.now() ? inv : null;
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
