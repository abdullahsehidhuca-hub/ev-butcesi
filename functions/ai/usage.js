// Günlük AI kullanım sayacı (uç nokta başına: advisor · receipt · statement).
// Firebase Functions'ta (ve emülatörde) Realtime Database'de aiUsage/{uid}/{kind} altında tutulur; sunucu yeniden
// başlasa da sayı korunur. Kök kuralı bu yolu istemciye açmadığı için yalnız sunucu (yönetici SDK) okur/yazar.
// Başka ortamlarda (Vercel, testler) eskisi gibi bellekte tutulur.

import { getDatabase } from "firebase-admin/database";
import { adminApp } from "./common.js";

const memory = {};

// Kullanıcı başına günlük sınırlar. Kayıt herkese açık olduğu için ücretli çağrıların her biri sınırlıdır.
export const DAILY_LIMITS = { advisor: 3, receipt: 20, statement: 5 };

// FUNCTION_TARGET, Firebase Functions çalışma ortamında ve emülatörde tanımlıdır.
const useDatabase = () => Boolean(process.env.FUNCTION_TARGET);

// Gün sınırı Türkiye saatine göre (gece 00:00'da yenilenir).
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });

const userRef = (uid, kind) => getDatabase(adminApp()).ref(`aiUsage/${uid}/${kind}`);

/** Kullanıcının bugünkü kullanım sayısı. */
export async function usageToday(uid, kind = "advisor") {
  const day = today();
  if (useDatabase()) {
    const snap = await userRef(uid, kind).child(day).get();
    return snap.val() || 0;
  }
  for (const k of Object.keys(memory)) {
    if (!k.endsWith(day)) delete memory[k];
  }
  return memory[`${uid}_${kind}_${day}`] || 0;
}

/** Bugünkü sayıyı bir artırır; önceki günlerin kaydı silinir. */
export async function addUsage(uid, kind = "advisor") {
  const day = today();
  if (useDatabase()) {
    await userRef(uid, kind).transaction(current => ({ [day]: ((current && current[day]) || 0) + 1 }));
    return;
  }
  const key = `${uid}_${kind}_${day}`;
  memory[key] = (memory[key] || 0) + 1;
}
