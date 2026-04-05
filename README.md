## IELTS Reading Past Papers

> [English Version](./README.en.md)

 | 在线预览：[https://ielts-reading-past-papers.vercel.app](https://ielts-reading-past-papers.vercel.app)

一个面向雅思阅读备考的练习应用，包含题库（由 ZYZ 老师民间搜集整理）浏览、练习模式、练习记录、成就系统、多语言和主题切换等功能。练习页使用**统一阅读模式**（`src/generated/reading-native` 预生成数据 + `public` 下运行时脚本与 PDF），题目列表由 `src/utils/questionIndex.json` 驱动；**不再使用**已移除的 `public/questionBank` 静态 HTML 题库。

### 界面预览


| 首页       | 题库浏览     |
| -------- | -------- |
|          |          |
| **练习模式** | **成就系统** |
|          |          |


### 功能特性

- 题库浏览：按类别（P1/P2/P3）、频率（高频/次频）筛选与搜索
- 练习模式：统一阅读页（结构化题目与解析），支持全屏沉浸式练习，自动记录时长、答题与分数，包含加载状态提示与超时处理
- 练习记录：展示最近练习、得分、正确率、用时等，支持全量数据 JSON 导入导出（备份与恢复）
- 成就系统：完成练习自动计算与解锁，配备精美的成就解锁通知与展示页面
- 多语言：内置中英文切换（自研 i18n），404 页面也支持
- 主题风格：浅色/深色主题，CSS 变量驱动
- PDF 查看：`public/ReadingPractice/PDF/` 下 PDF，一键打开（浏览器弹窗需允许）

### 数据备份与恢复

- **全量备份**：支持将所有本地数据（练习记录、成就进度、用户设置）导出为 JSON 文件。
- **无损恢复**：导入 JSON 文件时，系统会进行版本校验和数据完整性检查，确保能够 100% 还原用户数据。
- **跨设备迁移**：通过导入导出功能，您可以轻松地将学习进度从一台设备迁移到另一台设备。
- **数据安全**：所有数据均存储在浏览器本地 (localStorage)，我们不收集任何用户隐私数据。

### 技术栈

- Vue 3、TypeScript、Vite
- Pinia（状态管理）、Vue Router（路由）
- Ant Design Vue

### 开发环境

- Node.js ≥ 18（Vite 5 要求）
- 包管理：npm

### 评估工具（可选）

RAG 系统质量评估使用 Python + Ragas 实现，位于 `evals/ragas/` 目录。

- **用途**: 离线评估检索和回答质量
- **依赖**: Python 3.10+, Ragas, HuggingFace Datasets
- **运行**: `npm run eval:ragas`（从 server 目录）或 `cd evals/ragas && python run_eval.py --all`
- **说明**: Python 仅用于评估，不参与应用运行时逻辑

### 快速开始

```bash
npm install
npm run dev        # 本地开发
npm run build      # 生产构建（输出到 dist/）
npm run preview    # 本地预览生产构建
```

### 目录结构（摘要）

```
public/
  ReadingPractice/PDF/     # 题目 PDF（与索引中 pdfPath 对应）
  assets/generated/        # 由 npm run generate:index 从参考包同步的阅读资源
  js/runtime/              # 统一阅读页运行时脚本（同上）
src/
  generated/reading-native/  # 预生成的 exam / explanation JSON（助教与练习逻辑依赖）
  assets/                  # 静态资源（如有）
  components/              # 复用组件
  layouts/                 # 布局
  router/                  # 路由配置
  store/                   # Pinia stores（practice/achievement/question 等）
  styles/                  # 主题与全局样式
  utils/
    backup.ts              # 数据全量导入导出工具
    questionIndex.json     # 题目索引（预生成，页面据此展示）
    questionScanner.ts     # 从索引读取并补充元数据
    eventBus.ts            # 全局事件总线 (成就解锁、练习更新)
  views/                   # 页面（Home/Browse/Practice/PracticeMode 等）
  i18n/index.ts            # 自研 i18n（t、currentLang、setLocale）
```

### 数据与题库

- 题目列表来自 `src/utils/questionIndex.json`（字段含 `launchMode`、`dataKey`、`pdfPath`、`frequency` 等），`questionScanner.ts` 将其转为浏览页可用的题目数据。
- **统一阅读**（`launchMode: "unified"`）：练习与助教依赖 `src/generated/reading-native/` 下的 exam / explanation JSON；PDF 放在 `public/ReadingPractice/PDF/`，路径与索引中的 `pdfPath`（如 `/ReadingPractice/PDF/xxx.pdf`）一致。
- **仅 PDF**（`launchMode: "pdf_only"`）：无结构化题目数据，仅提供 PDF 查看。
- 构建时 Vite 会把 `public/` 整棵拷贝到 `dist/`（**不再**包含已删除的 `public/questionBank`）。

### 多语言（i18n）

- 位置：`src/i18n/index.ts`
- 用法：在组件中通过 `inject('t')` 获取翻译函数 `t(key)`，`inject('currentLang')` 获取当前语言；语言持久化在 `localStorage: ielts-language`。
- 注意：中文副标题（如题目中文名）在英文模式下默认隐藏以保持界面纯净。

### 成就与练习记录

- Store：`src/store/practiceStore.ts`、`src/store/achievementStore.ts`
- 本地存储：所有用户数据均存储在 localStorage 中（前缀 `ielts_`），支持一键全量导出。
- 事件通知：通过 `utils/eventBus.ts` 实现跨组件通信（如解锁成就时触发全局通知）。

### 主题与样式

- 主题变量：`src/styles/theme.css`，通过 CSS 变量适配浅/深色模式。
- 常用页面容器和组件均使用 `var(--bg-primary)`、`var(--text-primary)` 等变量，避免硬编码颜色。

### 构建与部署

- 运行 `npm run build` 产出到 `dist/`（整份 `public/` 会进入 `dist/`，不含已移除的 `questionBank` 目录）。
- 静态托管：将 dist 整目录部署至静态服务器（或 Vercel 等平台）。
- 若在仓库中不需要提交构建产物，请确保 `.gitignore` 中忽略 `dist/`（项目已配置）。

### 题库索引与资源同步

- **推荐方式（批量）**：使用 `npm run generate:index`，从本地「参考阅读包」同步 PDF、`public/assets/generated` 下的阅读资源、运行时 JS，并**重写** `src/utils/questionIndex.json` 与 `questionMeta.json`。
  - 通过环境变量 `READING_REFERENCE_ROOT` 指定参考包根目录；未设置时脚本内有默认路径（见 `scripts/generate-index.mjs`），部署前请改为你本机路径或始终传入该变量。
  - 同步前请确认参考包内已包含对应的 `src/generated/reading-native` 与 `public` 资源；脚本会校验索引条数等约束（见脚本内断言）。
- **手工增删**：在具备 `src/generated/reading-native/exams/<dataKey>.json`（及需要的 explanation）和 `public/ReadingPractice/PDF` 中 PDF 的前提下，编辑 `questionIndex.json` 中对应条目；**勿再使用** `htmlPath` / `public/questionBank`。
- **校验**：`npm run validate:index` 会检查统一阅读条目、`pdfPath` 前缀、`reading-native` JSON 是否存在等（PDF 与部分 explanation 缺失可能为警告）。
- **缓存提示**：开发时若页面未反映索引更新，请清除浏览器 `localStorage` 的 `ielts_questions` 或调用 `questionStore.refreshQuestions()`。

### 常见问题

- PDF 打不开？  
浏览器可能拦截弹窗。允许弹窗或直接跳转（页面已有降级逻辑）。

### 提交规范

- 推荐遵循 Conventional Commits：
  - `feat:` 新功能
  - `fix:` 修复缺陷
  - `docs:` 文档变更
  - `style:` 代码格式（不影响逻辑）
  - `refactor:` 重构
  - `perf:` 性能优化
  - `test:` 测试相关
  - `chore:` 构建/工具/依赖变更
- 示例：`feat(browse): add frequency filter to question cards`

### 贡献

- 分支：建议在 feature 分支开发，合并到 main。
- 提交：遵循清晰的提交信息（如 feat/ui: …、fix(store): …）。

### 许可证

- 本项目基于 GNU GPLv3 许可证开源，详见 [LICENSE](./LICENSE)。

