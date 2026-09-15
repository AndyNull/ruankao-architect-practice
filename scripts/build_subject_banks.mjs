#!/usr/bin/env node
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rawRoot = path.join(root, "data", "exam-materials");
const outputRoot = path.join(root, "data", "banks");
const subjects = [
  ["planner", "系统规划与管理师"],
  ["itpm", "信息系统项目管理师"],
  ["analyst", "系统分析师"],
  ["network", "网络规划设计师"],
];
const generatedAnswers = loadJson(path.join(outputRoot, "generated-answers.json"), {});
const onlineAnswers = loadJson(path.join(outputRoot, "online-answers.json"), {});
const networkOnlineAnswers = loadJson(path.join(outputRoot, "network-online-answers.json"), {});
const networkPdfAnswers = loadJson(path.join(outputRoot, "network-pdf-answer-keys.json"), {});
const networkWebSupplement = loadJson(path.join(outputRoot, "network-web-supplement.json"), { choices: [], cases: [], essays: [] });
const qicoderSupplements = loadJson(path.join(outputRoot, "qicoder-supplements.json"), {});
const pdfSupplements = {
  planner: loadJson(path.join(outputRoot, "planner-pdf-supplement.json"), { choices: [], cases: [], essays: [] }),
  network: loadJson(path.join(outputRoot, "network-pdf-supplement.json"), { choices: [], cases: [], essays: [] }),
};
const architectBank = loadJson(path.join(root, "data", "bank.json"), null);

validateSupplementInputs();

mkdirSync(outputRoot, { recursive: true });
const catalog = [{
  id: "architect",
  name: "系统架构设计师",
  shortName: "架构师",
  bankUrl: "./data/bank.json",
  explanationUrl: "./data/ai-explanations.json",
  caseExplanationUrl: "./data/ai-case-explanations.json",
}];
const coverage = {};
if (architectBank?.manifest) coverage.architect = architectBank.manifest;

for (const [code, name] of subjects) {
  const bank = buildBank(code, name);
  const filename = `${code}.json`;
  writeFileSync(path.join(outputRoot, filename), `${JSON.stringify(bank)}\n`);
  catalog.push({
    id: code,
    name,
    shortName: shortName(name),
    bankUrl: `./data/banks/${filename}`,
    explanationUrl: `./data/banks/ai-explanations-${code}.json`,
    caseExplanationUrl: `./data/banks/ai-case-explanations-${code}.json`,
  });
  coverage[code] = bank.manifest;
  console.log(`${name}: ${bank.choices.length} choices, ${bank.cases.length} cases, ${bank.essays.length} essays`);
}

writeFileSync(path.join(outputRoot, "index.json"), `${JSON.stringify({ schemaVersion: 1, defaultSubject: "architect", subjects: catalog }, null, 2)}\n`);
writeFileSync(path.join(outputRoot, "coverage.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), subjects: coverage }, null, 2)}\n`);

function buildBank(code, name) {
  const base = path.join(rawRoot, name, "raw");
  let choices = [];
  let cases = [];
  let essays = [];

  if (code === "itpm") {
    choices.push(...parseItpmChoices(code, path.join(base, "xmgzxmgz", "结构化题库", "questions.json")));
    cases.push(...parseItpmCases(code, path.join(base, "IHKYoung", "结构化题库", "src", "data", "case-bank.json")));
  } else if (code === "analyst") {
    const parsed = parseAnalystJson(code, path.join(base, "xiaolidan00", "结构化真题"));
    choices.push(...parsed.choices);
    cases.push(...parsed.cases);
    essays.push(...parsed.essays);
  }

  const markdown = parseAwesome(code, name, path.join(base, "awesome-ruankao"));
  const supplement = pdfSupplements[code] || { choices: [], cases: [], essays: [] };
  const webSupplement = code === "network" ? networkWebSupplement : { choices: [], cases: [], essays: [] };
  const qicoderSupplement = qicoderSupplements[code] || { choices: [], cases: [], essays: [] };
  choices = mergeBy(choices, [...markdown.choices, ...supplement.choices, ...webSupplement.choices, ...qicoderSupplement.choices], (item) => `${item.term}|${item.questionNo}`);
  choices = choices.map((item) => item.module === "other"
    ? { ...item, module: inferModule(`${item.stem} ${item.analysis}`) }
    : item);
  cases = mergeBy(cases, [...markdown.cases, ...supplement.cases], (item) => `${item.term}|${normalizeKey(item.title)}|${normalizeKey(item.description).slice(0, 80)}`);
  essays = mergeBy(essays, [...markdown.essays, ...supplement.essays], (item) => `${item.term}|${normalizeKey(item.title)}`);

  const pendingChoices = markdown.pendingChoices;
  cases = dedupeCases(cases);
  const realTerms = unique([...choices, ...pendingChoices].filter((item) => item.sourceType === "real").map((item) => item.term));
  const mockTerms = unique(choices.filter((item) => item.sourceType === "mock").map((item) => item.term));
  const realEntries = [...choices, ...pendingChoices].filter((item) => item.sourceType === "real");
  const choiceRealByTerm = Object.fromEntries(realTerms.map((term) => [term, realEntries.filter((item) => item.term === term).length]));
  const choiceRealMissingByTerm = Object.fromEntries(realTerms.map((term) => [
    term,
    Array.from({ length: 75 }, (_, index) => index + 1).filter((number) => !realEntries.some((item) => item.term === term && item.questionNo === number)),
  ]).filter(([, missing]) => missing.length));
  const manifest = {
    generated_at: new Date().toISOString(),
    subject: { id: code, name },
    sources: markdown.sources,
    scope: { real_terms: realTerms, mock_terms: mockTerms },
    counts: {
      choice: choices.length,
      choice_real: choices.filter((item) => item.sourceType === "real").length,
      choice_mock: choices.filter((item) => item.sourceType === "mock").length,
      case: cases.length,
      essay: essays.length,
      pending_choice_answers: pendingChoices.length,
    },
    choice_real_by_term: choiceRealByTerm,
    choice_real_missing_by_term: choiceRealMissingByTerm,
  };
  writeFileSync(path.join(outputRoot, `${code}-pending.json`), `${JSON.stringify({ subject: name, choices: pendingChoices }, null, 2)}\n`);
  return { schemaVersion: 1, generatedAt: manifest.generated_at, subject: { id: code, name }, manifest, choices, cases, essays };
}

function validateSupplementInputs() {
  const sources = [
    ["qicoder-supplements.json", loadJson(path.join(outputRoot, "qicoder-supplements.json"), {})],
    ["network-web-supplement.json", { network: loadJson(path.join(outputRoot, "network-web-supplement.json"), { choices: [] }) }],
  ];
  for (const [filename, payload] of sources) {
    for (const [subject, supplement] of Object.entries(payload)) {
      for (const question of supplement.choices || []) {
        const key = `${subject}|${question.term}|${question.questionNo}`;
        if (!String(question.stem || "").trim() || JSON.stringify(Object.keys(question.options || {}).sort()) !== JSON.stringify(["A", "B", "C", "D"]) || !/^[A-D]$/.test(question.answer || "") || String(question.analysis || "").trim().length < 4) {
          throw new Error(`未通过补充题校验：${filename} ${key}`);
        }
      }
    }
  }
}

function dedupeCases(cases) {
  const selected = new Map();
  for (const item of cases) {
    const previous = selected.get(item.id);
    if (!previous || caseScore(item) > caseScore(previous)) selected.set(item.id, item);
  }
  return [...selected.values()];
}

function caseScore(item) {
  return String(item.description || "").length
    + (item.subQuestions || []).reduce((total, question) => total
      + String(question.prompt || "").length
      + String(question.reference_answer || "").length, 0);
}

function parseAwesome(code, subject, folder) {
  const files = walk(folder).filter((file) => file.endsWith(".md") && !/README\.md$/iu.test(file));
  const selected = selectPaperFiles(files, folder);
  const choices = [];
  const pendingChoices = [];
  const cases = [];
  const essays = [];

  for (const entry of selected) {
    const questionText = readFileSync(entry.questionFile, "utf8");
    const answerText = entry.answerFile ? readFileSync(entry.answerFile, "utf8") : "";
    const sourceFile = path.relative(root, entry.questionFile).replaceAll("\\", "/");
    if (entry.paperType === "choice") {
      for (const question of parseChoiceMarkdown(questionText, answerText).flatMap((item) => splitCompoundChoice(code, entry.term, item))) {
        const answerKey = `${code}|${entry.term}|${question.questionNo}`;
        const generated = generatedAnswers[answerKey] || onlineAnswers[answerKey]
          || (code === "network" ? networkOnlineAnswers[answerKey] : null)
          || (code === "network" ? networkPdfAnswers[answerKey] : null);
        const sourceAnalysis = question.analysis && !/暂无详细解析/u.test(question.analysis) ? question.analysis : "";
        const item = {
          id: `${code}-${entry.sourceType}-${slug(entry.term)}-${String(question.questionNo).padStart(3, "0")}`,
          sourceType: entry.sourceType,
          term: entry.term,
          paper: entry.paper,
          questionNo: question.questionNo,
          module: inferModule(`${question.stem} ${question.analysis}`),
          knowledge: question.knowledge,
          difficulty: "",
          stem: question.stem,
          options: question.options,
          answer: question.answer || generated?.answer || "",
          analysis: sourceAnalysis || generated?.analysis || "暂无详细解析。",
          sourceFile,
          answerSource: question.answer ? "source" : generated ? generated.source || "imported" : "missing",
        };
        if (/^[A-D]$/.test(item.answer)) choices.push(item);
        else pendingChoices.push(item);
      }
      continue;
    }
    if (entry.paperType === "case") cases.push(...parseCaseMarkdown(code, entry, questionText, answerText, sourceFile));
    if (entry.paperType === "essay") essays.push(...parseEssayMarkdown(code, entry, questionText, answerText, sourceFile));
  }
  return {
    choices,
    pendingChoices,
    cases,
    essays,
    sources: [{ name: "awesome-ruankao", url: "https://github.com/wujiaming88/awesome-ruankao", note: "Markdown 真题与原创模拟题" }],
  };
}

function splitCompoundChoice(code, term, question) {
  if (code !== "network") return [question];
  if ((term === "2023年下半年" && question.questionNo === 4) || (term === "2024年下半年" && question.questionNo === 48)) {
    const context = "某网络需要提供VOD、网络流量监控、对外Web和邮件服务。";
    return [
      `${context}VOD服务器应部署在哪个位置？`,
      `${context}对外Web服务器应部署在哪个位置？`,
      `${context}流量监控器应部署在哪个位置？`,
      `${context}通常发出数据流量最大的服务器连接在哪个位置？`,
    ].map((stem, index) => ({ ...question, questionNo: Number(`${question.questionNo}.${index + 1}`), stem }));
  }
  if (term === "2023年下半年" && question.questionNo === 46) {
    return [
      "为保障传送信息安全，兼顾加解密效率与实现复杂性，用于信息加密的合理算法是（ ）。",
      "为保障传送信息安全，兼顾加解密效率与实现复杂性，用于数字签名的合理算法是（ ）。",
    ].map((stem, index) => ({ ...question, questionNo: Number(`${question.questionNo}.${index + 1}`), stem }));
  }
  return [question];
}

function selectPaperFiles(files, base) {
  const entries = new Map();
  for (const file of files) {
    const relative = path.relative(base, file);
    const parts = relative.split(path.sep);
    const sourceType = parts[0] === "模拟题" ? "mock" : "real";
    const year = parts[1];
    const volume = sourceType === "mock" ? parts[2] : parts.length > 3 ? parts[2] : "";
    const filename = parts.at(-1);
    const paperType = filename.startsWith("综合知识") ? "choice" : filename.startsWith("案例分析") ? "case" : filename.startsWith("论文") ? "essay" : "";
    if (!paperType) continue;
    const isAnswer = /_答案\.md$/u.test(filename);
    const isQuestion = /_题目\.md$/u.test(filename);
    const term = sourceType === "mock" ? `${year} ${volume}` : year + (volume ? ` ${volume}` : "");
    const key = `${sourceType}|${term}|${paperType}`;
    const current = entries.get(key) || { sourceType, term, paper: volume || year, paperType, questionFile: "", answerFile: "", score: -1 };
    if (isAnswer) current.answerFile = file;
    else {
      const score = isQuestion ? 100 : /rkpass完整版/u.test(filename) ? 80 : filename === `${paperName(paperType)}.md` ? 60 : 10;
      if (score > current.score) Object.assign(current, { questionFile: file, score });
    }
    entries.set(key, current);
  }
  return [...entries.values()].filter((entry) => entry.questionFile);
}

function parseChoiceMarkdown(questionText, answerText) {
  const answers = parseAnswerMap(`${questionText}\n${answerText}`);
  const headings = [...questionText.matchAll(/^#{2,4}\s*第\s*(\d+)(?:[-~～]\d+)?\s*题[^\n]*$/gmu)];
  return headings.map((heading, index) => {
    const block = questionText.slice(heading.index + heading[0].length, headings[index + 1]?.index ?? questionText.length);
    const options = Object.fromEntries([...block.matchAll(/^\s*[-*]?\s*([A-D])[.、]\s*(.+)$/gmu)].map((match) => [match[1], match[2].trim()]));
    const firstOption = block.search(/^\s*[-*]?\s*A[.、]/mu);
    const stem = cleanMarkdown(block.slice(0, firstOption < 0 ? block.length : firstOption).replace(/^\*\*选项\*\*\s*[:：]?/gmu, ""));
    const ownAnswer = block.match(/\*\*答案\*\*\s*[:：]\s*([A-D])/u)?.[1] || "";
    const ownAnalysis = block.match(/\*\*解析\*\*\s*[:：]\s*([\s\S]*?)(?=\n---|$)/u)?.[1] || "";
    const keyed = answers.get(Number(heading[1]));
    return {
      questionNo: Number(heading[1]),
      stem,
      options,
      answer: ownAnswer || keyed?.answer || "",
      analysis: cleanMarkdown(ownAnalysis || keyed?.analysis || ""),
      knowledge: keyed?.knowledge || "",
    };
  }).filter((item) => item.stem && Object.keys(item.options).length === 4);
}

function parseAnswerMap(text) {
  const result = new Map();
  const headings = [...text.matchAll(/^#{2,4}\s*第\s*(\d+)\s*题[^\n]*$/gmu)];
  headings.forEach((heading, index) => {
    const block = text.slice(heading.index + heading[0].length, headings[index + 1]?.index ?? text.length);
    const answer = block.match(/\*\*(?:验证答案|参考答案|答案)\s*[:：]?\*\*\s*[:：]?\s*([A-D])/u)?.[1]
      || block.match(/\*\*(?:验证答案|参考答案|答案)\s*[:：]\s*([A-D])\*\*/u)?.[1];
    if (!answer) return;
    result.set(Number(heading[1]), {
      answer,
      analysis: block.match(/\*\*解析\s*[:：]?\*\*\s*[:：]?\s*([\s\S]*?)(?=\n\*\*|\n---|$)/u)?.[1] || "",
      knowledge: block.match(/\*\*考点\s*[:：]?\*\*\s*[:：]?\s*([^\n]+)/u)?.[1]?.trim() || "",
    });
  });
  return result;
}

function parseCaseMarkdown(code, entry, questionText, answerText, sourceFile) {
  const questions = splitSections(questionText, /^(?:#{2,4}\s*)?试题\s*([一二三四五六七八九十\d]+)[^\n]*$/gmu);
  const answers = splitSections(answerText, /^(?:#{2,4}\s*)?试题\s*([一二三四五六七八九十\d]+)[^\n]*$/gmu);
  return questions.map((section, index) => {
    const answer = answers[index]?.body || "";
    const firstQuestion = section.body.search(/(?:^|\n)\s*(?:#{2,5}\s*)?(?:问题|问题：)\s*\d/u);
    const description = cleanMarkdown(section.body.slice(0, firstQuestion < 0 ? section.body.length : firstQuestion));
    const prompt = cleanMarkdown(firstQuestion < 0 ? section.body : section.body.slice(firstQuestion));
    return {
      id: `${code}-case-${entry.sourceType}-${slug(entry.term)}-${index + 1}`,
      sourceType: entry.sourceType,
      term: entry.term,
      paper: entry.paper,
      module: inferModule(section.body),
      title: `试题${section.label}`,
      description,
      subQuestions: [{ question_label: "问题", prompt, reference_answer: cleanMarkdown(answer) || "暂无参考答案" }],
      sourceFile,
    };
  }).filter((item) => item.description || item.subQuestions[0].prompt);
}

function parseEssayMarkdown(code, entry, questionText, answerText, sourceFile) {
  const questions = splitSections(questionText, /^(?:#{2,4}\s*)?(?:试题|论文)\s*([一二三四五六七八九十\d]+)[：:]?[^\n]*$/gmu);
  const answers = splitSections(answerText, /^(?:#{2,4}\s*)?(?:试题|论文)\s*([一二三四五六七八九十\d]+)[：:]?[^\n]*$/gmu);
  return questions.map((section, index) => {
    const prompt = cleanMarkdown(section.body);
    const title = prompt.match(/论[^\n。]{2,40}/u)?.[0] || `论文${section.label}`;
    return {
      id: `${code}-essay-${entry.sourceType}-${slug(entry.term)}-${index + 1}`,
      sourceType: entry.sourceType,
      term: entry.term,
      paper: entry.paper,
      module: inferModule(`${title} ${prompt}`),
      title,
      prompt,
      writingPoints: cleanMarkdown(answers[index]?.body || "") || "暂无写作要点",
      sourceFile,
    };
  }).filter((item) => item.prompt.length > 40);
}

function parseItpmChoices(code, file) {
  const payload = loadJson(file, { questions: [] });
  const termCounts = new Map();
  return payload.questions.flatMap((question, index) => {
    const answer = String.fromCharCode(65 + Number(question.ans));
    const options = Object.fromEntries((question.opts || []).slice(0, 4).map((option, optionIndex) => [
      String.fromCharCode(65 + optionIndex),
      String(option).replace(/^\s*[A-D][.、]\s*/u, "").trim(),
    ]));
    if (!/^[A-D]$/.test(answer) || Object.keys(options).length !== 4) return [];
    const paper = String(question.paper || "").trim();
    const isReal = (/^20\d{2}(?:年)?(?:[上下]|年(?:0?5|11)月)/u.test(paper) || /历年真题/u.test(question.src || "")) && !/押题|密卷|模拟/u.test(paper);
    const term = isReal ? normalizeTerm(paper) : paper || "章节练习";
    const questionNo = (termCounts.get(term) || 0) + 1;
    termCounts.set(term, questionNo);
    return [{
      id: `${code}-${isReal ? "real" : "mock"}-${slug(term)}-${question.id || index + 1}`,
      sourceType: isReal ? "real" : "mock",
      term,
      paper: term,
      questionNo,
      module: String(question.cat || "项目管理"),
      knowledge: String(question.cat || ""),
      difficulty: "",
      stem: stripHtml(question.q),
      options,
      answer,
      analysis: stripHtml(question.exp) || "暂无详细解析。",
      sourceFile: "xmgzxmgz/ruankao-cli/questions.json",
      answerSource: "source",
    }];
  });
}

function parseItpmCases(code, file) {
  const payload = loadJson(file, { cases: [] });
  const termCounts = new Map();
  return payload.cases.map((item, index) => {
    const term = normalizeTerm(item.title || item.sourceLabels?.[0] || "案例练习");
    const sourceType = item.sourceCategory === "历年真题" ? "real" : "mock";
    const orderKey = `${sourceType}|${term}`;
    const order = (termCounts.get(orderKey) || 0) + 1;
    termCounts.set(orderKey, order);
    return {
      id: `${code}-case-${sourceType}-${slug(term)}-${order}`,
      sourceType,
      term,
      paper: term,
      module: inferModule(item.combinedText || item.stemText),
      title: `试题${order}`,
      description: stripHtml(item.stemText || item.stemHtml),
      subQuestions: (item.questions || []).map((question) => ({
        question_label: question.label || `问题${question.order || 1}`,
        prompt: stripHtml(question.promptHtml),
        reference_answer: stripHtml(question.answerHtml || question.explanationHtml) || "暂无参考答案",
      })),
      sourceFile: "IHKYoung/RuanKao/src/data/case-bank.json",
    };
  }).filter((item) => item.description && item.subQuestions.length);
}

function parseAnalystJson(code, folder) {
  const choices = [];
  const cases = [];
  const essays = [];
  for (const year of [2018, 2019, 2020, 2021, 2022, 2023]) {
    const choiceFile = path.join(folder, "choice", `${year}.json`);
    const caseFile = path.join(folder, "case", `${year}.json`);
    const term = `${year}年上半年`;
    const choicePayload = loadJson(choiceFile, { data: { questionList: [] } });
    for (const [index, question] of choicePayload.data.questionList.entries()) {
      const options = Object.fromEntries((question.itemList || []).map((item) => [item.chooseValue, stripHtml(item.content)]));
      if (!/^[A-D]$/.test(question.answer) || Object.keys(options).length !== 4) continue;
      choices.push({
        id: `${code}-real-${year}-${String(index + 1).padStart(3, "0")}`,
        sourceType: "real",
        term,
        paper: term,
        questionNo: index + 1,
        module: inferModule(`${question.title} ${question.analyze}`),
        knowledge: "",
        difficulty: "",
        stem: stripHtml(question.title),
        options,
        answer: question.answer,
        analysis: stripHtml(question.analyze) || "暂无详细解析。",
        sourceFile: `xiaolidan00/ruankao-question/choice/${year}.json`,
        answerSource: "source",
      });
    }
    const casePayload = loadJson(caseFile, { data: { questionList: [] } });
    const typed = casePayload.data.questionList || [];
    typed.filter((item) => item.questionType === 2).forEach((item, index) => {
      const plain = stripHtml(item.title);
      const firstQuestion = plain.search(/【问题\s*\d+】/u);
      cases.push({
        id: `${code}-case-real-${year}-${index + 1}`,
        sourceType: "real",
        term,
        paper: term,
        module: inferModule(`${plain} ${item.analyze}`),
        title: `试题${index + 1}`,
        description: plain.slice(0, firstQuestion < 0 ? plain.length : firstQuestion).trim(),
        subQuestions: [{
          question_label: "问题",
          prompt: (firstQuestion < 0 ? plain : plain.slice(firstQuestion)).trim(),
          reference_answer: stripHtml(item.analyze) || "暂无参考答案",
        }],
        sourceFile: `xiaolidan00/ruankao-question/case/${year}.json`,
      });
    });
    typed.filter((item) => item.questionType === 3).forEach((item, index) => {
      const prompt = stripHtml(item.title);
      essays.push({
        id: `${code}-essay-real-${year}-${index + 1}`,
        sourceType: "real",
        term,
        paper: term,
        module: inferModule(prompt),
        title: prompt.match(/论[^\n。]{2,40}/u)?.[0] || `论文${index + 1}`,
        prompt,
        writingPoints: stripHtml(item.analyze) || "暂无写作要点",
        sourceFile: `xiaolidan00/ruankao-question/case/${year}.json`,
      });
    });
  }
  return { choices, cases, essays };
}

function splitSections(text, pattern) {
  if (!text) return [];
  const matches = [...text.matchAll(pattern)];
  return matches.map((match, index) => ({
    label: match[1],
    body: text.slice(match.index + match[0].length, matches[index + 1]?.index ?? text.length).trim(),
  }));
}

function cleanMarkdown(value) {
  return String(value || "")
    .replace(/^---\s*$/gmu, "")
    .replace(/^#{1,6}\s+/gmu, "")
    .replace(/^>\s?/gmu, "")
    .replace(/\*\*/gu, "")
    .replace(/\[图片:\s*([^\]]+)\]/gu, "图片：$1")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
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
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function normalizeTerm(value) {
  const text = String(value || "");
  const match = text.match(/(20\d{2})年\s*(0?5|11)月/u);
  if (match) return `${match[1]}年${Number(match[2]) === 5 ? "上" : "下"}半年`;
  const short = text.match(/(20\d{2})([上下])/u);
  if (short) return `${short[1]}年${short[2]}半年`;
  return text.match(/20\d{2}年(?:上|下)半年/u)?.[0] || text.trim() || "案例练习";
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
    ["computer_foundation", /操作系统|进程|线程|存储器|流水线|指令|文件系统/u],
    ["legal_ip", /著作权|知识产权|专利|商标|法律/u],
    ["new_technology", /人工智能|机器学习|区块链|物联网|大数据|云计算/u],
    ["english", /\b[A-Za-z]{4,}\b.*\b[A-Za-z]{4,}\b/u],
  ];
  return rules.find(([, pattern]) => pattern.test(String(text || "")))?.[0] || "other";
}

function mergeBy(primary, additions, keyOf) {
  const result = [...primary];
  const keys = new Set(primary.map(keyOf));
  for (const item of additions) {
    const key = keyOf(item);
    if (keys.has(key)) continue;
    keys.add(key);
    result.push(item);
  }
  return result;
}

function walk(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(folder, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

function loadJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function unique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "zh-CN"));
}

function normalizeKey(value) {
  return String(value || "").replace(/\s+/gu, "").toLowerCase();
}

function slug(value) {
  return String(value || "").replace(/[^\w一-龥]+/gu, "-").replace(/^-|-$/gu, "");
}

function paperName(type) {
  return type === "choice" ? "综合知识" : type === "case" ? "案例分析" : "论文";
}

function shortName(name) {
  return ({
    系统规划与管理师: "系规",
    信息系统项目管理师: "高项",
    系统分析师: "系分",
    网络规划设计师: "网规",
  })[name];
}
