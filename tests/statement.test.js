import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyState, addAccount, addTransaction, addInstallmentPurchase,
  parseStatementLine, parseStatementText, reconcileStatement, statementInstallmentPlan, importStatementRows
} from "../src/core/index.js";

function setup() {
  let s = emptyState();
  s = addAccount(s, { id: "kart", name: "Kart", type: "credit", currency: "TRY" });
  s = addAccount(s, { id: "banka", name: "Banka", type: "bank", currency: "TRY" });
  s = addTransaction(s, { id: "m", type: "expense", date: "2026-11-03", amount: 123456, currency: "TRY", accountId: "kart", note: "Migros" });
  s = addTransaction(s, { id: "x", type: "expense", date: "2026-11-10", amount: 4999, currency: "TRY", accountId: "kart", note: "Ekstrede yok" });
  return s;
}

test("Ekstre satırı kuruşuyla, yuvarlanmadan okunur", () => {
  const r = parseStatementLine("05.11.2026 MIGROS ISTANBUL 1.234,56 TL");
  assert.equal(r.date, "2026-11-05");
  assert.equal(r.amount, 123456);
  assert.equal(r.credit, false);
  assert.match(r.description, /MIGROS/);
  assert.equal(parseStatementLine("2026-11-07;NETFLIX;149.99").amount, 14999);
  assert.equal(parseStatementLine("08/11/26 ÖDEME -5.000,00").credit, true);
  const t = parseStatementLine("01.11.2026 TEKNOSA 3/6 TAKSIT 1.500,00");
  assert.deepEqual(t.installment, { index: 3, total: 6 });
  assert.equal(parseStatementLine("Dönem borcu toplamı"), null);
});

test("Metin içindeki başlık ve toplam satırları atlanır", () => {
  const { rows, skipped } = parseStatementText("Tarih Açıklama Tutar\n05.11.2026 MIGROS 1.234,56\n\nToplam");
  assert.equal(rows.length, 1);
  assert.equal(skipped, 2);
});

test("Eşitleme: tam tutar + yakın tarih eşleşir; yalnız ekstrede ve yalnız uygulamada olanlar ayrılır", () => {
  const s = setup();
  const { rows } = parseStatementText([
    "05.11.2026 MIGROS 1.234,56",
    "06.11.2026 SHELL 1.234,57",
    "11.11.2026 YEMEKSEPETI 250,00"
  ].join("\n"));
  const r = reconcileStatement(s, "kart", rows);
  assert.equal(r.matched.length, 1);
  assert.equal(r.matched[0].tx.id, "m");
  assert.equal(r.matched[0].dayShift, 2);
  assert.deepEqual(r.onlyStatement.map(x => x.amount), [123457, 25000]);
  assert.deepEqual(r.onlyApp.map(t => t.id), ["x"]);
  assert.equal(r.totals.statement, 123456 + 123457 + 25000);
});

test("Taksit satırı kayıtlı taksitli alışverişle eşleşir ve gelecek ay yükü çıkar", () => {
  let s = setup();
  s = { ...s, settings: { ...s.settings, payDay: 1 } };
  s = addInstallmentPurchase(s, { id: "tk", name: "Teknosa", total: 900000, count: 6, accountId: "kart", date: "2026-09-02" });
  const { rows } = parseStatementText("02.11.2026 TEKNOSA 3/6 1.500,00\n03.11.2026 ZARA 2/3 333,33");
  const r = reconcileStatement(s, "kart", rows);
  const tk = r.installments.find(i => i.row.amount === 150000);
  assert.equal(tk.obligationId, "tk");
  const zara = r.installments.find(i => i.row.amount === 33333);
  assert.equal(zara.obligationId, null);
  const plan = statementInstallmentPlan(s, rows, { linked: { [tk.row.line]: true } });
  assert.equal(plan[0].period, "2026-12");
  assert.equal(plan[0].total, 150000 + 33333);
  assert.equal(plan[0].unrecorded, 33333);
  assert.equal(plan.length, 3);
});

test("Yalnız ekstrede olanlar içe alınır; taksit kalem olarak, kuruş korunur", () => {
  let s = setup();
  let n = 0;
  const { rows } = parseStatementText("11.11.2026 YEMEKSEPETI 250,05\n03.11.2026 ZARA 2/3 333,33");
  const out = importStatementRows(s, "kart", rows, { newId: () => `n${++n}`, now: new Date("2026-11-12T10:00:00Z") });
  assert.equal(out.added.length, 2);
  const tx = Object.values(out.state.transactions).find(t => t.note === "YEMEKSEPETI");
  assert.equal(tx.amount, 25005);
  const ob = Object.values(out.state.obligations)[0];
  assert.equal(ob.count, 3);
  assert.equal(ob.amount, 33333);
});
