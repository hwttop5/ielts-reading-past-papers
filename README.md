## IELTS Reading Past Papers

> [English Version](./README.en.md)

 | 在线预览：[https://ielts-reading-past-papers.vercel.app](https://ielts-reading-past-papers.vercel.app)

一个面向雅思阅读备考的练习应用，包含题库（由ZYZ老师民间搜集整理）浏览、练习模式、练习记录、成就系统、多语言和主题切换等功能。题库以静态 HTML/PDF 的形式放置在 public/questionBank，并通过预生成索引进行加载展示。

### 界面预览
| 首页 | 题库浏览 |
| :-: | :-: |
| ![Home](./docs/images/home.png) | ![Browse](./docs/images/browse.png) |

### 功能特性
- 题库浏览：按类别（P1/P2/P3）、频率（高频/次频）筛选与搜索
- 练习模式：内嵌题目 HTML，支持全屏沉浸式练习，自动记录时长、答题与分数，包含加载状态提示与超时处理
- 练习记录：展示最近练习、得分、正确率、用时等，支持全量数据 JSON 导入导出（备份与恢复）
- 成就系统：完成练习自动计算与解锁，配备精美的成就解锁通知与展示页面
- 多语言：内置中英文切换（自研 i18n），404 页面也支持
- 主题风格：浅色/深色主题，CSS 变量驱动
- PDF 查看：与题目 HTML 同目录，一键打开（浏览器弹窗需允许）

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
  questionBank/            # 题库静态资源（HTML/PDF）
src/
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
- 静态题库位于 public/questionBank，构建时会被 Vite 原样复制到 dist/questionBank。
- 页面并不直接扫描文件系统，而是读取 `src/utils/questionIndex.json` 中的 `htmlPath` 列表，再由 `questionScanner.ts` 生成最终题目数据（如题目数量估算）。
- 不要删除 `public/questionBank`。如果仅需减小仓库体积，可删除其中的 `.pdf` 并在页面隐藏“查看 PDF”。

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
- 运行 `npm run build` 产出到 `dist/`。其中包含 `dist/questionBank`（由 public 拷贝而来）。
- 静态托管：将 dist 整目录部署至静态服务器（或 Vercel 等平台）。
- 若在仓库中不需要提交构建产物，请确保 `.gitignore` 中忽略 `dist/`（项目已配置）。

### 题库索引更新流程
- 新增题目
  1. 将 HTML（和可选 PDF）放入 `public/questionBank` 对应目录（如 `1.P1 高频/`）。HTML 文件名建议遵循现有模式：`<序号>. <类别> - <英文题名> <中文题名>【高|次】.html`。
  2. 在 `src/utils/questionIndex.json` 追加一条记录：
     - `id`：全局唯一（建议 `p<类别>-<序号>` 或语义 ID）
     - `title`：英文题名
     - `titleCN`：中文题名
     - `category`：`"P1" | "P2" | "P3"`
     - `difficulty`：`"高频"` 或 `"次频"`
     - `htmlPath`：以 `/questionBank/` 开头的相对路径，指向新增 HTML
  3. 页面会从索引读取数据并展示；构建时 PDF 将与 HTML 一起拷贝至 `dist/questionBank`。
- 示例：
  ```json
  {
    "id": "p1-230",
    "title": "New Discovery",
    "titleCN": "新发现",
    "category": "P1",
    "difficulty": "高频",
    "htmlPath": "/questionBank/1.P1 高频/230. P1 - New Discovery 新发现【高】.html"
  }
  ```
- 删除题目
  1. 从 `public/questionBank` 删除对应 HTML/PDF
  2. 从 `questionIndex.json` 移除对应对象
  3. 重新构建
- 命名注意
  - 打开 PDF 的逻辑会从 HTML 文件名中去除 `【高】/【次】` 后缀并拼接 `.pdf`，确保对应 PDF 文件名满足该规则。
- 批量更新（自动化）
  - 如果你替换了整个 `public/questionBank` 目录，或进行了大量增删，可以使用脚本全量重新生成索引。
  - 运行命令：`npm run generate:index`
  - 脚本逻辑：
    - 扫描 `public/questionBank` 下所有 HTML 文件
    - 解析文件名（尝试提取序号、类别、标题、中文名、难度）
    - 自动生成新的 `src/utils/questionIndex.json`
  - 注意：自动生成后建议人工 check 生成的 json 内容，确保标题解析正确。

- 校验索引
  - 运行 `npm run validate:index` 校验以下内容：
    - 必填字段是否完整
    - `category`/`difficulty` 是否有效
    - `htmlPath` 是否以 `/questionBank/` 开头且实际文件存在
    - 推荐的 PDF 是否存在（缺失仅警告）
- 缓存提示
  - 开发时若页面未反映索引更新，请清除浏览器 `localStorage` 的 `ielts_questions` 或在代码中调用 `questionStore.refreshQuestions()` 强制刷新。

### 常见问题
- 为什么仓库里会出现两份 questionBank？  
  开发源在 `public/questionBank`，构建后会被复制到 `dist/questionBank`。仓库中仅应保留 `public/questionBank`；`dist/` 仅用于发布。
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
