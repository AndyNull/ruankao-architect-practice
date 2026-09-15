#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "data", "banks", "supplement-validation.json");
const supplements = {
  ...load("qicoder-supplements.json", {}),
  network: load("qicoder-supplements.json", {}).network || { choices: [] },
};
const pdfAnswers = load("network-pdf-answer-keys.json", {});
const report = { generatedAt: new Date().toISOString(), subjects: {}, valid: true };

for (const [subject, payload] of Object.entries(supplements)) {
  const issues = [];
  const warnings = [];
  const choices = payload.choices || [];
  const seen = new Set();
  for (const question of choices) {
    const key = `${question.term}|${question.questionNo}`;
    if (seen.has(key)) issues.push(`${key}: duplicate question number`);
    seen.add(key);
    if (!Number.isInteger(question.questionNo) || question.questionNo < 1 || question.questionNo > 75) issues.push(`${key}: invalid question number`);
    if (!String(question.stem || "").trim()) issues.push(`${key}: empty stem`);
    if (JSON.stringify(Object.keys(question.options || {}).sort()) !== JSON.stringify(["A", "B", "C", "D"])) issues.push(`${key}: incomplete options`);
    if (!/^[A-D]$/.test(question.answer || "")) issues.push(`${key}: invalid answer`);
    if (String(question.analysis || "").trim().length < 4) issues.push(`${key}: missing analysis`);
    if (!/^https:\/\//.test(String(question.sourceFile || ""))) issues.push(`${key}: missing source URL`);
    const independent = pdfAnswers[`${subject}|${question.term}|${question.questionNo}`]?.answer;
    if (independent && independent !== question.answer) warnings.push(`${key}: PDF answer mismatch (${independent} != ${question.answer})`);
  }
  report.subjects[subject] = { choices: choices.length, issues, warnings, verified: issues.length === 0 };
  if (issues.length) report.valid = false;
}

writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
if (!report.valid) {
  console.error(`supplement validation failed: ${Object.values(report.subjects).reduce((sum, item) => sum + item.issues.length, 0)} issues`);
  process.exitCode = 1;
} else {
  console.log(`supplement validation passed: ${Object.values(report.subjects).reduce((sum, item) => sum + item.choices, 0)} choices`);
}

function load(file, fallback) {
  try { return JSON.parse(readFileSync(path.join(root, "data", "banks", file), "utf8")); }
  catch { return fallback; }
}
