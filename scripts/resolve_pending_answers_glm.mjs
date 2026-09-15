#!/usr/bin/env node
import { readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const subject = process.argv[2];
if (!["planner", "network"].includes(subject)) throw new Error("用法：node scripts/resolve_pending_answers_glm.mjs <planner|network>");
const pendingPath = path.join(root, "data/banks", `${subject}-pending.json`);
const outputPath = path.join(root, "data/banks/generated-answers.json");
const errorPath = path.join(root, "data/banks/generated-answer-errors.json");
const pending = JSON.parse(await readFile(pendingPath, "utf8")).choices || [];
const bank = await readJson(path.join(root, "data/banks", `${subject}.json`), { choices: [] });
const candidates = pending;
const answers = await readJson(outputPath, {});
const errors = await readJson(errorPath, {});
const options = parseOptions(process.argv.slice(3));
const queue = candidates.filter((q) => {
  const record = answers[`${subject}|${q.term}|${q.questionNo}`];
  return !record || errors[`${subject}|${q.term}|${q.questionNo}`];
}).slice(0, options.limit || undefined);
let cursor = 0, ok = 0, failed = 0;
console.log(`${subject}: ${queue.length} pending, concurrency ${options.concurrency}`);
await Promise.all(Array.from({ length: options.concurrency }, worker));
await atomicWrite(outputPath, answers);
await atomicWrite(errorPath, errors);
console.log(`${subject}: resolved ${ok}, failed ${failed}`);
if (failed) process.exitCode = 1;

async function worker() {
  while (cursor < queue.length) {
    const q = queue[cursor++];
    const key = `${subject}|${q.term}|${q.questionNo}`;
    try { answers[key] = await resolve(q); delete errors[key]; ok += 1; }
    catch (e) { errors[key] = { id: q.id, message: e.message, failedAt: new Date().toISOString() }; failed += 1; }
  }
}

async function resolve(q) {
  let last;
  for (let attempt = 1; attempt <= options.retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetch("https://glm.996986.xyz/v1/chat/completions", {
        method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${process.env.GLM_API_KEY || ""}` },
        body: JSON.stringify({ model: "glm-5.2", temperature: 0.1, max_tokens: 500, messages: [
          { role: "system", content: "你是软考题库审核员。依据题干和四个选项判断唯一正确答案；不确定时 answer 留空。只输出 JSON，不要 Markdown。analysis 必须包含：核心考点、解题依据、选项辨析、记忆方法，并逐一说明 A、B、C、D。" },
          { role: "user", content: `题目：${q.stem}\nA. ${q.options.A}\nB. ${q.options.B}\nC. ${q.options.C}\nD. ${q.options.D}\n只输出单个 JSON 对象，不得附加任何文字。analysis 用 100-180 字，必须明确写 A、B、C、D 四项。格式：{"answer":"A-D之一或空","analysis":"核心考点：... 解题依据：... 选项辨析：A... B... C... D... 记忆方法：..."}` },
        ] }), signal: controller.signal,
      });
      if (!response.ok) throw new Error(`GLM HTTP ${response.status}`);
      const payload = await response.json();
      const text = String(payload.choices?.[0]?.message?.content || "").replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
      const result = JSON.parse(extractJson(text));
      if (!/^[A-D]$/.test(result.answer || "")) throw new Error("答案不是 A-D");
      if (typeof result.analysis !== "string" || result.analysis.length < 80 || !/[A-D]/.test(result.analysis)) throw new Error("选项解析不完整");
      return { answer: result.answer, analysis: result.analysis, source: "glm-pending", model: "glm-5.2", generatedAt: new Date().toISOString() };
    } catch (e) { last = e; if (attempt < options.retries) await new Promise((r) => setTimeout(r, attempt * 400)); }
    finally { clearTimeout(timer); }
  }
  throw last;
}

async function readJson(file, fallback) { try { return JSON.parse(await readFile(file, "utf8")); } catch (e) { if (e.code === "ENOENT") return fallback; throw e; } }
async function atomicWrite(file, value) { const temp = `${file}.tmp`; await writeFile(temp, JSON.stringify(value, null, 2) + "\n", "utf8"); await rename(temp, file); }
function parseOptions(args) { const o = { concurrency: 8, retries: 2, timeoutMs: 60000, limit: 0 }; for (let i=0;i<args.length;i++) { const n=Number(args[i+1]); if(args[i]==="--concurrency"&&n>0)o.concurrency=Math.min(16,n); if(args[i]==="--retries"&&n>0)o.retries=Math.min(4,n); if(args[i]==="--timeout-ms"&&n>=10000)o.timeoutMs=n; if(args[i]==="--limit"&&n>0)o.limit=n; } return o; }
function validRecord(value) { const text = String(value?.analysis || ""); return /^[A-D]$/.test(value?.answer || "") && text.length >= 80 && ["核心考点", "解题依据", "选项辨析", "记忆方法"].every((h) => text.includes(h)) && ["A", "B", "C", "D"].every((label) => new RegExp(`(?:^|[\\s；;，,])${label}(?:[.、:：]|选项)`).test(text)); }
function extractJson(text) { const start = text.indexOf("{"); const end = text.lastIndexOf("}"); if (start < 0 || end <= start) throw new Error("未找到 JSON"); return text.slice(start, end + 1); }
