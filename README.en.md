# IELTS Reading Past Papers

> [简体中文](./README.md)

| Live demo | [https://ielts-reading-past-papers.vercel.app](https://ielts-reading-past-papers.vercel.app) |

An IELTS Reading practice app built around a **community question bank** and an **AI assistant**, with support for guided practice, review, history, achievements, and optional RAG-enhanced tutoring.

## Features

- **Home dashboard**: Practice count, average accuracy, study time, latest practice, and recently unlocked achievements.
- **Community question bank**: Filter by passage type and frequency, search passages, open PDFs, and launch practice directly.
- **Reading practice**: Passage and questions side by side, with timing, submit/review flow, notes, highlights, and fullscreen mode.
- **AI assistant**: Hints, reasoning help, mistake review, free-form questions, and attachment support.
- **History and achievements**: Session history, review entry points, import/export, and an achievement system.
- **Multi-device UX**: Chinese and English UI, light/dark themes, responsive layouts, and PWA support.

## Quick start

Requirements:

- Node.js >= 18
- npm

Minimal local setup:

```bash
npm install
cd server && npm install && cd ..
npm run dev
```

Common development commands:

```bash
npm run dev:status
npm run dev:logs
npm run dev:down
npm run build
npm run preview
```

For AI assistant and RAG-related environment variables, see `server/.env.example`. For defaults and runtime mode logic, see `server/src/config/env.ts`.

## Project structure

```text
repo-root/
  src/                          frontend source
  server/                       assistant API
  evals/ragas/                  offline RAG evaluation
  docs/                         retained doc assets and local guidance
  public/                       static assets
  docker-compose.rag.local.yml  local RAG helper stack
```

## Tech stack

| Layer | Stack |
| --- | --- |
| Frontend | Vue 3, TypeScript, Vite, Pinia, Vue Router, Ant Design Vue |
| Assistant API | Node.js, Fastify, LangChain, OpenAI-compatible LLM / embedding endpoints, Qdrant |
| Evaluation | Python, Ragas |

## Documentation map

- Server env template: [`server/.env.example`](./server/.env.example)
- RAG evaluation guide: [`evals/ragas/README.md`](./evals/ragas/README.md)

## Open-source license

This project is released under the [GNU GPLv3](./LICENSE).
