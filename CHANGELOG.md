# 版本说明 / Changelog

## v2.0.5 - 2026-05-17

### 中文说明

#### 1. 修复大字号拖拽答题

修复 `p1-high-01` 在 L 字号下 q9-13 国家选项与题目难以稳定同屏的问题，匹配题选项改用应用层 pointer 拖拽，并加入题区自动滚动和释放命中兜底，提升独立滚动题区内的拖放稳定性。

#### 2. 原文支持可点击 Note 标记

Note 现在会绑定到具体原文选区，保存后在原文中显示暖色标记，点击即可查看、编辑或删除该条 Note；没有 Note 的旧高亮记录仍按普通高亮兼容显示。

#### 3. 统一首页交互并约束提交格式

统一首页四个统计卡片的 hover 箭头反馈，并新增 Conventional Commits 提交格式校验，后续提交会通过 commit-msg hook 保持版本历史格式一致。

### English Notes

#### 1. Fixed Large-Font Drag Answers

Fixed the `p1-high-01` large-font case where q9-13 country options and drop targets could not stay reliably visible together, replacing fragile native drag behavior with pointer-based dragging, pane auto-scroll, and drop fallback targeting.

#### 2. Added Clickable In-Passage Note Markers

Notes now bind to the selected passage range and render as warm clickable markers in the original text, allowing users to view, edit, or delete the note while preserving compatibility with older plain highlights.

#### 3. Unified Home Hover Feedback and Commit Rules

Unified the hover arrow feedback across all four Home statistic cards and added Conventional Commits enforcement through a commit-msg hook so future history keeps the established release format.

## v2.0.4 - 2026-05-11

### 中文说明

#### 1. 修复深色模式视觉问题

修复浏览题库、顶部导航、移动菜单、PDF 按钮、筛选控件、分页与标签在深色模式下残留浅色背景或低对比文字的问题，统一改用主题语义变量。

#### 2. 完善中英文与响应式样式

核对中文、英文、浅色、深色在 PC 与移动端的展示，优化按钮、卡片、状态标签、成就徽章和 404 页的主题一致性，避免横向溢出。

#### 3. 补充保守版 UI 设计资料

新增保守版 UI polish 参考资料、当前截图、GPT image2 提示词和实现验证截图，保留页面结构和答题流程不变，方便后续继续做视觉细节优化。

### English Notes

#### 1. Fixed Dark Mode Visual Issues

Fixed light-background and low-contrast leftovers in Browse, the main header, mobile menu, PDF buttons, filters, pagination, and status tags by moving them to semantic theme variables.

#### 2. Improved Bilingual Responsive Styling

Reviewed Chinese and English layouts across light and dark themes on desktop and mobile, polishing buttons, cards, status tags, achievement badges, and the 404 page while avoiding horizontal overflow.

#### 3. Added Conservative UI Polish References

Added conservative UI polish references, current screenshots, GPT image2 prompts, and implementation verification screenshots while preserving existing page structure and practice workflows.

## v2.0.3 - 2026-04-23

### 中文说明

#### 1. 高亮改为按选区精确回放

练习页高亮从“按词条全文匹配”改为“按当次选区范围锚定”，同一个单词在文章中多次出现时，只会高亮用户当时选中的那一处，并可在复盘时准确回放。

#### 2. 练习记录支持进入复盘页

练习记录列表与首页最近练习卡片都可直接进入 `review` 模式，恢复该次作答快照、标记题目与历史高亮，便于回看思路和定位失分点。

#### 3. 补充兼容与回归验证

兼容旧版仅保存文本内容的高亮记录，对缺少 `resultSnapshot` 的旧练习记录给出不可复盘提示；同时补充存储归一化、范围高亮与复盘入口的测试与真实页面回归验证。

### English Notes

#### 1. Anchored Highlight Replay

Practice highlights now anchor to the exact selection range instead of globally matching the same word everywhere in the passage, so review mode replays only the originally selected occurrence.

#### 2. Review Entry from Practice History

Both the practice history list and the latest-practice cards on Home can now open `review` mode, restoring that attempt's answers, marked questions, and saved highlights for post-practice review.

#### 3. Compatibility and Regression Coverage

Legacy text-only highlight records remain supported, older records without `resultSnapshot` now surface a clear unavailable-review state, and regression coverage was added for normalization, anchored replay, and review entry flows.

## v1.0.0 - 2026-03-09

### 中文说明

#### 1. 第一个正式版本

第一个正式版本，主体功能完成。

### English Notes

#### 1. First Official Release

This is the first official release, with the core functionality completed.

## v2.0.0 - 2026-04-08

### 中文说明

#### 1. 题目更新

更新并扩充雅思阅读题库，补充新的题目内容，持续优化题库数据与索引覆盖，方便更高效地检索与练习。

#### 2. 重构解析和做题页面

重构阅读解析页与做题页，统一练习流程，优化题目渲染、交互体验与响应式布局，提升整体做题效率与阅读体验。

#### 3. 加入 AI 助教

在练习场景中加入 AI 助教，支持提示、思路讲解、错题复盘等学习辅助能力，帮助用户更高效地理解题目与完成复习。

### English Notes

#### 1. Question Bank Updates

Updated and expanded the IELTS reading question bank with new content, while continuing to improve data quality and index coverage for faster search and practice.

#### 2. Refactored Explanations and Practice Pages

Refactored the explanation and practice pages with a more unified workflow, better item rendering, smoother interactions, and improved responsive layouts.

#### 3. Added AI Coach

Added an AI coach to practice sessions, with support for hints, reasoning walkthroughs, and mistake review to help users understand questions and revise more efficiently.

## v2.0.1 - 2026-04-15

### 中文说明

#### 1. 切换 OpenRouter 免费模型

将 AI 助教默认 LLM 运行时切换到 OpenRouter 免费模型路由器 `openrouter/free`，同步更新 Render 与示例配置，并保留旧 Coding Plan provider 兼容。

#### 2. 修复填空题提交异常

修复填空题输入后提交时的事件转发异常，避免 `questionId` 读取失败；同时清洗损坏的本地练习记录，防止旧 `ielts_practice` 数据污染练习历史。

#### 3. 补充回归验证

新增练习记录清洗单测与填空题提交 E2E 回归测试，覆盖损坏本地记录、非法 JSON 与 `p1-high-05` 填空题提交流程。

### English Notes

#### 1. Switched to OpenRouter Free Router

Switched the AI coach default LLM runtime to the OpenRouter free model router `openrouter/free`, updated Render and example configuration, and kept the legacy Coding Plan provider compatible.

#### 2. Fixed Fill-in Submission Errors

Fixed the event forwarding issue that could break fill-in submissions when reading `questionId`, and sanitized damaged local practice history so stale `ielts_practice` data no longer pollutes recent practice records.

#### 3. Added Regression Coverage

Added practice-history sanitization unit tests and a fill-in submission E2E regression test covering damaged local records, malformed JSON, and the `p1-high-05` fill-in flow.

## v2.0.2 - 2026-04-16

### 中文说明

#### 1. 恢复相似文章推荐卡片

修复“推荐相似题目”在流式接口中退化为普通文本回答的问题，统一复用静态相似文章推荐数据，确保返回 `recommendedQuestions` 并继续支持文章卡片跳转。

#### 2. 优化 AI 助手本地回复可靠性

优化本地 deterministic 回复的置信度与缺上下文提示：缺选项列表时不再高置信，缺原文证据时降为低置信；同时清理 `Qthe current set`、`the cited evidence area附近` 等占位文案。

#### 3. 补充本地评估与回归验证

新增不触发 LLM/RAGAS 指标的 local-only replay 报告入口，并补充相似推荐、缺选项列表、缺原文证据和本地文案的后端回归测试。

### English Notes

#### 1. Restored Similar Passage Recommendation Cards

Fixed the issue where “recommend similar questions” could fall back to a plain text answer in the streaming API, reusing static similar-passage recommendations so `recommendedQuestions` is returned for clickable passage cards.

#### 2. Improved Local AI Assistant Reliability

Improved confidence gating and missing-context messaging for deterministic local replies: missing option lists no longer produce high confidence, missing passage evidence is downgraded to low confidence, and placeholder wording such as `Qthe current set` and `the cited evidence area附近` has been removed.

#### 3. Added Local Evaluation and Regression Coverage

Added a local-only replay report mode that does not invoke LLM/RAGAS metrics, plus backend regression coverage for similar recommendations, missing option lists, missing passage evidence, and local fallback wording.
