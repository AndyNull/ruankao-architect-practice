# 高级资格原始资料库

本目录只做原始资料收集；结构化结果写入 `data/banks/`，不会改写架构师主库 `data/bank.json`。四个二级目录分别保存系统规划与管理师、信息系统项目管理师、系统分析师、网络规划设计师资料。

## 收集范围

| 资格 | 已找到的真题年份 | 2026 资料 | 补充资料 |
|---|---|---|---|
| 系统规划与管理师 | 2017-2025 | 下半年模拟题 | 历年三科 PDF、章节题、全真模拟题 |
| 信息系统项目管理师 | 2010-2026 | 上半年回忆版真题 | 历年三科 PDF、2023 多批次回忆卷、3581 道结构化选择题、187 道结构化案例 |
| 系统分析师 | 2005-2026 | 上半年回忆版真题、下半年模拟题 | 历年三科 PDF、2018-2023 JSON/Markdown、模拟题 |
| 网络规划设计师 | 2009-2025 | 下半年模拟题 | 历年三科 PDF、全真模拟题 |

`raw/awesome-ruankao/` 保存较新的 Markdown 真题和原创模拟题；`raw/xiaomabenten/` 保存早年 PDF/Word；系统分析师的 `raw/xiaolidan00/` 是额外的结构化交叉校对源。

信息系统项目管理师另保留 `xmgzxmgz/ruankao-cli` 的 3581 道去重选择题，以及其上游 `IHKYoung/RuanKao` 的 4137 道选择题、187 道案例和配套图。两者存在来源重叠，后续导入前必须按题干、选项、答案和来源标签去重。

二进制原卷约 1 GB，只保留在本地工作区并由 `.gitignore` 排除。`manifest.json` 记录每个文件的来源提交、原始路径、大小和 SHA-256；运行以下命令可重建清单：

```bash
node scripts/index_exam_materials.mjs
```

## 来源与边界

- `wujiaming88/awesome-ruankao`：CC BY-SA 4.0，真题权利仍归原权利方。
- `xiaomabenten/system_planner`、`ruankao_itpm`、`system-analysts`、`network_planner`：仓库声明 Apache-2.0；其中收录的第三方试题、答案和扫描资料不因此转为本项目 MIT 内容。
- `xiaolidan00/ruankao-question`：未提供独立许可证，仅作为可追溯的本地研究材料，不纳入本项目代码许可。
- `xmgzxmgz/ruankao-cli`、`IHKYoung/RuanKao`：结构化高项题库；题库上游未统一授权，仅用于本地研究和交叉校对。
- `educity.cn/rk/zhenti/xifen`：补齐系统分析师 2005-2007 三科公开 PDF；页面与文件版权归原站及相应权利方。
- 系规 2017-2019 PDF 选择题经 `scripts/import_planner_pdf_bank.py` 转换后纳入题库；网规 2021 答案键经 `scripts/import_network_online_answers.mjs` 导入。无法可靠确认答案的题目仍留在 `*-pending.json`。
- 2026 年尚未举行的下半年考试只收录模拟题，不标记为真题。

已核查但仍存在的缺口：系统分析师 2004 年下载地址已失效；信息系统项目管理师公开可下载原卷目前从 2010 年开始。清单不以空文件或模型生成内容伪装缺失真题。
