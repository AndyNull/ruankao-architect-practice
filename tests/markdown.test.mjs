import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderMarkdown } from "../src/markdown.mjs";

test("renders controlled Markdown blocks and HTTPS links", () => {
  const html = renderMarkdown("# 标题\n\n正文含 **重点**。\n\n| 项目 | 说明 |\n| --- | --- |\n| 来源 | [资料](https://example.com/a) |\n\n```js\nconst value = 1;\n```", "https://example.com/readme.md");
  assert.match(html, /<h1>标题<\/h1>/);
  assert.match(html, /<table>/);
  assert.match(html, /href="https:\/\/example.com\/a"/);
  assert.match(html, /<pre><code data-language="js">/);
});

test("escapes raw HTML and rejects unsafe Markdown links", () => {
  const html = renderMarkdown("<script>alert(1)</script>\n\n[危险](javascript:alert(1))");
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /href=/);
});

test("ships a traceable study-material index without bundled document content", () => {
  const materials = JSON.parse(readFileSync(new URL("../data/study-materials.json", import.meta.url), "utf8"));
  assert.equal(materials.materials.length, 27);
  assert.equal(new Set(materials.materials.map((item) => item.id)).size, 27);
  assert.ok(materials.materials.every((item) => item.rawUrl.startsWith("https://raw.githubusercontent.com/YoungHong1992/")));
  assert.ok(materials.materials.every((item) => !Object.hasOwn(item, "content")));
});
