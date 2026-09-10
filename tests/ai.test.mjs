import test from "node:test";
import assert from "node:assert/strict";
import {
  aiEndpoint,
  aiModel,
  buildCaseExplanationMessages,
  buildEssaySampleMessages,
  buildLocalExplanationMessages,
  buildWrongAnswerMessages,
  createExplanationRecord,
  createCaseExplanationRecord,
  EssaySampleValidationError,
  explainWrongAnswer,
  explainWrongAnswerProgressively,
  explainWrongAnswerStream,
  generateLocalExplanation,
  generateLocalCaseExplanation,
  generateEssaySampleProgressively,
  generateEssaySampleStream,
  getEssaySampleTemplate,
  getCaseExplanationSignature,
  getLocalCaseExplanation,
  getLocalExplanation,
  getQuestionExplanationSignature,
  validateEssaySample,
} from "../src/ai.mjs";

const question = {
  id: "test-availability",
  stem: "系统可用性应如何计算？",
  options: { A: "MTTF/MTTR", B: "MTTF/(MTTF+MTTR)", C: "MTTR/MTTF", D: "MTTR/(MTTF+MTTR)" },
  answer: "B",
  analysis: "可用性是正常运行时间占总时间的比例。",
};
const graded = { answer: "A", correctAnswer: "B", correct: false };
const caseItem = {
  id: "case-test-1",
  title: "平台架构评估",
  description: "某平台需要提升高峰期可用性。",
  subQuestions: [
    { question_label: "问题1", prompt: "识别主要风险。", reference_answer: "从性能、可用性和容错机制分析。" },
    { question_label: "问题2", prompt: "说明改进措施。", reference_answer: "采用限流、缓存和熔断机制。" },
  ],
};
const essay = {
  title: "论软件系统架构评估方法及其应用",
  prompt: [
    "请围绕软件系统架构评估方法，依次从以下三个方面进行论述。",
    "1. 概要叙述你参与管理和开发的软件项目以及你在其中所承担的主要工作。",
    "2. 详细论述架构评估方法的核心原则、实施过程和关键技术。",
    "3. 结合项目，说明实施中遇到的问题、解决办法及效果。",
  ].join("\n"),
  writingPoints: [
    "说明 ATAM 的质量属性权衡和项目实施过程。",
    "### 范文提纲（2500字框架）",
    "摘要（200-300字）",
    "正文第一章：项目概述（400-500字）",
    "正文第二章：架构评估方法与关键分析（600-800字）",
    "正文第三章：项目实施与问题解决（800-1000字）",
    "结论（200-300字）",
    "示例项目日活 500 万，吞吐量提升 5 倍，可用性达到 99.99%。",
  ].join("\n"),
};
const completeAbstract = `本文以某政务服务平台升级项目为背景，论述软件系统架构评估方法在项目建设中的应用。项目面向多部门协同办理场景，原有系统在业务扩展、性能和可维护性方面面临压力。论文从项目背景与项目职责、架构评估方法及实施过程三个方面展开，重点说明如何识别质量属性、分析架构风险、制定改进方案并验证实施效果。实践表明，架构评估应服务于项目目标和质量属性权衡，并在设计、开发和上线阶段持续闭环。${"甲".repeat(220)}`;
const completeBody = [
  "我在某政务服务平台升级项目中担任系统架构师，负责总体架构规划、技术选型、服务边界设计和上线实施协调。项目需要在既有业务稳定运行的前提下支持跨部门协同办理，因此我先梳理核心业务流程、质量属性和关键干系人诉求，明确性能、可用性、安全性和可修改性等评估目标。",
  "在架构评估阶段，我采用场景驱动的分析方法，围绕高并发访问、业务规则调整、第三方接口故障和数据一致性等风险场景，组织项目组识别架构决策、敏感点、权衡点和风险点。对于影响较大的风险，我负责制定改进优先级和验证计划，并将评估结论落实到服务拆分、缓存策略、接口治理和监控告警等设计中。",
  `在实施过程中，项目曾出现跨系统调用链路过长和高峰期响应不稳定的问题。我组织开发团队通过接口分级、异步消息处理、限流降级和链路追踪等措施进行改进，并通过压测和灰度发布验证效果。上线后，项目组持续根据监控数据复核架构假设，将评估机制纳入迭代流程，使架构风险能够被提前发现和闭环处理。${"乙".repeat(1970)}`,
].join("\n\n");
const completeEssay = [
  "摘要",
  completeAbstract,
  "正文",
  completeBody,
].join("\n\n");

test("builds a grounded wrong-answer prompt", () => {
  const messages = buildWrongAnswerMessages(question, graded);
  assert.equal(messages.length, 2);
  assert.match(messages[1].content, /考生答案：A/);
  assert.match(messages[1].content, /正确答案：B/);
  assert.match(messages[1].content, /题库解析/);
});

test("builds reusable local explanations without a fabricated candidate answer", () => {
  const messages = buildLocalExplanationMessages(question);
  assert.equal(messages.length, 2);
  assert.match(messages[0].content, /可复用的本地错题解析/);
  assert.match(messages[0].content, /不要假设或提及考生选择/);
  assert.match(messages[1].content, /正确答案：B/);
  assert.doesNotMatch(messages[1].content, /考生答案/);
  assert.match(buildLocalExplanationMessages(question, true)[0].content, /标题必须逐行独占/);
  assert.match(buildLocalExplanationMessages(question, true, true)[0].content, /不要输出思考过程/);
});

test("uses a local explanation only when it still matches the current question", () => {
  const content = "核心考点\n可用性。\n错误原因\n混淆概念。\n选项辨析\nB 正确。\n记忆方法\n先看定义。";
  const record = createExplanationRecord(question, content, "2026-09-10T00:00:00.000Z");
  const explanations = { [question.id]: record };
  assert.equal(getLocalExplanation(question, explanations)?.content, content);
  assert.equal(getLocalExplanation({ ...question, answer: "A" }, explanations), null);
  assert.notEqual(getQuestionExplanationSignature(question), getQuestionExplanationSignature({ ...question, stem: "新题干" }));
});

test("generates a non-streaming local explanation with the GLM completion endpoint", async () => {
  let request;
  await generateLocalExplanation({
    apiKey: "",
    question,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ choices: [{ message: { content: "核心考点\n定义。\n错误原因\n混淆。\n选项辨析\nB 正确。\n记忆方法\n记关键词。" } }] }) };
    },
  });
  assert.equal(request.url, aiEndpoint);
  const body = JSON.parse(request.options.body);
  assert.equal(body.model, aiModel);
  assert.equal(body.stream, false);
  assert.equal(body.max_tokens, 900);
  assert.match(body.messages[0].content, /可复用的本地错题解析/);
});

test("builds and validates local case explanations", () => {
  const messages = buildCaseExplanationMessages(caseItem);
  assert.equal(messages.length, 2);
  assert.match(messages[0].content, /案例分析辅导老师/);
  assert.match(messages[0].content, /问题N.*解题思路.*作答要点/);
  assert.match(messages[1].content, /问题1/);
  assert.match(messages[1].content, /限流、缓存和熔断/);
  assert.match(buildCaseExplanationMessages(caseItem, true, true)[0].content, /不超过 900 个汉字/);
  const content = "问题1\n解题思路\n先找质量属性风险。\n作答要点\n性能、可用性和容错。\n\n问题2\n解题思路\n对应风险选择策略。\n作答要点\n限流、缓存和熔断。";
  const record = createCaseExplanationRecord(caseItem, content, "2026-09-10T00:00:00.000Z");
  assert.equal(getLocalCaseExplanation(caseItem, { [caseItem.id]: record })?.content, content);
  assert.equal(getLocalCaseExplanation({ ...caseItem, title: "已变更案例" }, { [caseItem.id]: record }), null);
  assert.notEqual(getCaseExplanationSignature(caseItem), getCaseExplanationSignature({ ...caseItem, description: "已变更" }));
});

test("generates a local case explanation with the GLM completion endpoint", async () => {
  let request;
  await generateLocalCaseExplanation({
    apiKey: "",
    caseItem,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ choices: [{ message: { content: "问题1\n解题思路\n识别风险。\n作答要点\n性能和可用性。\n问题2\n解题思路\n选择策略。\n作答要点\n限流和缓存。" } }] }) };
    },
  });
  assert.equal(request.url, aiEndpoint);
  const body = JSON.parse(request.options.body);
  assert.equal(body.model, aiModel);
  assert.equal(body.max_tokens, 1600);
  assert.match(body.messages[0].content, /案例分析辅导老师/);
});

test("builds a soft-exam project-practice essay prompt", () => {
  const messages = buildEssaySampleMessages(essay);
  assert.equal(messages.length, 2);
  assert.match(messages[0].content, /AI 范文示例/);
  assert.match(messages[0].content, /软考项目实践论文/);
  assert.match(messages[0].content, /第一人称/);
  assert.match(messages[0].content, /三个方面|三问|逐项/);
  assert.match(messages[0].content, /提纲.*参考|参考.*提纲/);
  assert.match(messages[0].content, /2800/);
  assert.match(messages[0].content, /摘要/);
  assert.match(messages[0].content, /正文/);
  assert.match(messages[0].content, /300-400/);
  assert.match(messages[0].content, /2000-3000/);
  assert.match(messages[1].content, /论软件系统架构评估方法及其应用/);
  assert.match(messages[1].content, /ATAM/);
  assert.doesNotMatch(messages[1].content, /\n###\s*$/);
});

test("uses the fixed soft-exam abstract and body template", () => {
  const template = getEssaySampleTemplate(essay);
  assert.equal(template.targetChars, 2800);
  assert.deepEqual(template.sections.map((section) => section.title), [
    "摘要",
    "正文",
  ]);
  assert.deepEqual(template.sections.map((section) => [section.minChars, section.maxChars]), [
    [300, 400],
    [2000, 3000],
  ]);
  assert.equal(validateEssaySample(essay, completeEssay).valid, true);
  const withoutAbstract = completeEssay.replace("摘要\n\n", "");
  assert.match(validateEssaySample(essay, withoutAbstract).errors.join("；"), /摘要/);
  const withoutBody = completeEssay.replace("\n\n正文\n\n", "\n\n");
  assert.match(validateEssaySample(essay, withoutBody).errors.join("；"), /正文/);
  assert.equal(validateEssaySample(essay, completeEssay.replace("正文", "正文第一章：项目概述")).valid, true);
  assert.equal(validateEssaySample(essay, completeEssay.replace("正文", "一、项目背景与本人职责")).valid, true);
});

test("keeps a near-target abstract as a warning instead of blocking a complete essay", () => {
  const nearTargetEssay = completeEssay.replace(completeAbstract, "甲".repeat(276));
  const validation = validateEssaySample(essay, nearTargetEssay);
  assert.equal(validation.valid, true);
  assert.match(validation.warnings.join("；"), /摘要.*276.*300-400/);
});

test("requires first-person project responsibility in the body", () => {
  const missingNarration = validateEssaySample(
    essay,
    completeEssay.replaceAll("我", "项目组"),
  );
  assert.equal(missingNarration.valid, false);
  assert.match(missingNarration.errors.join("；"), /第一人称.*角色.*职责/);

  assert.equal(validateEssaySample(essay, completeEssay).valid, true);
});

test("treats a question outline as reference rather than a validation contract", () => {
  const differentOutlineEssay = {
    title: "论架构演进",
    prompt: essay.prompt,
    writingPoints: [
      "说明架构演进原则。",
      "### 范文提纲（1800字框架）",
      "摘要（100-200字）",
      "第一章：背景（200-300字）",
      "第二章：实践（1000-1200字）",
    ].join("\n"),
  };
  const messages = buildEssaySampleMessages(differentOutlineEssay);
  assert.match(messages[1].content, /架构演进原则/);
  assert.deepEqual(getEssaySampleTemplate(differentOutlineEssay), getEssaySampleTemplate(essay));
  assert.equal(validateEssaySample(differentOutlineEssay, completeEssay).valid, true);
});

test("calls the configured GLM model", async () => {
  let request;
  const text = await explainWrongAnswer({
    apiKey: "test-key",
    question,
    graded,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ choices: [{ message: { content: "核心考点：可用性。" } }] }) };
    },
  });
  assert.equal(request.url, aiEndpoint);
  assert.equal(JSON.parse(request.options.body).model, aiModel);
  assert.equal(request.options.headers.Authorization, "Bearer test-key");
  assert.equal(text, "核心考点：可用性。");
});

test("reports API errors", async () => {
  await assert.rejects(
    explainWrongAnswer({
      apiKey: "bad-key",
      question,
      graded,
      fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: { message: "无效密钥" } }) }),
    }),
    /无效密钥/,
  );
});

test("supports the current keyless endpoint", async () => {
  let headers;
  await explainWrongAnswer({
    apiKey: "",
    question,
    graded,
    fetchImpl: async (_url, options) => {
      headers = options.headers;
      return { ok: true, json: async () => ({ choices: [{ message: { content: "解读" } }] }) };
    },
  });
  assert.equal(headers.Authorization, undefined);
});

test("streams SSE deltas across arbitrary UTF-8 chunks", async () => {
  const encoder = new TextEncoder();
  const payload = [
    'data: {"choices":[{"delta":{"role":"assistant","content":""}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"流"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"式"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"输出"}}]}\n\n',
    "data: [DONE]\n\n",
  ].join("");
  const bytes = encoder.encode(payload);
  const chunks = [bytes.slice(0, 111), bytes.slice(111, 178), bytes.slice(178)];
  const updates = [];
  let request;
  const text = await explainWrongAnswerStream({
    apiKey: "",
    question,
    graded,
    onDelta: (value) => updates.push(value),
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        body: new ReadableStream({
          start(controller) {
            chunks.forEach((chunk) => controller.enqueue(chunk));
            controller.close();
          },
        }),
      };
    },
  });
  assert.equal(request.url, aiEndpoint);
  assert.equal(request.options.headers.Accept, "text/event-stream");
  assert.equal(request.options.headers.Authorization, undefined);
  assert.equal(JSON.parse(request.options.body).stream, true);
  assert.equal(text, "流式输出");
  assert.deepEqual(updates, ["流", "流式", "流式输出"]);
});

test("rejects an empty SSE completion", async () => {
  await assert.rejects(
    explainWrongAnswerStream({
      apiKey: "",
      question,
      graded,
      fetchImpl: async () => ({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
            controller.close();
          },
        }),
      }),
    }),
    /AI 未返回有效内容/,
  );
});

test("falls back to a complete response when a stream is empty or incomplete", async () => {
  const calls = [];
  const updates = [];
  const text = await explainWrongAnswerProgressively({
    apiKey: "",
    question,
    graded,
    onDelta: (value) => updates.push(value),
    fetchImpl: async (_url, options) => {
      calls.push(JSON.parse(options.body));
      if (calls.length === 1) {
        return {
          ok: true,
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"不完整"}}]}\n\ndata: [DONE]\n\n'));
              controller.close();
            },
          }),
        };
      }
      return { ok: true, json: async () => ({ choices: [{ message: { content: "回退解读" } }] }) };
    },
  });
  assert.equal(text, "回退解读");
  assert.deepEqual(calls.map((item) => item.stream), [true, false]);
  assert.deepEqual(updates, ["不完整", "回退解读"]);
});

test("recovers a partial wrong-answer stream after an idle timeout", async () => {
  const calls = [];
  const updates = [];
  const statuses = [];
  const partial = "核心考点\n图像处理任务的前驱关系。";
  const complete = "核心考点\n前驱关系描述资源与程序段约束。\n错误原因\n选项 B 混淆了并发集合。\n选项辨析\nA 符合题图，其他选项违反前驱关系。\n记忆方法\n先按扫描、处理、打印检查资源串行约束。";
  const text = await explainWrongAnswerProgressively({
    apiKey: "",
    question,
    graded,
    idleTimeoutMs: 5,
    onDelta: (value) => updates.push(value),
    onStatus: (value) => statuses.push(value),
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      calls.push(body);
      if (!body.stream) return { ok: true, json: async () => ({ choices: [{ message: { content: complete } }] }) };
      return {
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: partial } }] })}\n\n`));
          },
        }),
      };
    },
  });
  assert.equal(text, complete);
  assert.deepEqual(calls.map((item) => item.stream), [true, false]);
  assert.deepEqual(updates, [partial, complete]);
  assert.deepEqual(statuses, ["流式输出不完整，正在获取完整解读…"]);
});

test("streams an essay sample across arbitrary UTF-8 chunks", async () => {
  const encoder = new TextEncoder();
  const first = completeEssay.slice(0, 38);
  const second = completeEssay.slice(38);
  const payload = [
    `data: ${JSON.stringify({ choices: [{ delta: { content: first } }] })}\n\n`,
    `data: ${JSON.stringify({ choices: [{ delta: { content: second } }] })}\n\n`,
    "data: [DONE]\n\n",
  ].join("");
  const bytes = encoder.encode(payload);
  const chunks = [bytes.slice(0, 83), bytes.slice(83, 211), bytes.slice(211)];
  const updates = [];
  let request;
  const text = await generateEssaySampleStream({
    apiKey: "",
    essay,
    onDelta: (value) => updates.push(value),
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        body: new ReadableStream({
          start(controller) {
            chunks.forEach((chunk) => controller.enqueue(chunk));
            controller.close();
          },
        }),
      };
    },
  });
  const requestBody = JSON.parse(request.options.body);
  assert.equal(request.url, aiEndpoint);
  assert.equal(request.options.headers.Accept, "text/event-stream");
  assert.equal(requestBody.model, aiModel);
  assert.equal(requestBody.max_tokens, 3600);
  assert.equal(requestBody.stream, true);
  assert.equal(text, completeEssay);
  assert.deepEqual(updates, [first, completeEssay]);
});

test("falls back to a complete response when an essay stream is empty", async () => {
  const calls = [];
  const updates = [];
  const statuses = [];
  const text = await generateEssaySampleProgressively({
    apiKey: "",
    essay,
    onDelta: (value) => updates.push(value),
    onStatus: (value) => statuses.push(value),
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      calls.push(body);
      if (body.stream) {
        return {
          ok: true,
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
              controller.close();
            },
          }),
        };
      }
      return { ok: true, json: async () => ({ choices: [{ message: { content: completeEssay } }] }) };
    },
  });
  assert.equal(text, completeEssay);
  assert.deepEqual(calls.map((item) => item.stream), [true, false]);
  assert.deepEqual(updates, [completeEssay]);
  assert.deepEqual(statuses, ["流式输出不完整，正在获取完整范文…"]);
});

test("recovers a short streamed essay with a validated complete response", async () => {
  const streamedDraft = "摘要\n流式草稿不完整";
  const calls = [];
  const updates = [];
  const statuses = [];
  const text = await generateEssaySampleProgressively({
    apiKey: "",
    essay,
    onDelta: (value) => updates.push(value),
    onStatus: (value) => statuses.push(value),
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      calls.push(body);
      if (!body.stream) return { ok: true, json: async () => ({ choices: [{ message: { content: completeEssay } }] }) };
      return {
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: streamedDraft } }] })}\n\ndata: [DONE]\n\n`));
            controller.close();
          },
        }),
      };
    },
  });
  assert.equal(text, completeEssay);
  assert.deepEqual(calls.map((item) => item.stream), [true, false]);
  assert.deepEqual(updates, [streamedDraft, completeEssay]);
  assert.deepEqual(statuses, ["流式输出不完整，正在获取完整范文…"]);
});

test("recovers a partial draft when an essay stream times out", async () => {
  const partialDraft = "摘要\n未结束的流式草稿";
  const calls = [];
  const updates = [];
  const text = await generateEssaySampleProgressively({
    apiKey: "",
    essay,
    idleTimeoutMs: 5,
    onDelta: (value) => updates.push(value),
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      calls.push(body);
      if (!body.stream) return { ok: true, json: async () => ({ choices: [{ message: { content: completeEssay } }] }) };
      return {
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: partialDraft } }] })}\n\n`));
          },
        }),
      };
    },
  });
  assert.equal(text, completeEssay);
  assert.deepEqual(calls.map((item) => item.stream), [true, false]);
  assert.deepEqual(updates, [partialDraft, completeEssay]);
});

test("keeps the received draft when complete-response recovery fails", async () => {
  const partialDraft = "摘要\n流式草稿出现异常";
  const updates = [];
  await assert.rejects(
    generateEssaySampleProgressively({
      apiKey: "",
      essay,
      onDelta: (value) => updates.push(value),
      fetchImpl: async (_url, options) => {
        const body = JSON.parse(options.body);
        if (!body.stream) return { ok: false, status: 503, json: async () => ({ error: { message: "服务暂不可用" } }) };
        return {
          ok: true,
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: partialDraft } }] })}\n\ndata: {not-json}\n\n`));
              controller.close();
            },
          }),
        };
      },
    }),
    (error) => error instanceof EssaySampleValidationError
      && error.draft === partialDraft
      && /完整响应请求失败/.test(error.message),
  );
  assert.deepEqual(updates, [partialDraft]);
});
