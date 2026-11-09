// Veritabanı kurallarını Firebase emülatöründe dener. Canlı veritabanına bağlanmaz:
// proje kimliği "demo-" ile başlar, emülatör dışına çıkamaz.
// Çalıştırma: npm run test:rules (emülatörü başlatır, testleri çalıştırır, kapatır)
import { test, before } from "node:test";
import assert from "node:assert/strict";

const HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST || "127.0.0.1:9000";
const NS = "demo-ev-butcesi-default-rtdb";

// Emülatör imzasız kimlik jetonunu kabul eder; auth.uid jetondaki sub alanıdır.
const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
const token = uid => `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: uid, user_id: uid, iat: 0, exp: 9999999999, aud: "demo-ev-butcesi", iss: "https://securetoken.google.com/demo-ev-butcesi", firebase: { sign_in_provider: "password" } })}.`;

async function req(method, path, uid, body) {
  const headers = { "Content-Type": "application/json" };
  if (uid === "owner") headers.Authorization = "Bearer owner";
  // Kullanıcı kimlik jetonu ?auth= ile gider; Bearer başlığı servis hesabı (tam yetki) sayılır.
  const auth = uid && uid !== "owner" ? `&auth=${token(uid)}` : "";
  const r = await fetch(`http://${HOST}/${path}.json?ns=${NS}${auth}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return r.status;
}
const ok = async (p, msg) => assert.equal(await p, 200, msg);
const denied = async (p, msg) => { const s = await p; assert.ok(s === 401 || s === 403, `${msg} (durum ${s})`); };

const ADMIN = "admin1", MEMBER = "uye1", STRANGER = "yabanci";

before(async () => {
  await ok(req("PUT", "", "owner", null), "veritabanı temizlenemedi");
  // Yönetici kendi ailesini kurar (eski uygulamanın createFamily akışı).
  await ok(req("PUT", `families/${ADMIN}/admin`, ADMIN, ADMIN), "admin yazılamadı");
  await ok(req("PUT", `families/${ADMIN}/members/${ADMIN}`, ADMIN, { name: "Abdullah", email: "a@x", role: "admin" }), "yönetici üye kaydı");
  await ok(req("PUT", `userFamilies/${ADMIN}`, ADMIN, { familyId: ADMIN, role: "admin" }), "userFamilies");
  await ok(req("PUT", `nameIndex/abdullah`, ADMIN, { email: "a@x", familyId: ADMIN, uid: ADMIN }), "isim kaydı");
  await ok(req("PUT", `families/${ADMIN}/data`, ADMIN, { settings: { payDay: 15 }, months: {} }), "eski veri");
});

test("yabancı aile verisini okuyamaz, yazamaz", async () => {
  await denied(req("GET", `families/${ADMIN}`, STRANGER), "okuma");
  await denied(req("PUT", `families/${ADMIN}/data`, STRANGER, { x: 1 }), "eski veri yazma");
  await denied(req("PUT", `families/${ADMIN}/v3/schemaVersion`, STRANGER, 3), "v3 yazma");
  await denied(req("GET", `families/${ADMIN}`, null), "girişsiz okuma");
});

test("yabancı kendini davetsiz üye yazamaz (eski açık)", async () => {
  await denied(req("PUT", `families/${ADMIN}/members/${STRANGER}`, STRANGER, { name: "X", role: "member" }), "davetsiz üye");
  await denied(req("PUT", `families/${ADMIN}/members/${STRANGER}`, STRANGER, { name: "X", role: "admin", inviteCode: "000000" }), "admin rolüyle");
});

test("davet listelenemez, başkası adına davet yazılamaz", async () => {
  await denied(req("GET", "invitations", STRANGER), "davet listesi");
  await denied(req("GET", "nameIndex", STRANGER), "isim dizini listesi");
  await denied(req("PUT", "invitations/111111", STRANGER, { familyId: ADMIN, used: false }), "başkasının ailesine davet");
});

test("davetle katılma akışı çalışır ve kod tek kullanımlıktır", async () => {
  await ok(req("PUT", "invitations/123456", ADMIN, { familyId: ADMIN, name: "Kadriye", email: "k@x", used: false }), "davet oluşturma");
  await ok(req("GET", "invitations/123456", null), "kodla tek davet okunur (girişten önce)");
  await denied(req("PUT", "invitations/123456", STRANGER, { familyId: STRANGER, used: false }), "daveti ele geçirme");
  await ok(req("PUT", `families/${ADMIN}/members/${MEMBER}`, MEMBER, { name: "Kadriye", email: "k@x", role: "member", inviteCode: "123456" }), "üye kaydı");
  await ok(req("PUT", `userFamilies/${MEMBER}`, MEMBER, { familyId: ADMIN, code: "123456", role: "member" }), "userFamilies");
  await ok(req("PUT", "invitations/123456/used", MEMBER, true), "davet kullanıldı");
  await ok(req("PUT", "nameIndex/kadriye", MEMBER, { email: "k@x", familyId: ADMIN, uid: MEMBER }), "isim kaydı");
  // Aynı kodu ikinci kez kullanmak reddedilir.
  await denied(req("PUT", `families/${ADMIN}/members/${STRANGER}`, STRANGER, { name: "X", role: "member", inviteCode: "123456" }), "kullanılmış kod");
  await denied(req("PUT", "invitations/123456/used", STRANGER, false), "kodu yeniden açma");
});

test("üye eski veriyi, v3'ü ve yedekleri kullanır; rolünü yükseltemez", async () => {
  await ok(req("GET", `families/${ADMIN}`, MEMBER), "aile okuma");
  await ok(req("PUT", `families/${ADMIN}/data/settings/payDay`, MEMBER, 10), "eski veri yazma");
  await ok(req("PATCH", `families/${ADMIN}/v3`, MEMBER, { schemaVersion: 1, "transactions/t1": { amount: 100 } }), "v3 yazma");
  await denied(req("PUT", `families/${ADMIN}/v3/schemaVersion`, MEMBER, "bir"), "şema sürümü sayı olmalı");
  await ok(req("PUT", `backups/${ADMIN}/2026-11-09`, MEMBER, { settings: {} }), "üye günlük yedek");
  await ok(req("GET", `backups/${ADMIN}`, MEMBER), "yedek listesi");
  await denied(req("GET", `backups/${ADMIN}`, STRANGER), "yabancı yedek okuma");
  await denied(req("PUT", `families/${ADMIN}/members/${MEMBER}/role`, MEMBER, "admin"), "rol yükseltme");
  await denied(req("PUT", `families/${ADMIN}/admin`, MEMBER, MEMBER), "yöneticiliği alma");
});

test("isim dizini ve userFamilies başkasınca ezilemez", async () => {
  await denied(req("PUT", "nameIndex/abdullah", STRANGER, { email: "kotu@x", familyId: STRANGER, uid: STRANGER }), "isim ele geçirme");
  await denied(req("PUT", `userFamilies/${MEMBER}`, STRANGER, { familyId: STRANGER }), "başkasının aile kaydı");
  await denied(req("GET", `userFamilies/${ADMIN}`, MEMBER), "başkasının aile kaydını okuma");
});

test("yönetici üyenin erişimini sıfırlayabilir (resetMemberAccess)", async () => {
  await ok(req("PUT", `userFamilies/${MEMBER}`, ADMIN, null), "userFamilies silme");
  await ok(req("PUT", "nameIndex/kadriye", ADMIN, null), "isim silme");
  await ok(req("PUT", `families/${ADMIN}/members/${MEMBER}`, ADMIN, null), "üye silme");
  await denied(req("GET", `families/${ADMIN}/v3`, MEMBER), "silinen üye artık okuyamaz");
});
