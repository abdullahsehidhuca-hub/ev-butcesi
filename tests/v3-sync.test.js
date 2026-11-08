// v3 bulut eşitlemesi: Realtime Database'in saklama biçimi bellekte taklit edilir (null, boş nesne ve
// boş dizi tutulmaz). Firebase'e bağlanılmaz. Çalıştırma: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSampleState, SAMPLE_TODAY } from "../src/v3/sampleData.js";
import { toCloud, fromCloud, clean, diffTrees, applyPatch, mergeRemote, pendingFor, encodeKey, decodeKey, stampCreatedBy, cloudPath } from "../src/v3/sync.js";
import { closePeriod, computePeriod, quickAdd, updateTransaction, deleteTransaction } from "../src/core/index.js";
import { closeCandidate } from "../src/v3/selectors.js";

const state = buildSampleState();
// Veritabanına yazılıp geri okunmuş gibi (JSON + boş alanların düşmesi).
const stored = tree => clean(JSON.parse(JSON.stringify(tree))) || {};
const now = new Date(`${SAMPLE_TODAY}T12:00:00`);

test("v3 eski uygulamanın veri yolundan ayrı yolda tutulur", () => {
  assert.equal(cloudPath("fam1"), "families/fam1/v3");
  assert.notEqual(cloudPath("fam1"), "families/fam1/data");
});

test("Bulut biçimine çevrilip geri okunan veri aynı hesap sonucunu verir ve yeniden yazma gerektirmez", () => {
  const back = fromCloud(stored(toCloud(state)));
  const p = "2026-11";
  assert.deepEqual(computePeriod(back, p), computePeriod(state, p));
  assert.deepEqual(pendingFor(stored(toCloud(state)), back), {});
});

test("Kapatılmış dönem buluttan geri okununca boş listeler geri gelir", () => {
  const c = closeCandidate(state, SAMPLE_TODAY);
  const closed = closePeriod(state, c.period, { decisions: Object.fromEntries(c.open.map(i => [i.obligationId, "drop"])) });
  const back = fromCloud(stored(toCloud(closed)));
  const s = computePeriod(back, c.period);
  assert.ok(Array.isArray(s.obligations.items) && Array.isArray(s.budgets.items) && Array.isArray(s.missingRates));
  assert.equal(s.remaining, closed.closedPeriods[c.period].remaining);
});

test("Yasak karakterli anahtarlar kaçırılır ve aynen geri çözülür", () => {
  for (const k of ["a.b", "x#y$z", "p/q", "[k]", "%25", "migros konya"]) {
    assert.ok(!/[.#$[\]/]/.test(encodeKey(k)));
    assert.equal(decodeKey(encodeKey(k)), k);
  }
});

test("Fark yalnız değişen kayıtları içerir; silme null olarak yazılır", () => {
  const base = stored(toCloud(state));
  const t = Object.values(state.transactions)[0];
  const edited = updateTransaction(state, t.id, { amount: t.amount + 100 });
  const patch = diffTrees(base, toCloud(edited));
  assert.deepEqual(Object.keys(patch), [`transactions/${t.id}`]);
  const removed = diffTrees(base, toCloud(deleteTransaction(state, t.id)));
  assert.deepEqual(removed, { [`transactions/${t.id}`]: null });
  assert.deepEqual(fromCloud(applyPatch(base, patch)).transactions[t.id].amount, t.amount + 100);
});

test("Çevrimdışı değişiklik, bu arada eşin yaptığı değişikliği silmeden birleşir", () => {
  const base = stored(toCloud(state));
  // Bu cihaz çevrimdışıyken bir harcama ekledi.
  const mine = quickAdd(state, { amount: 12300, categoryId: Object.keys(state.categories)[0], note: "Fırın" }, { id: "benim", now }).state;
  // Eş aynı sürede başka bir harcamayı sildi ve yeni harcama ekledi.
  const victim = Object.keys(state.transactions)[1];
  const spouse = quickAdd(deleteTransaction(state, victim), { amount: 4500, categoryId: Object.keys(state.categories)[0], note: "Simit" }, { id: "esin", now }).state;
  const remote = stored(toCloud(spouse));
  const r = mergeRemote({ remote, base, local: mine });
  assert.ok(r.state.transactions.benim, "bu cihazın kaydı kalmalı");
  assert.ok(r.state.transactions.esin, "eşin kaydı gelmeli");
  assert.equal(r.state.transactions[victim], undefined, "eşin sildiği kayıt geri gelmemeli");
  assert.deepEqual(Object.keys(r.pending), ["transactions/benim"]);
});

test("Aileye ilk bağlanışta: bulut doluysa bulut geçerli, bu cihazın verisi karışmaz; bulut boşsa yükleme sorulur", () => {
  const remote = stored(toCloud(state));
  const other = quickAdd(state, { amount: 999, note: "yerel" }, { id: "yerel-1", now }).state;
  const r = mergeRemote({ remote, base: null, local: other });
  assert.equal(r.state.transactions["yerel-1"], undefined);
  assert.equal(r.keepLocalCopy, true);
  assert.deepEqual(r.pending, {});
  assert.equal(mergeRemote({ remote: null, base: null, local: state }).needsUpload, true);
  assert.equal(mergeRemote({ remote: null, base: null, local: fromCloud(null) }).needsUpload, false);
});

test("Yeni işleme ekleyen kişi yazılır; mevcut işlemlere dokunulmaz", () => {
  const next = quickAdd(state, { amount: 100, note: "çay" }, { id: "yeni", now }).state;
  const stamped = stampCreatedBy(state, next, "uid-1");
  assert.equal(stamped.transactions.yeni.createdBy, "uid-1");
  for (const id of Object.keys(state.transactions)) assert.equal(stamped.transactions[id], state.transactions[id]);
  assert.equal(stampCreatedBy(state, next, null), next);
});
