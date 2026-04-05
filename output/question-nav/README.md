# Question Navigation Audit Tools

本目录包含问题导航自动化检测工具的输出结果。

## 目录结构

```
output/question-nav/
├── static-report.json    # 静态审计报告（JSON 格式）
├── static-report.md      # 静态审计报告（Markdown 格式）
├── failures/             # E2E 测试失败详情
│   └── <examId>/
│       └── <questionId>.json
├── playwright-report/    # Playwright HTML 报告
└── test-results/         # Playwright 测试结果
```

## 使用命令

### 只运行静态审计（推荐）

```bash
npm run audit:question-nav:static
```

静态审计会在几秒内完成，扫描所有 217 篇考试 2917 道题目的导航锚点。

### 运行完整审计（静态 + E2E）

```bash
npm run audit:question-nav
```

**注意**: E2E 测试需要 dev server 正常运行。如果 E2E 测试失败，请检查：
1. Dev server 是否在运行：`npm run dev:web`
2. 浏览器控制台是否有 JavaScript 错误
3. Playwright 浏览器是否正确安装：`npx playwright install chromium`

## 失败原因类型

| 原因 | 说明 |
|------|------|
| `NO_TARGET` | 找不到目标元素 |
| `TARGET_NOT_VISIBLE` | 目标元素不在可视区域内 |
| `NO_SCROLL` | 点击后滚动位置未变化 |
| `WRONG_TARGET` | 跳转到错误的目标 |
| `PAGE_LOAD_TIMEOUT` | 页面加载超时 |

## 报告格式

每条失败记录包含：
- `examId`: 考试 ID
- `title`: 考试标题
- `questionId`: 题目 ID
- `displayNumber`: 题号显示
- `reason`: 失败原因
- `targetSelector`: 目标元素选择器
- `scrollBefore`: 点击前滚动位置
- `scrollAfter`: 点击后滚动位置
- `screenshotPath`: 截图路径（如有）

## Current Status

### Static Audit

**Status**: Passing

- 总考试数：217
- 总题目数：2917
- 通过率：100%

### E2E 测试

**Status**: Passing

E2E 测试验证问题导航点击后能正确滚动到目标元素。

**测试覆盖**:
- p1-low-02 (13 题) - 通过
- p1-high-01 (13 题) - 通过

**修复内容**:
- `questionScanner.ts` - 修复 `estimateTotalQuestions` 函数中 `htmlPath` 可能为 undefined 的问题
- `PracticeNodeRenderer.vue` - `highlightSegments` 函数添加防御性检查
- `useReadingPracticeSession.ts` - `markedQuestions`/`highlights` undefined 处理
- `PracticeMode.vue` - 多个 computed 属性和函数添加空值检查
- `readingPractice.ts` - `collectAnswers`/`buildQuestionGroupMeta` 使用可选链访问
- `main.ts` - 添加全局错误处理器便于调试
- `question-nav.audit.spec.ts` - 修复导航选择器，使用 `.nav-shell .nav-item` 而非 `.nav-item`

## CI/CD 集成

在 CI 环境中运行：

```bash
# 安装依赖
npm install

# 安装 Playwright 浏览器
npx playwright install chromium

# 启动 dev server
npm run dev:web &

# 等待 server 启动
sleep 5

# 运行完整审计
npm run audit:question-nav
```

## 日常开发建议

1. 修改题库生成脚本后：先运行 `audit:question-nav:static`
2. 修复跳转逻辑后：运行完整 `audit:question-nav`
3. 日常开发：只跑静态审计即可

## 故障排查

### E2E 测试失败

1. **页面加载超时**: 检查 dev server 是否正常运行
2. **JavaScript 错误**: 在实际浏览器中打开页面查看控制台
3. **找不到目标元素**: 检查 `data-question` 和 `data-nav-target` 属性是否正确渲染

### 静态审计失败

1. 查看 `output/question-nav/static-report.md` 获取详细失败原因
2. 检查对应 exam JSON 文件的 `questionItems` 和 `questionAnchors`
3. 确认 AST 节点中存在对应的 `id` 属性
