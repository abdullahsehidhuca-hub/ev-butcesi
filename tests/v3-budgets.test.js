// Çoklu bütçe: kullanıcının bütçe listesi ve açılışta hangi bütçenin açılacağı (src/v3/sync.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { budgetEntries, chooseBudget } from "../src/v3/sync.js";

test("eski tek bütçe kaydı ile yeni liste birleşir, aynı bütçe iki kez sayılmaz", () => {
  assert.deepEqual(budgetEntries(null, { familyId: "u1", role: "admin" }), [{ id: "u1", role: "admin" }]);
  assert.deepEqual(budgetEntries({ u1: { role: "admin" }, "b-x": { role: "member" } }, { familyId: "u1", role: "admin" }).map(b => b.id), ["u1", "b-x"]);
  assert.deepEqual(budgetEntries({ "b-x": {} }, { familyId: "u1" }).map(b => b.id), ["u1", "b-x"]);
  assert.deepEqual(budgetEntries(null, null), []);
});

test("tek bütçe kendiliğinden açılır, birden çoksa her açılışta sorulur", () => {
  const one = [{ id: "u1" }], two = [{ id: "u1" }, { id: "b-x" }];
  assert.equal(chooseBudget(one, null), "u1");
  assert.equal(chooseBudget(two, null), null);
  assert.equal(chooseBudget(two, "b-x"), "b-x");
  assert.equal(chooseBudget(two, "silinmis"), null);
  assert.equal(chooseBudget(one, "u1", true), null, "Başka bütçeye geç seçim ekranını açar");
  assert.equal(chooseBudget([], null), null);
});
