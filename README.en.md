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
- For local AI features, configure `LLM_API_KEY` and related keys in `server/.env` (see `server/src/config/env.ts`). For **RAG semantic retrieval**, configure an **embedding endpoint** (prefer `EMBEDDING_*`) and **`QDRANT_URL`**. If **`LLM_API_KEY` is unset**, the assistant stays mostly in local template mode; with LLM configured but **without** RAG, you still get LLM replies but no vector retrieval boost.

---

## Quick start

```bash
npm install
cd server && npm install && cd ..

npm run dev          # frontend http://localhost:5175 + assistant http://127.0.0.1:8787
npm run dev:status   # ports, process state
npm run dev:logs     # recent logs
npm run dev:down     # stop both services

npm run build        # production build → dist/ (set VITE_ASSISTANT_API_BASE_URL; for a local prod bundle test only, use SKIP_ASSISTANT_ENV_CHECK=1)
npm run preview      # preview build; default http://localhost:4173 (dev uses 5175—see terminal). /api → 127.0.0.1:8787; start the assistant first
```

- **Deployment**: Host `dist/` on static hosting; run the assistant as its own Node service (or container). **Production builds** must set `VITE_ASSISTANT_API_BASE_URL` (assistant base URL: scheme + host + port, no trailing `/`); otherwise `vite build` fails. On Vercel, set it under Project → Environment Variables → **Production**.
  - **Vercel (frontend)**: **Import** this repo in Vercel, set the Production branch to **`main`**, and enable **Git auto-deploy**. [`vercel.json`](vercel.json) pins the Vite build and SPA rewrites. Set **Production** `VITE_ASSISTANT_API_BASE_URL` (and Preview envs if needed) under Project → Environment Variables. **No** GitHub repository secrets are required; pushes to **`main`** are built and deployed by Vercel automatically.
  - **Render (assistant API, no RAG)**: Create a **Web Service** from the same GitHub repo, set **Root Directory** to `server`, Production branch to **`main`**, and enable auto-deploy (or use the [`render.yaml`](render.yaml) Blueprint). Add `LLM_API_KEY` and `FRONTEND_ORIGIN` in the dashboard; omit `QDRANT_URL` / `EMBEDDING_*`. **No** Deploy Hook or GitHub Actions is required.
  - **Verify**: After the API is live, run `npm run verify:deployment -- https://<assistant-base-url>`. For a strict no-RAG check, set `EXPECT_NO_RAG=1` first, then run the same command.
  - **Assistant API URL (frontend)**: Priority **①** build env `VITE_ASSISTANT_API_BASE_URL` (Vercel Production) → **②** [`public/assistant-api.json`](public/assistant-api.json) `apiBaseUrl` (when non-empty, applied at runtime after redeploy; the repo defaults to `""` and relies on build env). For local production builds, copy [.env.production.example](.env.production.example) to `.env.production` and fill in the value; overview in [.env.example](.env.example).

---

## Project structure

- **Repository root**: Vue 3 + Vite frontend; `npm run build` outputs `dist/` for static hosting.
- **`server/`**: Fastify assistant API with its own `package.json`, default `http://127.0.0.1:8787`; in development, Vite proxies `/api` to it.
- **`evals/ragas/`** (optional): Python + Ragas for offline retrieval/answer evaluation.

```
repo-root/
  src/                          # frontend source
  server/                       # assistant API
  evals/ragas/                  # optional RAG evaluation
  docker-compose.rag.local.yml  # local TEI embeddings + Qdrant (Docker)
  public/                       # static assets (PDFs, etc.)
```

---

## Tech stack

| Layer | Stack |
| --- | --- |
| Frontend | Vue 3, TypeScript, Vite, Pinia, Vue Router, Ant Design Vue |
| Assistant API | Node.js, Fastify, LangChain (OpenRouter or compatible APIs); semantic search uses **Qdrant** + OpenAI-compatible embeddings (prefer `EMBEDDING_*` + `QDRANT_URL`) |
| Optional eval | `evals/ragas/`: Python + Ragas for offline retrieval/answer quality |

---

## Assistant configuration

- Copy from [`server/.env.example`](server/.env.example); field definitions and defaults are in [`server/src/config/env.ts`](server/src/config/env.ts).
- **Chat and intent routing**: `LLM_API_KEY` and `LLM_*` (e.g. `LLM_PROVIDER`, `LLM_CHAT_MODEL`).
- **RAG semantic retrieval**: **`QDRANT_URL`** plus a working embedding base URL/key (`EMBEDDING_*` preferred; legacy `OPENAI_EMBEDDING_BASE_URL` / `OPENAI_EMBED_MODEL` / `OPENAI_API_KEY` still supported).
- **Web search** and other options (e.g. `TAVILY_API_KEY`) are documented in the env file comments.

### Local RAG (Docker on Windows)

This stack is for **local** vector retrieval only; it does not change production (e.g. Vercel static hosting). The assistant API can still run on your machine or any Node host.

**Environment**: Prefer **Docker Desktop** with the **WSL2 backend** and **GPU containers** (NVIDIA) for TEI. Allocate roughly **8–10GB** RAM to the Linux engine; avoid running other heavy GPU workloads alongside TEI if VRAM is tight.

**First-time Docker / `docker` or `winget` not found**:

- **Docker Desktop** (PowerShell):  
  `winget install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements`  
  Then start Docker Desktop and wait until it is ready; run `docker version`.
- **PATH**: If `docker` is still missing in a **new** terminal, **manually** add  
  `C:\Program Files\Docker\Docker\resources\bin` to your user or system `Path`.  
  If `winget` is missing, add `%LOCALAPPDATA%\Microsoft\WindowsApps` the same way; open a new terminal afterward.

**Default stack** (see repo root `docker-compose.rag.local.yml`):

| Service | Image | Host ports | Notes |
| --- | --- | --- | --- |
| TEI | `ghcr.io/huggingface/text-embeddings-inference:cuda-1.9` | **8080** (maps container **80**) | Model default `intfloat/multilingual-e5-base`, OpenAI-compatible `/v1/embeddings` |
| Qdrant | `qdrant/qdrant` | **6333** (HTTP), **6334** (gRPC) | Dashboard: `http://localhost:6333/dashboard` |

**Commands** (from repo root):

- `npm run rag:up` / `npm run rag:down` / `npm run rag:logs` / `npm run rag:ps`

**`server/.env` example** (same idea as [`server/.env.example`](server/.env.example)): `EMBEDDING_BASE_URL=http://127.0.0.1:8080/v1`, `EMBEDDING_API_KEY=-`, `EMBEDDING_MODEL=text-embeddings-inference`, `QDRANT_URL=http://127.0.0.1:6333`.

**Smoke checks (TEI / Qdrant reachable on the host)**:

- `docker compose -f docker-compose.rag.local.yml ps`: TEI should show **`0.0.0.0:8080->80/tcp`**, Qdrant **`6333->6333`**. If TEI only shows `80/tcp` with no host port, **`8080` was likely taken** when the container started, or publishing failed—free `8080` and run `docker compose -f docker-compose.rag.local.yml up -d --force-recreate tei`.
- `curl -s http://127.0.0.1:8080/health` (200 after TEI is ready; first download/load can take minutes)
- `curl -s http://127.0.0.1:6333/` (JSON with `version`)
- With the assistant API running, open `http://127.0.0.1:8787/health`: `semanticSearchConfigured` should be `true`; if `LLM_API_KEY` is set, `assistantRuntimeMode` should be **`llm-enabled-hybrid-retrieval`**.

**Ingestion**: After changing embedding models or moving from cloud to local embeddings, **rebuild the index**; do not mix old and new vectors. Start with `npm --prefix server run ingest -- --limit=5`, then run a full ingest without `--limit`.

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
