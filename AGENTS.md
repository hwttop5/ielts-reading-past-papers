# AGENTS.md

本文件面向在本仓库内工作的 AI 代理与维护者。根目录规则对整个仓库生效；若子目录存在更近的 `AGENTS.md`，则该子目录规则优先生效。

## 仓库概览

- 前端应用：Vue 3 + Vite，主代码在 `src/`
- 助教 API：Fastify 服务，代码与配置在 `server/`
- RAG 评估：离线评估工具在 `evals/ragas/`
- 文档素材与局部说明：保留的仓库文档资源在 `docs/`

## 优先入口

- 用户说明：`README.md`
- 英文说明：`README.en.md`
- 版本记录：`CHANGELOG.md`
- 服务端环境变量模板：`server/.env.example`
- RAG 评估说明：`evals/ragas/README.md`

## 常用命令

```bash
npm run dev
npm run dev:status
npm run build
npm run test:server
npm run audit:question-nav
npm run verify:deployment -- https://<assistant-base-url>
```

需要单独处理服务端时，优先使用：

```bash
npm --prefix server run dev
npm --prefix server run build
npm --prefix server run test
```

## 文档职责边界

- `README.md` / `README.en.md` 面向用户，保留产品介绍、功能概览、最小开发入口和文档导航。
- `AGENTS.md` 体系面向代理与维护执行，记录目录职责、验证命令、改动边界与局部规则。
- 评估报告、优化报告和必要文档素材继续保留在各自目录，不并入根 `README`。

## 改动边界

- 未经要求，不要修改生成产物、大体量题库数据或评估输出。
- 涉及题库索引、生成数据或批量脚本前，先确认是否需要同步 `scripts/`、`server/src/cli/` 或相关校验命令。
- 文档改动默认不改变生产部署行为；若文档提到部署，只能描述现有事实，不新增额外流程。
- 若本地存在未跟踪的设计交付包，不要把其中的虚构文案、虚构入口或视觉幻觉写回产品说明。

## 验证优先级

- 文档改动至少检查：相对链接、路径、命令名、目录名是否真实存在。
- 涉及 `server/` 文档时，优先以 `npm --prefix server run test` 作为首选验证命令。
- 涉及 `evals/ragas/` 文档时，只引用真实存在的 Python 脚本、真实输出文件和当前 Python 版本策略。
- 若只改文档，除非内容涉及运行行为，否则不要顺手跑重型构建或大规模评估。

## 维护约定

- Markdown 统一使用 UTF-8。
- 命令使用 fenced code block。
- 路径、环境变量、脚本名统一用反引号。
- 优先窄改，避免把局部说明扩写成新的长期维护负担。
