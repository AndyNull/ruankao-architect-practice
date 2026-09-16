import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getLocalCaseExplanation } from "../src/ai.mjs";
import { buildPracticeSet, uniqueSorted } from "../src/core.mjs";

const index = JSON.parse(readFileSync(new URL("../data/banks/index.json", import.meta.url), "utf8"));

test("catalog exposes the five supported subjects", () => {
  assert.deepEqual(index.subjects.map((subject) => subject.id), ["architect", "planner", "itpm", "analyst", "network"]);
  assert.equal(index.defaultSubject, "architect");
});

test("each generated subject bank is answerable and has unique ids", () => {
  for (const subject of index.subjects) {
    const bank = JSON.parse(readFileSync(new URL(`../${subject.bankUrl.replace(/^\.\//, "")}`, import.meta.url), "utf8"));
    assert.ok(bank.choices.length > 0, subject.id);
    assert.equal(new Set(bank.choices.map((item) => item.id)).size, bank.choices.length, subject.id);
    for (const question of bank.choices) {
      assert.match(question.answer, /^[A-D]$/, `${subject.id}:${question.id}`);
      assert.deepEqual(Object.keys(question.options).sort(), ["A", "B", "C", "D"], question.id);
      assert.ok(question.stem.trim(), question.id);
    }
    assert.ok(bank.cases.length > 0, `${subject.id} cases`);
    assert.ok(bank.essays.length > 0, `${subject.id} essays`);
    assert.equal(new Set(bank.cases.map((item) => item.id)).size, bank.cases.length, `${subject.id} case ids`);
    for (const item of bank.cases) {
      for (const question of item.subQuestions) {
        assert.equal(typeof question.reference_answer, "string", `${subject.id}:${item.id} case answer type`);
        assert.doesNotMatch(question.reference_answer, /暂无|待补|请先|应用市场|\[object Object\]/u, `${subject.id}:${item.id} case answer completeness`);
      }
    }
    for (const item of bank.essays) {
      assert.equal(typeof item.writingPoints, "string", `${subject.id}:${item.id} essay answer type`);
      assert.doesNotMatch(item.writingPoints, /暂无|待补|请先|应用市场|\[object Object\]/u, `${subject.id}:${item.id} essay answer completeness`);
    }
    const caseExplanationUrl = subject.caseExplanationUrl || "./data/ai-case-explanations.json";
    const caseExplanations = JSON.parse(readFileSync(new URL(`../${caseExplanationUrl.replace(/^\.\//, "")}`, import.meta.url), "utf8"));
    assert.equal(Object.keys(caseExplanations.explanations || {}).length, bank.cases.length, `${subject.id} case explanation count`);
    for (const item of bank.cases) {
      assert.ok(caseExplanations.explanations[item.id], `${subject.id}:${item.id} case explanation`);
      assert.ok(getLocalCaseExplanation(item, caseExplanations.explanations), `${subject.id}:${item.id} current case explanation`);
    }
    if (subject.id !== "architect") {
      const pending = JSON.parse(readFileSync(new URL(`../data/banks/${subject.id}-pending.json`, import.meta.url), "utf8"));
      assert.equal(pending.choices.length, bank.manifest.counts.pending_choice_answers, `${subject.id} pending count`);
      assert.ok(pending.choices.every((item) => !/^[A-D]$/.test(item.answer)), `${subject.id} pending answers`);
    }
  }
});

test("each subject ships matching local choice explanations", () => {
  for (const subject of index.subjects) {
    const bank = JSON.parse(readFileSync(new URL(`../${subject.bankUrl.replace(/^\.\//, "")}`, import.meta.url), "utf8"));
    const explanationUrl = subject.explanationUrl || "./data/ai-explanations.json";
    const payload = JSON.parse(readFileSync(new URL(`../${explanationUrl.replace(/^\.\//, "")}`, import.meta.url), "utf8"));
    assert.equal(Object.keys(payload.explanations || {}).length, bank.choices.length, `${subject.id} explanation count`);
    for (const question of bank.choices) {
      const record = payload.explanations[question.id];
      assert.equal(record?.answer, question.answer, `${subject.id}:${question.id} answer`);
      assert.match(record?.content || "", /核心考点[\s\S]*错误原因[\s\S]*选项辨析[\s\S]*记忆方法/u, `${subject.id}:${question.id} headings`);
    }
  }
});

test("all subjects build isolated continue and switchable exam queues", () => {
  for (const subject of index.subjects) {
    const bank = JSON.parse(readFileSync(new URL(`../${subject.bankUrl.replace(/^\.\//, "")}`, import.meta.url), "utf8"));
    const continued = buildPracticeSet(bank.choices, [], { mode: "continue" });
    assert.equal(continued.length, bank.choices.length, `${subject.id} continue queue`);
    const terms = uniqueSorted(bank.choices.filter((item) => item.sourceType === "real"), "term");
    assert.ok(terms.length >= 2, `${subject.id} real exam terms`);
    const current = buildPracticeSet(bank.choices, [], { mode: "exam" });
    const selected = buildPracticeSet(bank.choices, [], { mode: "exam", filters: { term: terms[0] } });
    const latestSize = bank.choices.filter((item) => item.sourceType === "real" && item.term === terms.at(-1)).length;
    const selectedSize = bank.choices.filter((item) => item.sourceType === "real" && item.term === terms[0]).length;
    assert.equal(current.length, latestSize, `${subject.id} latest exam queue`);
    assert.equal(selected.length, selectedSize, `${subject.id} selected exam queue`);
    assert.notEqual(current[0]?.id, selected[0]?.id, `${subject.id} exam switch`);
  }
});

test("coverage audit keeps the known architecture gaps explicit", () => {
  const coverage = JSON.parse(readFileSync(new URL("../data/banks/coverage.json", import.meta.url), "utf8"));
  assert.deepEqual(coverage.subjects.architect.choice_real_missing_by_term, {
    "2010年下半年": [8],
    "2011年下半年": [8],
    "2012年下半年": [69],
  });
});

test("new supplements are visible in the subject manifests", () => {
  const planner = JSON.parse(readFileSync(new URL("../data/banks/planner.json", import.meta.url), "utf8"));
  const network = JSON.parse(readFileSync(new URL("../data/banks/network.json", import.meta.url), "utf8"));
  const itpmPending = JSON.parse(readFileSync(new URL("../data/banks/itpm-pending.json", import.meta.url), "utf8"));
  assert.ok(planner.choices.length >= 589);
  assert.ok(planner.manifest.scope.real_terms.includes("2017年下半年"));
  assert.ok(network.manifest.counts.choice_real >= 890);
  assert.equal(network.choices.filter((item) => item.term === "2019年下半年").length, 75);
  assert.equal(network.choices.filter((item) => item.term === "2020年下半年").length, 75);
  const planner2020 = planner.choices.filter((item) => item.term === "2020年下半年");
  const itpm = JSON.parse(readFileSync(new URL("../data/banks/itpm.json", import.meta.url), "utf8"));
  const analyst = JSON.parse(readFileSync(new URL("../data/banks/analyst.json", import.meta.url), "utf8"));
  assert.equal(planner2020.length, 75);
  assert.equal(itpm.choices.filter((item) => item.term === "2020年下半年").length, 75);
  assert.ok(analyst.choices.length >= 956);
  assert.equal(analyst.choices.filter((item) => item.term === "2009年上半年").length, 39);
  assert.equal(network.choices.filter((item) => item.term === "2009年下半年").length, 75);
  assert.equal(network.choices.filter((item) => item.term === "2010年上半年").length, 72);
  assert.equal(network.choices.filter((item) => item.term === "2021年下半年").length, 75);
  assert.deepEqual(network.manifest.choice_real_missing_by_term["2010年上半年"], [48, 54, 70]);
  assert.equal(itpmPending.choices.length, 0);
  assert.equal(itpm.choices.filter((item) => item.term === "2025年上半年 第1批次").length, 75);
  assert.equal(itpm.choices.filter((item) => item.term === "2025年上半年 第2批次").length, 75);
});

test("network legacy case and essay papers remain imported", () => {
  const network = JSON.parse(readFileSync(new URL("../data/banks/network.json", import.meta.url), "utf8"));
  const legacyCases = network.cases.filter((item) => /^20(?:0[9]|1[0-9])年/u.test(item.term));
  const legacyEssays = network.essays.filter((item) => /^20(?:0[9]|1[0-9])年/u.test(item.term));
  assert.ok(legacyCases.length >= 30);
  assert.ok(legacyEssays.length >= 21);
  assert.ok(legacyCases.every((item) => item.subQuestions.every((question) => question.reference_answer.length >= 2)));
});

test("supplement validation report is clean", () => {
  const report = JSON.parse(readFileSync(new URL("../data/banks/supplement-validation.json", import.meta.url), "utf8"));
  assert.equal(report.valid, true);
  for (const subject of Object.values(report.subjects)) assert.deepEqual(subject.issues, []);
});
