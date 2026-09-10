import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPracticeSet,
  buildDiagnosisExport,
  buildMemoryCards,
  cleanDisplayText,
  filterQuestions,
  formatQuestionForDisplay,
  gradeAnswer,
  questionSourceLabel,
  summarizeMemory,
  summarizeModules,
  summarizeProgressPayload,
  summarizeAttempts,
} from "../src/core.mjs";

const questions = [
  { id: "q1", sourceType: "real", term: "2024年下半年", module: "architecture", stem: "架构题", answer: "A", options: { A: "a", B: "b", C: "c", D: "d" } },
  { id: "q2", sourceType: "mock", term: "2026年5月 模拟卷1", module: "database", stem: "Redis 缓存", answer: "C", options: { A: "a", B: "b", C: "c", D: "d" } },
  { id: "q3", sourceType: "real", term: "2023年下半年", module: "network", stem: "TCP 网络", answer: "D", options: { A: "a", B: "b", C: "c", D: "d" } },
];

test("filters questions by source, module, keyword, and status", () => {
  const attempts = [{ questionId: "q1", correct: false, answeredAt: "2026-06-21T01:00:00.000Z" }];
  assert.deepEqual(filterQuestions(questions, attempts, { sourceType: "real", term: "all", module: "architecture", status: "wrong", keyword: "" }).map((q) => q.id), ["q1"]);
  assert.deepEqual(filterQuestions(questions, attempts, { sourceType: "all", term: "all", module: "all", status: "unanswered", keyword: "网络" }).map((q) => q.id), ["q3"]);
});

test("grades answers case-insensitively", () => {
  assert.deepEqual(gradeAnswer(questions[0], "a"), { answer: "A", correctAnswer: "A", correct: true });
  assert.deepEqual(gradeAnswer(questions[1], "B"), { answer: "B", correctAnswer: "C", correct: false });
});

test("builds deterministic continue, review, and exam practice sets", () => {
  const continued = buildPracticeSet(questions, [
    { questionId: "q3", correct: true, answeredAt: "2026-06-21T01:00:00.000Z" },
  ], { mode: "continue" });
  assert.deepEqual(continued.map((q) => q.id), ["q1", "q2", "q3"]);
  const review = buildPracticeSet(questions, [
    { questionId: "q1", correct: false, answeredAt: "2026-06-21T01:00:00.000Z" },
  ], { mode: "review", now: "2026-06-21T01:01:00.000Z" });
  assert.deepEqual(review.map((q) => q.id), ["q1"]);
  const favorite = buildPracticeSet(questions, [], { mode: "favorite", bookmarkedIds: ["q2"] });
  assert.deepEqual(favorite.map((q) => q.id), ["q2"]);
  const exam = buildPracticeSet(questions, [], { mode: "exam", filters: { term: "2024年下半年" } });
  assert.deepEqual(exam.map((q) => q.id), ["q1"]);
});

test("summarizes memory states from answer history", () => {
  const attempts = [
    { questionId: "q1", correct: false, answeredAt: "2026-06-20T01:00:00.000Z" },
    { questionId: "q2", correct: true, answeredAt: "2026-06-20T01:00:00.000Z" },
    { questionId: "q3", correct: true, answeredAt: "2026-06-01T01:00:00.000Z" },
    { questionId: "q3", correct: true, answeredAt: "2026-06-02T01:00:00.000Z" },
    { questionId: "q3", correct: true, answeredAt: "2026-06-03T01:00:00.000Z" },
  ];
  const cards = buildMemoryCards(questions, attempts, { now: "2026-06-21T01:00:00.000Z" });
  assert.equal(cards.find((card) => card.questionId === "q1").state, "due");
  assert.equal(cards.find((card) => card.questionId === "q3").streak, 3);
  const summary = summarizeMemory(questions, attempts, { now: "2026-06-21T01:00:00.000Z" });
  assert.equal(summary.due, 3);
  assert.equal(summary.wrong, 1);
});

test("summarizes module progress for chapter navigation", () => {
  const rows = summarizeModules(questions, [
    { questionId: "q1", module: "architecture", correct: false, answeredAt: "2026-06-21T01:00:00.000Z" },
    { questionId: "q2", module: "database", correct: true, answeredAt: "2026-06-20T01:00:00.000Z" },
  ], { now: "2026-06-21T02:00:00.000Z" });
  const architecture = rows.find((row) => row.module === "architecture");
  const database = rows.find((row) => row.module === "database");
  assert.equal(architecture.total, 1);
  assert.equal(architecture.wrong, 1);
  assert.equal(architecture.due, 1);
  assert.equal(database.progress, 1);
  assert.equal(database.accuracy, 1);
});

test("summarizes imported progress JSON before applying it", () => {
  const summary = summarizeProgressPayload({
    schemaVersion: 1,
    exportedAt: "2026-06-21T03:00:00.000Z",
    attempts: [
      { questionId: "q1", correct: false, answeredAt: "2026-06-21T01:00:00.000Z" },
      { questionId: "q1", correct: true, answeredAt: "2026-06-21T02:00:00.000Z" },
      { questionId: "q2", correct: false, answeredAt: "2026-06-21T02:30:00.000Z" },
    ],
    bookmarks: [{ questionId: "q3", createdAt: "2026-06-21T02:40:00.000Z" }],
  });
  assert.equal(summary.attempts, 3);
  assert.equal(summary.answeredQuestions, 2);
  assert.equal(summary.wrong, 1);
  assert.equal(summary.bookmarks, 1);
  assert.equal(summary.latestAt, "2026-06-21T02:30:00.000Z");
});

test("formats clear source labels", () => {
  assert.equal(questionSourceLabel({ ...questions[0], questionNo: 5, paper: "2024年下半年" }), "历年真题 · 2024年下半年 · 第5题 · 2024年下半年");
});

test("cleans question display text and normalizes missing analysis", () => {
  assert.equal(cleanDisplayText("题目: 软件 复用 的 基本过程 是（ ）。"), "软件复用的基本过程是（ ）。");
  const display = formatQuestionForDisplay({
    ...questions[0],
    stem: "题目: 在 数据库 设计 中应完成（1）。",
    options: { A: " 数据 字典 ", B: "E-R 图", C: " 关系 模式", D: "任务书" },
    analysis: "（解析待补充）",
  });
  assert.equal(display.stem, "在数据库设计中应完成（1）。");
  assert.equal(display.options.A, "数据字典");
  assert.equal(display.analysisKind, "missing");
  assert.match(display.analysis, /暂无详细解析/);
});

test("summarizes attempts and weak modules", () => {
  const summary = summarizeAttempts([
    { questionId: "q1", module: "architecture", term: "2024年下半年", sourceType: "real", correct: false, answeredAt: "1" },
    { questionId: "q2", module: "database", term: "2026年5月 模拟卷1", sourceType: "mock", correct: true, answeredAt: "2" },
    { questionId: "q3", module: "architecture", term: "2023年下半年", sourceType: "real", correct: false, answeredAt: "3" },
  ]);
  assert.equal(summary.total, 3);
  assert.equal(summary.correct, 1);
  assert.equal(summary.wrong, 2);
  assert.equal(summary.byModule.architecture.accuracy, 0);
  assert.equal(summary.weakModules[0].module, "architecture");
});

test("builds AI-friendly diagnosis export", () => {
  const exportData = buildDiagnosisExport({
    generatedAt: "2026-06-21T00:00:00.000Z",
    bank: { source: { name: "test" }, manifest: { counts: { choice: 3 } }, choices: questions, cases: [], essays: [] },
    attempts: [
      { questionId: "q1", module: "architecture", term: "2024年下半年", sourceType: "real", answer: "B", correctAnswer: "A", correct: false, answeredAt: "2026-06-21T01:00:00.000Z" },
    ],
    bookmarks: [
      { questionId: "q2", createdAt: "2026-06-21T01:30:00.000Z" },
    ],
  });
  assert.equal(exportData.schemaVersion, 1);
  assert.equal(exportData.learner.summary.wrong, 1);
  assert.deepEqual(exportData.learner.bookmarkedQuestionIds, ["q2"]);
  assert.equal(exportData.learner.recentWrong[0].question.id, "q1");
  assert.equal(exportData.aiInstructions.length > 0, true);
});
