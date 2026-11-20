import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyState, addAccount, addObligation, ValidationError, balanceOf, recordReconciliation, reconcile,
  setAllowance, dueAllowances, applyAllowances, nextAllowanceDate, isoWeekday, fundingNeeds, reconcileDue
} from "../src/core/index.js";

const NOW = new Date("2026-11-20T09:00:00Z");

// Ana hesap, konfor kartı (ön ödemeli) ve talimat hesabı. 2026-11-16 Pazartesi.
function fixture() {
  let s = emptyState();
  s = { ...s, settings: { ...s.settings, payDay: 15, defaultAccountId: "main" } };
  s = addAccount(s, { id: "main", name: "Ana hesap", type: "bank", currency: "TRY", opening: { date: "2026-11-15", balance: 50000_00 } });
  s = addAccount(s, { id: "konfor", name: "Konfor kartı", type: "prepaid", currency: "TRY", opening: { date: "2026-11-15", balance: 0 } });
  s = addAccount(s, { id: "talimat", name: "Talimat hesabı", type: "bank", currency: "TRY", opening: { date: "2026-11-15", balance: 0 } });
  s = addAccount(s, { id: "kart", name: "Kart", type: "credit", currency: "TRY", opening: { date: "2026-11-15", balance: 0 } });
  s = addObligation(s, { id: "maas", kind: "income", name: "Maaş", amount: 60000_00, currency: "TRY", accountId: "main", startPeriod: "2026-11", dueDay: 15 });
  return s;
}

test("haftalık harçlık: yükleme gününde aktarım yazılır, iki kez yazılmaz", () => {
  assert.equal(isoWeekday("2026-11-16"), 1);
  let s = setAllowance(fixture(), "konfor", { amount: 1500_00, weekday: 1, fromAccountId: "main" }, "2026-11-16");
  // Tanımlandığı gün yüklenmez; bir sonraki Pazartesi yüklenir.
  assert.deepEqual(dueAllowances(s, "2026-11-22"), []);
  assert.equal(nextAllowanceDate(s.accounts.konfor, "2026-11-16"), "2026-11-23");
  s = applyAllowances(s, "2026-11-30", { now: NOW });
  assert.deepEqual(Object.keys(s.transactions).sort(), ["allow-konfor-2026-11-23", "allow-konfor-2026-11-30"]);
  assert.equal(balanceOf(s, "konfor", "2026-11-30"), 3000_00);
  assert.equal(balanceOf(s, "main", "2026-11-30"), 47000_00);
  assert.equal(applyAllowances(s, "2026-11-30", { now: NOW }), s, "bekleyen yükleme yoksa durum aynı kalır");
  // Kullanıcı bir yüklemeyi silerse yeniden yazılmaz.
  const { ["allow-konfor-2026-11-23"]: _, ...rest } = s.transactions;
  assert.deepEqual(dueAllowances({ ...s, transactions: rest }, "2026-11-30"), []);
});

test("haftalık harçlık: kart, aynı hesap ve farklı para birimi reddedilir; kaldırılabilir", () => {
  const s = fixture();
  assert.throws(() => setAllowance(s, "kart", { amount: 100_00, weekday: 1, fromAccountId: "main" }, "2026-11-16"), ValidationError);
  assert.throws(() => setAllowance(s, "konfor", { amount: 100_00, weekday: 1, fromAccountId: "konfor" }, "2026-11-16"), ValidationError);
  assert.throws(() => setAllowance(s, "konfor", { amount: 0, weekday: 1, fromAccountId: "main" }, "2026-11-16"), ValidationError);
  const on = setAllowance(s, "konfor", { amount: 100_00, weekday: 3, fromAccountId: "main" }, "2026-11-16");
  assert.equal(setAllowance(on, "konfor", null, "2026-11-16").accounts.konfor.allowance, undefined);
});

test("talimat hesabı: talimatlı ödemeler için eksik tutar sorulur, aktarılınca ya da atlanınca kaybolur", () => {
  let s = addObligation(fixture(), { id: "kira", kind: "fixed", name: "Kira", amount: 20000_00, currency: "TRY", accountId: "talimat", startPeriod: "2026-11", dueDay: 1, autopayFrom: "2026-11" });
  s = addObligation(s, { id: "elek", kind: "fixed", name: "Elektrik", amount: 1000_00, currency: "TRY", accountId: "talimat", startPeriod: "2026-11", dueDay: 5 });
  const [need] = fundingNeeds(s, "2026-11-20", "main");
  assert.equal(need.accountId, "talimat");
  assert.equal(need.amount, 20000_00, "yalnız talimatlı ödemeler sayılır");
  const funded = { ...s, transactions: { t1: { id: "t1", type: "transfer", date: "2026-11-18", amount: 20000_00, currency: "TRY", accountId: "main", toAccountId: "talimat" } } };
  assert.deepEqual(fundingNeeds(funded, "2026-11-20", "main"), []);
  const skipped = { ...s, settings: { ...s.settings, fundingSkips: [need.key] } };
  assert.deepEqual(fundingNeeds(skipped, "2026-11-20", "main"), []);
});

test("karşılaştırma hatırlatması: son karşılaştırmadan bu yana süre dolan hesaplar, erteleme ve kart hariç", () => {
  let s = fixture();
  assert.deepEqual(reconcileDue(s, "2026-11-20"), []);
  assert.deepEqual(reconcileDue(s, "2026-11-22").map(a => a.accountId).sort(), ["konfor", "main", "talimat"]);
  s = recordReconciliation(s, reconcile(s, "main", "2026-11-21", 50000_00));
  assert.deepEqual(reconcileDue(s, "2026-11-22").map(a => a.accountId).sort(), ["konfor", "talimat"]);
  assert.deepEqual(reconcileDue(s, "2026-11-22", 30), []);
  s = { ...s, settings: { ...s.settings, reconcileSnooze: "2026-11-25" } };
  assert.deepEqual(reconcileDue(s, "2026-11-22"), []);
});
