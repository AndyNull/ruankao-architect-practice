#!/usr/bin/env node
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const referenceRoot = path.resolve(appRoot, "..", "ruankao-senior-architecture-designer-main", "ruankao-senior-architecture-designer-main");
const examRoot = path.join(referenceRoot, "02.历年真题-清洗版");
const bankPath = path.join(appRoot, "data", "bank.json");
const bank = JSON.parse(readFileSync(bankPath, "utf8"));
const termPattern = /^(201[6-9]|202[0-5])年(上|下)半年/;

function sections(text, pattern) {
  const matches = [...text.matchAll(pattern)];
  return matches.map((match, index) => ({
    match,
    body: text.slice(match.index + match[0].length, matches[index + 1]?.index ?? text.length).trim(),
  }));
}

function trimBlock(value) {
  return value.replace(/^---\s*/m, "").replace(/\s*---\s*$/m, "").trim();
}

function inferModule(text) {
  const rules = [
    ["security", /安全|加密|密码|攻击|防火墙|认证|授权|漏洞|审计/],
    ["database", /数据库|SQL|关系模式|范式|事务|索引|数据仓库|数据湖/],
    ["network", /网络|TCP|UDP|IP地址|路由|协议|以太网|HTTP|DNS/],
    ["legal_ip", /著作权|知识产权|专利|商标|侵权|法律/],
    ["project_management", /项目管理|成本|进度|风险管理|挣值|关键路径/],
    ["embedded", /嵌入式|实时系统|片上|总线|中断/],
    ["computer_foundation", /操作系统|进程|线程|存储器|流水线|磁盘|指令|文件系统/],
    ["software_engineering", /软件工程|需求|测试|UML|用例|设计模式|开发模型|维护|配置管理/],
    ["new_technology", /人工智能|机器学习|区块链|物联网|大数据|云计算/],
    ["architecture", /架构|构件|中间件|微服务|SOA|质量属性|系统设计|分布式/],
    ["english", /\b[A-Za-z]{4,}\b.*\b[A-Za-z]{4,}\b/],
  ];
  return rules.find(([, pattern]) => pattern.test(text))?.[0] || "other";
}

function sharedStem(text, questionHeading) {
  const ranges = [...text.matchAll(/^## 第(\d+)-(\d+)题[^\n]*$/gm)];
  const range = ranges.find((item) => item.index < questionHeading.index
    && Number(item[1]) <= Number(questionHeading[1])
    && Number(item[2]) >= Number(questionHeading[1]));
  if (!range) return "";
  const firstChild = [...text.matchAll(/^### 第(\d+)题\s*$/gm)].find((item) => item.index > range.index && Number(item[1]) >= Number(range[1]));
  return firstChild ? text.slice(range.index + range[0].length, firstChild.index).trim() : "";
}

function parseChoices(file, existing) {
  const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const term = path.basename(file).match(termPattern)?.[0];
  const headings = [...text.matchAll(/^#{2,3} 第(\d+)题\s*$/gm)];
  const rangeHeadings = [...text.matchAll(/^## 第\d+-\d+题[^\n]*$/gm)];
  const existingByNo = new Map(existing.filter((item) => item.term === term).map((item) => [item.questionNo, item]));
  const parsed = new Map();

  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const questionNo = Number(heading[1]);
    const nextExact = headings[index + 1]?.index ?? text.length;
    const nextRange = rangeHeadings.find((item) => item.index > heading.index && item.index < nextExact)?.index;
    const ownBody = text.slice(heading.index + heading[0].length, nextRange ?? nextExact).trim();
    const body = `${sharedStem(text, heading)}\n\n${ownBody}`.trim();
    const optionMatches = [...body.matchAll(/^- \*\*([A-D])\.\*\*\s*(.+)$/gm)];
    const answer = body.match(/^\*\*正确答案[：:]\s*([A-D])\*\*$/m)?.[1];
    if (optionMatches.length !== 4 || !answer) continue;

    const firstOptionIndex = optionMatches[0].index;
    const stem = trimBlock(body.slice(0, firstOptionIndex).replace(/^> \*\*共用题干：\*\*.*$/gm, ""));
    const analysisMarker = body.match(/^\*\*解析[：:]\*\*$/m);
    const previous = existingByNo.get(questionNo);
    parsed.set(questionNo, {
      id: `real-${term}-${String(questionNo).padStart(3, "0")}`,
      sourceType: "real",
      term,
      paper: term,
      questionNo,
      module: previous?.module || inferModule(`${stem}\n${analysisMarker ? body.slice(analysisMarker.index) : ""}`),
      knowledge: previous?.knowledge || "",
      difficulty: previous?.difficulty || "",
      stem,
      options: Object.fromEntries(optionMatches.map((item) => [item[1], item[2].trim()])),
      answer,
      analysis: analysisMarker ? trimBlock(body.slice(analysisMarker.index + analysisMarker[0].length)) : "暂无详细解析。",
      sourceFile: `ruankao-senior-architecture-designer/02.历年真题-清洗版/${path.basename(file)}`,
    });
  }

  return Array.from({ length: 75 }, (_, index) => parsed.get(index + 1) || existingByNo.get(index + 1)).filter(Boolean);
}

function parseCases(file) {
  const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const term = path.basename(file).match(termPattern)?.[0];
  return sections(text, /^## 试题([一二三四五])[^\n]*$/gm).map(({ match, body }, index) => {
    const answerIndex = body.search(/^### 参考答案/m);
    const questionIndex = body.search(/^#{3,4} 问题/m);
    const contentEnd = answerIndex < 0 ? body.length : answerIndex;
    const descriptionEnd = questionIndex < 0 ? contentEnd : questionIndex;
    const promptStart = questionIndex < 0 ? descriptionEnd : body.indexOf("\n", questionIndex) + 1;
    return {
      id: `case-real-${term}-${index + 1}`,
      sourceType: "real",
      term,
      paper: term,
      module: inferModule(body),
      title: `试题${match[1]}`,
      description: trimBlock(body.slice(0, descriptionEnd).replace(/^### 说明\s*/m, "")),
      subQuestions: [{
        question_label: "问题",
        prompt: trimBlock(body.slice(promptStart, contentEnd)),
        reference_answer: answerIndex < 0 ? "暂无参考答案" : trimBlock(body.slice(body.indexOf("\n", answerIndex) + 1)),
      }],
      sourceFile: `ruankao-senior-architecture-designer/02.历年真题-清洗版/${path.basename(file)}`,
    };
  });
}

function parseEssays(file) {
  const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const term = path.basename(file).match(termPattern)?.[0];
  return sections(text, /^## 试题([一二三四])(?:：|:)\s*(.+)$/gm).map(({ match, body }, index) => {
    const tipsIndex = body.search(/^### (?:备考提示|非官方参考提纲|补充写作框架)/m);
    return {
      id: `essay-real-${term}-${index + 1}`,
      sourceType: "real",
      term,
      paper: term,
      module: inferModule(`${match[2]}\n${body}`),
      title: match[2].trim(),
      prompt: trimBlock(body.slice(0, tipsIndex < 0 ? body.length : tipsIndex)),
      writingPoints: tipsIndex < 0 ? "暂无写作要点" : trimBlock(body.slice(body.indexOf("\n", tipsIndex) + 1)),
      sourceFile: `ruankao-senior-architecture-designer/02.历年真题-清洗版/${path.basename(file)}`,
    };
  });
}

const files = readdirSync(examRoot).filter((name) => termPattern.test(name));
const choices = files.filter((name) => name.endsWith("综合知识.md"))
  .flatMap((name) => parseChoices(path.join(examRoot, name), bank.choices));
const cases = files.filter((name) => name.endsWith("案例分析.md")).flatMap((name) => parseCases(path.join(examRoot, name)));
const essays = files.filter((name) => name.endsWith("论文.md")).flatMap((name) => parseEssays(path.join(examRoot, name)));

function appendMissing(existing, additions, keyOf) {
  const keys = new Set(existing.map(keyOf));
  return [...existing, ...additions.filter((item) => {
    const key = keyOf(item);
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  })];
}

bank.choices = appendMissing(bank.choices, choices, (item) => `${item.sourceType}|${item.term}|${item.questionNo}`);
bank.cases = appendMissing(bank.cases, cases, (item) => item.id);
bank.essays = appendMissing(bank.essays, essays, (item) => item.id);
bank.generatedAt = new Date().toISOString();
bank.source = {
  name: "awesome-ruankao + ruankao-senior-architecture-designer",
  note: "2016-2025 真题采用清洗交叉校对版；答案均为非官方整理。",
};
bank.manifest.generated_at = bank.generatedAt;
bank.manifest.supplemental_sources = [
  ...(bank.manifest.supplemental_sources || []).filter((item) => item.name !== "YoungHong1992/ruankao-senior-architecture-designer"),
  {
    name: "YoungHong1992/ruankao-senior-architecture-designer",
    url: "https://github.com/YoungHong1992/ruankao-senior-architecture-designer",
    scope: "2016-2025 系统架构设计师清洗交叉校对版真题",
    note: "第三方整理资料，不代表官方原卷或官方答案。",
  },
];
bank.manifest.scope.real_terms = [...new Set(bank.choices.filter((item) => item.sourceType === "real").map((item) => item.term))].sort();
bank.manifest.counts = {
  choice: bank.choices.length,
  choice_real: bank.choices.filter((item) => item.sourceType === "real").length,
  choice_mock: bank.choices.filter((item) => item.sourceType === "mock").length,
  case: bank.cases.length,
  essay: bank.essays.length,
};
bank.manifest.choice_real_by_term = Object.fromEntries(bank.manifest.scope.real_terms.map((term) => [term, bank.choices.filter((item) => item.sourceType === "real" && item.term === term).length]));
bank.manifest.choice_real_missing_by_term = Object.fromEntries(bank.manifest.scope.real_terms
  .map((term) => {
    const numbers = new Set(bank.choices.filter((item) => item.sourceType === "real" && item.term === term).map((item) => item.questionNo));
    return [term, Array.from({ length: 75 }, (_, index) => index + 1).filter((number) => !numbers.has(number))];
  })
  .filter(([, missing]) => missing.length));
bank.manifest.module_counts = Object.fromEntries([...new Set(bank.choices.map((item) => item.module))].map((module) => [module, bank.choices.filter((item) => item.module === module).length]));

writeFileSync(bankPath, JSON.stringify(bank));
console.log(JSON.stringify(bank.manifest.counts, null, 2));
