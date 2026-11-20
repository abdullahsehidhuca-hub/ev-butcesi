// Kısa süreli bütçe (kamp, tatil, gezi) Firebase işlemleri. Veri ev bütçesinden ayrıdır:
// events/{id}/{meta, members, expenses}, katılım kodu eventInvites/{kod}, kişinin listesi userEvents/{uid}/{id}.
// Veritabanı kuralları (database.rules.json) bu yazımlara göre yazılmıştır: etkinliği ve kodu yalnız kuran yazar,
// kodla katılan üye harcama ekler ve yalnız kendi girdiği kaydı siler. Hesap kuralları src/core/events.js'tedir.
import { ref, get, set, push, remove, onValue } from "firebase/database";
import { firebase, inviteCode, INVITE_DAYS } from "./family.js";
import { validateEventMeta, validateEventExpense } from "../core/events.js";
import { ValidationError } from "../core/index.js";

const memberName = (user, name) => (name || user.displayName || user.email?.split("@")[0] || "Üye").trim().slice(0, 40);

// Kişinin kısa süreli bütçeleri: { id: { name, kind, start, end, role } }.
export async function listMyEvents(user) {
  const { db } = firebase();
  return (await get(ref(db, `userEvents/${user.uid}`))).val() || {};
}

export async function createEvent(user, meta, name) {
  const errs = validateEventMeta(meta);
  if (errs.length) throw new ValidationError(errs);
  const { db } = firebase();
  const id = push(ref(db, "events")).key;
  const rec = { ownerUid: user.uid, name: meta.name.trim(), kind: meta.kind, start: meta.start, end: meta.end, ...(meta.kind === "trip" ? { budget: meta.budget } : {}), createdAt: new Date().toISOString() };
  // Sıra önemli: kurallar üyelik için önce kurucunun meta kaydını arar.
  await set(ref(db, `events/${id}/meta`), rec);
  await set(ref(db, `events/${id}/members/${user.uid}`), { name: memberName(user, name), joinedAt: new Date().toISOString() });
  await set(ref(db, `userEvents/${user.uid}/${id}`), { name: rec.name, kind: rec.kind, start: rec.start, end: rec.end, role: "owner" });
  return id;
}

// Katılım kodu: 6 karakter, 7 gün geçerli, süresi içinde birden çok kişi kullanabilir (kamp grubu).
export async function createEventInvite(user, eventId) {
  const { db } = firebase();
  for (let i = 0; i < 5; i++) {
    const code = inviteCode();
    if ((await get(ref(db, `eventInvites/${code}`))).exists()) continue;
    const expiresAt = Date.now() + INVITE_DAYS * 86400000;
    await set(ref(db, `eventInvites/${code}`), { eventId, createdBy: user.uid, expiresAt });
    return { code, expiresAt };
  }
  throw new Error("Katılım kodu oluşturulamadı; yeniden deneyin.");
}

// Kodla katılım. Kod geçersizse ya da süresi dolduysa null döner.
export async function joinEvent(user, code, name) {
  const { db } = firebase();
  const inv = (await get(ref(db, `eventInvites/${code}`))).val();
  if (!inv?.eventId || !(inv.expiresAt > Date.now())) return null;
  await set(ref(db, `events/${inv.eventId}/members/${user.uid}`), { name: memberName(user, name), code, joinedAt: new Date().toISOString() });
  const meta = (await get(ref(db, `events/${inv.eventId}/meta`))).val();
  await set(ref(db, `userEvents/${user.uid}/${inv.eventId}`), { name: meta.name, kind: meta.kind, start: meta.start, end: meta.end, role: "member" });
  return inv.eventId;
}

// Etkinliği canlı izler; değişiklik (başka üyenin harcaması) anında gelir. Dönüş: aboneliği bırakan işlev.
export function watchEvent(eventId, onData, onError) {
  const { db } = firebase();
  return onValue(ref(db, `events/${eventId}`), snap => onData(snap.val()), onError);
}

export async function addEventExpense(user, eventId, event, expense) {
  const errs = validateEventExpense(event, expense);
  if (errs.length) throw new ValidationError(errs);
  const { db } = firebase();
  const rec = { ...expense, note: (expense.note || "").trim(), createdBy: user.uid, createdAt: new Date().toISOString() };
  if (!rec.note) delete rec.note;
  await set(push(ref(db, `events/${eventId}/expenses`)), rec);
}

export const deleteEventExpense = (eventId, id) => remove(ref(firebase().db, `events/${eventId}/expenses/${id}`));

// Kuran ayarları değiştirir (ad, tarih, bütçe); tür değişmez.
export async function updateEventMeta(user, eventId, meta) {
  const errs = validateEventMeta(meta);
  if (errs.length) throw new ValidationError(errs);
  const { db } = firebase();
  await set(ref(db, `events/${eventId}/meta`), { ...meta, ownerUid: user.uid, name: meta.name.trim() });
  await set(ref(db, `userEvents/${user.uid}/${eventId}`), { name: meta.name.trim(), kind: meta.kind, start: meta.start, end: meta.end, role: "owner" });
}

// Üye ayrılır: üyeliği ve listesindeki kayıt silinir; girdiği harcamalar etkinlikte kalır.
export async function leaveEvent(user, eventId) {
  const { db } = firebase();
  await remove(ref(db, `events/${eventId}/members/${user.uid}`));
  await remove(ref(db, `userEvents/${user.uid}/${eventId}`));
}

// Kişinin listesinden kaldırma (kuran için: etkinlik veritabanında kalır, yalnız listede görünmez).
export const hideEvent = (user, eventId) => remove(ref(firebase().db, `userEvents/${user.uid}/${eventId}`));
