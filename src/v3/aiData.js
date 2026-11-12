// Yapay zekâya giden ve ondan gelen verinin saf dönüşümleri: danışman istemi, danışman yanıtının satırları ve
// fiş sonucundan harcama taslağı. Ağ ve tarayıcı kullanmaz; testlerde de çalışır.
// İsteme toplamlar, kategori / düzenli ödeme / hedef adları girer; işlem açıklamaları ve aile üyelerinin adları girmez.
import { aiAmount } from "../core/index.js";
import { overview, report, spendingTrend, paymentsView, savingsView, periodLabel, dayNum, monthLong, fmt } from "./selectors.js";

const when = d => `${dayNum(d)} ${monthLong(d)}`;
const line = (label, minor) => `- ${label}: ${fmt(minor)}`;

// Danışmana gönderilecek metin: bu dönemin özeti, kategoriler, ödenmemiş ödemeler, önceki dönemler,
// önümüzdeki 6 dönemin planı, birikim ve istenen yanıt biçimi.
export function advisorPrompt(state, today) {
  const o = overview(state, today);
  const r = report(state, today);
  const pv = paymentsView(state, o.period);
  const sv = savingsView(state, today);
  const open = [...pv.before, ...pv.after].filter(i => !i.paid && !i.auto && i.open > 0);
  const past = spendingTrend(state, today, 6).filter(t => !t.current && (t.spent || t.obligations || t.income));
  const bar = o.salaryBar;

  const out = [
    "Bir Türk ailesinin bütçe uygulamasından alınmış özet. Tutarlar Türk lirasıdır.",
    `Bugün ${when(today)} ${today.slice(0, 4)}. Dönem maaştan maaşa: ${when(o.start)} – ${when(o.end)}; ${o.totalDays} günün ${o.day}. günü, ${o.daysLeft} gün kaldı.`,
    "", "## Bu dönem",
    line("Beklenen gelir", bar.income), line("Alınan gelir", bar.received),
    line("Düzenli ödemeler (toplam)", bar.obligations), line("Düzenli ödemelerden henüz ödenmeyen", bar.pending),
    line("Serbest harcama (şimdiye kadar)", bar.spent), line("Kategori bütçelerinde ayrılmış, henüz harcanmamış", bar.reserved),
    line("Gelir − ödemeler − harcama", o.free), line("Harcanabilir (bütçe payları da düşülmüş)", o.safe), line("Günlük harcanabilir", o.perDay)
  ];
  if (o.pace.plan > 0) out.push(`- Bütçeli kategoriler: harcanan ${fmt(o.pace.spent)}, bugüne düşen plan ${fmt(o.pace.expected)}, bu hızla dönem sonu ${fmt(o.pace.projected)} (plan ${fmt(o.pace.plan)})`);

  if (r.rows.length) {
    out.push("", "## Kategorilere göre serbest harcama (bu dönem · önceki dönem)");
    for (const x of r.rows) out.push(`- ${x.name}: ${fmt(x.value)} · ${fmt(x.prev)}`);
  }
  if (r.limits.length) {
    out.push("", "## Kategori limitleri");
    for (const l of r.limits) out.push(`- ${l.name}: harcanan ${fmt(l.spent)} / limit ${fmt(l.budget)}, bu hızla dönem sonu ${fmt(l.projected)}`);
  }
  if (open.length) {
    out.push("", "## Bu dönem henüz ödenmemiş ödemeler");
    for (const i of open) out.push(`- ${when(i.date)} · ${i.name} · ${fmt(i.open)}${i.total && i.index ? ` (taksit ${i.index}/${i.total})` : ""}`);
  }
  if (past.length) {
    out.push("", "## Önceki dönemler");
    for (const t of past) out.push(`- ${periodLabel(t.period)}: gelir ${fmt(t.income)}, düzenli ödemeler ${fmt(t.obligations)}, serbest harcama ${fmt(t.spent)}`);
  }
  out.push("", "## Önümüzdeki 6 dönemin planı (gelir − ödemeler − kategori bütçeleri)");
  for (const m of r.projection) {
    out.push(`- ${periodLabel(m.period)}: ${fmt(m.free)} (gelir ${fmt(m.income)}, ödemeler ${fmt(m.obligations)}${m.budgets ? `, bütçeler ${fmt(m.budgets)}` : ""})${m.ending.length ? `; biten: ${m.ending.join(", ")}` : ""}`);
  }
  out.push("", "## Birikim", line("Ana hesap dışındaki varlıkların TL karşılığı", sv.savingsTotal));
  if (sv.emergency.monthly > 0) out.push(`- Aylık zorunlu gider (ödemeler + bütçeler) ${fmt(sv.emergency.monthly)}; ${sv.emergency.months} aylık acil durum fonu önerisi ${fmt(sv.emergency.target)}`);
  for (const g of sv.goals) out.push(`- Hedef "${g.name}": ${fmt(g.saved)} / ${fmt(g.target)} (%${g.percent})${g.monthlyNeeded != null ? `, her dönem ${fmt(g.monthlyNeeded)} ayrılmalı` : ""}`);

  out.push("", "## İstenen",
    "Bu veriye göre aileye kısa ve uygulanabilir bir değerlendirme yaz. Başlıklar:",
    "1. Durum: en fazla 3 madde.",
    "2. Riskler: dönem sonu ve önümüzdeki 3 dönem için, tarih ve tutarla.",
    "3. Kategoriler: önceki döneme göre belirgin değişimler ve olası nedenleri.",
    "4. 5 somut adım: her birinde TL tutar ve tahmini aylık etki.",
    "Yalnız verilen veriye dayan; veride olmayan konuları (fiş, fatura geçmişi, kur) tahmin etme, gerekirse eksik olduğunu söyle. Tablo kullanma; en fazla 450 kelime yaz.");
  return out.join("\n");
}

// Danışman yanıtı (Markdown) ekranda düz metin olarak gösterilir: başlık, madde ve paragraf satırlarına ayrılır,
// vurgu işaretleri atılır. HTML olarak basılmaz.
export function adviceBlocks(text) {
  const blocks = [];
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const s = raw.replace(/\*\*|__|`/g, "").trim();
    if (!s || /^(-{3,}|\*{3,}|_{3,})$/.test(s)) continue;
    const h = s.match(/^#{1,6}\s+(.*)$/);
    const li = s.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (h) blocks.push({ type: "h", text: h[1] });
    else if (li) blocks.push({ type: "li", text: /^\d/.test(s) ? s : li[1] });
    else blocks.push({ type: "p", text: s });
  }
  return blocks;
}

// Fiş okumasının sonucundan hızlı harcama taslağı. Toplam okunamadıysa kalemlerden (adet × birim fiyat) hesaplanır.
// { amount: kuruş | null, store, items: kalem sayısı, fromItems: tutar kalemlerden mi hesaplandı }
export function receiptDraft(result) {
  const items = Array.isArray(result?.items) ? result.items : [];
  const itemsTotal = Math.round(items.reduce((s, it) => s + aiAmount(it?.price) * (Number(it?.qty) > 0 ? Number(it.qty) : 1), 0));
  const total = aiAmount(result?.totalAmount);
  const amount = total || itemsTotal;
  return {
    amount: amount > 0 ? amount : null,
    store: String(result?.store ?? "").replace(/\s+/g, " ").trim().slice(0, 60),
    items: items.length,
    fromItems: !total && itemsTotal > 0
  };
}
