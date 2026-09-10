#!/usr/bin/env node
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.resolve(appRoot, "..", "ruankao-senior-architecture-designer-main", "ruankao-senior-architecture-designer-main");
const materialRoot = path.join(appRoot, "data", "study-materials");
const repository = "https://github.com/YoungHong1992/ruankao-senior-architecture-designer";
const groups = [
  ["outline", "考试大纲", "00.系统架构设计师考试大纲-清洗版"],
  ["textbook", "教程知识点", "01.系统架构设计师教材-清洗版"],
];

const materials = groups.flatMap(([group, groupLabel, folder]) => collectGroup(group, groupLabel, folder));
writeFileSync(path.join(appRoot, "data", "study-materials.json"), JSON.stringify({
  schemaVersion: 1,
  source: repository,
  generatedAt: new Date().toISOString(),
  note: "正文为来源仓库的可追溯同步副本，保留原始来源链接和第三方权利说明。",
  materials,
}));
console.log(`已写入 ${materials.length} 篇资料目录`);

function collectGroup(group, groupLabel, folder) {
  const folderPath = path.join(sourceRoot, folder);
  return readdirSync(folderPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "INDEX.md")
    .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"))
    .map((entry) => createMaterial(group, groupLabel, folder, entry.name));
}

function createMaterial(group, groupLabel, folder, filename) {
  const file = path.join(sourceRoot, folder, filename);
  const markdown = readFileSync(file, "utf8");
  const sourcePath = `${folder}/${filename}`;
  const localPath = `study-materials/${group}/${filename}`;
  const target = path.join(materialRoot, group, filename);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, markdown.replace(/(?:\r?\n){2,}$/, "\n"));
  const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() || filename.replace(/\.md$/, "");
  return {
    id: `${group}-${filename.replace(/\.md$/, "")}`,
    group,
    groupLabel,
    title,
    sourcePath,
    localUrl: `./data/${encodeURI(localPath)}`,
    charCount: markdown.replace(/\s/g, "").length,
    sourceUrl: `${repository}/blob/main/${encodeURI(sourcePath)}`,
  };
}
