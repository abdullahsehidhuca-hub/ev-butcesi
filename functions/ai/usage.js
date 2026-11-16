// Günlük AI kullanım sayacı (uç nokta başına: advisor · receipt · statement).
// Firebase Functions'ta (ve emülatörde) Realtime Database'de tutulur: kullanıcı başına aiUsage/{uid}/{kind}, tüm
// kullanıcıların toplamı aiUsageTotal/{kind}. Sunucu yeniden başlasa da sayı korunur. Kök kuralı bu yolları istemciye
// açmadığı için yalnız sunucu (yönetici SDK) okur/yazar. Başka ortamlarda (testler) bellekte tutulur.

import { getDatabase } from "firebase-admin/database";
import { adminApp } from "./common.js";

const memory = {};

// Kullanıcı başına günlük sınırlar. Kayıt herkese açık olduğu için ücretli çağrıların her biri sınırlıdır.
export const DAILY_LIMITS = { advisor: 3, receipt: 20, statement: 5 };
// Tüm kullanıcıların günlük toplam tavanı: çok sayıda sahte hesap açılsa da günlük maliyet bunu aşamaz.
export const DAILY_TOTAL_LIMITS = { advisor: 30, receipt: 200, statement: 40 };

// FUNCTION_TARGET, Firebase Functions çalışma ortamında ve emülatörde tanımlıdır.
const useDatabase = () => Boolean(process.env.FUNCTION_TARGET);

// Gün sınırı Türkiye saatine göre (gece 00:00'da yenilenir).
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });

const userPath = (uid, kind) => `aiUsage/${uid}/${kind}`;
const totalPath = kind => `aiUsageTotal/${kind}`;

function pruneMemory(day) {
  for (const k of Object.keys(memory)) {
    if (!k.endsWith(day)) delete memory[k];
  }
}

// Sayacı sınırın altındaysa tek atomik adımda bir artırır; yeni sayıyı ya da (sınır doluysa) null döner.
// Önceki günlerin kaydı silinir.
async function take(path, limit) {
  const day = today();
  if (useDatabase()) {
    let count = null;
    const { committed } = await getDatabase(adminApp()).ref(path).transaction(current => {
      const used = (current && current[day]) || 0;
      if (used >= limit) return; // undefined: işlem iptal, hak yok
      count = used + 1;
      return { [day]: count };
    });
    return committed ? count : null;
  }
  pruneMemory(day);
  const key = `${path}_${day}`;
  if ((memory[key] || 0) >= limit) return null;
  memory[key] = (memory[key] || 0) + 1;
  return memory[key];
}

async function giveBack(path) {
  const day = today();
  if (useDatabase()) {
    await getDatabase(adminApp()).ref(path).child(day).transaction(n => (n > 0 ? n - 1 : n));
    return;
  }
  const key = `${path}_${day}`;
  if (memory[key] > 0) memory[key] -= 1;
}

/** Kullanıcının bugünkü kullanım sayısı. */
export async function usageToday(uid, kind = "advisor") {
  const day = today();
  if (useDatabase()) {
    const snap = await getDatabase(adminApp()).ref(userPath(uid, kind)).child(day).get();
    return snap.val() || 0;
  }
  pruneMemory(day);
  return memory[`${userPath(uid, kind)}_${day}`] || 0;
}

/**
 * Model çağrısından ÖNCE bir hak ayırır: önce kullanıcının, sonra herkesin günlük toplamından. Her biri tek atomik
 * adımdır; önce okuyup sonra artırmak aynı anda gönderilen isteklerin hepsini geçirirdi.
 * Dönüş: { count } (kullanıcının bugünkü yeni sayısı) ya da { full: "user" | "total" } (hangi sınır dolu).
 */
export async function reserveUsage(uid, kind, { limit = DAILY_LIMITS[kind], totalLimit = DAILY_TOTAL_LIMITS[kind] } = {}) {
  const count = await take(userPath(uid, kind), limit);
  if (count === null) return { full: "user" };
  if (await take(totalPath(kind), totalLimit) === null) {
    await giveBack(userPath(uid, kind));
    return { full: "total" };
  }
  return { count };
}

/** Ayrılan hakkı (kullanıcı ve toplam) geri verir: model hiç yanıt vermediyse maliyet oluşmamıştır. */
export async function releaseUsage(uid, kind) {
  await giveBack(userPath(uid, kind));
  await giveBack(totalPath(kind));
}

// Toplam tavan dolunca kullanıcıya gösterilen ileti.
export const TOTAL_FULL_MESSAGE = "Yapay zekâ bugün için günlük kullanım sınırına ulaştı. Yarın yeniden deneyin.";
