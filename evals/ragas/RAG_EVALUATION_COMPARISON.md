# RAG 评测对比：基线（仅 LLM） vs 混合检索（嵌入 + Qdrant）

本文档由 `evals/ragas/scripts/compare_eval_summaries.py` 根据两份 `evaluation_summary.json` 自动生成。

## 输入文件

- **基线（无 Qdrant / 无向量语义检索）**：`reports/baseline_llm_only_no_qdrant/evaluation_summary.json`
- **本次（当前配置，含嵌入 + Qdrant）**：`reports/eval_hybrid_qdrant_20260406/evaluation_summary.json`
- 基线时间戳：`2026-04-06T01:04:07.961557`
- 本次时间戳：`2026-04-06T17:21:21.308309`

## 汇总对比表


| 指标                    | 基线      | 本次      | 差值（本次 − 基线） |
| --------------------- | ------- | ------- | ----------- |
| Question hit rate     | 2.94%   | 2.94%   | 0.00%       |
| Avg noise penalty     | 0.0241  | 0.0258  | 0.0018      |
| Heading list hit rate | 100.00% | 100.00% | 0.00%       |
| Avg answer score      | 0.8847  | 0.8891  | 0.0044      |
| Style match rate      | 75.91%  | 81.02%  | 5.11%       |
| 成功请求平均延迟 (ms)         | 1156.4  | 4384.5  | 3228.2      |
| API 失败数               | 4       | 4       | 0           |
| Style violations 条数   | 54      | 44      | -10         |


### Ragas 标准指标

两版 `ragas_metrics` 均为空（例如 Python 3.14 下跳过 Ragas LLM 评分）时，**无法对比** faithfulness / context_precision 等。

## 解读（按类别）

### 明显提升或改善

- Style match rate 75.91% → 81.02%
- Style violations：54 → 44 条

### 基本持平

- Question hit rate 2.94% → 2.94%（持平，阈值 ±0.005）
- Avg noise penalty 0.0241 → 0.0258（持平）
- Heading list hit rate 100.00%（不变）
- Avg answer score（基本持平）
- Assistant 路由分布与基线一致（`page_grounded` / `unrelated_chat` / `ielts_general` 计数相同）。
- 检索侧参与/跳过条数与基线一致。

### 需关注或下降

- 成功请求平均延迟明显增加：1156.4 ms → 4384.5 ms（混合检索与向量调用可能拉长尾延迟，需结合体验单独评估）。

## HTTP 失败样本

基线与本次均为 **4** 条失败（HTTP 400），与 Golden 中部分题型请求体验证有关；混合检索未改变该结果。

## 说明

- 可比性：同一 `golden_samples.json`、同一评测脚本。
- 若 `question_hit_rate` 与路由分布不变，常见原因是：语义召回未改变「证据命中」判定所需块，或路由仍以 `page_grounded` / `unrelated_chat` 为主。
- 灌库版本、集合名与 `QDRANT_`* 应与题库一致，否则语义层可能贡献有限。

