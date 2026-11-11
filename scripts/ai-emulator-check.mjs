// AI uç noktalarını Firebase emülatörlerinde denetler; canlı projeye ve Anthropic'e istek gitmez.
// Çalıştırma: npm run test:ai
// (firebase emulators:exec --only auth,functions,database --project demo-ev-butcesi "node scripts/ai-emulator-check.mjs")
// Denenenler: oturumsuz istek 401, sahte oturum 401, yanlış yöntem 405, eksik/hatalı girdi 400, günlük hak dolunca 429
// (sayaç veritabanında) ve izinli kaynaktan CORS ön isteği.

const PROJECT = process.env.GCLOUD_PROJECT || "demo-ev-butcesi";
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const DB = process.env.FIREBASE_DATABASE_EMULATOR_HOST || "127.0.0.1:9000";
const FN = `http://127.0.0.1:5001/${PROJECT}/europe-west1`;

let failed = 0;
function check(name, ok, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "✔" : "✘"} ${name}${detail ? ` (${detail})` : ""}`);
}

async function post(fn, { token, body, method = "POST", origin } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (origin) headers.Origin = origin;
  const res = await fetch(`${FN}/${fn}`, { method, headers, body: method === "POST" ? JSON.stringify(body || {}) : undefined });
  let payload = null;
  try { payload = await res.json(); } catch { /* boş yanıt */ }
  return { status: res.status, payload, headers: res.headers };
}

// Deneme kullanıcısı (yalnız Auth emülatöründe)
const signUp = await fetch(`http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: `deneme${Date.now()}@example.com`, password: "deneme123", returnSecureToken: true })
}).then(r => r.json());
const token = signUp.idToken;
const uid = signUp.localId;
check("emülatörde deneme kullanıcısı oluştu", Boolean(token && uid));

const forged = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(`{"sub":"${uid}"}`).toString("base64url")}.`;

for (const [fn, good] of [
  ["aiAdvisor", { prompt: "merhaba" }],
  ["analyzeReceipt", { base64: "aGVsbG8=", mediaType: "image/png" }],
  ["analyzeStatement", { base64: "aGVsbG8=", mediaType: "application/pdf" }]
]) {
  check(`${fn}: oturumsuz 401`, (await post(fn, { body: good })).status === 401);
  check(`${fn}: sahte oturum 401`, (await post(fn, { token: forged, body: good })).status === 401);
  check(`${fn}: GET 405`, (await post(fn, { method: "GET", token })).status === 405);
  const bad = await post(fn, { token, body: {} });
  check(`${fn}: geçerli oturum + eksik girdi 400`, bad.status === 400, bad.payload?.error);
}
const wrongType = await post("analyzeStatement", { token, body: { base64: "aGVsbG8=", mediaType: "text/html" } });
check("analyzeStatement: desteklenmeyen tür 400", wrongType.status === 400, wrongType.payload?.error);

// Günlük hak: sayacı veritabanı emülatöründe 3'e çekip danışmanı çağır (Anthropic'e gitmeden 429 dönmeli).
const day = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
for (const ns of [`${PROJECT}-default-rtdb`, PROJECT]) {
  await fetch(`http://${DB}/aiUsage/${uid}.json?ns=${ns}`, {
    method: "PUT",
    headers: { Authorization: "Bearer owner" },
    body: JSON.stringify({ [day]: 3 })
  });
}
const limited = await post("aiAdvisor", { token, body: { prompt: "merhaba" } });
check("aiAdvisor: günlük hak dolunca 429 (sayaç veritabanında)", limited.status === 429, limited.payload?.error);

// CORS: iOS kabuğunun kaynağına izin var, başka siteye yok.
const pre = await fetch(`${FN}/aiAdvisor`, {
  method: "OPTIONS",
  headers: { Origin: "capacitor://localhost", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type" }
});
check("CORS: capacitor://localhost ön isteği kabul", pre.headers.get("access-control-allow-origin") === "capacitor://localhost", `HTTP ${pre.status}`);
// İzinsiz kaynağın reddi emülatörde denenemez: emülatör "enableCors" hata ayıklama ayarıyla izin listesini yok sayıp
// her kaynağa izin verir (firebase-functions resolveCorsOrigin). Liste canlıda geçerlidir; birim testi: tests/functions.test.js.
console.log("i CORS izin listesi emülatörde uygulanmaz; tests/functions.test.js ile denetlenir");

console.log(failed ? `\n${failed} denetim başarısız` : "\nTüm denetimler geçti");
process.exit(failed ? 1 : 0);
