#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sources = [
  config("系统分析师/raw/qicoder", "https://ebook.qicoder.com/系统分析师/notes/source.html", (url) =>
    url.hostname === "ebook.qicoder.com" && /^\/系统分析师\/(?:images\/shiti|tiku\/uploadfiles)\//u.test(decodeURIComponent(url.pathname))),
  config("系统分析师/raw/qingsuyun", "https://www.qingsuyun.com/", (url) => url.hostname === "img.examcoo.com"),
  config("系统分析师/raw/web-archive", "https://community.sslcode.com.cn/", (url) =>
    url.hostname === "i-blog.csdnimg.cn" && url.pathname.startsWith("/direct/")),
  config("系统分析师/raw/educity", "https://www.educity.cn/", (url) =>
    url.hostname === "img.kuaiwenyun.com" && /^\/images\/(?:article|cms)\//u.test(url.pathname)),
  config("信息系统项目管理师/raw/cnitpm", "https://www.cnitpm.com/", (url) => url.hostname === "pic.cnitpm.com"),
  config("系统架构设计师/raw/web-archive", "https://www.educity.cn/", (url) =>
    url.hostname === "img.bim99.cn" || (url.hostname === "img.kuaiwenyun.com" && /\/(?:attach|images\/shiti)\//u.test(url.pathname))),
  config("网络规划设计师/raw/web-archive", "https://www.lightsoft.tech/", (url) => url.hostname === "files.lightsoft.tech"),
  ...["系统架构设计师", "系统规划与管理师", "信息系统项目管理师", "系统分析师", "网络规划设计师"].map((exam) =>
    config(`${exam}/raw/lightsoft`, "https://www.lightsoft.tech/", (url) =>
      ["doquestion.docdev.cn", "files.lightsoft.tech", "img.kuaiwenyun.com", "static.educity.cn"].includes(url.hostname)
      && /\.(?:gif|jpe?g|png|webp)$/iu.test(url.pathname))),
];

for (const source of sources) {
  const htmlFiles = await walk(source.root, ".html");
  const urls = new Map();
  for (const file of htmlFiles) {
    const html = await readFile(file, "utf8");
    for (const match of html.matchAll(/<img[^>]+src=["']([^"']+)["']/giu)) {
      const url = resolveUrl(match[1], source.baseUrl);
      if (url && source.accept(url)) urls.set(url.href, url);
    }
  }

  const entries = await mapConcurrent([...urls.values()], 4, (url) => download(source, url));
  await writeFile(path.join(source.root, "asset-manifest.json"), `${JSON.stringify(entries, null, 2)}\n`);
  console.log(`${path.relative(appRoot, source.root)}: ${entries.length} assets`);
}

function config(relativeRoot, baseUrl, accept) {
  return {
    root: path.join(appRoot, "data", "exam-materials", relativeRoot),
    baseUrl,
    accept,
  };
}

function resolveUrl(value, baseUrl) {
  if (!value || value.startsWith("data:") || value.includes("{{")) return null;
  const url = new URL(value, baseUrl);
  if (url.protocol === "http:" && url.hostname !== "doquestion.docdev.cn") url.protocol = "https:";
  return ["http:", "https:"].includes(url.protocol) ? url : null;
}

async function download(source, url) {
  const relative = path.join("assets", url.hostname, ...decodeURIComponent(url.pathname).split("/").filter(Boolean));
  const target = path.join(source.root, relative);
  const cached = await readFile(target).catch(() => null);
  const content = cached || await fetchBuffer(url);
  if (!cached) {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  return {
    url: url.href,
    localPath: path.relative(appRoot, target).replaceAll("\\", "/"),
    bytes: content.length,
    sha256: createHash("sha256").update(content).digest("hex"),
  };
}

async function fetchBuffer(url) {
  const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function walk(folder, extension) {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(folder, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const current = path.join(folder, entry.name);
    return entry.isDirectory() && entry.name !== "assets" ? walk(current, extension) : current.endsWith(extension) ? [current] : [];
  }));
  return files.flat();
}

async function mapConcurrent(items, concurrency, worker) {
  const results = new Array(items.length);
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const current = index++;
      results[current] = await worker(items[current]);
    }
  }));
  return results;
}
