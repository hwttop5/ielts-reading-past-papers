# IELTS Reading 助手 RAG 离线评测报告（混合检索：嵌入 + Qdrant）

本文档与 [RAG_EVALUATION_BASELINE_REPORT.md](RAG_EVALUATION_BASELINE_REPORT.md) 对称，记录 **同一 Golden 数据集** 在 **`llm-enabled-hybrid-retrieval`**（向量语义检索可用）下的一次全量评测。与基线的数值差异见 [RAG_EVALUATION_COMPARISON.md](RAG_EVALUATION_COMPARISON.md)。

| 项目 | 说明 |
|------|------|
| 报告版本 | 混合检索 v1 |
| 评测时间 | 2026-04-06（见 `evaluation_summary.json` 内 `timestamp`） |
| 数据集 | `evals/ragas/datasets/golden_samples.json`（141 条） |
| 运行环境 | 已配置 **LLM**（`LLM_*`）+ **Qdrant**（`QDRANT_URL` 等）+ **嵌入端点**（`EMBEDDING_*` 或与 `OPENAI_*` 兼容的配置），并已灌库 |
| 助手模式 | `llm-enabled-hybrid-retrieval`（确定性上下文 + 语义召回 + LLM） |

---

## 1. 执行摘要

| 指标 | 数值 |
|------|------|
| 总样本数 | 141 |
| API 成功 | 137 |
| API 失败 | 4（HTTP 400，见第 4 节） |
| 成功请求平均延迟 | **约 4385 ms** |

### 1.1 检索质量（自定义指标）

| 指标 | 数值 | 说明 |
|------|------|------|
| Question hit rate | **2.94%** | 与基线相同；语义层未改变本批样本上的证据命中判定 |
| Avg noise penalty | **0.026** | 相对基线略升（见对比文档，仍在「持平」阈值内） |
| Heading list hit rate | **100%** | heading_matching（5/5） |
| 参与检索统计条数 | 102 | |
| 跳过证据类指标条数 | 35 | |

**Assistant 路由分布（成功样本）**：`page_grounded` 103，`unrelated_chat` 33，`ielts_general` 1（与基线一致）。

### 1.2 答案质量（自定义指标）

| 指标 | 数值 |
|------|------|
| Avg answer score | **0.889** |
| Style match rate | **81.0%** |
| Style violations | **44** 条（明细见 `evaluation_summary.json`） |

### 1.3 Ragas 标准指标

本次运行环境为 **Python 3.14** 时，Ragas LLM 评分仍**跳过**，详见 `ragas_*_skipped.txt`。与基线相同，**不包含** faithfulness / context_precision 等聚合分；若需对比 Ragas，请使用 Python 3.12/3.13 重跑。

---

## 2. 产物路径

| 类型 | 相对仓库根路径 |
|------|----------------|
| 汇总 JSON | `evals/ragas/reports/eval_hybrid_qdrant_20260406/evaluation_summary.json` |
| Replay | `evals/ragas/reports/eval_hybrid_qdrant_20260406/replay_20260406_171754.jsonl` |
| 同次简要 MD | `evals/ragas/reports/eval_hybrid_qdrant_20260406/EVALUATION_REPORT.md` |
| **与基线对比** | `evals/ragas/RAG_EVALUATION_COMPARISON.md` |

---

## 3. 如何复现本次混合检索评测

```bash
cd evals/ragas
python run_eval.py --all --dataset datasets/golden_samples.json --output reports/eval_hybrid_qdrant_20260406 --concurrency 3
```

跑前请确认 `GET http://127.0.0.1:8787/health` 中 `assistantRuntimeMode` 为 `llm-enabled-hybrid-retrieval` 且 `semanticSearchConfigured` 为 `true`。

---

## 4. 已知问题（失败样本）

与基线相同，以下 4 条返回 **HTTP 400**：

- `paragraph_matching_single`
- `true_false_not_given_single`
- `multiple_choice_single`
- `summary_completion_single`

---

## 5. 与基线对比的结论摘要

- **明显改善**：Style match rate 与 Style violations 条数（见对比文档）。
- **基本持平**：Question hit、Heading list hit、路由分布、检索参与条数；Avg noise penalty 略升但在脚本阈值内记为持平。
- **需关注**：成功请求平均延迟相对基线显著增加（混合检索与嵌入调用成本）。

完整差分表与自动解读见 [RAG_EVALUATION_COMPARISON.md](RAG_EVALUATION_COMPARISON.md)。

---

*指标定义见 `evals/ragas/README.md`。对比表可由 `python scripts/compare_eval_summaries.py` 重新生成。*
