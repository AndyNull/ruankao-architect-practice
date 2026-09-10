#!/usr/bin/env node
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  aiModel,
  createExplanationRecord,
  generateLocalExplanation,
  getLocalExplanation,
} from "../src/ai.mjs";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(appRoot, "data");
const outputPath = path.join(dataDir, "ai-explanations.json");
const errorPath = path.join(dataDir, "ai-explanation-errors.json");
const options = readOptions(process.argv.slice(2));
const bank = JSON.parse(await readFile(path.join(dataDir, "bank.json"), "utf8"));
const figures = JSON.parse(await readFile(path.join(dataDir, "figures.json"), "utf8")).figures || {};
const existing = await readJson(outputPath, { explanations: {} });
const errors = await readJson(errorPath, { errors: {} });
const explanations = existing.explanations && typeof existing.explanations === "object" ? existing.explanations : {};
const generationErrors = errors.errors && typeof errors.errors === "object" ? errors.errors : {};

const questions = bank.choices
  .map((question) => figures[question.id] ? { ...question, figure: figures[question.id] } : question)
  .filter((question) => !getLocalExplanation(question, explanations))
  .filter((question) => !options.questionIds.length || options.questionIds.includes(question.id));
const pending = options.limit ? questions.slice(0, options.limit) : questions;
let completed = 0;
let failed = 0;
let nextIndex = 0;
let writeQueue = Promise.resolve();
let writeInProgress = false;
let writeDirty = false;

console.log(`待生成 ${pending.length} / ${bank.choices.length} 道，本地已命中 ${bank.choices.length - questions.length} 道，模型 ${aiModel}，并发 ${options.concurrency}`);

await Promise.all(Array.from({ length: options.concurrency }, () => worker()));
await writeQueue;
console.log(`完成 ${completed} 道，失败 ${failed} 道，本地解析总数 ${Object.keys(explanations).length}`);
if (failed) process.exitCode = 1;

async function worker() {
  while (nextIndex < pending.length) {
    const question = pending[nextIndex];
    nextIndex += 1;
    try {
      explanations[question.id] = await requestWithRetries(question);
      delete generationErrors[question.id];
      completed += 1;
      scheduleWrite();
      if (completed % 20 === 0 || completed === pending.length) {
        console.log(`进度 ${completed + failed}/${pending.length}，成功 ${completed}，失败 ${failed}`);
      }
    } catch (error) {
      failed += 1;
      generationErrors[question.id] = {
        questionId: question.id,
        message: error.message || "未知错误",
        failedAt: new Date().toISOString(),
      };
      scheduleWrite();
      console.error(`失败 ${question.id}：${generationErrors[question.id].message}`);
    }
  }
}

async function requestWithRetries(question) {
  let lastError;
  for (let attempt = 1; attempt <= options.retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("GLM 完整响应超时")), options.timeoutMs);
    try {
      const content = await generateLocalExplanation({
        apiKey: process.env.GLM_API_KEY || "",
        question,
        strict: options.strict || attempt > 1,
        compact: options.compact,
        maxTokens: options.maxTokens,
        signal: controller.signal,
      });
      return createExplanationRecord(question, content);
    } catch (error) {
      lastError = error;
      if (attempt < options.retries) await wait(attempt * 1000);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

function scheduleWrite() {
  writeDirty = true;
  if (writeInProgress) return;
  writeInProgress = true;
  writeQueue = writeQueue.then(async () => {
    while (writeDirty) {
      writeDirty = false;
      const generatedAt = new Date().toISOString();
      await writeJsonAtomically(outputPath, {
        schemaVersion: 1,
        generatedAt,
        model: aiModel,
        totalQuestions: bank.choices.length,
        explanations,
      });
      await writeJsonAtomically(errorPath, {
        schemaVersion: 1,
        generatedAt,
        totalQuestions: bank.choices.length,
        errors: generationErrors,
      });
    }
    writeInProgress = false;
  });
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJsonAtomically(file, value) {
  const temporary = `${file}.tmp`;
  await writeFile(temporary, JSON.stringify(value), "utf8");
  await rename(temporary, file);
}

function readOptions(args) {
  const values = { concurrency: 20, retries: 3, timeoutMs: 60_000, maxTokens: 900, limit: 0, strict: false, compact: false, questionIds: [] };
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    const value = Number(args[index + 1]);
    if (key === "--concurrency" && Number.isInteger(value) && value > 0 && value <= 40) values.concurrency = value;
    if (key === "--retries" && Number.isInteger(value) && value > 0 && value <= 10) values.retries = value;
    if (key === "--timeout-ms" && Number.isInteger(value) && value >= 5_000) values.timeoutMs = value;
    if (key === "--max-tokens" && Number.isInteger(value) && value >= 300 && value <= 3600) values.maxTokens = value;
    if (key === "--limit" && Number.isInteger(value) && value > 0) values.limit = value;
    if (key === "--strict") values.strict = true;
    if (key === "--compact") values.compact = true;
    if (key === "--question-id" && typeof args[index + 1] === "string" && args[index + 1].trim()) values.questionIds.push(args[index + 1].trim());
  }
  return values;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
