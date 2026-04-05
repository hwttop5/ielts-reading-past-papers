# IELTS Reading Past Papers

> [简体中文](./README.md)

| Live demo | [https://ielts-reading-past-papers.vercel.app](https://ielts-reading-past-papers.vercel.app) |

A web app for IELTS Reading prep, built around a **community question bank** and an **AI coach**. Reading material is curated by **Teacher ZYZ** from community sources (authentic passages that often appear in exams), organized by passage, difficulty, and appearance frequency. Practice uses a unified reader with a draggable **AI assistant** (hints, reasoning, mistake review); with LLM and vector retrieval configured, answers can be **RAG-augmented**.

---

## Features

What you can use in the app, in plain language (no development or deployment detail).

- **Home dashboard**: Questions practiced, average accuracy, total study time, session count; recently unlocked achievements with a shortcut to **My achievements** for the full list.
- **Community question bank**: Filter by passage type (P1/P2/P3) and frequency; search, sort, and paginate; per-passage progress; start practice or open the PDF; short on-page note about the nature of the bank.
- **Reading practice**: Passage and questions side by side with adjustable panes; **fullscreen**; timed sessions, submit, and score. Some passages are full on-screen practice; others focus on the PDF.
- **AI assistant**: Open the side panel while practicing—shortcuts such as hints, reasoning, and mistake review, or free-form questions; file attachments supported.
- **Practice history**: Past sessions and overall stats; **export** data to a file for backup or **import** a file to restore on this device (e.g. new computer or recovery).
- **Achievements**: Unlock automatically from sessions, accuracy, study time, streak days, perfect-score runs, and more; tiers and points; unlock notifications; browse everything under **My achievements**.
- **Interface**: **Chinese or English** UI; **light and dark** themes to reduce eye strain during long reading sessions.
- **Privacy & data**: Progress stays in **your browser** on your device—nothing is uploaded to our servers; use export/import to move your data between devices.

---

## Requirements

- Node.js ≥ 18 (npm)
- For local AI features, configure `LLM_API_KEY` and related keys in `server/.env` (see `server/src/config/env.ts`). For **RAG semantic retrieval**, configure embeddings and **Qdrant** (`OPENAI_API_KEY`, `QDRANT_URL`, etc.). Without them, some behavior falls back to local template-only mode.

---

## Quick start

```bash
npm install
cd server && npm install && cd ..

npm run dev          # frontend http://localhost:5175 + assistant http://127.0.0.1:8787
npm run dev:status   # ports, process state
npm run dev:logs     # recent logs
npm run dev:down     # stop both services

npm run build        # production build → dist/
npm run preview      # preview build (/api proxied to local assistant)
```

- **Deployment**: Host `dist/` on static hosting; run the assistant as its own Node service (or container). If the frontend and assistant are on **different origins**, set `VITE_ASSISTANT_API_BASE_URL` at build time to the assistant base URL (scheme, host, port).

---

## Project structure

- **Repository root**: Vue 3 + Vite frontend; `npm run build` outputs `dist/` for static hosting.
- **`server/`**: Fastify assistant API with its own `package.json`, default `http://127.0.0.1:8787`; in development, Vite proxies `/api` to it.
- **`evals/ragas/`** (optional): Python + Ragas for offline retrieval/answer evaluation.

```
repo-root/
  src/            # frontend source
  server/         # assistant API
  evals/ragas/    # RAG eval
  public/         # static assets (PDFs, etc.)
```

---

## Tech stack

| Layer | Stack |
| --- | --- |
| Frontend | Vue 3, TypeScript, Vite, Pinia, Vue Router, Ant Design Vue |
| Assistant API | Node.js, Fastify, LangChain (OpenRouter or compatible APIs); semantic search uses **Qdrant** (`OPENAI_API_KEY` + `QDRANT_URL`) |
| Optional eval | `evals/ragas/`: Python + Ragas for offline retrieval/answer quality |

---

## Assistant configuration

- Copy from [`server/.env.example`](server/.env.example); field definitions and defaults are in [`server/src/config/env.ts`](server/src/config/env.ts).
- **Chat and intent routing**: `LLM_API_KEY` and `LLM_*` (e.g. `LLM_PROVIDER`, `LLM_CHAT_MODEL`).
- **RAG semantic retrieval**: `OPENAI_API_KEY` (embeddings) and **`QDRANT_URL`** (and `QDRANT_API_KEY` if required).
- **Web search** and other options (e.g. `TAVILY_API_KEY`) are documented in the env file comments.

---

## Data & build

- **Question catalog**: `src/utils/questionIndex.json` (`launchMode`, `dataKey`, `pdfPath`, `frequency`, …), consumed by `questionScanner.ts` for the browse UI.
- **Unified reading** (`launchMode: "unified"`): exam/explanation JSON under `src/generated/reading-native/`; PDFs under `public/ReadingPractice/PDF/` matching each `pdfPath`.
- **PDF-only** (`launchMode: "pdf_only"`): PDF viewing only, no structured items.
- **Bulk index sync**: `npm run generate:index` (set `READING_REFERENCE_ROOT`, see `scripts/generate-index.mjs`); **validate**: `npm run validate:index`.

---

## Commit conventions

Prefer [Conventional Commits](https://www.conventionalcommits.org/), e.g. `feat(browse): …`, `fix(store): …`, `docs: …`.

---

## Open-source license

This project is released under the [GNU GPLv3](./LICENSE).
