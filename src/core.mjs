import { extractMermaidFigure, hasFigureReference } from "./figures.mjs";

export const emptyFilters = {
  sourceType: "all",
  term: "all",
  module: "all",
  status: "all",
  keyword: "",
};

export const defaultDailyCount = 20;

export function normalizeChoice(raw) {
  return {
    ...raw,
    sourceType: raw.sourceType || raw.source_type,
    questionNo: raw.questionNo || raw.question_no,
    sourceFile: raw.sourceFile || raw.source_file,
  };
}

export function filterQuestions(questions, attempts, filters = emptyFilters) {
  const latest = latestAttemptByQuestion(attempts);
  const memory = memoryCardsByQuestion(questions, attempts);
  const keyword = (filters.keyword || "").trim().toLowerCase();
  return questions.filter((question) => {
    const item = normalizeChoice(question);
    if (filters.sourceType && filters.sourceType !== "all" && item.sourceType !== filters.sourceType) return false;
    if (filters.term && filters.term !== "all" && item.term !== filters.term) return false;
    if (filters.module && filters.module !== "all" && item.module !== filters.module) return false;
    if (filters.status === "wrong" && latest.get(item.id)?.correct !== false) return false;
    if (filters.status === "unanswered" && latest.has(item.id)) return false;
    if (filters.status === "due" && !memory.get(item.id)?.due) return false;
    if (keyword) {
      const haystack = [item.stem, item.analysis, item.knowledge, item.term, item.module].join(" ").toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  });
}

export function buildPracticeSet(questions, attempts, options = {}) {
  const mode = options.mode || "all";
  const filters = { ...emptyFilters, ...(options.filters || {}) };
  const dailyCount = Number(options.dailyCount || defaultDailyCount);
  const pool = sortQuestionsForPractice(filterQuestions(questions, attempts, { ...filters, status: "all" }));
  const bookmarked = new Set(options.bookmarkedIds || []);

  if (mode === "continue" || mode === "daily") {
    const attempted = latestAttemptByQuestion(attempts);
    return continueFromLatest(pool, attempts).filter((question) => !attempted.has(question.id));
  }

  if (mode === "review") {
    return buildMemoryCards(pool, attempts, { now: options.now })
      .filter((card) => card.due)
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt) || b.wrongCount - a.wrongCount || a.questionOrder - b.questionOrder)
      .map((card) => card.question)
      .slice(0, Math.max(1, dailyCount));
  }

  if (mode === "special") {
    const module = filters.module === "all" ? inferWeakModule(attempts) : filters.module;
    return sortQuestionsForPractice(filterQuestions(questions, attempts, { ...filters, module, status: filters.status || "all" }));
  }

  if (mode === "exam") {
    const term = filters.term === "all" ? latestRealTerm(questions) : filters.term;
    return sortQuestionsForPractice(filterQuestions(questions, attempts, { ...filters, sourceType: "real", term, status: "all" }));
  }

  if (mode === "wrong") {
    return sortQuestionsForPractice(filterQuestions(questions, attempts, { ...filters, status: "wrong" }));
  }

  if (mode === "favorite") {
    return pool.filter((question) => bookmarked.has(question.id));
  }

  return sortQuestionsForPractice(filterQuestions(questions, attempts, filters));
}

export function gradeAnswer(question, answer) {
  const normalizedAnswer = String(answer || "").trim().toUpperCase();
  const correctAnswer = String(question.answer || "").trim().toUpperCase();
  return {
    answer: normalizedAnswer,
    correctAnswer,
    correct: normalizedAnswer === correctAnswer,
  };
}

export function questionSourceLabel(question) {
  const source = question.sourceType === "real" ? "历年真题" : "模拟题";
  const no = question.questionNo ? `第${question.questionNo}题` : "题号未知";
  return `${source} · ${question.term || "未知年份"} · ${no} · ${question.paper || "默认卷"}`;
}

export function cleanDisplayText(value) {
  let text = String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/^\s*题目[:：]\s*/i, "")
    .replace(/\u3000/g, " ")
    .replace(/\s+([，。；：！？、）])/g, "$1")
    .replace(/([（])\s+/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  let previous = "";
  while (previous !== text) {
    previous = text;
    text = text.replace(/([一-龥])\s+([一-龥])/g, "$1$2");
  }
  return text.replace(/（\s*）/g, "（ ）");
}

export function formatQuestionForDisplay(question) {
  const extracted = extractMermaidFigure(question.stem);
  const options = {};
  for (const key of ["A", "B", "C", "D"]) {
    options[key] = cleanDisplayText(question.options?.[key] || "");
  }
  return {
    ...question,
    stem: cleanDisplayText(extracted.stem),
    options,
    figure: question.figure || extracted.figure,
    figureMissing: !question.figure && !extracted.figure && hasFigureReference(extracted.stem),
    analysis: normalizeAnalysis(question.analysis),
    analysisKind: analysisKind(question.analysis),
  };
}

export function buildStudyPlan({ dailyCount = defaultDailyCount } = {}) {
  return [
    {
      title: "继续练习",
      detail: "按题库顺序往后推进，不再随机抽题。每次打开先接着上次的位置做，减少来回找题。",
    },
    {
      title: `记忆复习 ${dailyCount} 题`,
      detail: "做错题会进入待复习，连续做对后复习间隔拉长。周末先清到期题，再做章节练习。",
    },
    {
      title: "真题套卷",
      detail: "每周至少完成一套同年份真题，训练题感、时间分配和高频考点识别。",
    },
    {
      title: "AI 复盘",
      detail: "导出 ai-diagnosis.json 给 Codex，按错因和模块生成下一周 6-8 小时计划。",
    },
  ];
}

export function latestAttemptByQuestion(attempts) {
  const latest = new Map();
  for (const attempt of attempts) {
    const previous = latest.get(attempt.questionId);
    if (!previous || String(attempt.answeredAt) > String(previous.answeredAt)) {
      latest.set(attempt.questionId, attempt);
    }
  }
  return latest;
}

export function buildMemoryCards(questions, attempts, options = {}) {
  const nowMs = Date.parse(options.now || new Date().toISOString());
  const grouped = attemptsByQuestion(attempts);
  return sortQuestionsForPractice(questions).map((question, index) => {
    const history = grouped.get(question.id) || [];
    const latest = history.at(-1) || null;
    const streak = trailingCorrectCount(history);
    const wrongCount = history.filter((attempt) => !attempt.correct).length;
    const correctCount = history.length - wrongCount;
    const intervalDays = memoryIntervalDays(latest, streak);
    const dueAt = latest ? addDaysIso(latest.answeredAt, intervalDays) : "";
    const due = Boolean(latest) && Date.parse(dueAt) <= nowMs;
    const level = Math.min(streak, 4);
    const state = memoryState({ latest, streak, due });
    return {
      question,
      questionId: question.id,
      questionOrder: index,
      state,
      label: memoryStateLabel(state),
      due,
      dueAt,
      latest,
      attempts: history.length,
      correctCount,
      wrongCount,
      streak,
      level,
    };
  });
}

export function memoryCardsByQuestion(questions, attempts, options = {}) {
  return new Map(buildMemoryCards(questions, attempts, options).map((card) => [card.questionId, card]));
}

export function summarizeMemory(questions, attempts, options = {}) {
  const cards = buildMemoryCards(questions, attempts, options);
  return {
    total: cards.length,
    new: cards.filter((card) => card.state === "new").length,
    due: cards.filter((card) => card.due).length,
    learning: cards.filter((card) => card.state === "learning").length,
    mastered: cards.filter((card) => card.state === "mastered").length,
    wrong: cards.filter((card) => card.latest && !card.latest.correct).length,
  };
}

export function summarizeProgressPayload(payload) {
  if (!payload || ![1, 2].includes(payload.schemaVersion) || !Array.isArray(payload.attempts)) {
    throw new Error("进度 JSON 格式不正确");
  }
  const attempts = payload.attempts;
  const bookmarks = Array.isArray(payload.bookmarks) ? payload.bookmarks : [];
  const latest = latestAttemptByQuestion(attempts);
  const wrong = [...latest.values()].filter((attempt) => !attempt.correct).length;
  const latestAt = attempts
    .map((attempt) => attempt.answeredAt)
    .filter(Boolean)
    .sort((a, b) => String(b).localeCompare(String(a)))[0] || "";
  return {
    schemaVersion: payload.schemaVersion,
    exportedAt: payload.exportedAt || "",
    attempts: attempts.length,
    answeredQuestions: latest.size,
    wrong,
    bookmarks: bookmarks.length,
    essaySamples: Array.isArray(payload.essaySamples) ? payload.essaySamples.length : 0,
    latestAt,
  };
}

export function summarizeModules(questions, attempts, options = {}) {
  const latest = latestAttemptByQuestion(attempts);
  const memory = memoryCardsByQuestion(questions, attempts, options);
  const rows = new Map();
  for (const question of questions) {
    const item = normalizeChoice(question);
    const key = item.module || "other";
    if (!rows.has(key)) {
      rows.set(key, {
        module: key,
        total: 0,
        answered: 0,
        correct: 0,
        wrong: 0,
        due: 0,
        mastered: 0,
        progress: 0,
        accuracy: 0,
      });
    }
    const row = rows.get(key);
    const attempt = latest.get(item.id);
    const card = memory.get(item.id);
    row.total += 1;
    if (attempt) {
      row.answered += 1;
      if (attempt.correct) row.correct += 1;
      else row.wrong += 1;
    }
    if (card?.due) row.due += 1;
    if (card?.state === "mastered") row.mastered += 1;
  }
  return [...rows.values()]
    .map((row) => ({
      ...row,
      progress: row.total ? row.answered / row.total : 0,
      accuracy: row.answered ? row.correct / row.answered : 0,
    }))
    .sort((a, b) => b.total - a.total || a.module.localeCompare(b.module, "zh-Hans-CN"));
}

export function summarizeAttempts(attempts) {
  const total = attempts.length;
  const correct = attempts.filter((item) => item.correct).length;
  const wrong = total - correct;
  const accuracy = total ? correct / total : 0;
  const byModule = {};
  const byTerm = {};
  const bySourceType = {};

  for (const attempt of attempts) {
    incrementStat(byModule, attempt.module || "other", attempt.correct);
    incrementStat(byTerm, attempt.term || "unknown", attempt.correct);
    incrementStat(bySourceType, attempt.sourceType || "unknown", attempt.correct);
  }

  const weakModules = Object.entries(byModule)
    .map(([module, stat]) => ({ module, ...finishStat(stat) }))
    .filter((item) => item.total >= 2)
    .sort((a, b) => a.accuracy - b.accuracy || b.total - a.total)
    .slice(0, 5);

  return {
    total,
    correct,
    wrong,
    accuracy,
    byModule: finishStats(byModule),
    byTerm: finishStats(byTerm),
    bySourceType: finishStats(bySourceType),
    weakModules,
  };
}

export function buildDiagnosisExport({ bank, attempts, bookmarks = [], generatedAt = new Date().toISOString() }) {
  const choices = bank.choices || [];
  const attemptsSorted = [...attempts].sort((a, b) => String(b.answeredAt).localeCompare(String(a.answeredAt)));
  const summary = summarizeAttempts(attemptsSorted);
  const latest = latestAttemptByQuestion(attemptsSorted);
  const wrongQuestionIds = [...latest.values()].filter((attempt) => !attempt.correct).map((attempt) => attempt.questionId);
  const questionMap = new Map(choices.map((question) => [question.id, question]));
  const recentWrong = attemptsSorted
    .filter((attempt) => !attempt.correct)
    .slice(0, 50)
    .map((attempt) => {
      const question = questionMap.get(attempt.questionId);
      return {
        attempt,
        question: question ? compactQuestion(question) : null,
      };
    });

  return {
    schemaVersion: 1,
    generatedAt,
    app: "ruankao-practice-app",
    bank: {
      source: bank.source,
      counts: {
        choices: choices.length,
        cases: bank.cases?.length || 0,
        essays: bank.essays?.length || 0,
      },
      manifest: bank.manifest,
    },
    learner: {
      summary,
      answeredQuestionCount: latest.size,
      wrongQuestionIds,
      bookmarkedQuestionIds: bookmarks.map((item) => item.questionId),
      recentWrong,
      allAttempts: attemptsSorted,
    },
    aiInstructions: [
      "先按模块正确率找短板，不要只看单题。",
      "区分概念不会、审题失误、记忆混淆、计算错误。",
      "给出下一周6-8小时可执行学习安排。",
      "如果计算机基础/网络/数据库连续薄弱，再建议补对应408知识。",
    ],
  };
}

function incrementStat(target, key, correct) {
  if (!target[key]) target[key] = { total: 0, correct: 0, wrong: 0 };
  target[key].total += 1;
  if (correct) target[key].correct += 1;
  else target[key].wrong += 1;
}

function finishStat(stat) {
  return {
    total: stat.total,
    correct: stat.correct,
    wrong: stat.wrong,
    accuracy: stat.total ? stat.correct / stat.total : 0,
  };
}

function finishStats(stats) {
  return Object.fromEntries(Object.entries(stats).map(([key, stat]) => [key, finishStat(stat)]));
}

function compactQuestion(question) {
  return {
    id: question.id,
    term: question.term,
    sourceType: question.sourceType,
    questionNo: question.questionNo,
    module: question.module,
    knowledge: question.knowledge,
    stem: question.stem,
    options: question.options,
    answer: question.answer,
    analysis: question.analysis,
  };
}

function sortQuestionsForPractice(questions) {
  return [...questions].sort((a, b) => {
    const termCompare = compareExamTerms(a.term, b.term);
    if (termCompare) return termCompare;
    const noCompare = Number(a.questionNo || 0) - Number(b.questionNo || 0);
    if (noCompare) return noCompare;
    return String(a.id || "").localeCompare(String(b.id || ""), "zh-Hans-CN", { numeric: true });
  });
}

function continueFromLatest(questions, attempts) {
  if (!questions.length) return [];
  const latest = [...attempts].sort((a, b) => String(b.answeredAt).localeCompare(String(a.answeredAt)))[0];
  const latestIndex = latest ? questions.findIndex((question) => question.id === latest.questionId) : -1;
  if (latestIndex >= 0) {
    const nextIndex = (latestIndex + 1) % questions.length;
    return [...questions.slice(nextIndex), ...questions.slice(0, nextIndex)];
  }
  const attempted = latestAttemptByQuestion(attempts);
  const firstUnanswered = questions.findIndex((question) => !attempted.has(question.id));
  if (firstUnanswered > 0) return [...questions.slice(firstUnanswered), ...questions.slice(0, firstUnanswered)];
  return questions;
}

function attemptsByQuestion(attempts) {
  const grouped = new Map();
  for (const attempt of attempts) {
    if (!grouped.has(attempt.questionId)) grouped.set(attempt.questionId, []);
    grouped.get(attempt.questionId).push(attempt);
  }
  for (const rows of grouped.values()) {
    rows.sort((a, b) => String(a.answeredAt).localeCompare(String(b.answeredAt)));
  }
  return grouped;
}

function trailingCorrectCount(history) {
  let count = 0;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (!history[index].correct) break;
    count += 1;
  }
  return count;
}

function memoryIntervalDays(latest, streak) {
  if (!latest) return 0;
  if (!latest.correct) return 0;
  if (streak <= 1) return 1;
  if (streak === 2) return 3;
  if (streak === 3) return 7;
  return 15;
}

function memoryState({ latest, streak, due }) {
  if (!latest) return "new";
  if (due) return "due";
  if (streak >= 3) return "mastered";
  return "learning";
}

function memoryStateLabel(state) {
  const labels = {
    new: "未做",
    due: "待复习",
    learning: "学习中",
    mastered: "已掌握",
  };
  return labels[state] || "学习中";
}

function addDaysIso(value, days) {
  const base = new Date(value || Date.now());
  base.setDate(base.getDate() + days);
  return base.toISOString();
}

function analysisKind(analysis) {
  const text = cleanDisplayText(analysis);
  if (!text || text === "（解析待补充）") return "missing";
  if (/PDF\s*自动抽取|历史真题 PDF 自动抽取/.test(text)) return "source-only";
  return "available";
}

function normalizeAnalysis(analysis) {
  const text = cleanDisplayText(analysis);
  if (!text || text === "（解析待补充）") {
    return "本题暂无详细解析，已保留正确答案。做错后可以导出 AI 诊断，我会按题号继续补讲。";
  }
  if (/PDF\s*自动抽取|历史真题 PDF 自动抽取/.test(text)) {
    return "本题来自历史真题 PDF 自动抽取，当前仅提供正确答案和来源。需要详细讲解时，把题号或导出的 AI 诊断发给我。";
  }
  return text;
}

export function uniqueSorted(items, key) {
  const values = [...new Set(items.map((item) => item[key]).filter(Boolean))];
  return values.sort(key === "term" ? compareExamTerms : (a, b) => String(a).localeCompare(String(b), "zh-Hans-CN", { numeric: true }));
}

function compareExamTerms(left, right) {
  const leftKey = examTermKey(left);
  const rightKey = examTermKey(right);
  if (leftKey && rightKey) {
    for (let index = 0; index < leftKey.length; index += 1) {
      const difference = leftKey[index] - rightKey[index];
      if (difference) return difference;
    }
  } else if (leftKey) return -1;
  else if (rightKey) return 1;
  return String(left || "").localeCompare(String(right || ""), "zh-Hans-CN", { numeric: true });
}

function examTermKey(value) {
  const term = String(value || "");
  const year = Number(term.match(/(20\d{2})年/u)?.[1]);
  if (!year) return null;
  const phase = term.includes("上半年") ? 1 : term.includes("下半年") ? 2 : Number(term.match(/年\s*(\d{1,2})月/u)?.[1] || 0);
  const arabicBatch = Number(term.match(/(?:第\s*)?(\d+)\s*(?:批次|模拟卷)/u)?.[1] || 0);
  const chineseBatch = term.match(/第?([一二三四五六七八九十])批次/u)?.[1] || "";
  const batch = arabicBatch || "一二三四五六七八九十".indexOf(chineseBatch) + 1 || 0;
  return [year, phase, batch];
}

export function formatPercent(value) {
  return `${Math.round((value || 0) * 100)}%`;
}

function seededPick(items, count, seed) {
  return [...items]
    .map((item) => ({ item, score: hashString(`${seed}:${item.id}`) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, Math.max(1, count))
    .map((row) => row.item);
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function latestRealTerm(questions) {
  const terms = uniqueSorted(questions.filter((q) => q.sourceType === "real"), "term");
  return terms.at(-1) || "all";
}

function inferWeakModule(attempts) {
  return summarizeAttempts(attempts).weakModules[0]?.module || "architecture";
}
