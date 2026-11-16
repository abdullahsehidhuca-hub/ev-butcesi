import { test } from "node:test";
import assert from "node:assert/strict";
import advisor from "../functions/ai/advisor.js";
import receipt from "../functions/ai/receipt.js";
import statement from "../functions/ai/statement.js";
import { checkFile, getToken } from "../functions/ai/common.js";
import { usageToday, reserveUsage, releaseUsage } from "../functions/ai/usage.js";

// Canlı AI servisine istek gitmemesi için anahtar tanımsız tutulur.
delete process.env.ANTHROPIC_API_KEY;

const b64 = obj => Buffer.from(JSON.stringify(obj)).toString("base64url");
// Eski kodun kabul ettiği türden imzasız, elle üretilmiş token.
const FORGED = `${b64({ alg: "none", typ: "JWT" })}.${b64({ user_id: "saldirgan", sub: "saldirgan" })}.`;

function call(handler, { method = "POST", token, body = {} } = {}) {
  const req = { method, headers: token ? { authorization: `Bearer ${token}` } : {}, body };
  return new Promise(resolve => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { resolve({ status: this.statusCode, payload }); return this; }
    };
    handler(req, res);
  });
}

for (const [name, handler, body] of [
  ["ai-advisor", advisor, { prompt: "merhaba" }],
  ["analyze-receipt", receipt, { base64: "aGVsbG8=", mediaType: "image/png" }],
  ["analyze-statement", statement, { base64: "aGVsbG8=", mediaType: "application/pdf" }]
]) {
  test(`${name}: token yoksa 401`, async () => {
    assert.equal((await call(handler, { body })).status, 401);
  });
  test(`${name}: imzasız/sahte token 401`, async () => {
    assert.equal((await call(handler, { token: FORGED, body })).status, 401);
  });
  test(`${name}: GET 405`, async () => {
    assert.equal((await call(handler, { method: "GET" })).status, 405);
  });
}

test("getToken yalnızca Bearer biçimini kabul eder", () => {
  assert.equal(getToken({ headers: { authorization: "Bearer abc" } }), "abc");
  assert.equal(getToken({ headers: { authorization: "abc" } }), null);
  assert.equal(getToken({ headers: {} }), null);
});

test("checkFile tür ve boyut sınırı", () => {
  const types = ["application/pdf"];
  assert.equal(checkFile({ base64: "aGVsbG8=", mediaType: "application/pdf" }, types, 100), null);
  assert.equal(checkFile({ base64: "aGVsbG8=", mediaType: "text/html" }, types, 100), "Desteklenmeyen dosya türü");
  assert.equal(checkFile({ base64: "A".repeat(400), mediaType: "application/pdf" }, types, 100), "Dosya çok büyük");
  assert.equal(checkFile({}, types, 100), "Dosya verisi eksik");
});

test("günlük hak kullanıcı başına ayrılır; sınır dolunca reddedilir, iade bir hak geri verir (Functions dışında bellekte)", async () => {
  const lim = { limit: 2, totalLimit: 100 };
  assert.equal(await usageToday("test-a", "receipt"), 0);
  assert.deepEqual(await reserveUsage("test-a", "receipt", lim), { count: 1 });
  assert.deepEqual(await reserveUsage("test-a", "receipt", lim), { count: 2 });
  assert.deepEqual(await reserveUsage("test-a", "receipt", lim), { full: "user" });
  assert.equal(await usageToday("test-a", "receipt"), 2);
  assert.equal(await usageToday("test-b", "receipt"), 0);
  await releaseUsage("test-a", "receipt");
  assert.equal(await usageToday("test-a", "receipt"), 1);
});

test("aynı anda gönderilen istekler günlük sınırı aşamaz", async () => {
  const results = await Promise.all(Array.from({ length: 10 }, () => reserveUsage("test-c", "advisor", { limit: 3, totalLimit: 100 })));
  assert.equal(results.filter(r => r.count).length, 3);
  assert.equal(await usageToday("test-c", "advisor"), 3);
});

test("tüm kullanıcıların günlük toplam tavanı: çok hesap açılsa da aşılmaz; reddedilen kullanıcının hakkı düşmez", async () => {
  const lim = { limit: 3, totalLimit: 4 };
  const users = Array.from({ length: 6 }, (_, i) => `sahte-${i}`);
  const results = await Promise.all(users.map(u => reserveUsage(u, "statement", lim)));
  assert.equal(results.filter(r => r.count).length, 4);
  assert.equal(results.filter(r => r.full === "total").length, 2);
  const rejected = users.filter((u, i) => results[i].full);
  for (const u of rejected) assert.equal(await usageToday(u, "statement"), 0);
  // İade toplamdan da düşer: bir hak boşalınca başka kullanıcı alabilir.
  await releaseUsage(users.find((u, i) => results[i].count), "statement");
  assert.deepEqual(await reserveUsage(rejected[0], "statement", lim), { count: 1 });
});
