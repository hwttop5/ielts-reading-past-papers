# IELTS Reading Past Papers

> [English README](./README.en.md)

面向雅思阅读备考的 Web 应用，围绕 **民间题库** 与 **AI 助教** 提供更高效的练习、复盘与错题讲解体验。

## 功能概览

- **首页总览**：查看练习次数、平均正确率、学习时长、最近练习和最新解锁成就。
- **民间题库**：按篇型、频率、关键词筛选与搜索，支持直接开始练习或打开 PDF 对照。
- **阅读练习**：文章与题目同屏分栏，支持计时、提交、复盘、高亮、笔记与全屏模式。
- **AI 助教**：支持提示、思路讲解、错题复盘、自由提问和附件辅助说明。
- **练习记录与成就**：支持练习历史回看、复盘入口、数据导入导出，以及成就系统。
- **多端与主题**：支持中英文、浅色/深色主题、响应式布局与 PWA 安装。

## 快速开始

环境要求：

- Node.js >= 18
- npm

最小本地启动步骤：

```bash
npm install
cd server && npm install && cd ..
npm run dev
```

常用开发命令：

```bash
npm run dev:status
npm run dev:logs
npm run dev:down
npm run build
npm run preview
```

AI 助教与 RAG 相关环境变量请查看 `server/.env.example`，默认值和运行模式说明请查看 `server/src/config/env.ts`。

## 项目结构

```text
repo-root/
  src/                          前端源码
  server/                       助教 API
  evals/ragas/                  离线 RAG 评估
  docs/                         保留的文档素材与局部说明
  public/                       静态资源
  docker-compose.rag.local.yml  本地 RAG 辅助栈
```

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | Vue 3、TypeScript、Vite、Pinia、Vue Router、Ant Design Vue |
| 助教 API | Node.js、Fastify、LangChain、OpenAI 兼容 LLM / Embedding 接口、Qdrant |
| 评估 | Python、Ragas |

## 文档导航

- 服务端环境变量模板：[`server/.env.example`](./server/.env.example)
- RAG 评估说明：[`evals/ragas/README.md`](./evals/ragas/README.md)

## 开源许可

本项目以 [GNU GPLv3](./LICENSE) 开源。
