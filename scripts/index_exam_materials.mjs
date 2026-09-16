#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const materialRoot = path.join(appRoot, "data", "exam-materials");
const sources = [
  source("系统架构设计师", "awesome-ruankao", "真题", "真题/系统架构设计师", "https://github.com/wujiaming88/awesome-ruankao", "9923d3efdd99729a318ae55a1d2505cf021f3a86", "real"),
  source("系统架构设计师", "YoungHong1992", "真题-清洗版", "02.历年真题-清洗版", "https://github.com/YoungHong1992/ruankao-senior-architecture-designer", "c7614ed4fc4d02be742ad6f3cb114445a72fdd9b", "real"),
  source("系统架构设计师", "YoungHong1992", "真题-补充", "02.历年真题(补充)", "https://github.com/YoungHong1992/ruankao-senior-architecture-designer", "c7614ed4fc4d02be742ad6f3cb114445a72fdd9b", "real"),
  source("系统架构设计师", "chenghuipeng", "真题", "", "https://github.com/chenghuipeng/2018_system_architect", "4a93a274bdabed934834f7af0741bb1e160226cf", "real"),
  source("系统架构设计师", "PeterGuy326", "真题", "", "https://github.com/PeterGuy326/senior-software-architect-review", "7613332418df0001a31c34417a09c25e667ab827", "real"),
  webSource("系统架构设计师", "51cto", "真题", "https://rk.51cto.com/download", "real"),
  webSource("系统架构设计师", "web-archive", "真题", "https://www.educity.cn/rk/", "real"),
  lightsoftSource("系统架构设计师"),
  source("系统规划与管理师", "awesome-ruankao", "真题", "真题/系统规划与管理师", "https://github.com/wujiaming88/awesome-ruankao", "9923d3efdd99729a318ae55a1d2505cf021f3a86", "real"),
  source("系统规划与管理师", "awesome-ruankao", "模拟题", "模拟题/系统规划与管理师", "https://github.com/wujiaming88/awesome-ruankao", "9923d3efdd99729a318ae55a1d2505cf021f3a86", "mock"),
  source("系统规划与管理师", "xiaomabenten", "真题", "02. 历年真题及解析（2017年-2024年）", "https://github.com/xiaomabenten/system_planner", "cdafc4ab4aa1c651f3572aead49b843e44a26ffc", "real"),
  source("系统规划与管理师", "xiaomabenten", "模拟题", "07. 全真模拟题+章节模拟题+练习题", "https://github.com/xiaomabenten/system_planner", "cdafc4ab4aa1c651f3572aead49b843e44a26ffc", "mock"),
  webSource("系统规划与管理师", "51cto", "真题", "https://rk.51cto.com/download", "real"),
  lightsoftSource("系统规划与管理师"),
  source("信息系统项目管理师", "awesome-ruankao", "真题", "真题/信息系统项目管理师", "https://github.com/wujiaming88/awesome-ruankao", "9923d3efdd99729a318ae55a1d2505cf021f3a86", "real"),
  source("信息系统项目管理师", "xiaomabenten", "真题", "02. 历年真题及解析（2009年-2024上半年）", "https://github.com/xiaomabenten/ruankao_itpm", "4146ae4f3a338f3cbd34f244a029b4bcf92f2ce6", "real"),
  source("信息系统项目管理师", "xiaomabenten", "练习题", "06. 其他资料/01 【重要】历年真题解析和精华知识点", "https://github.com/xiaomabenten/ruankao_itpm", "4146ae4f3a338f3cbd34f244a029b4bcf92f2ce6", "practice"),
  source("信息系统项目管理师", "xmgzxmgz", "结构化题库", "", "https://github.com/xmgzxmgz/ruankao-cli", "e27c40e20a175440e936fe8130b4471b18c05db1", "mixed"),
  source("信息系统项目管理师", "IHKYoung", "结构化题库", "", "https://github.com/IHKYoung/RuanKao", "96e912d2d563bf22fa084089ed93cff8c8f63ee8", "mixed"),
  webSource("信息系统项目管理师", "cnitpm", "真题", "https://www.cnitpm.com/zhenti/", "real", (relative) => {
    const id = relative.match(/(\d+)(?:\.html)$/u)?.[1];
    return relative.startsWith("题目页/") ? `https://www.cnitpm.com/st/${id}.html` : `https://www.cnitpm.com/examst/${id}/`;
  }),
  webSource("信息系统项目管理师", "51cto", "真题", "https://rk.51cto.com/download", "real"),
  webSource("信息系统项目管理师", "yuejxt", "真题", "https://www.yuejxt.cn/", "real"),
  lightsoftSource("信息系统项目管理师"),
  source("系统分析师", "awesome-ruankao", "真题", "真题/系统分析师", "https://github.com/wujiaming88/awesome-ruankao", "9923d3efdd99729a318ae55a1d2505cf021f3a86", "real"),
  source("系统分析师", "awesome-ruankao", "模拟题", "模拟题/系统分析师", "https://github.com/wujiaming88/awesome-ruankao", "9923d3efdd99729a318ae55a1d2505cf021f3a86", "mock"),
  source("系统分析师", "xiaomabenten", "真题", "02. 真题（2025年-2009年真题及解析）", "https://github.com/xiaomabenten/system-analysts", "ae85a0a7715b44893b979075e39743afdb826f75", "real"),
  source("系统分析师", "xiaomabenten", "模拟题", "07. 模拟题", "https://github.com/xiaomabenten/system-analysts", "ae85a0a7715b44893b979075e39743afdb826f75", "mock"),
  source("系统分析师", "xiaolidan00", "结构化真题", "", "https://github.com/xiaolidan00/ruankao-question", "7c89a18c2693d8ce13d6da73e7b0f7279fccf1be", "real"),
  webSource("系统分析师", "educity", "真题", "https://www.educity.cn/rk/zhenti/xifen/", "real"),
  webSource("系统分析师", "51cto", "真题", "https://rk.51cto.com/download", "real"),
  webSource("系统分析师", "qicoder", "真题", "https://ebook.qicoder.com/系统分析师/", "real"),
  webSource("系统分析师", "web-archive", "真题", "https://community.sslcode.com.cn/", "real"),
  webSource("系统分析师", "yuejxt", "真题", "https://www.yuejxt.cn/", "real"),
  webSource("系统分析师", "qingsuyun", "真题", "https://www.qingsuyun.com/lib/", "real", (relative) => {
    const id = relative.match(/(\d+)(?:\.html)$/u)?.[1];
    return `https://www.qingsuyun.com/lib/d/${id}/`;
  }),
  lightsoftSource("系统分析师"),
  source("网络规划设计师", "awesome-ruankao", "真题", "真题/网络规划设计师", "https://github.com/wujiaming88/awesome-ruankao", "9923d3efdd99729a318ae55a1d2505cf021f3a86", "real"),
  source("网络规划设计师", "awesome-ruankao", "模拟题", "模拟题/网络规划设计师", "https://github.com/wujiaming88/awesome-ruankao", "9923d3efdd99729a318ae55a1d2505cf021f3a86", "mock"),
  source("网络规划设计师", "xiaomabenten", "真题", "02. 历年真题及解析（2017年-2024年）", "https://github.com/xiaomabenten/network_planner", "1685a0ecbc681b35eebd490ca2f2978be7aae528", "real"),
  source("网络规划设计师", "xiaomabenten", "模拟题", "06. 全真模拟卷", "https://github.com/xiaomabenten/network_planner", "1685a0ecbc681b35eebd490ca2f2978be7aae528", "mock"),
  webSource("网络规划设计师", "web-archive", "真题", "https://www.lightsoft.tech/", "real", (relative) => {
    const index = relative.match(/index(\d+)\.html$/u)?.[1];
    const id = relative.includes("案例分析") ? "b7" : "b8";
    return `https://www.lightsoft.tech/doquestion/doquestion?doType=1&id=${id}&index=${index}&userId=null`;
  }),
  webSource("网络规划设计师", "51cto", "真题", "https://rk.51cto.com/download", "real"),
  lightsoftSource("网络规划设计师"),
];

const files = sources.flatMap((item) => walk(item.localRoot).map((file) => describe(item, file)));
const exams = Object.fromEntries([...new Set(files.map((file) => file.exam))].map((exam) => {
  const selected = files.filter((file) => file.exam === exam);
  return [exam, {
    files: selected.length,
    bytes: selected.reduce((sum, file) => sum + file.bytes, 0),
    years: [...new Set(selected.map((file) => file.year).filter(Boolean))].sort(),
    categories: countBy(selected, "category"),
    paperTypes: countBy(selected, "paperType"),
  }];
}));

writeFileSync(path.join(materialRoot, "manifest.json"), `${JSON.stringify({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  note: "题面、答案和解析均为第三方整理资料，不代表官方原卷或官方答案。",
  exams,
  files,
}, null, 2)}\n`);
console.log(JSON.stringify(exams, null, 2));

function source(exam, owner, folder, sourcePrefix, repository, commit, category) {
  return {
    exam,
    repository,
    commit,
    category,
    sourcePrefix,
    localRoot: path.join(materialRoot, exam, "raw", owner, folder),
  };
}

function webSource(exam, owner, folder, repository, category, resolveUrl = () => repository) {
  return { exam, repository, commit: null, category, sourcePrefix: "", resolveUrl, localRoot: path.join(materialRoot, exam, "raw", owner, folder) };
}

function lightsoftSource(exam) {
  const localRoot = path.join(materialRoot, exam, "raw", "lightsoft", "真题");
  const manifest = JSON.parse(readFileSync(path.join(localRoot, "source-manifest.json"), "utf8"));
  const urls = new Map(manifest.files.map((file) => [path.relative(localRoot, path.join(appRoot, file.localPath)).replaceAll("\\", "/"), file.sourceUrl]));
  return { exam, repository: manifest.indexUrl, commit: null, category: "real", sourcePrefix: "", resolveUrl: (relative) => urls.get(relative) || manifest.indexUrl, localRoot };
}

function walk(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(folder, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

function describe(item, file) {
  const relative = path.relative(item.localRoot, file).replaceAll("\\", "/");
  const sourcePath = [item.sourcePrefix, relative].filter(Boolean).join("/");
  const name = path.basename(file);
  const content = readFileSync(file);
  const paperTypes = inferPaperTypes(sourcePath);
  const years = item.category === "mixed" ? [] : [...relative.matchAll(/(?<!\d)20(?:0[0-9]|1[0-9]|2[0-6])(?!\d)/gu)].map((match) => match[0]);
  const terms = item.category === "mixed" ? [] : [...relative.matchAll(/上半年|下半年/gu)].map((match) => match[0]);
  return {
    exam: item.exam,
    category: item.category,
    paperType: paperTypes.length === 1 ? paperTypes[0] : "mixed",
    paperTypes,
    year: years.at(-1) || null,
    term: terms.at(-1) || null,
    localPath: path.relative(appRoot, file).replaceAll("\\", "/"),
    bytes: statSync(file).size,
    sha256: createHash("sha256").update(content).digest("hex"),
    repository: item.repository,
    commit: item.commit,
    sourcePath,
    sourceUrl: item.resolveUrl
      ? item.resolveUrl(relative)
      : `${item.repository}/blob/${item.commit}/${sourcePath.split("/").map(encodeURIComponent).join("/")}`,
    tracked: !/\.(?:pdf|docx?|png|jpe?g)$/iu.test(name),
  };
}

function inferPaperTypes(value) {
  const types = [];
  if (/论文|科目三|essay|article|lunwen/iu.test(value)) types.push("essay");
  if (/案例|科目二|下午|case|anli/iu.test(value)) types.push("case");
  if (/综合|上午|选择|choice|zonghe/iu.test(value)) types.push("choice");
  return types.length ? types : ["mixed"];
}

function countBy(items, key) {
  return Object.fromEntries([...new Set(items.map((item) => item[key]))].sort().map((value) => [value, items.filter((item) => item[key] === value).length]));
}
