# GPT Image2 Prompts

本文件记录本次保守版 UI 细节优化设计稿的最终提示词策略。所有提示词都围绕同一原则：`same layout as reference screenshot`、`visual polish only`、`do not add/remove navigation items`、`do not change practice workflow`、`do not invent metrics or features`。

## 通用约束

- 保持当前页面布局、组件数量、文案和交互入口。
- 只优化颜色、字体层级、阴影、边框、圆角、状态色、按钮质感和轻微间距。
- 使用浅色背景、蓝色主色、Material Icons、轻阴影、8px 左右圆角、清晰边框、可读字号。
- 禁止生成营销页、侧边栏大改版、全新卡片结构、额外菜单、示例假数据、Band 分数、学习报告页。
- 任何 GPT 生成图和当前截图冲突时，以 `current-screenshots/` 和 Vue 代码为准。

## Home

```text
Use case: ui-mockup
Asset type: STRICT conservative responsive UI polish board for an existing Vue IELTS Reading Home page
Input image role: the currently visible Home reference board is the exact screenshot to follow.
Primary request: Create one wide board with three panels labeled exactly like the reference: PC current 1440x1000, Pad current 834x1112, Mobile current 390x844. Preserve the current layout, component count, text, and responsive behavior. Visual polish only.
Same-layout rules: same layout as reference screenshot; visual polish only; do not add/remove navigation items; do not change workflow; do not invent metrics or features; keep all current labels and empty states.
Preserve PC and Pad exactly: top global navigation with text logo "IELTS Reading / Past Papers", nav items 首页总览、民间题库、练习记录、我的成就, and the three right icon buttons; page title 首页总览; four stat cards; welcome card; 最近练习 empty card. Keep the same order and density.
Preserve Mobile exactly: do NOT add brand text, language/theme/GitHub icons, or nav items at the top. The mobile top bar is sparse with only the existing hamburger/menu button at the top right, followed by the 首页总览 title area, vertical stat cards, welcome card, and recent-practice card as shown.
Allowed polish only: cleaner light gray background, slightly deeper existing blue, clearer typography, subtle 8px-ish card radius, fine borders, soft shadows, better muted empty-state icon contrast, button surface polish. Keep Material Icons visual language.
Forbidden drift: no book/logo icon added to the brand, no extra top mobile controls, no new cards, no charts, no fake records, no marketing hero, no sidebars, no gradient orbs, no new CTA, no changed stat values.
```

## Browse

```text
Use case: ui-mockup
Asset type: STRICT conservative responsive UI polish board for an existing Vue IELTS Reading Browse question bank page
Input image role: the currently visible Browse reference board is the exact screenshot to follow.
Primary request: Create one wide board with three panels labeled PC current 1440x1000, Pad current 834x1112, Mobile current 390x844. Preserve the current layout, component count, text, and responsive behavior. Visual polish only.
Same-layout rules: same layout as reference screenshot; visual polish only; do not add/remove navigation items; do not change browsing/practice workflow; do not invent metrics or features; keep all visible question cards and filters.
Preserve PC/Pad exactly: top global navigation with text logo only, active 民间题库 tab, page heading 民间题库, warning note, filter panel with 题目类别 / 出现频率 / 排序方式 / 标题检索, result count "共 218 道题 第 1 / 19 页", page size "12", same grid cards and pagination. Keep card count and positions similar.
Preserve Mobile exactly: do NOT add brand text, language/theme/GitHub icons, or nav items at the top. The mobile top bar is sparse with only the hamburger/menu button at the top right, then the 民间题库 heading, explanatory text, warning note, stacked filter card, result count and first question card as shown.
Allowed polish only: cleaner borders, subtle card shadow, readable typography, refined blue buttons, better pill/tag contrast, 8px-ish radii, consistent input heights, crisp Material Icons. Keep light background and current density.
Forbidden drift: no new filters, no extra buttons, no sidebars, no fake data, no changed page size, no changed pagination count, no marketing hero, no new card layout, no book/logo icon added to brand, no mobile top control additions.
```

## Practice History

```text
Use case: ui-mockup
Asset type: extremely conservative responsive UI polish board for existing Practice History screenshots
Reference: the currently visible Practice History board is the source of truth. Treat it like a screenshot trace, not a redesign.
Primary request: produce one wide board with PC current 1440x1000, Pad current 834x1112, Mobile current 390x844. The page must look almost identical to the reference, with only subtle visual polish to colors, fonts, borders, shadows, and button treatment.
Exact content constraints:
- PC panel: keep the top nav, page title 练习记录, subtitle 查看你的学习历史和进度, four stat cards, the 练习历史 panel, buttons 导入数据 / 导出数据 / 清空记录, selector 每页显示: 10, simple gray list-pencil Material Icon, text 暂无练习记录, and 开始练习 button.
- Pad panel: keep the same top nav, stat cards arranged exactly as reference, and the complete 练习历史 panel with header, all three action buttons, selector 每页显示: 10, the simple gray list-pencil icon, 暂无练习记录, and 开始练习. Do not make this panel blank.
- Mobile panel: keep the mobile sparse top bar with only the hamburger button at upper right. Do not add brand text or extra icon buttons. Keep the visible vertical stat cards and the top of the 练习历史 card with import control as in the screenshot; no sticky bottom CTA.
Do not change values: all stats remain 0 or 0%, page size remains 10.
Do not invent: no fake rows, no large illustration, no cloud/plant artwork, no charts, no timeline, no report, no extra buttons, no mobile brand/header icons, no page size 20.
Allowed polish only: very light gray background, crisper blue active state, subtle 8px card radii, fine borders, soft shadows, clearer typography, polished small buttons.
```

## Practice Mode

```text
Use case: ui-mockup
Asset type: STRICT conservative responsive UI polish design board for an existing Vue IELTS Reading practice-mode page
Input image role: the currently visible practice-mode reference board is the exact screenshot to follow. Recreate the same page structure and same visible content types; only apply subtle visual polish.
Primary request: Create one wide responsive design board with three labeled panels: PC current 1440x1000, Pad current 834x1112, Mobile current 390x844. It must preserve the current IELTS practice-mode screenshot layout exactly: same app top navigation on PC and Pad, same mobile top menu button, same route title row with back button and "A Brief History of Tea", same fullscreen button, same reading passage and question workflow.
Non-negotiable same-layout rules: same layout as reference screenshot; visual polish only; do not add/remove navigation items; do not change practice workflow; do not invent metrics or features; do not change the question type; do not change the visible information architecture.
Preserve PC reference exactly: top global nav remains visible; below it the back/title row remains; main practice area is a two-column split card with passage on the left and questions on the right; keep the vertical splitter/scrollbars; keep the bottom fixed question number strip with Question label, numbered buttons 1-13, Reset and Submit buttons; keep the AI Assistant floating button.
Preserve question content type exactly: the right panel must show "QUESTIONS", "Single Practice", controls Clear Highlights, Notes, S/M/L, the heading "Questions", "Questions 1-8", instructions about Reading Passage 1 paragraphs A-H, the italic drag instruction, "List of Headings", and pill options like "i. Not enough tea to meet demand", "ii. Religious objections", "iii. In - and sometimes out - of fashion", etc. Do NOT show fill-in-the-blank summary questions. Do NOT show answer choices chips such as Buddhist/drinking water/Japanese. Do NOT show Questions 1-5.
Preserve Pad reference exactly: top global nav remains visible; back/title/fullscreen row; content is stacked with the full passage card visible first; floating AI button; no bottom question panel visible in this top-of-page screenshot.
Preserve Mobile reference exactly: small top bar with menu button, back/title row, single passage card first, large readable article text, floating AI Assistant button at the right; do not add a Questions card in the visible mobile first screen.
Allowed visual polish only: cleaner light background, slightly stronger blue active state, better font hierarchy, subtle card borders, 8px-ish radii, soft shadows, clearer focus outlines, polished chip borders, improved scrollbar styling, crisp Material Icons. Keep existing Chinese/English text positions and density.
Forbidden drift: no Passage/Questions tabs; no Band score; no result summary; no new top toolbar labels like "Single Practice" in the header; no invented notes side panel if not in screenshot; no new bottom dock; no answer-choice summary layout; no dashboard cards; no marketing hero; no fake metrics; no changed article/question structure.
```

## Achievements

```text
Use case: ui-mockup
Asset type: STRICT conservative responsive UI polish board for an existing Vue IELTS Reading My Achievements page
Input image role: the currently visible Achievements reference board is the exact screenshot to follow.
Primary request: Create one wide board with three panels labeled PC current 1440x1000, Pad current 834x1112, Mobile current 390x844. Preserve the current layout, component count, text, card grid, and responsive behavior. Visual polish only.
Same-layout rules: same layout as reference screenshot; visual polish only; do not add/remove navigation items; do not change achievement workflow; do not invent metrics or features.
Preserve PC/Pad exactly: top global navigation with text logo only, active 我的成就 tab, page heading 我的成就, subtitle 查看你解锁的徽章和荣誉。, summary card 0/22 已解锁, achievement cards with locked state, rarity tags, point chips, and lock status. Keep PC four-column grid and Pad two-column grid.
Preserve Mobile exactly: do NOT add brand text, language/theme/GitHub icons, or nav items at the top. The mobile top bar is sparse with only the hamburger/menu button at the top right, followed by 我的成就 heading, subtitle, 0/22 summary card, and single-column achievement cards as shown.
Allowed polish only: cleaner light background, subtle card borders, soft shadows, 8px-ish radii, refined muted icon tile colors, clearer tag contrast, better typography and spacing inside the same card structure.
Forbidden drift: no filters, no tabs, no new summary stats, no progress charts, no unlocked dates, no new achievements, no changed card count, no sidebar, no marketing hero, no book/logo icon added to brand, no extra mobile top controls.
```

## 404

```text
Use case: ui-mockup
Asset type: conservative responsive UI polish design board for an existing Vue IELTS Reading app
Input image role: the currently visible 404 reference board is the exact layout and content reference.
Primary request: Create one wide responsive design board for the 404 Not Found page with three labeled panels: PC 1440x1000, Pad 834x1112, Mobile 390x844. The design must be the same layout as reference screenshot and visual polish only.
Strict invariants: same layout as reference screenshot; visual polish only; do not add/remove navigation items; do not change navigation workflow; do not invent metrics or features; do not add breadcrumbs, search boxes, help links, cards, sidebars, extra buttons, illustrations, mascot art, large decorative backgrounds, or marketing content.
Preserve content and structure: keep the simple centered empty page, the existing sad face Material Icon style, large "404", subtitle "页面未找到", and a single blue "首页总览" button with home icon. Keep the same approximate vertical centering and responsive scale across PC, Pad, and Mobile.
Allowed polish only: refine typography weight and line-height, use a cleaner app-blue button color, slightly softer button radius around 8px, clearer icon stroke/color, subtle focus-ready button surface, very light neutral background if needed, and better spacing between icon/title/subtitle/button while preserving the current simple layout.
Forbidden visual drift: no extra navigation bars, no card container, no full illustration, no gradient blobs, no purple theme, no fake links, no recovery suggestions, no changed copy, no additional CTAs. Text may be approximated visually but must not imply new functionality.
```
