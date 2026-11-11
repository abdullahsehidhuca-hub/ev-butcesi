import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { aiAdvisor, analyzeReceipt, analyzeStatement } from "../functions/index.js";

// Emülatör dışındaki (canlı) davranış denetlenir; hata ayıklama modu CORS listesini yok sayar.
delete process.env.FIREBASE_DEBUG_MODE;

const FUNCTIONS = { aiAdvisor, analyzeReceipt, analyzeStatement };

// Ağa çıkmadan çağrı: GET, oturum denetiminden önce 405 döner.
function invoke(fn, origin) {
  return new Promise(resolve => {
    const headers = {};
    const res = Object.assign(new EventEmitter(), {
      statusCode: 200,
      setHeader(k, v) { headers[k.toLowerCase()] = v; },
      getHeader(k) { return headers[k.toLowerCase()]; },
      status(code) { this.statusCode = code; return this; },
      json() { this.emit("finish"); resolve({ status: this.statusCode, headers }); return this; },
      end() { this.emit("finish"); resolve({ status: this.statusCode, headers }); }
    });
    const req = { method: "GET", headers: { origin }, header(n) { return this.headers[n.toLowerCase()]; }, get(n) { return this.header(n); } };
    fn(req, res);
  });
}

for (const [name, fn] of Object.entries(FUNCTIONS)) {
  test(`${name}: europe-west1, Anthropic anahtarı gizli depodan, en fazla 3 kopya`, () => {
    const ep = fn.__endpoint;
    assert.deepEqual(ep.region, ["europe-west1"]);
    assert.deepEqual(ep.secretEnvironmentVariables.map(s => s.key), ["ANTHROPIC_API_KEY"]);
    assert.equal(ep.maxInstances, 3);
  });

  test(`${name}: iOS kabuğuna CORS izni var, başka siteye yok`, async () => {
    const ios = await invoke(fn, "capacitor://localhost");
    assert.equal(ios.status, 405);
    assert.equal(ios.headers["access-control-allow-origin"], "capacitor://localhost");
    const other = await invoke(fn, "https://kotu-site.example");
    assert.equal(other.status, 405);
    assert.equal(other.headers["access-control-allow-origin"], undefined);
  });
}
