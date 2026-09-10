import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractMermaidFigure, hasFigureReference, renderQuestionFigure } from "../src/figures.mjs";
import { formatQuestionForDisplay } from "../src/core.mjs";

const figures = JSON.parse(readFileSync(new URL("../data/figures.json", import.meta.url), "utf8"));

test("extracts Mermaid figures from question stems", () => {
  const source = "题干如下图所示。\n\n```mermaid\nflowchart LR\nA[\"甲\"] --> B[\"乙\"]\n```";
  const extracted = extractMermaidFigure(source);
  assert.equal(extracted.stem, "题干如下图所示。");
  assert.equal(extracted.figure.kind, "mermaid");
  assert.match(extracted.figure.code, /flowchart LR/);
  assert.match(renderQuestionFigure(extracted.figure, false), /<svg/);
});

test("renders a controlled layer stack without leaking answers", () => {
  const markup = renderQuestionFigure({
    kind: "layer-stack",
    layers: ["③", "②", "①", "计算机硬件"],
    caption: "结构化重绘示意（非原卷图）",
  }, false);
  assert.match(markup, /计算机硬件/);
  assert.match(markup, /③/);
  assert.doesNotMatch(markup, /操作系统/);
});

test("keeps the 2009 first-question figure as a separate controlled asset", () => {
  const figure = figures.figures["real-2009年下半年-001"];
  assert.equal(figure.kind, "layer-stack");
  assert.deepEqual(figure.layers, ["③", "②", "①", "计算机硬件"]);
});

test("renders the 2009 image-processing predecessor graph from controlled data", () => {
  const figure = figures.figures["real-2009年下半年-002"];
  assert.equal(figure.kind, "mermaid");
  assert.match(figure.code, /S1 --> C1/);
  assert.match(figure.code, /C1 --> C2/);
  assert.match(figure.code, /P2 --> P3/);
  assert.match(renderQuestionFigure(figure, false), /S1 扫描/);
});

test("marks unresolved figure questions instead of inventing a graphic", () => {
  const display = formatQuestionForDisplay({
    id: "q-figure-missing",
    stem: "下图所示的网络结构中，节点 A 的作用是（ ）。",
    options: { A: "a", B: "b", C: "c", D: "d" },
    analysis: "解析",
  });
  assert.equal(hasFigureReference(display.stem), true);
  assert.equal(display.figureMissing, true);
  assert.match(renderQuestionFigure(null, display.figureMissing), /原图待补录/);
});

test("recognizes 下图为 as a figure reference", () => {
  assert.equal(hasFigureReference("下图为三个任务各程序段并发执行的前驱图。"), true);
});
