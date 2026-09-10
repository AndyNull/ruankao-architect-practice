#!/usr/bin/env node
import { createReadStream } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
};

createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const file = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
  if (!file.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403).end();
    return;
  }
  response.setHeader("Content-Type", types[path.extname(file)] || "application/octet-stream");
  createReadStream(file)
    .on("error", () => response.writeHead(404).end())
    .pipe(response);
}).listen(4173, "localhost", () => {
  console.log("练题台已启动：http://localhost:4173");
});
