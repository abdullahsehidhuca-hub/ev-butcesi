import test from "node:test";
import assert from "node:assert/strict";
import { emptyState, addAccount, addInstallmentPurchase, parseFutureInstallments, compareFutureInstallments } from "../src/core/index.js";

test("Gelecek ay taksitleri: ay adı, kısaltma, sayısal ay ve alt alta düşen satırlar kuruşuyla okunur", () => {
  const text = [
    "Gelecek dönem taksitleri",
    "Aralık 2026 3.450,25 TL",
    "OCAK 2027",
    "1.200,00 TL",
    "Şub 2.100,10",
    "03/2027 980,10",
    "05.11.2026 MIGROS 12,00",
    "Toplam 7.730,45"
  ].join("\n");
  const { months, lines } = parseFutureInstallments(text, { today: "2026-11-09" });
  assert.equal(lines, 4);
  assert.deepEqual(months, [
    { period: "2026-12", amount: 345025 },
    { period: "2027-01", amount: 120000 },
    { period: "2027-02", amount: 210010 },
    { period: "2027-03", amount: 98010 }
  ]);
});

test("Aynı aya düşen satırlar toplanır; yılsız ay bugünden sonraki ilk o ay sayılır", () => {
  const { months } = parseFutureInstallments("Ocak 500,50\nOcak 99,50\nKasım 10,00", { today: "2026-11-09" });
  assert.deepEqual(months, [{ period: "2026-11", amount: 1000 }, { period: "2027-01", amount: 60000 }]);
});

test("Bankanın aylık taksit tutarı uygulamadaki kart taksit yüküyle kıyaslanır", () => {
  let s = emptyState();
  s = addAccount(s, { id: "kart", name: "Kart", type: "credit", currency: "TRY" });
  s = { ...s, settings: { ...s.settings, payDay: 1 } };
  s = addInstallmentPurchase(s, { id: "tk", name: "Teknosa", total: 600000, count: 6, accountId: "kart", date: "2026-11-02" });
  const r = compareFutureInstallments(s, "kart", [{ period: "2026-12", amount: 100000 }, { period: "2027-01", amount: 133333 }]);
  assert.deepEqual(r[0], { period: "2026-12", bank: 100000, app: 100000, diff: 0 });
  assert.equal(r[1].diff, 33333);
});
