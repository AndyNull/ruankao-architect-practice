# 软考高级练题台

支持系统架构设计师、系统规划与管理师、信息系统项目管理师、系统分析师和网络规划设计师。

## 本次更新

- 修复继续练习未做队列、模式计数和套卷切换显示。
- 补充系分案例与论文；五科题库支持独立作答、错题、收藏与进度导入导出。
- 删除在线人数功能，无统计服务或额外数据上报。

| 科目 | 选择题 | 案例 | 论文 |
|---|---:|---:|---:|
| 架构师 | 1947 | 132 | 104 |
| 系规 | 814 | 28 | 24 |
| 高项 | 3686 | 209 | 64 |
| 系分 | 956 | 102 | 80 |
| 网规 | 1496 | 57 | 45 |

## 使用

[在线练习](https://andynull.github.io/ruankao-architect-practice/)。本地运行：

```bash
node scripts/serve.mjs
```

访问 `http://localhost:4173/`，或在 Windows 双击 `start.cmd`。

支持继续练习、记忆复习、章节、真题套卷、错题、收藏、案例、论文和资料阅读。进度保存在本机浏览器，可导入导出 JSON。本地解析随题库发布；主动 AI 解读与论文生成使用 `glm.996986.xyz`。

## 维护

```bash
node scripts/build_subject_banks.mjs
node scripts/build_local_subject_explanations.mjs
node --test tests/*.test.mjs
```

推送 `main` 后由 GitHub Actions 发布 Pages，无需后端。题库位于 `data/bank.json` 与 `data/banks/`；来源缺口见 `data/banks/coverage.json`。题量含模拟题，第三方参考答案及 AI 解析不代表官方答案，已知不完整内容不进入正式练习。

详细变更见 [CHANGELOG.md](CHANGELOG.md)，版权与来源见 [NOTICE.md](NOTICE.md)。

## 致谢

Fork 自 [Zhang-986/ruankao-architect-practice](https://github.com/Zhang-986/ruankao-architect-practice)。感谢 [awesome-ruankao](https://github.com/wujiaming88/awesome-ruankao) 和 [YoungHong1992](https://github.com/YoungHong1992/ruankao-senior-architecture-designer) 的资料整理。本项目参与并认可 [linux.do](https://linux.do/) 社区。
