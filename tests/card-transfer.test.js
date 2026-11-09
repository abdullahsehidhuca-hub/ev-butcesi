import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyState, addAccount, addTransaction, updateTransaction,
  untransferredCardExpenses, cardTransferSummary, markCardTransferred
} from "../src/core/index.js";
import { parseAmount, fmtMoney } from "../src/v3/format.js";

function setup() {
  let s = emptyState();
  s = addAccount(s, { id: "kart", name: "Kart", type: "credit", currency: "TRY" });
  s = addAccount(s, { id: "banka", name: "Banka", type: "bank", currency: "TRY" });
  s = addTransaction(s, { id: "a", type: "expense", date: "2026-11-01", amount: 12345, currency: "TRY", accountId: "kart" });
  s = addTransaction(s, { id: "b", type: "expense", date: "2026-11-08", amount: 1999, currency: "TRY", accountId: "kart" });
  s = addTransaction(s, { id: "c", type: "expense", date: "2026-11-02", amount: 500, currency: "TRY", accountId: "banka" });
  return s;
}

test("Karta aktarılmamış kart harcamaları listelenir; 2+ gündür bekleyenler ayrılır", () => {
  const s = setup();
  const sum = cardTransferSummary(s, "2026-11-09");
  assert.deepEqual(sum.list.map(t => t.id), ["a", "b"]);
  assert.equal(sum.total, 14344);
  assert.deepEqual(sum.stale.map(t => t.id), ["a"]);
  assert.equal(sum.staleTotal, 12345);
});

test("Karta aktarıldı bayrağı konur ve kaldırılır; banka harcaması işaretlenemez", () => {
  let s = setup();
  s = markCardTransferred(s, ["a", "b"], "2026-11-09");
  assert.equal(untransferredCardExpenses(s).length, 0);
  assert.equal(s.transactions.a.cardTransferredAt, "2026-11-09");
  assert.equal(s.transactions.a.amount, 12345);
  s = markCardTransferred(s, "b", null);
  assert.deepEqual(untransferredCardExpenses(s).map(t => t.id), ["b"]);
  assert.equal("cardTransferredAt" in s.transactions.b, false);
  assert.throws(() => markCardTransferred(s, "c", "2026-11-09"));
  assert.throws(() => markCardTransferred(s, "a", "9 Kasım"));
});

test("Düzenleme karta aktarıldı bayrağını korur", () => {
  let s = markCardTransferred(setup(), "a", "2026-11-09");
  s = updateTransaction(s, "a", { note: "Migros" });
  assert.equal(s.transactions.a.cardTransferredAt, "2026-11-09");
});

test("Kuruş yuvarlanmaz: ekstredeki iki basamak aynen girilir ve gösterilir", () => {
  assert.equal(parseAmount("1.234,56"), 123456);
  assert.equal(parseAmount("0,01"), 1);
  assert.equal(parseAmount("2.049,99"), 204999);
  assert.equal(parseAmount("12,345"), null);
  assert.equal(fmtMoney(1250), "12,50 ₺");
  assert.equal(fmtMoney(10010), "100,10 ₺");
  assert.equal(fmtMoney(204999), "2.049,99 ₺");
  assert.equal(fmtMoney(1455000), "14.550 ₺");
});
