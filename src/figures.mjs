const figureReferencePattern = /(?:如下图|下图(?:所示|中|为)|如图所示|见下图|图中[①②③④⑤⑥⑦⑧⑨⑩])/;

export function extractMermaidFigure(value) {
  const source = String(value ?? "");
  const match = /```mermaid\s*\n([\s\S]*?)```/i.exec(source);
  if (!match) return { stem: source, figure: null };
  return {
    stem: `${source.slice(0, match.index)}${source.slice(match.index + match[0].length)}`.replace(/\n{3,}/g, "\n\n").trim(),
    figure: {
      kind: "mermaid",
      code: match[1].trim(),
      caption: "结构化重绘示意（非原卷图）",
    },
  };
}

export function hasFigureReference(value) {
  return figureReferencePattern.test(String(value ?? ""));
}

export function describeFigureForAi(figure) {
  if (figure?.kind === "layer-stack" && Array.isArray(figure.layers)) {
    return `结构化图示从上到下为：${figure.layers.join("、")}。图中仅保留原题编号，不预填答案。`;
  }
  if (figure?.kind === "mermaid") {
    return `题目附带的结构化图示代码如下：\n${figure.code}`;
  }
  return "";
}

export function renderQuestionFigure(figure, figureMissing) {
  if (figure?.kind === "layer-stack") return renderLayerStack(figure);
  if (figure?.kind === "mermaid") return renderMermaid(figure);
  if (figureMissing) return renderMissingFigure();
  return "";
}

function renderLayerStack(figure) {
  const layers = Array.isArray(figure.layers) ? figure.layers.map((item) => String(item).trim()).filter(Boolean).slice(0, 6) : [];
  if (layers.length < 2) return renderMissingFigure();
  const width = 680;
  const rowHeight = 54;
  const gap = 8;
  const height = 30 + layers.length * (rowHeight + gap);
  const rows = layers.map((label, index) => {
    const y = 16 + index * (rowHeight + gap);
    const hardware = index === layers.length - 1;
    return `
      <rect class="figure-layer ${hardware ? "figure-hardware" : ""}" x="90" y="${y}" width="500" height="${rowHeight}" rx="8" />
      <text class="figure-label" x="340" y="${y + 34}" text-anchor="middle">${escapeXml(label)}</text>
    `;
  }).join("");
  return figureShell(`
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(figure.alt || "计算机硬件层上方的三层软件结构示意")}">
      ${rows}
    </svg>
  `, figure.caption);
}

function renderMermaid(figure) {
  const code = String(figure.code || "").trim();
  if (/^flowchart\s+/im.test(code)) return figureShell(renderFlowchart(code), figure.caption);
  if (/^classDiagram/im.test(code)) return figureShell(renderClassDiagram(code), figure.caption);
  return renderMissingFigure("题库已保存图示结构，但当前图示类型尚未支持渲染。");
}

function renderFlowchart(code) {
  const direction = /^flowchart\s+(TB|LR)/im.exec(code)?.[1] || "TB";
  const nodes = new Map();
  const edges = [];
  const lines = code.split("\n").map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    for (const match of line.matchAll(/\b([A-Za-z][\w]*)\s*\["([^"\n]*)"\]/g)) {
      nodes.set(match[1], match[2]);
    }
    for (const match of line.matchAll(/\b([A-Za-z][\w]*)\s*\[([^\]\n]*)\]/g)) {
      if (!nodes.has(match[1])) nodes.set(match[1], match[2]);
    }
    const edge = /^([A-Za-z][\w]*)\s*(<-->|-->|--)\s*(?:\|([^|]+)\|\s*)?([A-Za-z][\w]*)\b/.exec(line);
    if (edge) {
      const [, from, connector, label, to] = edge;
      if (!nodes.has(from)) nodes.set(from, from);
      if (!nodes.has(to)) nodes.set(to, to);
      edges.push({ from, to, connector, label: label || "" });
    }
  }
  if (!nodes.size) return unsupportedSvg("无法解析该结构图。");
  const layout = layoutFlowchart([...nodes.keys()], edges, direction);
  const linesMarkup = edges.map((edge) => renderEdge(edge, layout.positions, direction)).join("");
  const nodesMarkup = [...nodes.entries()].map(([id, label]) => renderFlowNode(layout.positions.get(id), label)).join("");
  return `
    <svg viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-label="结构化流程图" preserveAspectRatio="xMinYMin meet">
      <defs>
        <marker id="figure-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" class="figure-arrow-head" />
        </marker>
      </defs>
      ${linesMarkup}
      ${nodesMarkup}
    </svg>
  `;
}

function layoutFlowchart(ids, edges, direction) {
  const outgoing = new Map(ids.map((id) => [id, []]));
  const incoming = new Map(ids.map((id) => [id, 0]));
  for (const edge of edges) {
    outgoing.get(edge.from)?.push(edge.to);
    incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
  }
  const levels = new Map(ids.map((id) => [id, 0]));
  const queue = ids.filter((id) => incoming.get(id) === 0);
  const visited = new Set();
  while (queue.length) {
    const current = queue.shift();
    visited.add(current);
    for (const next of outgoing.get(current) || []) {
      levels.set(next, Math.max(levels.get(next) || 0, (levels.get(current) || 0) + 1));
      incoming.set(next, (incoming.get(next) || 1) - 1);
      if (incoming.get(next) === 0) queue.push(next);
    }
  }
  for (const id of ids) {
    if (!visited.has(id)) levels.set(id, ids.indexOf(id));
  }
  const groups = new Map();
  for (const id of ids) {
    const level = levels.get(id) || 0;
    if (!groups.has(level)) groups.set(level, []);
    groups.get(level).push(id);
  }
  const nodeWidth = 160;
  const nodeHeight = 54;
  const gap = 28;
  const levelGap = 70;
  const positions = new Map();
  const maxLevel = Math.max(...groups.keys());
  const maxGroup = Math.max(...[...groups.values()].map((group) => group.length));
  for (const [level, group] of groups) {
    group.forEach((id, index) => {
      const x = direction === "LR" ? 30 + level * (nodeWidth + levelGap) : 30 + index * (nodeWidth + gap);
      const y = direction === "LR" ? 30 + index * (nodeHeight + gap) : 30 + level * (nodeHeight + levelGap);
      positions.set(id, { x, y, width: nodeWidth, height: nodeHeight });
    });
  }
  return {
    positions,
    width: direction === "LR" ? 60 + (maxLevel + 1) * nodeWidth + maxLevel * levelGap : 60 + maxGroup * nodeWidth + Math.max(0, maxGroup - 1) * gap,
    height: direction === "LR" ? 60 + maxGroup * nodeHeight + Math.max(0, maxGroup - 1) * gap : 60 + (maxLevel + 1) * nodeHeight + maxLevel * levelGap,
  };
}

function renderEdge(edge, positions, direction) {
  const from = positions.get(edge.from);
  const to = positions.get(edge.to);
  if (!from || !to) return "";
  const horizontal = direction === "LR";
  const x1 = horizontal ? from.x + from.width : from.x + from.width / 2;
  const y1 = horizontal ? from.y + from.height / 2 : from.y + from.height;
  const x2 = horizontal ? to.x : to.x + to.width / 2;
  const y2 = horizontal ? to.y + to.height / 2 : to.y;
  const markerStart = edge.connector === "<-->" ? ' marker-start="url(#figure-arrow)"' : "";
  const markerEnd = edge.connector === "--" ? "" : ' marker-end="url(#figure-arrow)"';
  const label = edge.label ? `<text class="figure-edge-label" x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 5}" text-anchor="middle">${escapeXml(edge.label)}</text>` : "";
  return `<line class="figure-edge" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${markerStart}${markerEnd} />${label}`;
}

function renderFlowNode(position, label) {
  if (!position) return "";
  const lines = wrapText(label, 14);
  const firstY = position.y + position.height / 2 - (lines.length - 1) * 9;
  return `
    <rect class="figure-node" x="${position.x}" y="${position.y}" width="${position.width}" height="${position.height}" rx="8" />
    <text class="figure-node-label" x="${position.x + position.width / 2}" y="${firstY}" text-anchor="middle">
      ${lines.map((line, index) => `<tspan x="${position.x + position.width / 2}" dy="${index ? 18 : 0}">${escapeXml(line)}</tspan>`).join("")}
    </text>
  `;
}

function renderClassDiagram(code) {
  const nodes = new Map();
  for (const match of code.matchAll(/class\s+([A-Za-z][\w]*)\s*\{([\s\S]*?)\}/g)) {
    const rows = match[2].split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 5);
    nodes.set(match[1], rows);
  }
  if (!nodes.size) return unsupportedSvg("无法解析该类图。");
  const ids = [...nodes.keys()];
  const positions = new Map();
  const cardWidth = 190;
  const cardHeight = 132;
  const gapX = 40;
  const gapY = 34;
  const columns = Math.min(3, ids.length);
  ids.forEach((id, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    positions.set(id, { x: 28 + column * (cardWidth + gapX), y: 28 + row * (cardHeight + gapY), width: cardWidth, height: cardHeight });
  });
  const edges = [];
  for (const line of code.split("\n")) {
    const edge = /^\s*([A-Za-z][\w]*)(?:\s+"[^"]+")?\s*(?:<\|--|\*--|o--|-->|--)\s*(?:"[^"]+"\s+)?([A-Za-z][\w]*)/.exec(line);
    if (edge && positions.has(edge[1]) && positions.has(edge[2])) edges.push({ from: edge[1], to: edge[2], connector: "-->" });
  }
  const rows = Math.ceil(ids.length / columns);
  const width = 56 + columns * cardWidth + Math.max(0, columns - 1) * gapX;
  const height = 56 + rows * cardHeight + Math.max(0, rows - 1) * gapY;
  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="结构化类图" preserveAspectRatio="xMinYMin meet">
      <defs>
        <marker id="figure-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" class="figure-arrow-head" />
        </marker>
      </defs>
      ${edges.map((edge) => renderEdge(edge, positions, "TB")).join("")}
      ${ids.map((id) => renderClassCard(positions.get(id), id, nodes.get(id))).join("")}
    </svg>
  `;
}

function renderClassCard(position, title, rows) {
  const content = rows.length ? rows : ["（无成员）"];
  return `
    <rect class="figure-class-card" x="${position.x}" y="${position.y}" width="${position.width}" height="${position.height}" rx="8" />
    <line class="figure-class-divider" x1="${position.x}" y1="${position.y + 36}" x2="${position.x + position.width}" y2="${position.y + 36}" />
    <text class="figure-class-title" x="${position.x + position.width / 2}" y="${position.y + 24}" text-anchor="middle">${escapeXml(title)}</text>
    <text class="figure-class-text" x="${position.x + 12}" y="${position.y + 56}">
      ${content.map((row, index) => `<tspan x="${position.x + 12}" dy="${index ? 17 : 0}">${escapeXml(row)}</tspan>`).join("")}
    </text>
  `;
}

function unsupportedSvg(message) {
  return `<svg viewBox="0 0 640 80" role="img" aria-label="${escapeXml(message)}"><text class="figure-node-label" x="24" y="46">${escapeXml(message)}</text></svg>`;
}

function renderMissingFigure(message = "原题引用图示，当前题库尚未恢复原图。") {
  return `
    <aside class="figure-unavailable" role="note">
      <strong>原图待补录</strong>
      <span>${escapeHtml(message)} 涉及图中位置、连线或数值时，请以可核对来源为准，AI 不会臆造图中细节。</span>
    </aside>
  `;
}

function figureShell(svg, caption = "结构化重绘示意（非原卷图）") {
  return `
    <figure class="question-diagram">
      <div class="diagram-scroll">${svg}</div>
      <figcaption>${escapeHtml(caption)}</figcaption>
    </figure>
  `;
}

function wrapText(value, size) {
  const text = String(value || "");
  if (text.length <= size) return [text];
  const result = [];
  for (let index = 0; index < text.length; index += size) result.push(text.slice(index, index + size));
  return result.slice(0, 3).map((item, index, all) => index === all.length - 1 && text.length > size * all.length ? `${item.slice(0, -1)}…` : item);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeXml(value) {
  return escapeHtml(value).replaceAll("'", "&apos;");
}
