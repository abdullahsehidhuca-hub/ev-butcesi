// AI model denemesi: fiş, PDF ekstre ve danışman görevlerini birden çok sağlayıcıda, üretimdeki istem metinleri ve
// sağlayıcı kodu (functions/ai/providers.js) ile çalıştırır. Doğruluk k/n ve %95 tek yönlü Clopper-Pearson alt
// sınırıyla ("en az %X"), maliyet modelin bildirdiği gerçek token sayısı × liste fiyatıyla raporlanır.
// Ölçütler: scripts/ai-model/olcut.mjs. Seçilen modeli üretime almak: providers.js'te AI_MODEL + npm run ai:kurulum.
//
// Kullanım (anahtarı olmayan sağlayıcı atlanır; anahtarlar ekrana yazılmaz):
//   ANTHROPIC_API_KEY=... GEMINI_API_KEY=... DEEPSEEK_API_KEY=... MISTRAL_API_KEY=... \
//   node scripts/ai-model-dene.mjs [--tekrar 3] [--model claude-haiku-5-5,gemini-3.1-flash-lite] [--gorev fis,ekstre,danisman]
//
// Deneme dosyaları depo dışı yedek/ai-test/ klasöründe (gerçek mali veri git'e girmez; --klasor ile değişir):
//   fis-*.jpg|jpeg|png|webp  + aynı adla .json: {"toplam": 412.75}            (fişin altındaki TOPLAM)
//   ekstre-*.pdf             + aynı adla .json: {"adet": 23, "toplam": 18450.30} (harcama satırı sayısı ve toplamı)
//   danisman.txt             isteğe bağlı; yoksa scripts/ai-model/danisman-ornek.txt (uydurma veri)
// Dosyalar seçilen sağlayıcılara gönderilir. DeepSeek veriyi Çin'de işler; gerçek fiş/ekstre göndermeden önce karar verin.
// Sonuçlar: yedek/ai-test/sonuc/<zaman>/ (her yanıt ayrı dosya + ozet.md)

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseJSON } from "../functions/ai/common.js";
import { MODELS, KEY_NAMES, callModel, costOf } from "../functions/ai/providers.js";
import { RECEIPT_PROMPT } from "../functions/ai/receipt.js";
import { STATEMENT_PROMPT } from "../functions/ai/statement.js";
import { SYSTEM_PROMPT } from "../functions/ai/advisor.js";
import { checkAdvisor, checkReceipt, checkStatement, clopperPearsonLower, runsNeeded } from "./ai-model/olcut.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };

const TIMEOUT_MS = 240000;

// ── Görevler ──

const dir = opt("--klasor", join(root, "yedek", "ai-test"));
const MEDIA = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".pdf": "application/pdf" };
const MAX_BYTES = 4 * 1024 * 1024;

function fixtures(prefix, exts) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(n => n.startsWith(prefix) && exts.includes(extname(n).toLowerCase())).sort().map(n => {
    const path = join(dir, n);
    const buf = readFileSync(path);
    const side = join(dir, basename(n, extname(n)) + ".json");
    if (buf.length > MAX_BYTES) { console.warn(`! ${n} 4 MB'tan büyük (uygulama da kabul etmez), atlandı`); return null; }
    if (!existsSync(side)) { console.warn(`! ${n} için beklenen değer dosyası yok (${basename(side)}), atlandı`); return null; }
    return { name: n, file: { base64: buf.toString("base64"), mediaType: MEDIA[extname(n).toLowerCase()] }, expected: JSON.parse(readFileSync(side, "utf8")) };
  }).filter(Boolean);
}

const wanted = (opt("--gorev", "fis,ekstre,danisman")).split(",");
const tasks = [];
if (wanted.includes("fis")) for (const f of fixtures("fis-", [".jpg", ".jpeg", ".png", ".webp"])) {
  tasks.push({ task: "fis", name: f.name, req: { text: RECEIPT_PROMPT, file: f.file, maxTokens: 4000, thinkingBudget: 2000 }, check: t => checkReceipt(safeParse(t), f.expected) });
}
if (wanted.includes("ekstre")) for (const f of fixtures("ekstre-", [".pdf"])) {
  tasks.push({ task: "ekstre", name: f.name, pdf: true, req: { text: STATEMENT_PROMPT, file: f.file, maxTokens: 16000, thinkingBudget: 8000 }, check: t => checkStatement(safeParse(t), f.expected) });
}
if (wanted.includes("danisman")) {
  const own = join(dir, "danisman.txt");
  const promptFile = existsSync(own) ? own : join(root, "scripts", "ai-model", "danisman-ornek.txt");
  tasks.push({ task: "danisman", name: basename(promptFile), req: { system: SYSTEM_PROMPT, text: readFileSync(promptFile, "utf8"), maxTokens: 16000, thinkingBudget: 10000 }, check: t => checkAdvisor(t) });
}

function safeParse(t) { try { return parseJSON(t); } catch { return null; } }

const only = opt("--model", null)?.split(",");
const models = MODELS.filter(m => !only || only.includes(m.id));
const repeat = Math.max(1, Number(opt("--tekrar", 3)) || 3);

if (!tasks.length) { console.error(`Görev yok. ${dir} klasörüne fiş/ekstre dosyaları koyun ya da --gorev danisman ile deneyin.`); process.exit(1); }

const outDir = join(dir, "sonuc", new Date().toISOString().replace(/[:.]/g, "-"));
mkdirSync(outDir, { recursive: true });
const rows = [];

for (const m of models) {
  if (!process.env[KEY_NAMES[m.provider]]) { console.log(`- ${m.id}: ${KEY_NAMES[m.provider]} tanımlı değil, atlandı`); continue; }
  for (const t of tasks) {
    const row = { model: m.id, task: t.task, ok: 0, n: 0, cost: 0, costKnown: !!m.price, secs: 0, notes: {}, unsupported: false };
    if (t.pdf && m.pdf === false) { row.unsupported = true; rows.push(row); continue; }
    for (let i = 1; i <= repeat; i++) {
      const started = Date.now();
      let verdict;
      try {
        const r = await callModel(m, t.req, { timeoutMs: TIMEOUT_MS });
        verdict = t.check(r.text);
        row.cost += costOf(m, r.inTok, r.outTok) || 0;
        writeFileSync(join(outDir, `${m.id}__${t.task}__${t.name}__${i}.txt`), r.text);
      } catch (e) {
        verdict = { ok: false, notes: [`çağrı hatası: ${e.message}`] };
      }
      row.secs += (Date.now() - started) / 1000;
      row.n++;
      if (verdict.ok) row.ok++;
      for (const note of verdict.notes) row.notes[note] = (row.notes[note] || 0) + 1;
      console.log(`${verdict.ok ? "✔" : "✘"} ${m.id} · ${t.task} · ${t.name} #${i}${verdict.ok ? "" : " — " + verdict.notes.join("; ")}`);
    }
    rows.push(row);
  }
}

// ── Özet: model × görev ──
const merged = {};
for (const r of rows) {
  const k = `${r.model}|${r.task}`;
  const x = merged[k] ||= { ...r, ok: 0, n: 0, cost: 0, secs: 0, notes: {} };
  x.ok += r.ok; x.n += r.n; x.cost += r.cost; x.secs += r.secs;
  for (const [note, c] of Object.entries(r.notes)) x.notes[note] = (x.notes[note] || 0) + c;
}
const pct = v => `%${(v * 100).toFixed(1).replace(".", ",")}`;
const lines = [
  `# AI model denemesi — ${new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}`,
  "",
  `Tekrar: ${repeat}. "En az" sütunu %95 güvenle tek yönlü Clopper-Pearson alt sınırıdır. Hatasız sonuçta en az %90 sözü için ${runsNeeded(0.9)},`,
  `en az %95 için ${runsNeeded(0.95)} başarılı çağrı gerekir. Danışmanda yalnız biçim denetlenir; içerik kalitesini yanıt dosyalarını okuyarak siz değerlendirin.`,
  "",
  "| Model | Görev | Başarılı | En az | Çağrı başına $ | 1.000 çağrı $ | Ort. süre | Sık hata |",
  "|---|---|---|---|---|---|---|---|"
];
for (const r of Object.values(merged)) {
  if (r.unsupported) { lines.push(`| ${r.model} | ${r.task} | desteklemiyor | — | — | — | — | PDF girişi yok |`); continue; }
  const per = r.n ? r.cost / r.n : 0;
  const top = Object.entries(r.notes).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([n, c]) => `${n} (${c})`).join("; ");
  lines.push(`| ${r.model} | ${r.task} | ${r.ok}/${r.n} | ${pct(clopperPearsonLower(r.ok, r.n))} | ${r.costKnown ? per.toFixed(4) : "?"} | ${r.costKnown ? (per * 1000).toFixed(2) : "?"} | ${(r.secs / Math.max(1, r.n)).toFixed(1)} sn | ${top || "—"} |`);
}
writeFileSync(join(outDir, "ozet.md"), lines.join("\n") + "\n");
console.log("\n" + lines.join("\n"));
console.log(`\nYanıtlar ve özet: ${outDir}`);
