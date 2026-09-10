import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const bank = JSON.parse(readFileSync(new URL("../data/bank.json", import.meta.url), "utf8"));
const auditedTerms = [
  "2016年下半年", "2017年下半年", "2018年下半年", "2019年下半年",
  "2020年下半年", "2021年下半年", "2022年下半年", "2023年下半年",
  "2024年上半年", "2024年下半年", "2025年上半年", "2025年下半年",
];
const originalCounts = { choices: 1822, cases: 78, essays: 60 };

test("keeps choice questions structurally valid", () => {
  assert.equal(new Set(bank.choices.map((item) => item.id)).size, bank.choices.length);
  for (const question of bank.choices) {
    assert.match(question.answer, /^[A-D]$/, question.id);
    assert.deepEqual(Object.keys(question.options).sort(), ["A", "B", "C", "D"], question.id);
    assert.ok(question.stem.trim(), question.id);
  }
});

test("never reduces the original project bank", () => {
  assert.ok(bank.choices.length >= originalCounts.choices);
  assert.ok(bank.cases.length >= originalCounts.cases);
  assert.ok(bank.essays.length >= originalCounts.essays);
});

test("covers every audited real exam", () => {
  for (const term of auditedTerms) {
    const choices = bank.choices.filter((item) => item.sourceType === "real" && item.term === term);
    const cases = bank.cases.filter((item) => item.sourceType === "real" && item.term === term);
    const essays = bank.essays.filter((item) => item.sourceType === "real" && item.term === term);
    assert.deepEqual(choices.map((item) => item.questionNo).sort((a, b) => a - b), Array.from({ length: 75 }, (_, index) => index + 1), term);
    assert.ok(cases.length >= 5, term);
    assert.ok(essays.length >= 4, term);
    if (/^201[6-9]/.test(term)) {
      assert.equal(cases.every((item) => item.description.trim() && item.subQuestions[0].prompt.trim()), true, term);
      assert.equal(essays.every((item) => item.prompt.trim() && item.writingPoints.trim()), true, term);
    }
  }
});
