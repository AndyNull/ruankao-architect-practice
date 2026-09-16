#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "data", "banks", "lightsoft-subjective-supplements.json");
const subjects = {
  architect: "系统架构设计师",
  planner: "系统规划与管理师",
  itpm: "信息系统项目管理师",
  analyst: "系统分析师",
  network: "网络规划设计师",
};

const supplements = {};
for (const [code, name] of Object.entries(subjects)) {
  const folder = path.join(root, "data", "exam-materials", name, "raw", "lightsoft", "真题");
  const manifest = JSON.parse(readFileSync(path.join(folder, "source-manifest.json"), "utf8"));
  const files = uniqueFiles(manifest.files);
  const cases = [];
  const essays = [];

  for (const entry of files) {
    const file = path.join(root, entry.localPath);
    const payload = parseNextData(readFileSync(file, "utf8"));
    const question = payload.props.pageProps.question;
    const paper = String(entry.paper || payload.props.pageProps.name || "").replace(/\s+/gu, " ").trim();
    const term = normalizeTerm(paper);
    const number = Number(entry.question);
    const fullText = stripHtml(question.name);
    let prompts = (question.answers || []).map((item) => stripHtml(item.content)).filter(Boolean);
    let description = fullText;
    if (!prompts.length && /(?:【\s*)?问题\s*[：:]?\s*\d/u.test(fullText)) {
      const sections = splitEmbeddedQuestions(fullText);
      description = sections.description;
      prompts = sections.prompts;
    }
    const sourceFile = entry.sourceUrl;
    const sourceAnswer = cleanSourceAnswer(question.parse);

    if (/案例/u.test(paper)) {
      if (!prompts.length) {
        prompts = [fullText];
        description = "";
      }
      cases.push({
        id: `${code}-case-real-${slug(term)}-lightsoft-${question.id}`,
        sourceType: "real",
        term,
        paper,
        module: inferModule(`${description} ${prompts.join(" ")}`),
        title: `试题${number}`,
        description,
        subQuestions: prompts.map((prompt, index) => ({
          question_label: getQuestionLabel(prompt, index),
          prompt,
          reference_answer: sourceAnswer,
        })),
        sourceFile,
      });
    }

    if (/论文/u.test(paper)) {
      const prompt = [stripHtml(question.name), ...prompts].filter(Boolean).join("\n\n");
      essays.push({
        id: `${code}-essay-real-${slug(term)}-lightsoft-${question.id}`,
        sourceType: "real",
        term,
        paper,
        module: inferModule(prompt),
        title: getEssayTitle(prompt, number),
        prompt,
        writingPoints: sourceAnswer,
        sourceFile,
      });
    }
  }

  supplements[code] = { cases, essays };
  const missingCases = cases.filter((item) => item.subQuestions.some((question) => !question.reference_answer)).length;
  const missingEssays = essays.filter((item) => !item.writingPoints).length;
  console.log(`${name}: ${cases.length} cases (${missingCases} pending), ${essays.length} essays (${missingEssays} pending)`);
}

writeFileSync(output, `${JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), subjects: supplements }, null, 2)}\n`);

function uniqueFiles(files) {
  const selected = new Map();
  for (const entry of files || []) selected.set(entry.localPath, entry);
  return [...selected.values()].filter((entry) => /(?:案例分析|论文)-试题\d+\.html$/u.test(entry.localPath));
}

function parseNextData(html) {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/u);
  if (!match) throw new Error("Lightsoft 页面缺少 __NEXT_DATA__");
  return JSON.parse(match[1]);
}

function normalizeTerm(value) {
  const match = String(value).match(/(20\d{2})年\s*(上|下)半年/u);
  return match ? `${match[1]}年${match[2]}半年` : String(value).trim();
}

function cleanSourceAnswer(value) {
  const text = stripHtml(value);
  return /请先在App中激活|应用市场搜|^(?:略|无|暂无)$/u.test(text) ? "" : text;
}

function splitEmbeddedQuestions(value) {
  const matches = [...value.matchAll(/(?:^|\n)\s*((?:【\s*)?问题\s*[：:]?\s*\d+(?:\.\d+)?[^\n]*(?:】)?)/gmu)];
  if (!matches.length) return { description: value, prompts: [] };
  return {
    description: value.slice(0, matches[0].index).trim(),
    prompts: matches.map((match, index) => value.slice(match.index, matches[index + 1]?.index ?? value.length).trim()),
  };
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/giu, "\n")
    .replace(/<img[^>]*src=["']([^"']+)["'][^>]*>/giu, "\n图片：$1\n")
    .replace(/<[^>]+>/gu, "")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function getQuestionLabel(prompt, index) {
  return prompt.match(/^问题[：:]?\s*([\d.]+)/u)?.[1] ? `问题${RegExp.$1}` : `问题${index + 1}`;
}

function getEssayTitle(prompt, number) {
  return prompt.match(/论[“\u201c]?[^\n。；]{2,45}/u)?.[0].replace(/[“\u201c\u201d”]/gu, "") || `论文${number}`;
}

function inferModule(text) {
  const rules = [
    ["security", /安全|加密|密码|攻击|防火墙|认证|授权|漏洞|审计/u],
    ["database", /数据库|SQL|关系模式|范式|事务|索引|数据仓库|数据湖/u],
    ["network", /网络|TCP|UDP|IP地址|路由|协议|以太网|交换机|无线/u],
    ["project_management", /项目|成本|进度|风险|挣值|关键路径|合同|采购/u],
    ["service_management", /IT服务|服务管理|服务级别|运维|ITIL|ITSS/u],
    ["software_engineering", /软件工程|需求|测试|UML|用例|开发模型|配置管理/u],
    ["architecture", /架构|构件|中间件|微服务|SOA|质量属性|分布式/u],
    ["new_technology", /人工智能|机器学习|区块链|物联网|大数据|云计算/u],
  ];
  return rules.find(([, pattern]) => pattern.test(String(text || "")))?.[0] || "other";
}

function slug(value) {
  return String(value || "").replace(/[^\w一-龥]+/gu, "-").replace(/^-|-$/gu, "");
}
