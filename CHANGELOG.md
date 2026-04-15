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
