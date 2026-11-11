// Başsız Chrome'u CDP ile sürer: sayfayı açar, verilen adım dosyasını tarayıcıda çalıştırır, konsol hatalarını ve
// yatay taşmayı raporlar. Geliştirme aracıdır; uygulamaya girmez. Kullanım:
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9333 about:blank &
//   node scripts/tarayici-deneme.mjs 9333 http://localhost:5180/v3?ornek 390 ./scripts/tarayici-adimlar.mjs
const port = process.argv[2] || 9333;
const url = process.argv[3];
const width = Number(process.argv[4] || 390);
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
let page = targets.find(t => t.type === "page");
if (!page) page = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => (ws.onopen = r));
let id = 0; const pending = new Map(); const logs = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params.type)) logs.push(`[${m.params.type}] ${m.params.args.map(a => a.value ?? a.description).join(" ")}`);
  if (m.method === "Runtime.exceptionThrown") logs.push(`[exception] ${m.params.exceptionDetails.text} ${m.params.exceptionDetails.exception?.description || ""}`);
};
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const evalJs = async expr => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) return `EXC: ${r.result.exceptionDetails.text} ${r.result.exceptionDetails.exception?.description || ""}`; return r.result?.result?.value; };
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 2, mobile: true });
await send("Page.navigate", { url });
await sleep(2500);

const failures = [];
const click = async (text, selector = "button, a, summary, label") => evalJs(`(() => { const els = [...document.querySelectorAll(${JSON.stringify(selector)})]; const el = els.find(e => (e.getAttribute('aria-label') || e.textContent || '').trim().includes(${JSON.stringify(text)})); if (!el) return 'NOT FOUND: ' + ${JSON.stringify(text)}; el.click(); return 'clicked ' + ${JSON.stringify(text)}; })()`);
const type = async (label, value) => evalJs(`(() => { const l = [...document.querySelectorAll('label')].find(x => x.textContent.trim().startsWith(${JSON.stringify(label)})); const inp = l && document.getElementById(l.htmlFor); if (!inp) return 'NO INPUT: ' + ${JSON.stringify(label)}; const setter = Object.getOwnPropertyDescriptor(inp.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set; setter.call(inp, ${JSON.stringify(value)}); inp.dispatchEvent(new Event(inp.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); return 'typed ' + ${JSON.stringify(label)}; })()`);
const check = async name => {
  const w = await evalJs("[document.documentElement.scrollWidth, window.innerWidth, (document.querySelector('.v3-sheet, .sheet') || document.body).scrollWidth].join('/')");
  const title = await evalJs("(document.querySelector('.v3-sheet-title, .sheet h2, .sheet h3') || document.querySelector('h1') || {}).textContent");
  const [sw, iw, sh] = String(w).split("/").map(Number);
  if (sw > iw || sh > iw) failures.push(`taşma: ${name} ${w}`);
  console.log(`${name.padEnd(34)} genişlik ${w}  başlık: ${String(title).slice(0, 60)}`);
};
const text = async () => evalJs("document.body.innerText");
const has = async (s, name) => { const t = await text(); const ok = t.includes(s); console.log(`  ${ok ? "✔" : "✘"} ${name || s}`); if (!ok) failures.push(name || s); };
const esc = async () => { await evalJs("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));"); await sleep(250); };
const shot = async file => { const r = await send("Page.captureScreenshot", { format: "png" }); const { writeFileSync } = await import("node:fs"); writeFileSync(file, Buffer.from(r.result.data, "base64")); };

const steps = (await import(process.argv[5])).default;
await steps({ click, type, check, has, text, sleep, evalJs, esc, shot, failures, logs, send });
console.log("\nKonsol hata/uyarı sayısı:", logs.length); for (const l of logs) console.log("  ", l.slice(0, 300));
console.log("Başarısız kontrol:", failures.length ? failures.join(" | ") : "yok");
ws.close(); process.exit(failures.length || logs.length ? 1 : 0);
