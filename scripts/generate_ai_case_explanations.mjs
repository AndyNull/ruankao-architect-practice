#!/usr/bin/env node
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  aiModel,
  createCaseExplanationRecord,
  generateLocalCaseExplanation,
  getLocalCaseExplanation,
} from "../src/ai.mjs";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(appRoot, "data");
const outputPath = path.join(dataDir, "ai-case-explanations.json");
const errorPath = path.join(dataDir, "ai-case-explanation-errors.json");
const options = readOptions(process.argv.slice(2));
const bank = JSON.parse(await readFile(path.join(dataDir, "bank.json"), "utf8"));
const existing = await readJson(outputPath, { explanations: {} });
const errors = await readJson(errorPath, { errors: {} });
const explanations = existing.explanations && typeof existing.explanations === "object" ? existing.explanations : {};
const generationErrors = errors.errors && typeof errors.errors === "object" ? errors.errors : {};
const pending = bank.cases
  .filter((item) => !getLocalCaseExplanation(item, explanations))
  .filter((item) => !options.caseIds.length || options.caseIds.includes(item.id));
let completed = 0;
let failed = 0;
let nextIndex = 0;
let writeQueue = Promise.resolve();
let writeInProgress = false;
let writeDirty = false;

console.log(`待生成 ${pending.length} / ${bank.cases.length} 道案例，本地已命中 ${bank.cases.length - pending.length} 道，模型 ${aiModel}，并发 ${options.concurrency}`);
await Promise.all(Array.from({ length: options.concurrency }, () => worker()));
await writeQueue;
console.log(`完成 ${completed} 道，失败 ${failed} 道，本地案例解题总数 ${Object.keys(explanations).length}`);
if (failed) process.exitCode = 1;

async function worker() {
  while (nextIndex < pending.length) {
    const item = pending[nextIndex];
    nextIndex += 1;
    try {
      explanations[item.id] = await requestWithRetries(item);
      delete generationErrors[item.id];
      completed += 1;
      scheduleWrite();
      if (completed % 10 === 0 || completed === pending.length) {
        console.log(`进度 ${completed + failed}/${pending.length}，成功 ${completed}，失败 ${failed}`);
      }
    } catch (error) {
      failed += 1;
      generationErrors[item.id] = {
        caseId: item.id,
        message: error.message || "未知错误",
        failedAt: new Date().toISOString(),
      };
      scheduleWrite();
      console.error(`失败 ${item.id}：${generationErrors[item.id].message}`);
    }
  }
}

async function requestWithRetries(item) {
  let lastError;
  for (let attempt = 1; attempt <= options.retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("GLM 案例响应超时")), options.timeoutMs);
    try {
      const content = await generateLocalCaseExplanation({
        apiKey: process.env.GLM_API_KEY || "",
        caseItem: item,
        strict: attempt > 1,
        compact: options.compact,
        maxTokens: options.maxTokens,
        signal: controller.signal,
      });
      return createCaseExplanationRecord(item, content);
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
        totalCases: bank.cases.length,
        explanations,
      });
      await writeJsonAtomically(errorPath, {
        schemaVersion: 1,
        generatedAt,
        totalCases: bank.cases.length,
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
  const values = { concurrency: 10, retries: 3, timeoutMs: 90_000, maxTokens: 1600, compact: false, caseIds: [] };
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    const value = Number(args[index + 1]);
    if (key === "--concurrency" && Number.isInteger(value) && value > 0 && value <= 20) values.concurrency = value;
    if (key === "--retries" && Number.isInteger(value) && value > 0 && value <= 10) values.retries = value;
    if (key === "--timeout-ms" && Number.isInteger(value) && value >= 10_000) values.timeoutMs = value;
    if (key === "--max-tokens" && Number.isInteger(value) && value >= 600 && value <= 3600) values.maxTokens = value;
    if (key === "--compact") values.compact = true;
    if (key === "--case-id" && typeof args[index + 1] === "string" && args[index + 1].trim()) values.caseIds.push(args[index + 1].trim());
  }
  return values;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
