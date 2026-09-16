#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = "https://www.lightsoft.tech";
const subjects = [
  ["系统架构设计师", "5a54594b40e24123843cb0cda46eaa8a"],
  ["系统规划与管理师", "3c2d17d0a657404f9c57b102bd5635cd"],
  ["信息系统项目管理师", "55971678f3a6404ba6179b89692829f2"],
  ["系统分析师", "057641fa9f9540b1877ab054adc12b65"],
  ["网络规划设计师", "078908c44df04b3799519b1adf4f1e1d"],
];

for (const [exam, subjectId] of subjects) {
  const root = path.join(appRoot, "data", "exam-materials", exam, "raw", "lightsoft", "真题");
  const indexUrl = `${baseUrl}/doquestion/subject?doType=0&subjectId=${subjectId}`;
  const indexHtml = await fetchText(indexUrl);
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, "科目索引.html"), indexHtml);

  const papers = parsePapers(indexHtml).filter((paper) => /案例|论文/u.test(paper.name));
  const requests = papers.flatMap((paper) => Array.from({ length: paper.count }, (_, index) => ({ paper, index })));
  const results = await mapConcurrent(requests, 4, async ({ paper, index }) => {
    const url = `${baseUrl}/doquestion/doquestion?userId=null&index=${index}&doType=0&id=${paper.id}&name=${encodeURIComponent(paper.name)}&subjectId=${subjectId}`;
    const folder = path.join(root, paper.name.replaceAll(" ", ""));
    const type = paper.name.includes("论文") ? "论文" : "案例分析";
    const target = path.join(folder, `${type}-试题${index + 1}.html`);
    await mkdir(folder, { recursive: true });
    const cached = await readFile(target, "utf8").catch(() => null);
    const html = cached || await fetchText(url, 3).catch((error) => error);
    if (html instanceof Error) return { error: html.message, paper: paper.name, question: index + 1, sourceUrl: url };
    if (!cached) await writeFile(target, html);
    if (!/第\s*\d+\s*题|试题|论/u.test(html)) return { error: "题面校验失败", paper: paper.name, question: index + 1, sourceUrl: url };
    return { file: {
      paper: paper.name,
      question: index + 1,
      sourceUrl: url,
      localPath: path.relative(appRoot, target).replaceAll("\\", "/"),
      bytes: Buffer.byteLength(html),
      sha256: createHash("sha256").update(html).digest("hex"),
    } };
  });
  const files = results.flatMap((result) => result.file || []);
  const failures = results.filter((result) => result.error);

  await writeFile(path.join(root, "source-manifest.json"), `${JSON.stringify({
    collectedAt: new Date().toISOString(),
    indexUrl,
    subjectId,
    papers,
    files,
    failures,
  }, null, 2)}\n`);
  console.log(`${exam}: ${papers.length} papers, ${files.length} questions, ${failures.length} failures`);
}

function parsePapers(html) {
  const raw = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/su)?.[1];
  if (!raw) throw new Error("Lightsoft 科目索引缺少 __NEXT_DATA__");
  return JSON.parse(raw).props.pageProps.serverDate.msg;
}

async function fetchText(url, attempts = 1) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
    if (response.ok) return response.text();
    if (attempt === attempts) throw new Error(`${response.status} ${url}`);
    await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }
}

async function mapConcurrent(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}
