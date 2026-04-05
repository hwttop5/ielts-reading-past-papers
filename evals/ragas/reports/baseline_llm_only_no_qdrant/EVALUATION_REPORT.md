# IELTS Reading 助手 RAG 评测报告

**生成时间**: 2026-04-06T01:04:07.961557

## 运行配置说明

本次为 **基线**：仅配置 **LLM API**（`LLM_*`），未单独配置嵌入专用 key；**未配置 Qdrant**（向量语义检索未启用）。助手运行时为 `llm-enabled`，检索以题号/段落等确定性上下文为主。

**Ragas LLM 指标**：当前 Python 为 3.14 时已自动跳过（见 `ragas_*_skipped.txt`）；若需 faithfulness / context_precision 等，请用 Python 3.12/3.13 重跑或设置 `RAGAS_FORCE=1` 尝试。

## 样本与请求

- 总样本数: 141
- 成功调用: 137
- 失败调用: 4
- 平均延迟 (ms): 1156.4
- Replay 文件: `reports/baseline_llm_only_no_qdrant\replay_20260406_010311.jsonl`

## 检索质量（自定义指标）

- **Question hit rate**: 2.94%
- **Avg noise penalty**: 0.0241
- **Heading list hit rate**: 100.00%
- 参与统计条数: 102
- 跳过证据类指标条数: 35
- Assistant 路由分布: `{'page_grounded': 103, 'unrelated_chat': 33, 'ielts_general': 1}`

### Ragas 检索阶段指标

（无）

## 答案质量（自定义指标）

- **Avg answer score**: 0.8847
- **Style match rate**: 75.91%
- **Style violations 条数**: 54

### Ragas 答案阶段指标

（无）

## 与后续「嵌入 + Qdrant」对比时建议

- 保留本报告路径与 `evaluation_summary.json`，全量配置后重跑同一命令，对比两项 `question_hit_rate`、Ragas 分数及延迟。
- 若仅开启 Qdrant 而未改评测集，差异主要来自检索上下文是否包含语义召回块。
