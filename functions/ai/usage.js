// Günlük AI kullanım sayacı.
// Firebase Functions'ta (ve emülatörde) Realtime Database'de aiUsage/{uid} altında tutulur; sunucu yeniden
// başlasa da sayı korunur. Kök kuralı bu yolu istemciye açmadığı için yalnız sunucu (yönetici SDK) okur/yazar.
// Başka ortamlarda (Vercel, testler) eskisi gibi bellekte tutulur.

import { getDatabase } from "firebase-admin/database";
import { adminApp } from "./common.js";

const memory = {};

// FUNCTION_TARGET, Firebase Functions çalışma ortamında ve emülatörde tanımlıdır.
const useDatabase = () => Boolean(process.env.FUNCTION_TARGET);

// Gün sınırı Türkiye saatine göre (gece 00:00'da yenilenir).
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });

const userRef = uid => getDatabase(adminApp()).ref(`aiUsage/${uid}`);

/** Kullanıcının bugünkü kullanım sayısı. */
export async function usageToday(uid) {
  const day = today();
  if (useDatabase()) {
    const snap = await userRef(uid).child(day).get();
    return snap.val() || 0;
  }
  for (const k of Object.keys(memory)) {
    if (!k.endsWith(day)) delete memory[k];
  }
  return memory[`${uid}_${day}`] || 0;
}

/** Bugünkü sayıyı bir artırır; önceki günlerin kaydı silinir. */
export async function addUsage(uid) {
  const day = today();
  if (useDatabase()) {
    await userRef(uid).transaction(current => ({ [day]: ((current && current[day]) || 0) + 1 }));
    return;
  }
  const key = `${uid}_${day}`;
  memory[key] = (memory[key] || 0) + 1;
}
