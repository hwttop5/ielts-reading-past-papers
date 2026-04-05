# IELTS Reading Past Papers

> [English README](./README.en.md)

| 在线预览 | [https://ielts-reading-past-papers.vercel.app](https://ielts-reading-past-papers.vercel.app) |

面向雅思阅读备考的 Web 应用，**民间题库** 与 **AI 助教** 助力高效备考。题库阅读材料由 **ZYZ 老师** 民间搜集整理（均是抽考概率较高的真实题目），按篇目、难度与出现频率组织；练习页采用统一阅读模式，并内置可拖拽的 **AI 助教**（提示、思路讲解、错题复盘等），在配置 LLM 与向量检索后可启用 RAG 增强回答。

---

## 功能概览

- **首页总览**：汇总展示已练题量、平均正确率、累计学习时长、练习次数等；可看到最近解锁的成就，并进入「我的成就」查看全部。
- **民间题库**：按阅读篇型（P1/P2/P3）、出现频率筛选，支持搜索、排序与分页；每篇显示练习进度，可进入做题或打开 PDF 对照；页面对题库性质有简要说明。
- **阅读练习**：文章与题目同屏分栏显示，可拖动调整区域；支持 **全屏**，专注计时作答，交卷后查看得分。部分篇目为完整在线答题，部分篇目以阅读 PDF 为主。
- **AI 助教**：做题时可打开侧边助教，使用「给提示」「讲思路」「分析错题」等快捷入口，也可自由提问，并支持上传附件辅助说明。
- **练习记录**：查看历次练习列表与总体统计；支持将学习数据 **导出为文件** 备份，或 **从文件导入** 恢复到本机（便于换电脑或防止误删）。
- **成就系统**：根据练习次数、正确率、学习时长、连续学习天数、满分场次等条件自动解锁；成就分档与积分，解锁时会有提示；在「我的成就」中浏览已得成就与总进度。
- **界面功能**：界面支持 **中文 / 英文**；提供 **浅色、深色** 主题，减轻长时间阅读的眼部疲劳。
- **隐私与数据**：学习记录与成就保存在 **本机浏览器** 中，不上传服务器；通过导出/导入即可在设备间迁移自己的进度。

---

## 环境要求

- Node.js ≥ 18（npm）
- 本地开发 AI 功能时：在 `server/.env` 中配置 `LLM_API_KEY` 等（详见 `server/src/config/env.ts`）；启用 **RAG 语义检索** 时需配置嵌入与 **Qdrant**（`OPENAI_API_KEY`、`QDRANT_URL` 等）。未配置时部分能力会降级为本地模板模式。

---

## 快速开始

```bash
npm install
cd server && npm install && cd ..

npm run dev          # 同时启动前端 http://localhost:5175 与助教 API http://127.0.0.1:8787
npm run dev:status   # 查看端口与进程状态
npm run dev:logs     # 查看近期日志
npm run dev:down     # 停止上述服务

npm run build        # 生产构建，输出 dist/
npm run preview      # 预览生产构建（若需连本地助教，preview 已配置 /api 代理）
```

- **部署**：前端将 `dist/` 部署到静态托管即可；助教需单独运行 Node 服务（或容器）。若前端与助教 API **不同域**，构建前端时设置 `VITE_ASSISTANT_API_BASE_URL` 为助教服务的根 URL（含协议与端口）。

---

## 项目结构

- **仓库根目录**：Vue 3 + Vite 前端，`npm run build` 产出 `dist/`，可静态托管。
- **`server/`**：Fastify 助教 API，独立 `package.json`，默认 `http://127.0.0.1:8787`；开发时由 Vite 将 `/api` 代理到该服务。
- **`evals/ragas/`**（可选）：Python + Ragas，离线评估检索与回答质量。

```
项目根/
  src/            # 前端源码
  server/         # 助教 API
  evals/ragas/    # RAG 评估
  public/         # 静态资源（含 PDF 等）
```

---

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | Vue 3、TypeScript、Vite、Pinia、Vue Router、Ant Design Vue |
| 智能助教 API | Node.js、Fastify、LangChain（OpenRouter / 兼容 API 等）；语义检索使用 **Qdrant**（`OPENAI_API_KEY` + `QDRANT_URL`） |
| 评估（可选） | `evals/ragas/`：Python + Ragas，离线评估检索与回答质量 |

---

## 助教配置

- 变量模板见 [`server/.env.example`](server/.env.example)，字段说明与默认值见 [`server/src/config/env.ts`](server/src/config/env.ts)。
- **对话与意图路由**：`LLM_API_KEY` 及 `LLM_PROVIDER`、`LLM_CHAT_MODEL` 等 `LLM_*`。
- **RAG 语义检索**：`OPENAI_API_KEY`（嵌入）与 **`QDRANT_URL`**（及按需 `QDRANT_API_KEY`）。
- **联网搜索**等（如 `TAVILY_API_KEY`）以 env 内注释为准。

---

## 数据构建

- **题目列表**：`src/utils/questionIndex.json`（含 `launchMode`、`dataKey`、`pdfPath`、`frequency` 等），由 `questionScanner.ts` 转为浏览页数据。
- **统一阅读**（`launchMode: "unified"`）：依赖 `src/generated/reading-native/` 下的试卷与解析 JSON；PDF 放在 `public/ReadingPractice/PDF/`，路径与索引中 `pdfPath` 一致。
- **仅 PDF**（`launchMode: "pdf_only"`）：无结构化题目，仅提供 PDF 查看。
- **批量同步索引**：`npm run generate:index`（需设置 `READING_REFERENCE_ROOT` 等，见 `scripts/generate-index.mjs`）；**校验**：`npm run validate:index`。

---

## 提交规范

推荐 [Conventional Commits](https://www.conventionalcommits.org/)，例如：`feat(browse): …`、`fix(store): …`、`docs: …`。

---

## 开源许可

本项目以 [GNU GPLv3](./LICENSE) 开源。
