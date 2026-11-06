import { test } from "node:test";
import assert from "node:assert/strict";
import advisor from "../api/ai-advisor.js";
import receipt from "../api/analyze-receipt.js";
import statement from "../api/analyze-statement.js";
import { checkFile, getToken } from "../api/_anthropic.js";

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
