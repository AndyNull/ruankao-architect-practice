#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCaseExplanationRecord, createExplanationRecord } from "../src/ai.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const subjects = ["planner", "itpm", "analyst", "network"];

for (const subject of subjects) {
  const bank = JSON.parse(readFileSync(path.join(root, "data", "banks", `${subject}.json`), "utf8"));
  const explanations = Object.fromEntries(bank.choices.map((question) => {
    const content = [
      "核心考点",
      question.analysis && question.analysis !== "暂无详细解析。" ? question.analysis : `${question.module || "综合知识"}相关基础概念与应用。`,
      "错误原因",
      "常见误区是忽略题干限定条件，或将相近概念、流程和适用范围混淆。作答时应先定位考点，再逐项核对选项。",
      "选项辨析",
      `正确项：${question.answer}。依据题库答案和题干语义，${question.answer}符合考点要求；其余选项与题干条件或概念定义不符。`,
      "记忆方法",
      `记住本题关键词“${String(question.stem).replace(/\s+/gu, " ").slice(0, 24)}”，先回忆定义，再判断场景。`,
    ].join("\n");
    return [question.id, createExplanationRecord(question, content)];
  }));
  writeFileSync(path.join(root, "data", "banks", `ai-explanations-${subject}.json`), `${JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), model: "grounded-local-template", totalQuestions: bank.choices.length, explanations })}\n`);

  const caseExplanations = Object.fromEntries(bank.cases.map((item) => {
    const content = item.subQuestions.map((subQuestion, index) => {
      const label = String(subQuestion.question_label || `问题${index + 1}`).trim();
      const answer = String(subQuestion.reference_answer || "暂无参考答案").trim();
      return `${label}\n解题思路\n围绕题干给出的背景和约束，先确定考查的过程、方法或计算关系，再按评分点组织答案。\n作答要点\n${answer}`;
    }).join("\n\n");
    return [item.id, createCaseExplanationRecord(item, content)];
  }));
  writeFileSync(path.join(root, "data", "banks", `ai-case-explanations-${subject}.json`), `${JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), model: "grounded-local-template", totalCases: bank.cases.length, explanations: caseExplanations })}\n`);
  console.log(`${subject}: ${Object.keys(explanations).length} choice, ${Object.keys(caseExplanations).length} case explanations`);
}
