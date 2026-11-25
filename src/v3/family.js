// v3 hesap ve aile işlemleri. Veri biçimi eski uygulamayla aynıdır (userFamilies, families/{id}/members, invitations);
// veritabanı kuralları (database.rules.json) bu yazımlara göre yazılmıştır. v3 isimle giriş kullanmaz ve herkese açık
// isim dizinine (nameIndex: ad → e-posta) yazmaz.
import {
  signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification,
  GoogleAuthProvider, signInWithPopup, signOut, updateProfile, reload, sendPasswordResetEmail
} from "firebase/auth";
import { ref, get, set, update } from "firebase/database";
import { firebase, isNativeShell } from "./firebaseApp.js";

export { firebase };
// Google girişi açılır pencere ister; iOS / Android kabuğunda çalışmaz (yerel eklenti ya da Apple ile Giriş gerekir).
export const googleAvailable = () => !isNativeShell();

// Firebase hata kodlarını kullanıcıya anlaşılır Türkçe iletiye çevirir.
export function authMessage(e) {
  switch (e?.code) {
    case "auth/invalid-credential": case "auth/wrong-password": case "auth/user-not-found": return "E-posta ya da şifre yanlış. Hatırlamıyorsanız “Şifremi unuttum”a dokunun.";
    case "auth/invalid-email": return "Geçerli bir e-posta adresi girin.";
    case "auth/email-already-in-use": return "Bu e-postayla açılmış bir üye hesabı var. Giriş yapın.";
    case "auth/weak-password": return "Şifre en az 6 karakter olmalı.";
    case "auth/too-many-requests": return "Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar deneyin.";
    case "auth/network-request-failed": return "İnternet bağlantısı yok. Bağlanınca tekrar deneyin.";
    case "auth/popup-blocked": return "Tarayıcı Google penceresini engelledi. Açılır pencerelere izin verin.";
    case "PERMISSION_DENIED": case "permission-denied": return "Bu işlem için izniniz yok.";
    // Firebase'in kendi iletisi İngilizcedir; ekrana yalnız uygulamanın kendi (kodsuz) iletileri çıkar.
    default: return (!e?.code && e?.message) || "Beklenmeyen bir hata oluştu. Tekrar deneyin.";
  }
}

// Yeni bütçe: kullanıcı kurucu (yönetici) olur. İlk bütçenin kimliği kendi uid'idir (eski uygulamayla aynı); ikinci ve
// sonraki bütçeler "b-" ile başlayan rastgele kimlik alır (kurallar: families/$familyId). Bütçenin adı families/{id}/name'de,
// kullanıcının bütçe listesi userBudgets/{uid}/{id}'de tutulur. userFamilies/{uid} eski tek bütçe kaydıdır: yalnız
// boşsa yazılır, davetle katılma ya da yeni bütçe kurma onu ezmez (kişi önceki bütçesinden habersizce ayrılmasın).
export async function createFamily(user, ownerName, budgetName = "") {
  const { db } = firebase();
  const own = (await get(ref(db, `families/${user.uid}/admin`))).val();
  const familyId = own ? `b-${inviteId()}` : user.uid;
  const name = budgetName.trim();
  await set(ref(db, `families/${familyId}/admin`), user.uid);
  await update(ref(db, `families/${familyId}`), {
    ...(name ? { name } : {}),
    [`members/${user.uid}`]: { name: ownerName, email: user.email, role: "admin", joinedAt: new Date().toISOString() }
  });
  const result = { familyId, role: "admin", name: ownerName };
  await addToList(user, familyId, { role: "admin", name: ownerName });
  return result;
}

// Bütçe listesine ekler. Eski tek bütçe kaydı boşsa oraya da yazılır (yeni kurallar yayınlanmadan da ilk bütçe çalışır);
// doluysa yalnız userBudgets yazılır ve bu yazım başarısızsa hata yukarı iletilir.
async function addToList(user, familyId, entry) {
  const { db } = firebase();
  const legacy = (await get(ref(db, `userFamilies/${user.uid}`))).val();
  if (!legacy?.familyId) await set(ref(db, `userFamilies/${user.uid}`), { familyId, ...entry });
  try { await set(ref(db, `userBudgets/${user.uid}/${familyId}`), entry); }
  catch (e) { if (legacy?.familyId) throw e; }
}

// Kurucu bütçenin adını değiştirir (üyeler okur, yalnız kurucu yazar).
export async function renameBudget(familyId, name) {
  await set(ref(firebase().db, `families/${familyId}/name`), name.trim());
}

const inviteId = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), b => (b % 36).toString(36)).join("") + Date.now().toString(36);

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

// Bütçeyi kuran kişi üye için davet kodu üretir. Kurallar yalnız ona izin verir (invitations/$code: familyId kurucunun
// uid'i ya da families/{familyId}/admin). Bütçenin adı davete de yazılır: davetli katılmadan önce hangi bütçeye
// katılacağını görür. Kod başka bir ailenin davetiyle çakışırsa yenisi denenir.
export async function createInvitation(user, name, email, familyId = user.uid, budgetName = "") {
  const { db } = firebase();
  for (let i = 0; i < 5; i++) {
    const code = inviteCode();
    if ((await get(ref(db, `invitations/${code}`))).exists()) continue;
    const now = Date.now();
    await set(ref(db, `invitations/${code}`), { familyId, ...(budgetName ? { budgetName } : {}), name: name.trim(), email: email.trim().toLowerCase(), createdAt: new Date(now).toISOString(), expiresAt: now + INVITE_DAYS * 86400000, used: false });
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

// Davete katılım doğrulanmış e-posta ister (kurallar auth.token.email_verified denetler): biri davetteki adresle önce
// hesap açsa bile o adresin gelen kutusuna erişmeden katılamaz. Kullanıcı e-postadaki bağlantıya dokunduktan sonra hesap
// yenilenir; oturum jetonu da yenilenir, yoksa kurallar eski (doğrulanmamış) değeri görür.
export async function refreshVerified(user) {
  await reload(user);
  if (user.emailVerified) await user.getIdToken(true);
  return user.emailVerified;
}

export async function resendVerification(user) {
  firebase().auth.languageCode = "tr";
  await sendEmailVerification(user);
}

// Üye kaydı ve kodun kullanıldı işareti tek atomik yazımda gider (kurallar ikisini birlikte ister).
export async function joinFamily(user, code, inv, name) {
  const { db } = firebase();
  const memberName = name || inv.name || user.email.split("@")[0];
  await update(ref(db), {
    [`families/${inv.familyId}/members/${user.uid}`]: { name: memberName, email: user.email, role: "member", inviteCode: code, joinedAt: new Date().toISOString() },
    [`invitations/${code}/used`]: true,
  });
  await addToList(user, inv.familyId, { code, role: "member", name: memberName });
  return { familyId: inv.familyId, role: "member", name: memberName };
}

export async function signInEmail(email, password) {
  return (await signInWithEmailAndPassword(firebase().auth, email.trim(), password)).user;
}

// Kayıtta doğrulama e-postası gönderilmez: bütçe kuran kişi için gerekmez. Davetle katılmada HesapSheet gönderir.
export async function registerEmail(name, email, password) {
  const user = (await createUserWithEmailAndPassword(firebase().auth, email.trim(), password)).user;
  try { await updateProfile(user, { displayName: name }); } catch {}
  return user;
}

// Şifre sıfırlama bağlantısı. Adresle hesap olup olmadığı söylenmez (hesap listesi dışarıdan çıkarılamasın):
// hesap yoksa da başarılı sayılır.
export async function sendPasswordReset(email) {
  const { auth } = firebase();
  auth.languageCode = "tr";
  try { await sendPasswordResetEmail(auth, email.trim()); } catch (e) { if (e?.code !== "auth/user-not-found") throw e; }
}

export async function signInGoogle() {
  return (await signInWithPopup(firebase().auth, new GoogleAuthProvider())).user;
}

export const logOut = () => signOut(firebase().auth);
