#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appRoot, "..");
const sourceRoot = path.join(repoRoot, "ruankao_architect_bank", "bank");
const dataDir = path.join(appRoot, "data");

function readJsonl(file) {
  const text = readFileSync(file, "utf8").trim();
  return text ? text.split("\n").map((line) => JSON.parse(line)) : [];
}

function pickChoice(question) {
  return {
    id: question.id,
    sourceType: question.source_type,
    term: question.term,
    paper: question.paper,
    questionNo: question.question_no,
    module: question.module,
    knowledge: question.knowledge,
    difficulty: question.difficulty,
    stem: question.stem,
    options: question.options,
    answer: question.answer,
    analysis: question.analysis,
    sourceFile: question.source_file,
  };
}

function pickCase(item) {
  return {
    id: item.id,
    sourceType: item.source_type,
    term: item.term,
    paper: item.paper,
    module: item.module,
    title: item.title,
    description: item.description,
    subQuestions: item.sub_questions,
    sourceFile: item.source_file,
  };
}

function pickEssay(item) {
  return {
    id: item.id,
    sourceType: item.source_type,
    term: item.term,
    paper: item.paper,
    module: item.module,
    title: item.title,
    prompt: item.prompt,
    writingPoints: item.writing_points,
    sourceFile: item.source_file,
  };
}

function main() {
  const manifest = JSON.parse(readFileSync(path.join(sourceRoot, "manifest.json"), "utf8"));
  const choices = readJsonl(path.join(sourceRoot, "choice.jsonl")).map(pickChoice);
  const cases = readJsonl(path.join(sourceRoot, "case.jsonl")).map(pickCase);
  const essays = readJsonl(path.join(sourceRoot, "essay.jsonl")).map(pickEssay);
  const payload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: manifest.source,
    manifest,
    choices,
    cases,
    essays,
  };

  mkdirSync(dataDir, { recursive: true });
  writeFileSync(path.join(dataDir, "bank.json"), JSON.stringify(payload));
  console.log(JSON.stringify({
    output: path.relative(repoRoot, path.join(dataDir, "bank.json")),
    choices: choices.length,
    cases: cases.length,
    essays: essays.length,
  }, null, 2));
}

main();
