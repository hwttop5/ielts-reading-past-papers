## IELTS Reading Past Papers

> [中文版](./README.md)

 | Live Demo: [https://ielts-reading-past-papers.vercel.app](https://ielts-reading-past-papers.vercel.app)

An IELTS Reading practice app featuring question bank browsing, practice mode, history, achievements, i18n, and theme switching. Practice uses the **unified reading** pipeline (`src/generated/reading-native` plus runtime assets under `public/`). The catalog is driven by `src/utils/questionIndex.json`. The legacy **`public/questionBank` HTML tree has been removed** from this repo.

### Screenshots


| Home     | Browse       |
| -------- | ------------ |
|          |              |
| Practice | Achievements |
|          |              |


### Features

- Browse by category (P1/P2/P3) and frequency (High/Low), with search and filters
- Practice mode with the unified reading UI (structured items and explanations), full-screen immersive experience, automatic time tracking, scoring, and loading state indicators with timeout handling
- Practice history with score, accuracy, and duration, supporting full data JSON import/export (backup & restore)
- Achievements with automatic unlock, featuring beautiful notification popups and a dedicated showcase page
- Internationalization (Chinese/English), including 404 page
- Light/Dark theme powered by CSS variables
- PDF viewing from `public/ReadingPractice/PDF/` (allow popups in your browser)

### Data Backup & Restore

- **Full Backup**: Export all local data (practice history, achievements, settings) as a JSON file.
- **Lossless Restore**: When importing a JSON file, the system performs version validation and data integrity checks to ensuring 100% restoration of user data.
- **Cross-Device Migration**: Easily migrate your learning progress from one device to another using the import/export feature.
- **Data Privacy**: All data is stored locally in your browser (localStorage). We do not collect any personal information.

### Tech Stack

- Vue 3, TypeScript, Vite
- Pinia (state), Vue Router (routing)
- Ant Design Vue (UI feedback)

### Requirements

- Node.js ≥ 18
- npm

### Quick Start

```bash
npm install
npm run dev         # boot frontend + assistant in background
npm run dev:status  # check ports, urls, and pid state
npm run dev:logs    # print recent frontend/backend logs
npm run dev:down    # stop both services
npm run build
npm run preview
```

### Stable Local Startup

- `npm run dev` now uses a local dev manager instead of relying on auto-increment ports.
- Frontend is fixed to `http://localhost:5175`.
- Assistant is fixed to `http://127.0.0.1:8787`.
- The dev manager clears stale listeners on those ports before boot, writes logs to `tmp/dev/`, and injects runtime env so backend CORS always matches the frontend origin.

### Structure (excerpt)

```
public/
  ReadingPractice/PDF/     # PDFs referenced by questionIndex pdfPath
  assets/generated/          # Synced reading assets (see npm run generate:index)
  js/runtime/                # Unified reading runtime scripts
src/
  generated/reading-native/  # Prebuilt exam & explanation JSON
  components/              # Reusable components
  layouts/                 # Layouts
  router/                  # Routes
  store/                   # Pinia stores
  styles/                  # Themes and globals
  utils/
    backup.ts              # Full data backup/restore utility
    questionIndex.json     # Prebuilt index of questions
    questionScanner.ts     # Build final question meta from index
    eventBus.ts            # Global event bus (achievements, updates)
  views/                   # Pages (Home/Browse/Practice/PracticeMode/...)
  i18n/index.ts            # Lightweight i18n (t, currentLang, setLocale)
```

### Data & Question Bank

- The catalog is `src/utils/questionIndex.json` (`launchMode`, `dataKey`, `pdfPath`, `frequency`, etc.), consumed by `questionScanner.ts`.
- **Unified** entries (`launchMode: "unified"`): require `src/generated/reading-native/` exam (and optional explanation) JSON; PDFs live under `public/ReadingPractice/PDF/` and must match each `pdfPath` (e.g. `/ReadingPractice/PDF/...pdf`).
- **PDF-only** entries (`launchMode: "pdf_only"`): PDF viewing only, no structured exam JSON.
- At build time, the whole `public/` tree is copied to `dist/` (there is no `questionBank` folder anymore).

### Syncing & Updating questionIndex.json

- **Bulk sync (recommended)**: run `npm run generate:index` to copy PDFs and generated assets from a local **reference reading bundle** and regenerate `questionIndex.json` / `questionMeta.json`. Set `READING_REFERENCE_ROOT` to that bundle’s root (see `scripts/generate-index.mjs` for the default path used when unset).
- **Manual edits**: only after the corresponding `src/generated/reading-native/exams/<dataKey>.json` (and explanations if needed) and `public/ReadingPractice/PDF` files exist. Do **not** add `htmlPath` or rely on `public/questionBank`.
- **Validate**: `npm run validate:index` checks unified rows, `pdfPath` prefix, and presence of reading-native JSON (missing PDFs or some explanations may warn).

### i18n

- Use `inject('t')` to get the translation function and `inject('currentLang')` to read current locale.
- Language persists in `localStorage: ielts-language`. Chinese subtitles are hidden in English mode for a clean UI.

### Build & Deploy

- `npm run build` outputs to `dist/` (full `public/` copy; no `questionBank` subtree).
- Deploy the entire `dist` folder to a static host (or platforms like Vercel).
- `dist/` is ignored by `.gitignore`.

### Commit Convention

- Follow Conventional Commits:
  - `feat:` new feature
  - `fix:` bug fix
  - `docs:` documentation
  - `style:` formatting
  - `refactor:` code refactor
  - `perf:` performance
  - `test:` tests
  - `chore:` tooling/build/deps

### License

- GNU GPLv3. See [LICENSE](./LICENSE).

