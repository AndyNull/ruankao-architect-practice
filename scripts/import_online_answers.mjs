#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sources = [
  {
    subject: "planner",
    term: "2021年上半年",
    urls: ["https://www.cnitpm.com/pm1/121647.html"],
    start: 1,
  },
  {
    subject: "planner",
    term: "2023年上半年",
    urls: [
      "https://www.cnitpm.com/pm1/147672laz9vvyq9p.html",
      "https://www.cnitpm.com/pm1/147673tnep9lp2rg.html",
      "https://www.cnitpm.com/pm1/147679akmexx3piu.html",
      "https://www.cnitpm.com/pm1/147680pxfu67fnb9.html",
      "https://www.cnitpm.com/pm1/147681xnfn6ienai.html",
      "https://www.cnitpm.com/pm1/147682cx3xph5kvt.html",
      "https://www.cnitpm.com/pm1/147683lvb9cd6u5r.html",
      "https://www.cnitpm.com/pm1/147684018tigpo1f.html",
    ],
    start: 1,
  },
  {
    subject: "planner",
    term: "2022年上半年",
    urls: [
      "https://www.cnitpm.com/pm1/128130.html",
      "https://www.cnitpm.com/pm1/128131.html",
      "https://www.cnitpm.com/pm1/128132.html",
      "https://www.cnitpm.com/pm1/128133.html",
      "https://www.cnitpm.com/pm1/128134.html",
      "https://www.cnitpm.com/pm1/128135.html",
      "https://www.cnitpm.com/pm1/128140.html",
      "https://www.cnitpm.com/pm1/128149.html",
    ],
    questionNos: [...Array.from({ length: 70 }, (_, index) => index + 1), 71, 72, 73, 75],
  },
];

const answers = {};
for (const source of sources) {
  let answerIndex = 0;
  for (const url of source.urls) {
    const html = await (await fetch(url)).text();
    const pageAnswers = [...html.matchAll(/(?:参考答案|答案)(?:解析)?\s*[】\]：:]\s*([A-D])/g)].map((match) => match[1]);
    for (const answer of pageAnswers) {
      const questionNo = source.questionNos?.[answerIndex] ?? answerIndex + source.start;
      answers[`${source.subject}|${source.term}|${questionNo}`] = { answer, source: "cnitpm-reference", sourceUrl: url };
      answerIndex += 1;
    }
  }
  console.log(`${source.term}: ${answerIndex} answers`);
}
mkdirSync(path.join(root, "data", "banks"), { recursive: true });
writeFileSync(path.join(root, "data", "banks", "online-answers.json"), `${JSON.stringify(answers, null, 2)}\n`);
