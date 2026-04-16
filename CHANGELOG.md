# 版本说明 / Changelog

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
