import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
    const caseExplanationUrl = subject.caseExplanationUrl || "./data/ai-case-explanations.json";
    const caseExplanations = JSON.parse(readFileSync(new URL(`../${caseExplanationUrl.replace(/^\.\//, "")}`, import.meta.url), "utf8"));
    assert.equal(Object.keys(caseExplanations.explanations || {}).length, bank.cases.length, `${subject.id} case explanation count`);
    for (const item of bank.cases) assert.ok(caseExplanations.explanations[item.id], `${subject.id}:${item.id} case explanation`);
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
});

test("network legacy case and essay papers remain imported", () => {
  const network = JSON.parse(readFileSync(new URL("../data/banks/network.json", import.meta.url), "utf8"));
  const legacyCases = network.cases.filter((item) => /^20(?:0[9]|1[0-9])年/u.test(item.term));
  const legacyEssays = network.essays.filter((item) => /^20(?:0[9]|1[0-9])年/u.test(item.term));
  assert.ok(legacyCases.length >= 30);
  assert.ok(legacyEssays.length >= 21);
  assert.ok(legacyCases.every((item) => item.subQuestions.every((question) => question.reference_answer.length >= 20)));
});

test("supplement validation report is clean", () => {
  const report = JSON.parse(readFileSync(new URL("../data/banks/supplement-validation.json", import.meta.url), "utf8"));
  assert.equal(report.valid, true);
  for (const subject of Object.values(report.subjects)) assert.deepEqual(subject.issues, []);
});
