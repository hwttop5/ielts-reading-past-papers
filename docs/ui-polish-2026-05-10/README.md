# UI Polish Design Handoff 2026-05-10

这是一套保守版 UI 细节优化设计稿，用于把当前项目页面交给 AI 做样式优化参考。目标不是重做产品，而是在现有 Vue 页面和交互入口基础上，优化颜色、字体层级、边框、阴影、圆角、状态色、按钮质感和少量间距。

旧版大改风格目录 `docs/ui-redesign-2026-05-10/` 已保留，本目录不覆盖旧产物。

## 目录结构

- `current-screenshots/`: 当前项目截图，共 18 张，覆盖 6 个路由和 PC / Pad / Mobile 三端。
- `reference-boards/`: 当前截图拼接参考板，共 6 张，每页一张三端对照。
- `gpt-image2-designs/`: GPT image2 生成的保守版设计板，共 6 张，每页一张三端对照。
- `gpt-image2-prompts.md`: 本次设计稿生成提示词和约束。

## 路由范围

- `/home`
- `/browse`
- `/practice`
- `/practice-mode?id=p1-high-01`
- `/my-achievements`
- `404` 示例路由：`/not-a-real-page`

## 设计板文件

- `gpt-image2-designs/home-responsive-polish-board.png`
- `gpt-image2-designs/browse-responsive-polish-board.png`
- `gpt-image2-designs/practice-history-responsive-polish-board.png`
- `gpt-image2-designs/practice-mode-responsive-polish-board.png`
- `gpt-image2-designs/achievements-responsive-polish-board.png`
- `gpt-image2-designs/not-found-responsive-polish-board.png`

## 可实现的优化

- 统一浅灰页面背景和白色卡片表面。
- 保持现有蓝色主色，但提高按钮、激活态和焦点态的一致性。
- 微调字体层级、字号权重和行高，让标题、正文、辅助说明更清晰。
- 卡片使用细边框、轻阴影和约 8px 圆角。
- 表单控件、按钮、标签、题号按钮保持现有位置，仅优化边框、填充、hover/focus/active 状态。
- 空状态继续使用当前简单 Material Icons 风格，不新增大插画。
- 移动端继续使用当前单列/堆叠结构，不新增顶部工具按钮。

## 不要改的内容

- 不新增路由、导航、筛选项、统计指标、学习报告、Band 分数或模拟数据。
- 不改变题库卡片数量、分页逻辑、题目数量、题型或练习流程。
- 不改 `/practice-mode` 的答题主布局：PC 保持阅读/题目双栏，Pad 保持当前堆叠逻辑，Mobile 保持当前长页面结构。
- 不新增 Passage / Questions 标签页，不新增底部 dock，不新增结果面板。
- 不把 GPT 图片里的文字误差当作真实文案；以当前 Vue 代码和 `current-screenshots/` 为准。

## GPT 图片使用规则

GPT image2 产物只作为视觉方向参考。实现时请以 `current-screenshots/` 和代码为结构真源，设计板中任何额外图标、错字、错位、缺失控件、虚构入口都不得照搬。

优先照搬这些视觉方向：更干净的蓝色、轻阴影、细边框、清晰文字层级、按钮状态、卡片质感。不要照搬任何不在当前项目代码里的功能或交互。

## 截图环境

本次当前页面截图来自临时 Vite 服务 `http://127.0.0.1:5176`，用于规避不可靠的 `5175` 端口状态。
