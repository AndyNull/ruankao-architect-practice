# 系统架构设计师练题台

这是一个面向软考高级资格考试的开源刷题练习站，支持系统架构设计师、系统规划与管理师、信息系统项目管理师、系统分析师和网络规划设计师。

## 本次更新

- 扩展五科题库并补齐当前已导入题目的答案，本地解析覆盖全部可作答选择题。
- 支持五科切换以及作答、错题、收藏、统计和论文范文的科目隔离。
- 进度 JSON 升级为 v2，可导入导出全部科目的作答、收藏和论文范文，并兼容 v1。
- 优化桌面端和移动端科目切换、工具栏与提示显示。
- 使用 GitHub Actions 自动部署 GitHub Pages。完整记录见 [CHANGELOG.md](CHANGELOG.md)。

- 覆盖综合知识选择题、案例分析和论文题。
- 支持继续练习、记忆复习、章节练习、真题套卷、错题重刷和收藏题。
- 不依赖后端服务，题库随代码发布，打开网页即可练习。
- 作答记录只保存在本机浏览器 IndexedDB，可导出或导入进度 JSON。
- 每道选择题都内置 `glm-5.2` 生成的本地题目解析；答错后才额外提供流式错因重解读，也可导出 `ai-diagnosis.json` 做阶段复盘。
- 每道案例都保留题库参考答案，并内置 `glm-5.2` 生成的解题思路与作答要点。
- 论文页可按题调用 `glm-5.2` 流式生成 AI 范文示例，完成后保存在当前浏览器，支持重读、重新生成和删除。
- 资料页可按需读取来源仓库的清洗版考试大纲和教程 Markdown，并在网页内自适应阅读。
- 顶部科目选择器可切换五科；题库、筛选器、错题、收藏、统计和论文范文按科目隔离。
- 五科均加载独立的本地题目解析文件；未核验答案仍明确标记为待补，不会误判。

## 在线使用

发布到 GitHub Pages 后，可以直接用浏览器打开：

```text
https://andynull.github.io/ruankao-architect-practice/
```

## 本地运行

Windows 直接双击：

```text
start.cmd
```

不要直接双击 `index.html`，`file://` 会阻止 JavaScript 模块和题库 JSON 加载。也可以手动启动：

```bash
node scripts/serve.mjs
```

题库重建或更新本地解析时执行：

```bash
python scripts/import_planner_pdf_bank.py
node scripts/import_network_online_answers.mjs
node scripts/build_subject_banks.mjs
node scripts/build_local_subject_explanations.mjs
```

然后访问：

```text
http://localhost:4173
```

## GitHub Pages

本项目为纯静态站点，由 `.github/workflows/pages.yml` 自动发布，无需构建或后端服务。

1. 进入仓库 Settings -> Pages。
2. Source 选择 `GitHub Actions`。
3. 推送到 `main` 或手动运行 `Deploy to GitHub Pages` 工作流。
4. 等待发布完成后访问 `https://andynull.github.io/ruankao-architect-practice/`。

## 使用方式

1. 打开练题页，默认进入继续练习，按题库顺序接着上次位置往后做。
2. 选择练习模式：继续练习、记忆复习、章节练习、真题套卷、错题重刷、收藏题、题库浏览。
3. 点任意选项就会直接判题，不需要再点提交。
4. 答案、题库原解析、本地 AI 题目解析、来源年份/卷、题号、模块会立即显示。
5. 错题会自动进入记忆复习和错题页，连续做对后复习间隔会拉长。
6. 遇到典型题可以点 `收藏本题`，之后在收藏题模式集中重刷。
7. 章节进度默认收起，需要时展开查看每个模块的已做数、正确率、错题数和待复习数。
8. 右侧答题卡按 75 题分段，所有题都能翻页跳转。
9. 统计页会显示模块正确率和薄弱项。
10. 顶部可以直接导出或导入进度 JSON；导入时会先读取摘要，确认后才替换当前浏览器进度。
11. 正确或错误作答都会显示本地 AI 题目解析；答错后点击 `使用 glm-5.2 重新解读错因`，内容会流式显示。当前接口无需密钥，也可在数据页填写可选 API Key。
12. 数据页点击 `下载 ai-diagnosis.json`，可按模块、错因、408 是否需要补、下一周 6-8 小时计划做完整复盘。
13. 在论文页点击 `使用 glm-5.2 生成范文`，范文会实时显示；完成后自动保存，可随时重新打开阅读。
14. 案例页默认展示题库参考答案与本地 GLM 解题要点；可按需点击 `使用 glm-5.2 重新整理` 获取新的案例复习版本。
15. 资料页可筛选考试大纲与教程章节；正文按需从来源仓库读取，离线或来源不可达时可直接跳转至原始文件。
16. 顶部选择器用于切换考试科目；尚未补齐答案的原始题目会在题库说明中标记，不会进入练习。

## 练习模式

| 模式 | 用途 |
|---|---|
| 继续练习 | 默认入口，按题库顺序接着上次位置往后做 |
| 记忆复习 | 做错和到期题优先，默认最多 20 题，可自行调整数量 |
| 章节练习 | 按模块刷题，例如架构、数据库、网络、安全 |
| 真题套卷 | 选择某一年份/批次，按同一套真题练 |
| 错题重刷 | 只看最近仍然做错的题 |
| 收藏题 | 只看手动收藏的重点题 |
| 题库浏览 | 自由按来源、年份、模块、关键词筛题 |

## 数据说明

题库数据在：

```text
data/bank.json
```

其他科目的结构化题库在 `data/banks/`，目录清单为 `data/banks/index.json`，可用 `node scripts/build_subject_banks.mjs` 从 `data/exam-materials/` 的原始资料重新生成。

当前五科可作答题量：架构师 1947 道、系规 814 道、高项 3686 道、系分 956 道、网规 1496 道。当前已导入选择题的待补答案数量为 0。

当前题库可从同级参考仓库的清洗版重新同步：

```bash
node scripts/sync_reference_bank.mjs
```

当前包含：

- 综合知识选择题：1947 道
- 其中真题选择题：1422 道
- 其中模拟选择题：525 道
- 案例分析：98 道
- 论文题：76 道

真题选择题覆盖 `2009年下半年` 到 `2025年下半年` 中可结构化的公开资料。`2016-2025` 的综合知识、案例分析和论文采用参考仓库的清洗交叉校对版，其中综合知识每套 75 题、案例每套 5 题、论文每套 4 题。题面和答案为第三方整理资料，不代表官方原卷或官方答案。

## 资料阅读

- 目录：`data/study-materials.json` 保存来源路径、标题、字数、本地资料路径和原始来源地址；正文同步至 `data/study-materials/`，由页面按需读取。
- 来源：`YoungHong1992/ruankao-senior-architecture-designer` 的清洗版考试大纲与教程资料；同步脚本为 `node scripts/sync_study_materials.mjs`，页面保留“在来源仓库阅读”链接。
- 适配：桌面端采用资料目录与正文双栏；窄屏切换为单栏与原生下拉选择，正文、代码与表格保持可读。

## AI 错题解读

- 接口：`https://glm.996986.xyz/v1/chat/completions`
- 模型：`glm-5.2`
- 题库批量解析：`node scripts/generate_subject_explanations_glm.mjs network`（可替换为 `planner`、`itpm`、`analyst`；默认只处理网页导入题目，使用 `GLM_API_KEY`、`--refresh` 可重新生成）。
- API Key：当前接口无需密钥；如接口启用鉴权，可在数据页填写，且只保存在页面内存。
- 本地优先：`data/ai-explanations.json` 按题目 ID、题干、选项、答案、原解析和图示签名保存 GLM 生成的解析。无论答对或答错都会展示本地解析，不发送 AI 请求；仅题目已更新或答错后手动点击“重新解读”时调用接口。
- 批量生成：运行 `node scripts/generate_ai_explanations.mjs --concurrency 20`。该脚本只调用上述 GLM 接口，断点后重复执行会跳过签名仍有效的题目；请求失败会记录在 `data/ai-explanation-errors.json`，下次继续补齐。
- 输出方式：手动重新解读时优先流式展示；如果上游流式响应为空、超时或缺少必要栏目，自动回退为完整响应，避免显示残缺解析。

## AI 案例解题

- 本地缓存：`data/ai-case-explanations.json` 按案例背景、子问题和题库参考答案签名保存 GLM 生成的解题思路与作答要点；案例页先显示缓存，不自动请求接口。
- 批量生成：运行 `node scripts/generate_ai_case_explanations.mjs --concurrency 10`。脚本仅调用上述 GLM 接口，支持断点续跑；失败项记录在 `data/ai-case-explanation-errors.json`。
- 人工复核：案例的题库参考答案始终单独保留；本地 GLM 解题仅作复习补充，不替换原答案。

## AI 论文范文

- 入口：论文页每道题下方的 `使用 glm-5.2 生成范文`。
- 输出：仅作为 `AI 范文示例`。按软考项目实践论文格式，摘要与正文分开，摘要约 `300-400` 字、正文约 `2000-3000` 字；正文按题目三个小问组织，在项目背景、本人职责和实施部分使用第一人称。写作要点中的范文提纲只作学习参考，不会成为固定标题、字数或项目事实。
- 保存：流式输出结束后，校验摘要与正文分隔、摘要和正文字数、正文中的第一人称项目角色与职责；通过才保存到当前浏览器 IndexedDB。刷新页面后仍可阅读，重新生成只会在新范文成功后覆盖旧内容。
- 失败处理：流式输出结构或篇幅明显不完整时，生成器会自动请求一次完整响应；只有完整响应通过校验后才保存。完整响应请求失败或仍不合格时，首稿原文会保留为未保存草稿，并显示具体问题；可选择保存为“未达标草稿”，不会覆盖已合格内容。
- 清理：`清空本地记录`只删除作答和收藏，不删除已保存范文；进度 JSON v2 包含全部科目的范文内容。

## 图题处理

- 图题使用 `data/figures.json` 保存受控的结构化图示，不嵌入原卷扫描图。
- 已保存 Mermaid 结构会在页面内渲染为 SVG；结构化重绘均标注“非原卷图”。
- 原题引用图片但尚未获得可靠结构时，页面显示“原图待补录”，不会根据题干臆造图中连线、位置或数值。

## 隐私说明

练题记录和已保存的 AI 范文只保存在你的浏览器 IndexedDB 里。随题库发布的选择题解析和案例解题缓存已在构建时由 GLM 生成；手动生成范文、错因重解读或案例重新整理时，才会将当前题目材料发送到配置的 AI 接口。除非你主动导出 JSON，否则不会上传练题记录。

## 进度 JSON

进度 JSON 用于在不同浏览器或电脑之间热插拔练习记录。

- `导出进度`：下载 v2 格式的 `ruankao-progress.json`，包含全部科目的作答记录、收藏题和论文范文。
- `导入进度`：兼容 v1 和 v2，先展示作答数、覆盖题目、错题、收藏题、论文范文和最近作答时间。
- `应用读取的进度`：确认后用 JSON 替换当前浏览器里的本地进度。
- `清空记录`：只清空当前浏览器本地 IndexedDB，不影响已经导出的 JSON。

## 开源与题库说明

- 应用代码使用 MIT License 开源。
- 题库数据来源、版权边界和移除方式见 `NOTICE.md`。
- 真题版权归原出题方或相关权利方所有，本项目仅供个人学习交流。

## 诊断 JSON 内容

`ai-diagnosis.json` 主要包含：

- 题库来源和题量
- 总作答数、正确率、错题数
- 模块正确率
- 收藏题 ID
- 最近错题题干、选项、答案、解析
- 全部作答轨迹
- 给 AI 的诊断提示

## 来源与致谢

本项目 [AndyNull/ruankao-architect-practice](https://github.com/AndyNull/ruankao-architect-practice) 是直接 Fork 自 [Zhang-986/ruankao-architect-practice](https://github.com/Zhang-986/ruankao-architect-practice) 的项目，并在其基础上持续维护和扩展。

题库主来源为 [wujiaming88/awesome-ruankao](https://github.com/wujiaming88/awesome-ruankao)，系统架构设计师清洗交叉校对题材及资料阅读目录参考 [YoungHong1992/ruankao-senior-architecture-designer](https://github.com/YoungHong1992/ruankao-senior-architecture-designer)。感谢两个仓库的整理与维护；第三方题面、答案、解析、大纲和教程内容的权利仍归相应权利人所有，具体边界见 [NOTICE.md](NOTICE.md)。

本项目积极参与并认可 [linux.do 社区](https://linux.do/)。
