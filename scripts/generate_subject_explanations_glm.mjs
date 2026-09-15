#!/usr/bin/env node
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aiModel, createExplanationRecord, generateLocalExplanation, getLocalExplanation } from "../src/ai.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const subject = process.argv[2];
if (!["planner", "itpm", "analyst", "network"].includes(subject)) throw new Error("用法：node scripts/generate_subject_explanations_glm.mjs <planner|itpm|analyst|network>");
const bankPath = path.join(root, "data", "banks", `${subject}.json`);
const outputPath = path.join(root, "data", "banks", `ai-explanations-${subject}.json`);
const errorPath = path.join(root, "data", "banks", `ai-explanation-errors-${subject}.json`);
const options = readOptions(process.argv.slice(3));
const bank = JSON.parse(await readFile(bankPath, "utf8"));
const existing = await readJson(outputPath, { explanations: {} });
const errors = await readJson(errorPath, { errors: {} });
const explanations = existing.explanations || {};
const generationErrors = errors.errors || {};
const pending = bank.choices
  .filter((question) => options.all || String(question.sourceFile || "").startsWith("https://"))
  .filter((question) => options.refresh || !getLocalExplanation(question, explanations))
  .filter((question) => !options.questionIds.length || options.questionIds.includes(question.id))
  .slice(0, options.limit || undefined);
let cursor = 0;
let completed = 0;
let failed = 0;
console.log(`${subject}: 待调用 ${pending.length}，模型 ${aiModel}，并发 ${options.concurrency}`);
await Promise.all(Array.from({ length: options.concurrency }, worker));
await save();
console.log(`${subject}: GLM 成功 ${completed}，失败 ${failed}，本地解析 ${Object.keys(explanations).length}`);
if (failed) process.exitCode = 1;

async function worker() {
  while (cursor < pending.length) {
    const question = pending[cursor++];
    try {
      explanations[question.id] = await request(question);
      delete generationErrors[question.id];
      completed += 1;
    } catch (error) {
      failed += 1;
      generationErrors[question.id] = { questionId: question.id, message: error.message || "未知错误", failedAt: new Date().toISOString() };
    }
  }
}

async function request(question) {
  let lastError;
  for (let attempt = 1; attempt <= options.retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("GLM 响应超时")), options.timeoutMs);
    try {
      const content = await generateLocalExplanation({
        apiKey: process.env.GLM_API_KEY || "",
        question,
        strict: attempt > 1,
        compact: options.compact,
        maxTokens: options.maxTokens,
        signal: controller.signal,
      });
      return createExplanationRecord(question, content);
    } catch (error) {
      lastError = error;
      if (attempt < options.retries) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

async function save() {
  const payload = { schemaVersion: 1, generatedAt: new Date().toISOString(), model: aiModel, totalQuestions: bank.choices.length, explanations };
  const failures = { schemaVersion: 1, generatedAt: new Date().toISOString(), totalQuestions: bank.choices.length, errors: generationErrors };
  await writeAtomic(outputPath, payload);
  await writeAtomic(errorPath, failures);
}

async function writeAtomic(file, value) {
  const temporary = `${file}.tmp`;
  await writeFile(temporary, JSON.stringify(value), "utf8");
  await rename(temporary, file);
}

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, "utf8")); } catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}

function readOptions(args) {
  const result = { concurrency: 8, retries: 2, timeoutMs: 60_000, maxTokens: 900, compact: false, limit: 0, all: false, refresh: false, questionIds: [] };
  for (let index = 0; index < args.length; index += 1) {
    const value = Number(args[index + 1]);
    if (args[index] === "--concurrency" && Number.isInteger(value) && value > 0 && value <= 20) result.concurrency = value;
    if (args[index] === "--retries" && Number.isInteger(value) && value > 0 && value <= 5) result.retries = value;
    if (args[index] === "--timeout-ms" && Number.isInteger(value) && value >= 10_000) result.timeoutMs = value;
    if (args[index] === "--max-tokens" && Number.isInteger(value) && value >= 300 && value <= 1800) result.maxTokens = value;
    if (args[index] === "--limit" && Number.isInteger(value) && value > 0) result.limit = value;
    if (args[index] === "--compact") result.compact = true;
    if (args[index] === "--all") result.all = true;
    if (args[index] === "--refresh") result.refresh = true;
    if (args[index] === "--question-id" && args[index + 1]) result.questionIds.push(args[index + 1]);
  }
  return result;
}
