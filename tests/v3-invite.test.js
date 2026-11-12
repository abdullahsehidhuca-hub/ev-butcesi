// Davet kodu: 6 karakter, harf-rakam karışık, karışan karakter yok; kullanıcının yazdığı kod büyük harfe çevrilir.
// Kuralların (süre, e-posta, biçim) denetimi: npm run test:rules. Çalıştırma: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { inviteCode, normalizeCode, INVITE_DAYS } from "../src/v3/family.js";

test("Davet kodu 6 karakter, yalnız karışmayan harf ve rakamlardan; kurallardaki biçime uyar", () => {
  const codes = Array.from({ length: 2000 }, inviteCode);
  for (const c of codes) assert.match(c, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  assert.ok(codes.every(c => /^[0-9A-Z]{6}$/.test(c)), "database.rules.json biçimi");
  assert.ok(new Set(codes).size > 1990, "kodlar tekrar etmemeli");
  assert.ok(codes.some(c => /\d/.test(c)) && codes.some(c => /[A-Z]/.test(c)), "harf ve rakam birlikte");
  assert.equal(INVITE_DAYS, 7);
});

test("Yazılan kod: boşluk ve tire atılır, küçük harf büyür; eski rakam kodlar da geçer", () => {
  assert.equal(normalizeCode(" k7m-2qx "), "K7M2QX");
  assert.equal(normalizeCode("123 456"), "123456");
  assert.equal(normalizeCode(null), "");
});
