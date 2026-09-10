import {
  buildPracticeSet,
  buildDiagnosisExport,
  buildStudyPlan,
  defaultDailyCount,
  emptyFilters,
  formatQuestionForDisplay,
  formatPercent,
  gradeAnswer,
  latestAttemptByQuestion,
  memoryCardsByQuestion,
  questionSourceLabel,
  summarizeMemory,
  summarizeModules,
  summarizeProgressPayload,
  summarizeAttempts,
  uniqueSorted,
} from "./core.mjs";
import {
  addAttempt,
  clearProgressData,
  deleteEssaySample,
  exportProgress,
  getBookmarks,
  getEssaySamples,
  getAttempts,
  importProgress,
  saveEssaySample,
  toggleBookmark,
} from "./db.mjs";
import {
  aiModel,
  generateLocalCaseExplanation,
  getLocalCaseExplanation,
  getLocalExplanation,
  explainWrongAnswerProgressively,
  generateEssaySampleProgressively,
  getEssaySampleTemplate,
  validateEssaySample,
} from "./ai.mjs";
import { renderQuestionFigure } from "./figures.mjs";
import { renderMarkdown } from "./markdown.mjs";

const state = {
  bank: null,
  figures: {},
  attempts: [],
  bookmarks: [],
  filteredQuestions: [],
  currentIndex: 0,
  selectedAnswer: "",
  submitted: false,
  retryQuestionId: "",
  mode: "continue",
  dailyCount: defaultDailyCount,
  queuePage: 0,
  queuePageSize: 75,
  questionStartedAt: Date.now(),
  currentView: "practice",
  filters: { ...emptyFilters },
  pendingProgress: null,
  aiApiKey: "",
  aiExplanations: {},
  caseExplanations: {},
  aiExplanation: null,
  aiRequestId: 0,
  caseExplanation: null,
  caseRequestId: 0,
  essaySamples: new Map(),
  essayGeneration: null,
  essayRequestId: 0,
  materials: [],
  materialId: "",
  materialKeyword: "",
  materialCache: new Map(),
  materialStatus: "idle",
  materialError: "",
  materialRequestId: 0,
};

let aiStreamFrame = 0;
let essayStreamFrame = 0;
let essayAbortController = null;

const $ = (id) => document.getElementById(id);
const viewTitles = {
  practice: "选择题",
  wrong: "错题",
  stats: "统计",
  cases: "案例分析",
  essays: "论文",
  materials: "资料阅读",
  data: "数据",
};

async function init() {
  try {
    const [bankResponse, figuresResponse, explanationsResponse, caseExplanationsResponse, materialsResponse] = await Promise.all([
      fetch("./data/bank.json"),
      fetch("./data/figures.json").catch(() => null),
      fetch("./data/ai-explanations.json", { cache: "no-store" }).catch(() => null),
      fetch("./data/ai-case-explanations.json", { cache: "no-store" }).catch(() => null),
      fetch("./data/study-materials.json").catch(() => null),
    ]);
    if (!bankResponse.ok) throw new Error(`题库读取失败（${bankResponse.status}）`);
    state.bank = await bankResponse.json();
    state.figures = figuresResponse?.ok ? (await figuresResponse.json()).figures || {} : {};
    state.aiExplanations = explanationsResponse?.ok ? (await explanationsResponse.json()).explanations || {} : {};
    state.caseExplanations = caseExplanationsResponse?.ok ? (await caseExplanationsResponse.json()).explanations || {} : {};
    const materialsPayload = materialsResponse?.ok ? await materialsResponse.json() : null;
    state.materials = normalizeMaterials(materialsPayload?.materials);
    state.materialId = state.materials[0]?.id || "";
    const [attempts, bookmarks, essaySamples] = await Promise.all([getAttempts(), getBookmarks(), getEssaySamples()]);
    state.attempts = attempts;
    state.bookmarks = bookmarks;
    state.essaySamples = new Map(essaySamples.map((sample) => [sample.essayId, sample]));
    initFilters();
    applyFilters();
    bindEvents();
    renderAll();
  } catch (error) {
    showNotice(`初始化失败：${error.message}`, "error");
  }
}

function bindEvents() {
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });
  document.querySelectorAll(".type-button").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.typeView));
  });
  $("applyFilters").addEventListener("click", () => {
    readFilters();
    applyFilters();
    renderPractice();
  });
  $("dailyCount").addEventListener("change", () => {
    readFilters();
    if (state.mode === "review") {
      applyFilters();
      renderPractice();
      renderOverview();
    }
  });
  document.querySelectorAll(".mode-button").forEach((button) => {
    button.addEventListener("click", () => runMode(button.dataset.mode));
  });
  $("keywordFilter").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      readFilters();
      applyFilters();
      renderPractice();
    }
  });
  $("prevQuestion").addEventListener("click", prevQuestion);
  $("nextQuestion").addEventListener("click", nextQuestion);
  $("toggleFavorite").addEventListener("click", toggleCurrentFavorite);
  $("queuePrevPage").addEventListener("click", () => changeQueuePage(-1));
  $("queueNextPage").addEventListener("click", () => changeQueuePage(1));
  $("exportDiagnosis").addEventListener("click", downloadDiagnosis);
  $("importProgressTop").addEventListener("click", chooseProgressFile);
  $("exportProgressTop").addEventListener("click", downloadProgress);
  $("exportProgress").addEventListener("click", downloadProgress);
  $("selectProgressFile").addEventListener("click", chooseProgressFile);
  $("applyProgressImport").addEventListener("click", applyPendingProgress);
  $("importProgress").addEventListener("change", importProgressFile);
  $("clearProgress").addEventListener("click", clearProgress);
  $("aiApiKey").addEventListener("input", (event) => {
    state.aiApiKey = event.target.value.trim();
  });
  $("essayList").addEventListener("click", handleEssayAction);
  $("caseList").addEventListener("click", handleCaseAction);
  $("materialList").addEventListener("click", handleMaterialAction);
  $("materialSearch").addEventListener("input", (event) => {
    state.materialKeyword = event.target.value.trim();
    renderMaterials();
  });
}

function initFilters() {
  fillSelect($("sourceFilter"), [
    ["all", "全部来源"],
    ["real", "真题"],
    ["mock", "模拟题"],
  ]);
  fillSelect($("termFilter"), [["all", "全部年份/卷"], ...uniqueSorted(state.bank.choices, "term").map((x) => [x, x])]);
  fillSelect($("moduleFilter"), [["all", "全部模块"], ...uniqueSorted(state.bank.choices, "module").map((x) => [x, moduleLabel(x)])]);
}

function fillSelect(select, rows) {
  select.innerHTML = rows.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join("");
}

function readFilters() {
  state.dailyCount = Math.max(5, Math.min(75, Number($("dailyCount").value || defaultDailyCount)));
  state.filters = {
    sourceType: $("sourceFilter").value,
    term: $("termFilter").value,
    module: $("moduleFilter").value,
    status: $("statusFilter").value,
    keyword: $("keywordFilter").value,
  };
}

function applyFilters() {
  state.filteredQuestions = buildPracticeSet(state.bank.choices, state.attempts, {
    mode: state.mode,
    filters: state.filters,
    dailyCount: state.dailyCount,
    bookmarkedIds: state.bookmarks.map((item) => item.questionId),
  });
  state.currentIndex = 0;
  state.selectedAnswer = "";
  state.submitted = false;
  state.retryQuestionId = "";
  state.queuePage = 0;
  state.questionStartedAt = Date.now();
}

function renderAll() {
  $("bankCount").textContent = `${state.bank.choices.length} 选择题`;
  $("attemptCount").textContent = `${state.attempts.length}`;
  $("localExplanationStatus").textContent = `本地 AI 解析：${Object.keys(state.aiExplanations).length}/${state.bank.choices.length} 道`;
  $("caseExplanationStatus").textContent = `本地案例解题：${Object.keys(state.caseExplanations).length}/${state.bank.cases.length} 道`;
  renderModeCounts();
  renderChapterBoard();
  renderOverview();
  renderPractice();
  renderStats();
  renderWrong();
  renderCases();
  renderEssays();
  renderMaterials();
}

function renderOverview() {
  $("studyPlanList").innerHTML = buildStudyPlan({ dailyCount: state.dailyCount }).map((item) => `
    <div class="plan-step">
      <strong>${escapeHtml(item.title)}</strong>
      <span>${escapeHtml(item.detail)}</span>
    </div>
  `).join("");
  const realTerms = state.bank.manifest.scope.real_terms || [];
  const mockTerms = state.bank.manifest.scope.mock_terms || [];
  const realCount = state.bank.manifest.counts.choice_real || state.bank.choices.filter((item) => item.sourceType === "real").length;
  const mockCount = state.bank.manifest.counts.choice_mock || state.bank.choices.filter((item) => item.sourceType === "mock").length;
  const realRange = realTerms.length ? `${realTerms[0]} 至 ${realTerms.at(-1)}，共 ${realTerms.length} 个批次` : "暂无真题";
  $("sourceSummary").textContent = `${state.bank.choices.length} 道选择题，${state.bank.cases.length} 道案例，${state.bank.essays.length} 道论文`;
  $("sourceDetail").textContent = `真题 ${realCount} 道：${realRange}；模拟 ${mockCount} 道：${mockTerms.length} 套。每题下方显示年份、题号、模块和来源文件。`;
}

function renderModeCounts() {
  const memory = summarizeMemory(state.bank.choices, state.attempts);
  const terms = uniqueSorted(state.bank.choices.filter((item) => item.sourceType === "real"), "term");
  $("continueModeCount").textContent = `${memory.new} 未做`;
  $("reviewModeCount").textContent = `${memory.due} 到期`;
  $("specialModeCount").textContent = `${uniqueSorted(state.bank.choices, "module").length} 模块`;
  $("examModeCount").textContent = `${terms.length} 套`;
  $("wrongModeCount").textContent = `${memory.wrong} 错题`;
  $("favoriteModeCount").textContent = `${state.bookmarks.length} 收藏`;
  $("allModeCount").textContent = `${state.bank.choices.length} 题`;
}

function renderChapterBoard() {
  const modules = summarizeModules(state.bank.choices, state.attempts);
  $("chapterList").innerHTML = modules.map((item) => `
    <button class="chapter-item ${state.mode === "special" && state.filters.module === item.module ? "active" : ""}" data-chapter="${escapeHtml(item.module)}" type="button">
      <span>
        <b>${moduleLabel(item.module)}</b>
        <small>${item.answered}/${item.total} 已做 · 正确率 ${formatPercent(item.accuracy)}</small>
      </span>
      <strong>${item.wrong} 错</strong>
      <em>${item.due} 待复习</em>
      <i><mark style="width: ${Math.round(item.progress * 100)}%"></mark></i>
    </button>
  `).join("");
  document.querySelectorAll("[data-chapter]").forEach((button) => {
    button.addEventListener("click", () => runChapter(button.dataset.chapter));
  });
}

function renderPractice() {
  syncModeButtons();
  syncChapterButtons();
  $("queueSummary").textContent = `${state.filteredQuestions.length} 道题`;
  $("modeLabel").textContent = modeLabel(state.mode);
  renderQueue();
  const question = currentQuestion();
  if (!question) {
    const empty = emptyPracticeMessage();
    $("questionMeta").textContent = empty.meta;
    $("questionStem").textContent = empty.title;
    $("optionList").innerHTML = "";
    $("questionProgress").textContent = "0/0";
    $("toggleFavorite").textContent = "收藏本题";
    $("toggleFavorite").classList.remove("marked");
    $("answerResult").hidden = true;
    $("questionFigure").hidden = true;
    $("questionFigure").innerHTML = "";
    $("sourceBox").innerHTML = "";
    return;
  }
  const display = formatQuestionForDisplay(questionWithFigure(question));
  const memory = memoryCardsByQuestion(state.bank.choices, state.attempts).get(question.id);
  const bookmarked = isBookmarked(question.id);
  const latestAttempt = shouldAnswerFresh(question) ? null : latestAttemptByQuestion(state.attempts).get(question.id);
  const answerForDisplay = state.submitted ? state.selectedAnswer : latestAttempt?.answer || "";
  const shouldReveal = state.submitted || Boolean(latestAttempt);
  const gradedForDisplay = shouldReveal ? gradeAnswer(question, answerForDisplay) : null;
  $("questionProgress").textContent = `${state.currentIndex + 1}/${state.filteredQuestions.length}`;
  $("questionMeta").innerHTML = `
    <span>${escapeHtml(questionSourceLabel(question))}</span>
    <span>${escapeHtml(moduleLabel(question.module))}</span>
    ${memory ? `<span class="memory-chip memory-${memory.state}">${escapeHtml(memory.label)}</span>` : ""}
    ${bookmarked ? `<span class="bookmark-chip">已收藏</span>` : ""}
    ${display.figure ? `<span class="figure-chip">结构化图示</span>` : ""}
    ${display.figureMissing ? `<span class="meta-warn">原图待补</span>` : ""}
    ${display.analysisKind !== "available" ? `<span class="meta-warn">${display.analysisKind === "source-only" ? "PDF抽取题" : "解析待补"}</span>` : ""}
  `;
  $("questionStem").innerHTML = renderRichText(display.stem);
  $("questionFigure").innerHTML = renderQuestionFigure(display.figure, display.figureMissing);
  $("questionFigure").hidden = !display.figure && !display.figureMissing;
  $("optionList").innerHTML = ["A", "B", "C", "D"].map((key) => {
    const classes = ["option"];
    if (shouldReveal) classes.push("locked");
    if (answerForDisplay === key) classes.push("selected");
    if (shouldReveal && key === question.answer) classes.push("correct-choice");
    if (shouldReveal && answerForDisplay === key && key !== question.answer) classes.push("wrong-choice");
    return `<button class="${classes.join(" ")}" data-answer="${key}" type="button"><b>${key}</b><span class="option-text">${renderInlineText(display.options[key] || "")}</span></button>`;
  }).join("");
  document.querySelectorAll(".option").forEach((button) => {
    button.addEventListener("click", () => {
      if (shouldReveal) return;
      submitCurrentAnswer(button.dataset.answer);
    });
  });
  if (gradedForDisplay) {
    renderAnswerResult(display, gradedForDisplay, {
      review: Boolean(latestAttempt) && !state.submitted,
      cacheQuestion: questionWithFigure(question),
    });
  } else {
    $("answerResult").hidden = true;
    $("answerResult").innerHTML = "";
  }
  $("toggleFavorite").textContent = bookmarked ? "取消收藏" : "收藏本题";
  $("toggleFavorite").classList.toggle("marked", bookmarked);
  $("sourceBox").innerHTML = `
    <div><b>来源</b><span>${escapeHtml(questionSourceLabel(question))}</span></div>
    <div><b>模块</b><span>${moduleLabel(question.module)}${question.knowledge ? ` · ${escapeHtml(question.knowledge)}` : ""}</span></div>
    <div><b>记忆</b><span>${memorySummary(memory)}</span></div>
    <div><b>标记</b><span>${bookmarked ? "已加入收藏题，可在收藏题模式重刷" : "未收藏，可手动标记重点题"}</span></div>
    <div><b>原始文件</b><span>${escapeHtml(question.sourceFile || "")}</span></div>
  `;
}

function renderQueue() {
  const latest = latestAttemptByQuestion(state.attempts);
  const queueAttempts = state.filteredQuestions.map((question) => latest.get(question.id)).filter(Boolean);
  const correct = queueAttempts.filter((attempt) => attempt.correct).length;
  const wrong = queueAttempts.filter((attempt) => attempt.correct === false).length;
  const unanswered = Math.max(0, state.filteredQuestions.length - queueAttempts.length);
  const pageCount = Math.max(1, Math.ceil(state.filteredQuestions.length / state.queuePageSize));
  state.queuePage = Math.min(Math.max(0, state.queuePage), pageCount - 1);
  const start = state.queuePage * state.queuePageSize;
  const end = Math.min(start + state.queuePageSize, state.filteredQuestions.length);
  $("queueSummary").textContent = `${state.filteredQuestions.length} 道题 · 已答 ${queueAttempts.length}`;
  $("queuePageLabel").textContent = state.filteredQuestions.length ? `${start + 1}-${end} / ${state.filteredQuestions.length}` : "0 / 0";
  $("queuePrevPage").disabled = state.queuePage === 0;
  $("queueNextPage").disabled = state.queuePage >= pageCount - 1;
  $("queueLegend").innerHTML = `
    <span><i class="legend-current"></i>当前</span>
    <span><i class="legend-ok"></i>正确 ${correct}</span>
    <span><i class="legend-bad"></i>错误 ${wrong}</span>
    <span><i></i>未答 ${unanswered}</span>
  `;
  $("questionQueue").innerHTML = state.filteredQuestions.slice(start, end).map((question, pageIndex) => {
    const index = start + pageIndex;
    const attempt = latest.get(question.id);
    const status = attempt ? (attempt.correct ? "ok" : "bad") : "";
    const active = index === state.currentIndex ? " active" : "";
    const title = attempt ? `${index + 1}：${attempt.correct ? "正确" : "错误"}` : `${index + 1}：未答`;
    return `<button class="queue-item ${status}${active}" data-index="${index}" title="${escapeHtml(title)}" type="button">${index + 1}</button>`;
  }).join("");
  document.querySelectorAll(".queue-item").forEach((button) => {
    button.addEventListener("click", () => {
      state.currentIndex = Number(button.dataset.index);
      state.selectedAnswer = "";
      state.submitted = false;
      state.retryQuestionId = "";
      state.queuePage = Math.floor(state.currentIndex / state.queuePageSize);
      state.questionStartedAt = Date.now();
      renderPractice();
    });
  });
}

async function submitCurrentAnswer(answer) {
  const question = currentQuestion();
  state.selectedAnswer = answer;
  if (!question || !state.selectedAnswer) {
    showNotice("先选一个答案。", "warn");
    return;
  }
  const graded = gradeAnswer(question, state.selectedAnswer);
  const attempt = {
    questionId: question.id,
    sourceType: question.sourceType,
    term: question.term,
    module: question.module,
    knowledge: question.knowledge || "",
    answer: graded.answer,
    correctAnswer: graded.correctAnswer,
    correct: graded.correct,
    durationMs: Date.now() - state.questionStartedAt,
    answeredAt: new Date().toISOString(),
  };
  await addAttempt(attempt);
  state.attempts = await getAttempts();
  state.submitted = true;
  state.retryQuestionId = "";
  renderPractice();
  renderStats();
  renderWrong();
  renderModeCounts();
  renderChapterBoard();
  $("attemptCount").textContent = `${state.attempts.length}`;
}

function renderAnswerResult(question, graded, options = {}) {
  const result = $("answerResult");
  result.hidden = false;
  result.className = `answer-result ${graded.correct ? "correct" : "wrong"}`;
  result.innerHTML = `
    <div class="answer-title">
      <h4>${options.review ? "上次作答" : graded.correct ? "回答正确" : "回答错误"}</h4>
      <span>你的答案 ${escapeHtml(graded.answer)} · 正确答案 ${escapeHtml(graded.correctAnswer)}</span>
    </div>
    <div class="analysis-body ${question.analysisKind !== "available" ? "analysis-muted" : ""}"><h5>题库原解析</h5>${renderRichText(question.analysis || "暂无解析")}</div>
    ${renderLocalQuestionExplanation(options.cacheQuestion || question)}
    ${graded.correct ? "" : renderAiExplanation(question)}
    ${options.review ? `<button class="retry-answer" type="button">再次作答</button>` : ""}
  `;
  result.querySelector(".ai-explain-button")?.addEventListener("click", requestAiExplanation);
  result.querySelector(".retry-answer")?.addEventListener("click", () => {
    const question = currentQuestion();
    state.retryQuestionId = question?.id || "";
    state.selectedAnswer = "";
    state.submitted = false;
    state.questionStartedAt = Date.now();
    renderPractice();
  });
}

function renderAiExplanation(question) {
  const explanation = state.aiExplanation?.questionId === question.id ? state.aiExplanation : null;
  if (explanation?.status === "loading") {
    const text = explanation.text ? escapeHtml(explanation.text) : "正在生成错因分析…";
    return `
      <div class="ai-explanation ai-streaming">
        <h5>AI 错题解读 <span class="ai-stream-status">${escapeHtml(explanation.statusText || "实时生成中")}</span></h5>
        <div class="ai-stream-output" aria-live="polite">${text}</div>
        <button class="ai-explain-button" type="button" disabled>${aiModel} 正在解读</button>
      </div>
    `;
  }
  if (explanation?.status === "success") {
    return `<div class="ai-explanation"><h5>AI 错题解读</h5>${renderRichText(explanation.text)}<button class="ai-explain-button" type="button">重新解读</button></div>`;
  }
  const error = explanation?.status === "error" ? `<p class="ai-error">${escapeHtml(explanation.text)}</p>` : "";
  const partial = explanation?.status === "error" && explanation.partialText
    ? `<div class="ai-stream-output">${escapeHtml(explanation.partialText)}</div>`
    : "";
  return `<div class="ai-explanation">${error}${partial}<button class="ai-explain-button" type="button">使用 ${aiModel} 解读错因</button></div>`;
}

function renderLocalQuestionExplanation(question) {
  const explanation = getLocalExplanation(questionWithFigure(question), state.aiExplanations);
  if (!explanation) {
    return `<div class="ai-explanation"><h5>本地 AI 题目解析</h5><p class="ai-error">本地解析未加载，请刷新页面后重试。</p></div>`;
  }
  return `<div class="ai-explanation"><h5>本地 AI 题目解析</h5>${renderRichText(explanation.content)}</div>`;
}

async function requestAiExplanation() {
  const question = currentQuestion();
  if (!question) return;
  const graded = gradeAnswer(question, state.selectedAnswer || latestAttemptByQuestion(state.attempts).get(question.id)?.answer);
  const requestId = state.aiRequestId + 1;
  state.aiRequestId = requestId;
  state.aiExplanation = { questionId: question.id, status: "loading", text: "", statusText: "实时生成中" };
  renderPractice();
  try {
    const text = await explainWrongAnswerProgressively({
      apiKey: state.aiApiKey,
      question: questionWithFigure(question),
      graded,
      onStatus: (statusText) => {
        if (requestId !== state.aiRequestId || state.aiExplanation?.questionId !== question.id) return;
        state.aiExplanation.statusText = statusText;
        renderPractice();
      },
      onDelta: (streamText) => {
        if (requestId !== state.aiRequestId || state.aiExplanation?.questionId !== question.id) return;
        state.aiExplanation.text = streamText;
        scheduleAiStreamRender(question.id);
      },
    });
    if (requestId !== state.aiRequestId || state.aiExplanation?.questionId !== question.id) return;
    state.aiExplanation = { questionId: question.id, status: "success", text };
  } catch (error) {
    if (requestId !== state.aiRequestId || state.aiExplanation?.questionId !== question.id) return;
    state.aiExplanation = {
      questionId: question.id,
      status: "error",
      text: error.message,
      partialText: typeof error.partialText === "string" ? error.partialText : "",
    };
  }
  if (currentQuestion()?.id === question.id) renderPractice();
}

function scheduleAiStreamRender(questionId) {
  if (aiStreamFrame) return;
  aiStreamFrame = window.requestAnimationFrame(() => {
    aiStreamFrame = 0;
    if (state.aiExplanation?.questionId !== questionId || currentQuestion()?.id !== questionId) return;
    const output = $("answerResult").querySelector(".ai-stream-output");
    if (output) output.textContent = state.aiExplanation.text;
  });
}

function prevQuestion() {
  if (!state.filteredQuestions.length) return;
  state.currentIndex = (state.currentIndex - 1 + state.filteredQuestions.length) % state.filteredQuestions.length;
  state.selectedAnswer = "";
  state.submitted = false;
  state.retryQuestionId = "";
  state.queuePage = Math.floor(state.currentIndex / state.queuePageSize);
  state.questionStartedAt = Date.now();
  renderPractice();
}

function nextQuestion() {
  if (!state.filteredQuestions.length) return;
  state.currentIndex = (state.currentIndex + 1) % state.filteredQuestions.length;
  state.selectedAnswer = "";
  state.submitted = false;
  state.retryQuestionId = "";
  state.queuePage = Math.floor(state.currentIndex / state.queuePageSize);
  state.questionStartedAt = Date.now();
  renderPractice();
}

function changeQueuePage(delta) {
  const pageCount = Math.max(1, Math.ceil(state.filteredQuestions.length / state.queuePageSize));
  state.queuePage = Math.min(Math.max(0, state.queuePage + delta), pageCount - 1);
  renderQueue();
}

function renderStats() {
  const summary = summarizeAttempts(state.attempts);
  const answered = latestAttemptByQuestion(state.attempts).size;
  $("metricTotal").textContent = String(summary.total);
  $("metricAccuracy").textContent = formatPercent(summary.accuracy);
  $("metricWrong").textContent = String(summary.wrong);
  $("metricAnswered").textContent = String(answered);
  const modules = Object.entries(summary.byModule)
    .sort((a, b) => a[1].accuracy - b[1].accuracy || b[1].total - a[1].total);
  $("moduleStats").innerHTML = modules.length ? modules.map(([module, stat]) => `
    <div class="stat-row">
      <span>${moduleLabel(module)}</span>
      <strong>${formatPercent(stat.accuracy)}</strong>
      <small>${stat.correct}/${stat.total}</small>
    </div>
  `).join("") : `<p class="muted">还没有作答记录。</p>`;
}

function renderWrong() {
  const latest = latestAttemptByQuestion(state.attempts);
  const questionMap = new Map(state.bank.choices.map((q) => [q.id, q]));
  const wrong = [...latest.values()].filter((attempt) => !attempt.correct);
  $("wrongList").innerHTML = wrong.length ? wrong.map((attempt) => {
    const question = questionMap.get(attempt.questionId);
    if (!question) return "";
    return itemCard(question, `
      <p>你的答案：<b>${escapeHtml(attempt.answer)}</b>；正确答案：<b>${escapeHtml(attempt.correctAnswer)}</b></p>
      <button data-retry="${question.id}" type="button">重刷这题</button>
    `);
  }).join("") : `<p class="muted">现在没有错题。</p>`;
  document.querySelectorAll("[data-retry]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.retry;
      state.filters = { ...emptyFilters };
      syncFilterControls();
      state.filteredQuestions = state.bank.choices.filter((q) => q.id === id);
      state.currentIndex = 0;
      state.selectedAnswer = "";
      state.submitted = false;
      state.retryQuestionId = id;
      state.queuePage = 0;
      state.questionStartedAt = Date.now();
      switchView("practice");
      renderPractice();
    });
  });
}

function renderCases() {
  $("caseList").innerHTML = state.bank.cases.slice(0, 120).map((item) => `
    <article class="item-card">
      <div class="question-meta">${escapeHtml(item.term)} · ${moduleLabel(item.module)}</div>
      <h4>${escapeHtml(item.title)}</h4>
      <p>${escapeHtml(item.description || "暂无题干描述")}</p>
      <details>
        <summary>查看问题与参考答案</summary>
        ${uniqueCaseSubQuestions(item).map((sub) => `<h5>${escapeHtml(sub.question_label)}</h5><div class="case-reference"><p>${escapeHtml(sub.prompt || "")}</p>${renderRichText(sub.reference_answer || "暂无参考答案")}</div>`).join("")}
      </details>
      ${renderCaseAiExplanation(item)}
    </article>
  `).join("");
}

function renderMaterials() {
  const selected = state.materials.find((item) => item.id === state.materialId) || null;
  const keyword = state.materialKeyword.toLocaleLowerCase();
  const visible = state.materials.filter((item) => `${item.groupLabel} ${item.title}`.toLocaleLowerCase().includes(keyword));
  $("materialSearch").value = state.materialKeyword;
  $("materialList").innerHTML = visible.length ? visible.map((item) => `
    <button class="material-item ${item.id === selected?.id ? "active" : ""}" data-material-id="${escapeHtml(item.id)}" type="button">
      <span>${escapeHtml(item.groupLabel)}</span>
      <b>${escapeHtml(item.title)}</b>
    </button>
  `).join("") : `<p class="muted">没有匹配的资料。</p>`;
  $("materialHeader").innerHTML = selected ? materialHeader(selected) : "";
  $("materialContent").innerHTML = materialContent(selected);
}

function materialHeader(material) {
  return `
    <div>
      <p class="section-kicker">${escapeHtml(material.groupLabel)} · ${material.charCount} 字</p>
      <h3>${escapeHtml(material.title)}</h3>
      <p>正文按需从来源仓库读取，不作为本站题库内容重新发布。</p>
    </div>
    <a href="${escapeHtml(material.sourceUrl)}" target="_blank" rel="noreferrer">在来源仓库阅读</a>
  `;
}

function materialContent(material) {
  if (!material) return `<p class="muted">资料目录未加载。</p>`;
  if (state.materialStatus === "loading") return `<p class="muted">正在从来源仓库加载 Markdown…</p>`;
  if (state.materialError) return `<p class="ai-error">${escapeHtml(state.materialError)}</p>`;
  const content = state.materialCache.get(material.id);
  return content ? renderMarkdown(content, material.rawUrl) : `<p class="muted">选择资料后开始阅读。</p>`;
}

function handleMaterialAction(event) {
  const button = event.target.closest("[data-material-id]");
  if (!button || button.dataset.materialId === state.materialId) return;
  void selectMaterial(button.dataset.materialId);
}

async function selectMaterial(materialId = state.materialId) {
  const material = state.materials.find((item) => item.id === materialId);
  if (!material) return;
  const requestId = state.materialRequestId + 1;
  state.materialRequestId = requestId;
  state.materialId = material.id;
  state.materialError = "";
  if (state.materialCache.has(material.id)) {
    state.materialStatus = "ready";
    renderMaterials();
    return;
  }
  state.materialStatus = "loading";
  renderMaterials();
  try {
    const response = await fetch(material.rawUrl);
    if (!response.ok) throw new Error(`来源资料读取失败（${response.status}）`);
    const content = await response.text();
    if (requestId !== state.materialRequestId) return;
    state.materialCache.set(material.id, content);
    state.materialStatus = "ready";
  } catch (error) {
    if (requestId !== state.materialRequestId) return;
    state.materialStatus = "error";
    state.materialError = error.message || "来源资料读取失败，请在来源仓库打开。";
  }
  renderMaterials();
}

function renderCaseAiExplanation(item) {
  const current = state.caseExplanation?.caseId === item.id ? state.caseExplanation : null;
  const local = getLocalCaseExplanation(item, state.caseExplanations);
  if (current?.status === "loading") {
    return `<section class="case-ai-explanation ai-streaming"><h5>GLM 案例解题 <span class="ai-stream-status">正在整理</span></h5><div class="ai-stream-output">正在根据题库参考答案整理作答要点…</div><button type="button" disabled>${aiModel} 正在整理</button></section>`;
  }
  const content = current?.status === "success" ? current.content : local?.content;
  const error = current?.status === "error" ? `<p class="ai-error">${escapeHtml(current.message)}</p>` : "";
  return `<section class="case-ai-explanation"><h5>本地 GLM 案例解题</h5>${content ? renderRichText(content) : `<p class="muted">本地案例解题尚未加载。</p>`}${error}<button type="button" data-case-ai="${escapeHtml(item.id)}">使用 ${aiModel} 重新整理</button></section>`;
}

function uniqueCaseSubQuestions(item) {
  const selected = new Map();
  (item.subQuestions || []).forEach((sub) => {
    const label = String(sub.question_label || "问题").trim();
    const previous = selected.get(label);
    const score = String(sub.prompt || "").length + String(sub.reference_answer || "").length;
    const previousScore = previous ? String(previous.prompt || "").length + String(previous.reference_answer || "").length : -1;
    if (score >= previousScore) selected.set(label, sub);
  });
  return [...selected.values()];
}

async function handleCaseAction(event) {
  const button = event.target.closest("[data-case-ai]");
  if (!button) return;
  const item = state.bank.cases.find((caseItem) => caseItem.id === button.dataset.caseAi);
  if (!item) return;
  const requestId = state.caseRequestId + 1;
  state.caseRequestId = requestId;
  state.caseExplanation = { caseId: item.id, status: "loading" };
  renderCases();
  try {
    const content = await generateLocalCaseExplanation({ apiKey: state.aiApiKey, caseItem: item });
    if (requestId !== state.caseRequestId) return;
    state.caseExplanation = { caseId: item.id, status: "success", content };
  } catch (error) {
    if (requestId !== state.caseRequestId) return;
    state.caseExplanation = { caseId: item.id, status: "error", message: error.message || "GLM 案例解题失败" };
  }
  renderCases();
}

function renderEssays() {
  $("essayList").innerHTML = state.bank.essays.slice(0, 120).map((item) => `
    <article class="item-card">
      <div class="question-meta">${escapeHtml(item.term)} · ${moduleLabel(item.module)}</div>
      <h4>${escapeHtml(item.title)}</h4>
      <p>${escapeHtml(item.prompt || "")}</p>
      <details>
        <summary>查看写作要点</summary>
        <p class="analysis">${escapeHtml(item.writingPoints || "暂无写作要点")}</p>
      </details>
      ${renderEssaySample(item)}
    </article>
  `).join("");
}

function renderEssaySample(essay) {
  const sample = state.essaySamples.get(essay.id);
  const template = getEssaySampleTemplate(essay);
  const validation = sample ? validateEssaySample(essay, sample.content) : null;
  const generation = state.essayGeneration?.essayId === essay.id ? state.essayGeneration : null;
  const generating = state.essayGeneration?.status === "loading";
  const loading = generation?.status === "loading";
  const savedAsDraft = sample?.status === "draft";
  const failedDraft = generation?.status === "error" && generation.draft ? `
    <section class="essay-sample-draft">
      <div class="essay-sample-heading"><h5>未保存草稿</h5><span>首稿原文已保留，不会自动替换成另一篇，也不会覆盖已保存范文</span></div>
      <div class="essay-sample-content">${renderEssaySampleContent(generation.draft, generation.validation)}</div>
    </section>
  ` : "";
  const error = generation?.status === "error" ? `<p class="ai-error">${escapeHtml(generation.text)}</p>` : "";
  const invalid = sample && !validation.valid && !savedAsDraft ? `<p class="essay-sample-warning">已保存范文不符合当前书写条件：${escapeHtml(validation.errors.join("；"))}。重新生成后会覆盖该版本。</p>` : "";
  const savedDraftNotice = savedAsDraft ? `<p class="essay-sample-warning">这是未达标草稿：${escapeHtml((sample.validationErrors || validation.errors).join("；"))}。</p>` : "";
  const warning = sample && validation?.warnings?.length ? `<p class="essay-sample-note">字数提示：${escapeHtml(validation.warnings.join("；"))}。</p>` : "";
  const saved = sample ? `
    <section class="essay-sample-saved">
      <div class="essay-sample-heading">
        <h5>${savedAsDraft ? "AI 未达标草稿" : "AI 范文示例"}</h5>
        <span>${escapeHtml(sample.model || aiModel)} · ${escapeHtml(formatDateTime(sample.generatedAt))}</span>
      </div>
      ${invalid}
      ${savedDraftNotice}
      ${warning}
      <div class="essay-sample-content">${renderEssaySampleContent(sample.content, validation)}</div>
    </section>
  ` : "";
  const stream = loading ? `
    <section class="essay-sample-stream ai-streaming">
      <h5>AI 范文草稿 <span class="ai-stream-status">${escapeHtml(generation.statusText || "实时生成中")}</span></h5>
      <div class="ai-stream-output" data-essay-stream-output="${escapeHtml(essay.id)}" aria-live="polite">${generation.text ? escapeHtml(generation.text) : "正在生成范文…"}</div>
    </section>
  ` : "";
  return `
    <section class="essay-sample">
      <details class="essay-template">
        <summary>范文书写条件</summary>
        <p>${escapeHtml(formatEssayTemplate(template))}</p>
      </details>
      ${saved}
      ${stream}
      ${failedDraft}
      ${error}
      <div class="button-row essay-sample-actions">
        <button class="primary" data-essay-action="generate" data-essay-id="${escapeHtml(essay.id)}" type="button" ${generating ? "disabled" : ""}>${loading ? `${aiModel} 正在生成` : sample ? "按书写条件重新生成" : `使用 ${aiModel} 生成范文`}</button>
        ${generation?.status === "error" && generation.draft && (!sample || !validation.valid) ? `<button data-essay-action="save-draft" data-essay-id="${escapeHtml(essay.id)}" type="button">保存未达标草稿</button>` : ""}
        ${sample ? `<button data-essay-action="delete" data-essay-id="${escapeHtml(essay.id)}" type="button" ${generating ? "disabled" : ""}>删除已保存范文</button>` : ""}
      </div>
    </section>
  `;
}

function formatEssayTemplate(template) {
  const sections = template.sections.map((section) => `${section.title} ${section.minChars}-${section.maxChars} 字`).join("；");
  return `建议总字数约 ${template.targetChars} 字。${sections}。摘要与正文必须分开；正文按题目三个小问组织，以第一人称说明项目角色、职责和实践。写作要点中的范文提纲仅供参考，不作为固定标题、字数或项目事实。`;
}

function renderEssaySampleContent(content, validation) {
  if (!validation?.valid) return renderRichText(content);
  return validation.sections.map((section) => `<h5>${escapeHtml(section.title)} <small>${section.charCount} 字</small></h5>${renderRichText(section.content)}`).join("");
}

async function handleEssayAction(event) {
  const button = event.target.closest("[data-essay-action]");
  if (!button || button.disabled) return;
  const essay = state.bank.essays.find((item) => item.id === button.dataset.essayId);
  if (!essay) return;
  if (button.dataset.essayAction === "save-draft") {
    const generation = state.essayGeneration?.essayId === essay.id ? state.essayGeneration : null;
    if (!generation?.draft) return;
    const sample = await saveEssaySample({
      essayId: essay.id,
      title: essay.title,
      content: generation.draft,
      model: aiModel,
      status: "draft",
      validationErrors: generation.validation?.errors || [],
      generatedAt: new Date().toISOString(),
    });
    state.essaySamples.set(essay.id, sample);
    state.essayGeneration = null;
    renderEssays();
    showNotice("未达标草稿已保存，可稍后继续参考或重新生成。", "ok");
    return;
  }
  if (button.dataset.essayAction === "delete") {
    if (!confirm("确定删除这篇已保存的 AI 范文吗？")) return;
    await deleteEssaySample(essay.id);
    state.essaySamples.delete(essay.id);
    renderEssays();
    showNotice("已删除保存的 AI 范文。", "ok");
    return;
  }
  await requestEssaySample(essay);
}

async function requestEssaySample(essay) {
  if (state.essayGeneration?.status === "loading") return;
  const requestId = state.essayRequestId + 1;
  state.essayRequestId = requestId;
  essayAbortController?.abort();
  const controller = new AbortController();
  essayAbortController = controller;
  state.essayGeneration = { essayId: essay.id, status: "loading", text: "", statusText: "实时生成中" };
  renderEssays();
  try {
    const content = await generateEssaySampleProgressively({
      apiKey: state.aiApiKey,
      essay,
      signal: controller.signal,
      onStatus: (statusText) => {
        if (requestId !== state.essayRequestId || state.essayGeneration?.essayId !== essay.id) return;
        state.essayGeneration.statusText = statusText;
        renderEssays();
      },
      onDelta: (streamText) => {
        if (requestId !== state.essayRequestId || state.essayGeneration?.essayId !== essay.id) return;
        state.essayGeneration.text = streamText;
        scheduleEssayStreamRender(essay.id);
      },
    });
    if (requestId !== state.essayRequestId || controller.signal.aborted) return;
    const sample = await saveEssaySample({
      essayId: essay.id,
      title: essay.title,
      content,
      model: aiModel,
      generatedAt: new Date().toISOString(),
    });
    if (requestId !== state.essayRequestId || controller.signal.aborted) return;
    state.essaySamples.set(essay.id, sample);
    state.essayGeneration = null;
    showNotice("AI 范文已保存到当前浏览器。", "ok");
  } catch (error) {
    if (requestId !== state.essayRequestId || controller.signal.aborted) return;
    const draft = typeof error.draft === "string" ? error.draft : state.essayGeneration?.text || "";
    state.essayGeneration = {
      essayId: essay.id,
      status: "error",
      text: error.message || "AI 范文生成失败",
      draft,
      validation: error.validation || null,
    };
  } finally {
    if (requestId === state.essayRequestId) essayAbortController = null;
  }
  if (requestId === state.essayRequestId) renderEssays();
}

function scheduleEssayStreamRender(essayId) {
  if (essayStreamFrame) return;
  essayStreamFrame = window.requestAnimationFrame(() => {
    essayStreamFrame = 0;
    if (state.essayGeneration?.essayId !== essayId) return;
    const output = $("essayList").querySelector("[data-essay-stream-output]");
    if (output?.dataset.essayStreamOutput === essayId) output.textContent = state.essayGeneration.text;
  });
}

function itemCard(question, extra = "") {
  const display = formatQuestionForDisplay(question);
  return `
    <article class="item-card">
      <div class="question-meta">${escapeHtml(question.term)} · 第 ${question.questionNo || "-"} 题 · ${moduleLabel(question.module)}</div>
      <h4>${escapeHtml(display.stem)}</h4>
      ${extra}
    </article>
  `;
}

function switchView(view) {
  state.currentView = view;
  $("viewTitle").textContent = viewTitles[view] || "练题";
  document.querySelectorAll(".nav-button").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  syncTypeButtons();
  document.querySelectorAll(".view").forEach((section) => section.classList.remove("active-view"));
  $(`${view}View`).classList.add("active-view");
  if (view === "materials") void selectMaterial();
}

function currentQuestion() {
  return state.filteredQuestions[state.currentIndex] || null;
}

function emptyPracticeMessage() {
  if (state.mode === "review") {
    return {
      meta: "记忆复习 · 暂无到期题",
      title: "今天没有到期复习题，可以继续顺序练习或重刷错题。",
    };
  }
  if (state.mode === "wrong") {
    return {
      meta: "错题重刷 · 暂无错题",
      title: "当前没有错题，继续练习后这里会自动收集。",
    };
  }
  if (state.mode === "favorite") {
    return {
      meta: "收藏题 · 暂无标记",
      title: "还没有收藏题。做题时点击“收藏本题”，这里会形成重点题清单。",
    };
  }
  return {
    meta: "没有符合条件的题目",
    title: "请调整筛选条件",
  };
}

function syncFilterControls() {
  $("dailyCount").value = String(state.dailyCount);
  $("sourceFilter").value = state.filters.sourceType;
  $("termFilter").value = state.filters.term;
  $("moduleFilter").value = state.filters.module;
  $("statusFilter").value = state.filters.status;
  $("keywordFilter").value = state.filters.keyword;
}

function runMode(mode) {
  state.mode = mode;
  if (mode === "continue") {
    state.filters.status = "all";
  }
  if (mode === "review") {
    state.filters.status = "due";
  }
  if (mode === "daily") {
    state.filters.status = "unanswered";
  }
  if (mode === "exam") {
    state.filters.sourceType = "real";
    state.filters.module = "all";
    state.filters.status = "all";
    state.filters.keyword = "";
  }
  if (mode === "wrong") {
    state.filters.module = "all";
    state.filters.status = "wrong";
  }
  if (mode === "favorite") {
    state.filters.module = "all";
    state.filters.status = "all";
    state.filters.keyword = "";
  }
  if (mode === "special" && state.filters.module === "all") {
    state.filters.module = summarizeAttempts(state.attempts).weakModules[0]?.module || "architecture";
  }
  if (mode === "special") {
    state.filters.status = "all";
  }
  if (mode === "all") {
    state.filters.status = "all";
  }
  syncFilterControls();
  applyFilters();
  state.retryQuestionId = ["review", "wrong", "favorite"].includes(mode) ? state.filteredQuestions[0]?.id || "" : "";
  state.queuePage = 0;
  switchView("practice");
  renderPractice();
}

function runChapter(module) {
  state.mode = "special";
  state.filters = {
    ...state.filters,
    module,
    status: "all",
    keyword: "",
  };
  syncFilterControls();
  applyFilters();
  state.queuePage = 0;
  switchView("practice");
  renderPractice();
}

function syncModeButtons() {
  document.querySelectorAll(".mode-button").forEach((button) => button.classList.toggle("active", button.dataset.mode === state.mode));
}

function syncChapterButtons() {
  document.querySelectorAll("[data-chapter]").forEach((button) => {
    button.classList.toggle("active", state.mode === "special" && button.dataset.chapter === state.filters.module);
  });
}

function syncTypeButtons() {
  document.querySelectorAll(".type-button").forEach((button) => {
    const active = button.dataset.typeView === state.currentView;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function shouldAnswerFresh(question) {
  if (state.retryQuestionId === question.id) return true;
  return ["review", "wrong", "favorite"].includes(state.mode);
}

async function toggleCurrentFavorite() {
  const question = currentQuestion();
  if (!question) return;
  await toggleBookmark(question.id);
  state.bookmarks = await getBookmarks();
  if (state.mode === "favorite" && !isBookmarked(question.id)) {
    applyFilters();
  }
  renderPractice();
  renderModeCounts();
}

function isBookmarked(questionId) {
  return state.bookmarks.some((bookmark) => bookmark.questionId === questionId);
}

function questionWithFigure(question) {
  const figure = state.figures[question.id];
  return figure ? { ...question, figure } : question;
}

function memorySummary(memory) {
  if (!memory || memory.state === "new") return "未做过，进入顺序练习后开始记录";
  const base = `${memory.label} · ${memory.correctCount} 对 / ${memory.wrongCount} 错 · 连对 ${memory.streak}`;
  if (!memory.dueAt) return base;
  return `${base} · 下次复习 ${formatDateTime(memory.dueAt)}`;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知";
  return `${date.getMonth() + 1}-${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

async function downloadDiagnosis() {
  const diagnosis = buildDiagnosisExport({ bank: state.bank, attempts: state.attempts, bookmarks: state.bookmarks });
  downloadJson("ai-diagnosis.json", diagnosis);
}

async function downloadProgress() {
  downloadJson("ruankao-progress.json", await exportProgress());
}

function chooseProgressFile() {
  $("importProgress").click();
}

async function importProgressFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    state.pendingProgress = payload;
    renderProgressPreview(summarizeProgressPayload(payload), file.name);
    $("applyProgressImport").disabled = false;
    switchView("data");
    showNotice("已读取进度 JSON，请确认后应用。", "ok");
  } catch (error) {
    state.pendingProgress = null;
    $("applyProgressImport").disabled = true;
    showNotice(`导入失败：${error.message}`, "error");
  } finally {
    event.target.value = "";
  }
}

async function applyPendingProgress() {
  if (!state.pendingProgress) {
    showNotice("先选择一个进度 JSON。", "warn");
    return;
  }
  if (!confirm("确定用这个 JSON 替换当前浏览器里的练习进度吗？")) return;
  state.attempts = await importProgress(state.pendingProgress);
  state.bookmarks = await getBookmarks();
  state.pendingProgress = null;
  $("applyProgressImport").disabled = true;
  applyFilters();
  renderAll();
  showNotice("进度已应用。", "ok");
}

async function clearProgress() {
  if (!confirm("确定清空所有本地作答记录吗？")) return;
  await clearProgressData();
  state.attempts = [];
  state.bookmarks = [];
  state.pendingProgress = null;
  $("applyProgressImport").disabled = true;
  renderAll();
  showNotice("本地记录已清空。", "ok");
}

function renderProgressPreview(summary, filename = "") {
  $("progressPreview").innerHTML = `
    <div class="progress-preview-grid">
      <span><b>文件</b>${escapeHtml(filename || "未命名 JSON")}</span>
      <span><b>作答记录</b>${summary.attempts}</span>
      <span><b>覆盖题目</b>${summary.answeredQuestions}</span>
      <span><b>错题</b>${summary.wrong}</span>
      <span><b>收藏题</b>${summary.bookmarks}</span>
      <span><b>最近作答</b>${summary.latestAt ? escapeHtml(formatDateTime(summary.latestAt)) : "暂无"}</span>
    </div>
  `;
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function showNotice(message, kind = "ok") {
  const notice = $("notice");
  notice.textContent = message;
  notice.className = `notice ${kind}`;
  notice.hidden = false;
  window.setTimeout(() => {
    notice.hidden = true;
  }, 2800);
}

function moduleLabel(module) {
  const labels = {
    architecture: "架构设计",
    software_engineering: "软件工程",
    computer_foundation: "计算机基础",
    database: "数据库",
    network: "网络",
    security: "安全",
    project_management: "项目管理",
    legal_ip: "知识产权",
    new_technology: "新技术",
    embedded: "嵌入式",
    english: "英语",
    other: "其他",
  };
  return labels[module] || module || "未分类";
}

function modeLabel(mode) {
  const labels = {
    continue: "继续练习",
    review: "记忆复习",
    daily: "每日练习",
    special: "章节练习",
    exam: "真题套卷",
    wrong: "错题重刷",
    favorite: "收藏题",
    all: "题库浏览",
  };
  return labels[mode] || "练题";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizeMaterials(value) {
  if (!Array.isArray(value)) return [];
  return value.reduce((items, material) => {
    const id = String(material?.id || "").trim();
    const groupLabel = String(material?.groupLabel || "").trim();
    const title = String(material?.title || "").trim();
    const sourceUrl = safeHttpsUrl(material?.sourceUrl);
    const rawUrl = safeHttpsUrl(material?.rawUrl);
    const charCount = Number(material?.charCount);
    if (id && groupLabel && title && sourceUrl && rawUrl && Number.isFinite(charCount) && charCount > 0) {
      items.push({ id, groupLabel, title, sourceUrl, rawUrl, charCount: Math.floor(charCount) });
    }
    return items;
  }, []);
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function renderInlineText(value) {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

function renderRichText(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const blocks = text.split(/\n{2,}/).filter(Boolean);
  return blocks.map((block) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    if (looksLikeMarkdownTable(lines)) return renderMarkdownTable(lines);
    return `<p>${lines.map(renderMarkdownInline).join("<br>")}</p>`;
  }).join("");
}

function looksLikeMarkdownTable(lines) {
  return lines.length >= 2 && lines[0].includes("|") && /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?$/.test(lines[1]);
}

function renderMarkdownTable(lines) {
  const rows = lines
    .filter((_, index) => index !== 1)
    .map((line) => line.split("|").map((cell) => cell.trim()).filter((cell, index, arr) => cell || index > 0 && index < arr.length - 1));
  const [head = [], ...body] = rows;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr>${head.map((cell) => `<th>${renderMarkdownInline(cell)}</th>`).join("")}</tr></thead>
        <tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${renderMarkdownInline(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    </div>
  `;
}

function renderMarkdownInline(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

init();
