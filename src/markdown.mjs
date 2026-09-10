const blockStart = /^(?:#{1,6}\s|```|[-*+]\s+|\d+\.\s+|>\s?|---+$|\|)/;

export function renderMarkdown(value, baseUrl = "") {
  const lines = String(value ?? "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  for (let index = 0; index < lines.length;) {
    if (!lines[index].trim()) {
      index += 1;
      continue;
    }
    const block = readBlock(lines, index, baseUrl);
    blocks.push(block.html);
    index = block.next;
  }
  return blocks.join("");
}

function readBlock(lines, index, baseUrl) {
  const line = lines[index];
  if (/^```/.test(line)) return readCodeBlock(lines, index);
  if (/^\|/.test(line) && isTableSeparator(lines[index + 1])) return readTable(lines, index, baseUrl);
  if (/^(#{1,6})\s+/.test(line)) return readHeading(line, index, baseUrl);
  if (/^[-*+]\s+/.test(line)) return readList(lines, index, baseUrl, "ul");
  if (/^\d+\.\s+/.test(line)) return readList(lines, index, baseUrl, "ol");
  if (/^>\s?/.test(line)) return readQuote(lines, index, baseUrl);
  if (/^---+$/.test(line.trim())) return { html: "<hr />", next: index + 1 };
  return readParagraph(lines, index, baseUrl);
}

function readCodeBlock(lines, index) {
  const language = lines[index].slice(3).trim();
  const body = [];
  let next = index + 1;
  while (next < lines.length && !/^```/.test(lines[next])) body.push(lines[next++]);
  return {
    html: `<pre><code${language ? ` data-language="${escapeHtml(language)}"` : ""}>${escapeHtml(body.join("\n"))}</code></pre>`,
    next: next < lines.length ? next + 1 : next,
  };
}

function readTable(lines, index, baseUrl) {
  const rows = [splitTableRow(lines[index])];
  let next = index + 2;
  while (next < lines.length && /^\|/.test(lines[next])) rows.push(splitTableRow(lines[next++]));
  const header = rows.shift().map((cell) => `<th>${renderInline(cell, baseUrl)}</th>`).join("");
  const body = rows.map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell, baseUrl)}</td>`).join("")}</tr>`).join("");
  return { html: `<div class="table-wrap"><table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></div>`, next };
}

function readHeading(line, index, baseUrl) {
  const match = /^(#{1,6})\s+(.+)$/.exec(line);
  const level = match[1].length;
  return { html: `<h${level}>${renderInline(match[2], baseUrl)}</h${level}>`, next: index + 1 };
}

function readList(lines, index, baseUrl, tag) {
  const pattern = tag === "ul" ? /^[-*+]\s+(.+)$/ : /^\d+\.\s+(.+)$/;
  const items = [];
  let next = index;
  while (next < lines.length) {
    const match = pattern.exec(lines[next]);
    if (!match) break;
    items.push(`<li>${renderInline(match[1], baseUrl)}</li>`);
    next += 1;
  }
  return { html: `<${tag}>${items.join("")}</${tag}>`, next };
}

function readQuote(lines, index, baseUrl) {
  const body = [];
  let next = index;
  while (next < lines.length && /^>\s?/.test(lines[next])) body.push(lines[next++].replace(/^>\s?/, ""));
  return { html: `<blockquote>${body.map((line) => renderInline(line, baseUrl)).join("<br />")}</blockquote>`, next };
}

function readParagraph(lines, index, baseUrl) {
  const body = [];
  let next = index;
  while (next < lines.length && lines[next].trim() && (next === index || !blockStart.test(lines[next]))) body.push(lines[next++]);
  return { html: `<p>${body.map((line) => renderInline(line, baseUrl)).join("<br />")}</p>`, next };
}

function isTableSeparator(line) {
  return /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/.test(String(line || ""));
}

function splitTableRow(line) {
  return line.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
}

function renderInline(value, baseUrl) {
  let text = escapeHtml(value);
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^)]*&quot;)?\)/g, (_, label, href) => {
    const url = safeUrl(href.replaceAll("&amp;", "&"), baseUrl);
    return url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${label}</a>` : label;
  });
  text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return text.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
}

function safeUrl(value, baseUrl) {
  try {
    const url = new URL(value, baseUrl || "https://example.invalid/");
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
