import { test } from "node:test";
import assert from "node:assert/strict";
import { convertLegacy, isLegacyData } from "../src/v3/legacyImport.js";
import { computePeriod } from "../src/core/index.js";

const legacy = () => ({
  settings: {
    payDay: 15, monthlyBudget: 50000,
    cards: [{ id: "k1", name: "Bonus", type: "credit", cutoffDay: 28 }, { id: "k2", name: "Banka kartı", type: "debit" }],
    variableExpenses: [{ id: "v1", name: "Market", expectedAmount: 12000, keywords: ["migros"] }],
    fixedExpenses: [
      { id: "f1", name: "Kira", amount: 20000, paymentMethod: "account", paymentDay: 5 },
      { id: "f2", name: "Netflix", amount: 229.99, paymentMethod: "cc", cardId: "k1" },
      { id: "f3", name: "Bozuk", amount: 0, paymentMethod: "account" }
    ]
  },
  months: {
    "2026-10": {
      incomeEntries: [{ id: "i1", name: "Maaş", amount: 60000, date: "2026-10-15" }],
      ccSingle: [{ id: "c1", amount: 1250.5, note: "Migros", date: "2026-10-20", cardId: "k1", categoryId: "v1" }],
      accountEntries: [{ id: "a1", amount: 450, note: "Eczane", date: "", categoryId: null }],
      billEntries: [{ id: "b1", name: "Elektrik", amount: 900, paid: true, paymentMethod: "account", date: "2026-10-18" }, { id: "b2", name: "Su", amount: 300, paid: false }],
      fixedPaid: { f1: true },
      ccTransferred: { "single-c1": { transferred: true, date: "2026-10-22" }, "fixed-f2": { transferred: true, date: "2026-10-25" }, "inst-p1": { transferred: true, date: "2026-10-26" }, "single-yok": { transferred: true } }
    },
    "2026-11": { incomeEntries: [], ccSingle: [], accountEntries: [] }
  },
  installmentPlans: [{ id: "p1", monthlyPayment: 1000, months: 6, startMonth: "2026-09", note: "Buzdolabı", cardId: "k1", categoryId: "v1" }],
  debts: [
    { id: "d1", name: "Kredi", monthlyPayment: 3000, remainingMonths: 10, currency: "TRY" },
    { id: "d2", name: "Altın borcu", monthlyPayment: 2, remainingMonths: 5, currency: "XAU" },
    { id: "d3", name: "Biten", monthlyPayment: 100, remainingMonths: 0, currency: "TRY" }
  ],
  savings: { TRY: [{ id: "s1", type: "buy", amount: 1000, unitPrice: 1, date: "2026-10-30", note: "Ekim artığı" }], USD: [], EUR: [], XAU: [{ type: "buy", amount: 2 }] }
});

test("eski veri tanınır, başka dosya reddedilir", () => {
  assert.equal(isLegacyData(legacy()), true);
  assert.equal(isLegacyData({ app: "ev-butcesi-v3", state: {} }), false);
  assert.throws(() => convertLegacy({ foo: 1 }), /eski Ev Bütçesi/);
});

test("hesaplar, kategoriler, yükümlülükler ve işlemler kuruş olarak aktarılır", () => {
  const { state: s, warnings, counts } = convertLegacy(legacy(), { today: "2026-11-20" });
  assert.equal(s.settings.payDay, 15);
  assert.deepEqual(Object.keys(s.accounts).sort(), ["eski-birikim", "eski-hesap", "eski-kart-k1", "eski-kart-k2"]);
  assert.equal(s.accounts["eski-kart-k1"].cutoffDay, 28);
  assert.equal(s.accounts["eski-kart-k2"].type, "debit");
  assert.equal(s.categories["eski-kat-v1"].budget, 12000_00);
  assert.equal(s.obligations["eski-sabit-f2"].amount, 22999);
  assert.equal(s.obligations["eski-sabit-f2"].accountId, "eski-kart-k1");
  assert.equal(s.obligations["eski-sabit-f1"].dueDay, 5);
  assert.equal(s.obligations["eski-taksit-p1"].count, 6);
  assert.equal(s.obligations["eski-borc-d1"].startPeriod, "2026-11");
  assert.equal(s.obligations["eski-borc-d3"], undefined, "biten borç aktarılmaz");
  const kk = s.transactions["eski-kk-2026-10-c1"];
  assert.equal(kk.amount, 125050);
  assert.equal(kk.categoryId, "eski-kat-v1");
  assert.equal(kk.period, "2026-10");
  assert.equal(s.transactions["eski-hes-2026-10-a1"].date, "2026-10-15", "tarihsiz kayıt dönem başına yazılır");
  assert.equal("categoryId" in s.transactions["eski-hes-2026-10-a1"], false);
  assert.ok(s.transactions["eski-fatura-2026-10-b1"]);
  assert.equal(counts.payments, 4, "1 sabit gider + 2 ay maaş + karta aktarılan Netflix");
  // Karta aktarıldı bayrağı: harcamaya tarih yazılır, bankadan karta aynı tutarda aktarım oluşur.
  assert.equal(kk.cardTransferredAt, "2026-10-22");
  assert.deepEqual([s.transactions["eski-aktarim-2026-10-single-c1"].amount, s.transactions["eski-aktarim-2026-10-single-c1"].toAccountId], [125050, "eski-kart-k1"]);
  assert.equal(s.transactions["eski-odeme-2026-10-f2"].cardTransferredAt, "2026-10-25", "karttaki sabit gider ödenmiş ve aktarılmış");
  assert.equal(s.transactions["eski-aktarim-2026-10-inst-p1"].amount, 1000_00, "taksit aylık tutarı karta aktarıldı");
  assert.equal(s.transactions["eski-aktarim-2026-10-single-yok"], undefined, "olmayan harcama için aktarım yazılmaz");
  // Aylık bütçe maaş gelir kalemi olur, yedekteki aylar için alınmış yazılır; ay bütçesi farkı değişiklik olarak kalır.
  assert.equal(s.obligations["eski-maas"].kind, "income");
  assert.equal(s.obligations["eski-maas"].amount, 50000_00);
  assert.equal(s.transactions["eski-maas-2026-10"].type, "income");
  assert.equal(s.transactions["eski-maas-2026-10"].period, "2026-10");
  // TL birikim havuzu: Birikim hesabı + banka hesabından aktarım; döviz / altın için uyarı.
  assert.equal(s.accounts["eski-birikim"].type, "bank");
  const tr = s.transactions["eski-birikim-s1"];
  assert.equal(tr.type, "transfer");
  assert.equal(tr.accountId, "eski-hesap");
  assert.equal(tr.toAccountId, "eski-birikim");
  assert.equal(tr.amount, 1000_00);
  assert.ok(warnings.some(w => w.includes("Bozuk")));
  assert.ok(warnings.some(w => w.includes("Altın borcu")));
  assert.ok(warnings.some(w => w.includes("Su")));
  assert.ok(warnings.some(w => w.includes("Döviz / altın birikimi")));
  const p = computePeriod(s, "2026-10");
  assert.equal(p.obligations.items.find(i => i.obligationId === "eski-sabit-f1").settled, true);
});

test("dönüşüm sonucu JSON'a çevrilebilir (undefined alan kalmaz)", () => {
  const { state } = convertLegacy(legacy(), { today: "2026-11-20" });
  assert.deepEqual(JSON.parse(JSON.stringify(state.transactions)), state.transactions);
});
