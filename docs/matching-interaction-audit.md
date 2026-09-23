# 匹配题交互结构排查（2026-09-23）

只读扫描原生题库 JSON；没有修改题库、渲染器或评分逻辑。

范围：217 个题库记录，208 个符合当前完整模考候选条件。扫描 questionGroups 的 leadNodes 和 contentNodes，按人名匹配／句尾匹配说明文字识别，递归检查 optionChip 与原始输入控件。这是静态结构排查，不是全库人工视觉验收；相同文章的不同 ID 分别计数，也不包括全部标题匹配、段落信息匹配和摘要词库题。

全库识别 71 个相关题组（71 个记录），23 个未生成拖动选项。当前完整模考候选中识别 65 个相关题组，其中 19 个没有拖动选项：人名匹配 10 个，句尾匹配 9 个。占相关题组约 29.2%，占候选文章约 9.1%。其余题组有 optionChip，不代表所有交互和布局均已人工验收。

根因：原始结构采用 radio、select、textInput；生成脚本只把特定类名转换为 optionChip/dropzone。另有多种题型混在一个 questionGroup 中，不能只靠 kind 批量转换。Pacific Navigation 与 multitasking 的字母答案存在，但选项列表缺少可见字母，不能直接假定所有类似数据都可以无条件按顺序补字母。

## 当前模考候选内的疑似不一致清单

| ID | 标题 | 类别 | 当前控件 |
|---|---|---|---|
| p2-low-135 | Skyscraper Farming | people | 单选 |
| p1-low-35 | Sweet Trouble | people | 单选 |
| p2-low-051 | The dingo debate _ | people | 单选 |
| p3-low-158 | Game theory | endings | 单选 |
| p3-high-170 | Pacific Navigation and Voyaging | endings | 文字输入 |
| p3-low-165 | Let’s teach them how to teach | endings | 文字输入 |
| p3-high-161 | Insect-inspired robots | people | 单选 |
| p3-low-153 | Crossing the Threshold | endings | 文字输入 |
| p3-medium-183 | The hazards of multitasking | people | 混合（需拆分识别） |
| p2-medium-146 | The Tasmanian Tiger | people | 单选 |
| p2-medium-058 | Who wrote Shakespeare's plays | people | 单选 |
| p3-low-172 | Rebranding art museums | endings | 文字输入 |
| p3-high-180 | The fluoridation controversy | endings | 文字输入 |
| p2-low-222 | Ideal Homes | people | 下拉 |
| p3-high-159 | Grimm’s Fairy Tales | endings | 单选 |
| p2-high-120 | A new look for Talbot Park | people | 单选 |
| p2-low-147 | Who wrote Shakespeare's plays | people | 单选 |
| p3-high-178 | The benefits of learning an instrument | endings | 文字输入 |
| p3-low-74 | The Placebo Effect5 | endings | 下拉 |

## 修复评估

建议只在模考呈现层适配：有明确选项字母和范围的先转换，答案仍写入原字段；题组混合、标签缺失的少数记录做明确映射。需要验证选项可重复使用、字母评分、刷新恢复、跨篇隔离。不要将所有单选或填空统一改为拖拽。


## 修复完成

上述 19 个记录现已通过 `src/utils/examMatching.ts` 和显式核对的 `examMatchingSpecs.ts` 在模考加载时适配为选项卡片和拖动答题区，普通练习仍使用原始结构。没有改写生成题库、原答案或题号。

选项顺序缺少可见字母的五个记录已对照仓库 PDF：Pacific Navigation、Crossing the Threshold、The fluoridation controversy、The benefits of learning an instrument、The hazards of multitasking。反向人名匹配保留观点或机器人选项的语义。允许重复使用的三个记录保留重复规则；混合 multitasking 只替换前五题。旧草稿和复盘中的字母答案会恢复为完整选项标签。

验收：19 个真实记录均检查字段转换、答案恢复、评分、选项复用/移动与非目标题型不变；真实 PracticeMode 路由测试确认仅模考适配。Chrome 实测 Pacific 选项 C 拖入第 37 题并刷新恢复；multitasking 选项 B 可同时用于 27、30，后续单选和摘要填空保留。截图见 [matching-repaired.png](exam-preview/matching-repaired.png)。
