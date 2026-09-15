#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sources = [{ term: "2021年下半年", url: "https://www.jayjaydream.com/?p=1320" }];
const answers = {};

for (const source of sources) {
  const html = await (await fetch(source.url)).text();
  const text = html
    .replace(/<br\s*\/?>/giu, "\n")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;|&#160;/giu, " ")
    .replace(/&（|&\(/gu, "(")
    .replace(/\s+/gu, " ");
  let nextQuestion = 1;
  for (const match of text.matchAll(/答案\s*[：:]\s*(.*?)(?=\s+\d{1,2}(?:-\d{1,2})?、|本文固定|$)/gu)) {
    const line = match[1];
    const pairs = [...line.matchAll(/[（(]\s*(\d{1,2})\s*[）)]\s*([A-D])/gu)];
    if (pairs.length) {
      for (const pair of pairs) {
        const questionNo = Number(pair[1]);
        answers[`network|${source.term}|${questionNo}`] = {
          answer: pair[2].toUpperCase(),
          source: "jayjaydream-reference",
          sourceUrl: source.url,
        };
        nextQuestion = Math.max(nextQuestion, questionNo + 1);
      }
      continue;
    }
    const answer = line.match(/(?:^|\s)([A-D])(?:\s|$|解析)/u)?.[1];
    if (!answer) continue;
    while (answers[`network|${source.term}|${nextQuestion}`]) nextQuestion += 1;
    answers[`network|${source.term}|${nextQuestion}`] = {
      answer: answer.toUpperCase(),
      source: "jayjaydream-reference",
      sourceUrl: source.url,
    };
    nextQuestion += 1;
  }
}

writeFileSync(path.join(root, "data", "banks", "network-online-answers.json"), `${JSON.stringify(answers, null, 2)}\n`);
console.log(`network online answer keys: ${Object.keys(answers).length}`);
