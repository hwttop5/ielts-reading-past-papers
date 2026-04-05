# IELTS Reading 助手 RAG 离线评测基线报告

本文档随仓库维护，记录 **Golden 数据集** 上的一次完整基线评测结果，便于与后续「嵌入模型 + Qdrant」配置完成后的复跑结果对比。


| 项目   | 说明                                                            |
| ---- | ------------------------------------------------------------- |
| 报告版本 | 基线 v1                                                         |
| 评测时间 | 2026-04-06（见 `evaluation_summary.json` 内 `timestamp`）         |
| 数据集  | `evals/ragas/datasets/golden_samples.json`（141 条）             |
| 运行环境 | 仅配置 **LLM API**（`LLM_*`）；**未**单独配置嵌入专用 key；**未**配置 **Qdrant** |
| 助手模式 | `llm-enabled`（无向量语义检索时的混合确定性上下文 + LLM）                        |


---

## 1. 执行摘要


| 指标       | 数值                 |
| -------- | ------------------ |
| 总样本数     | 141                |
| API 成功   | 137                |
| API 失败   | 4（HTTP 400，见第 4 节） |
| 成功请求平均延迟 | **约 1156 ms**      |


### 1.1 检索质量（自定义指标）


| 指标                    | 数值        | 说明                                           |
| --------------------- | --------- | -------------------------------------------- |
| Question hit rate     | **2.94%** | 在具备可评估证据的样本上，检索是否命中预期证据                      |
| Avg noise penalty     | **0.024** | 噪声惩罚（越低越好，0～1）                               |
| Heading list hit rate | **100%**  | heading_matching 题型中 heading list 检索成功率（5/5） |
| 参与检索统计条数              | 102       | 有证据约束且未跳过                                    |
| 跳过证据类指标条数             | 35        | 无证据 / 通用闲聊等按规则跳过                             |


**Assistant 路由分布（成功样本）**：`page_grounded` 103，`unrelated_chat` 33，`ielts_general` 1。

### 1.2 答案质量（自定义指标）


| 指标               | 数值                                      |
| ---------------- | --------------------------------------- |
| Avg answer score | **0.885**（约 0～1）                        |
| Style match rate | **75.9%**                               |
| Style violations | **54** 条（明细见 `evaluation_summary.json`） |


### 1.3 Ragas 标准指标（faithfulness、context_precision 等）

本次评测在 **Python 3.14** 下对 Ragas LLM 评分器做了**自动跳过**（与 `nest_asyncio` 执行器不兼容）。因此本基线 **不包含** Ragas 四项聚合分数。

- 说明文件：`evals/ragas/reports/baseline_llm_only_no_qdrant/ragas_retrieval_skipped.txt`、`ragas_answer_skipped.txt`
- 若需随仓库提交完整 Ragas 分数：建议使用 **Python 3.12/3.13** 虚拟环境重跑 `run_eval.py`，或按评测脚本说明设置 `RAGAS_FORCE=1`（不推荐在未验证环境下用于正式对比）

---

## 2. 产物路径（便于复核与对比）


| 类型              | 相对仓库根路径                                                                        |
| --------------- | ------------------------------------------------------------------------------ |
| 汇总 JSON         | `evals/ragas/reports/baseline_llm_only_no_qdrant/evaluation_summary.json`      |
| Replay（可离线重算指标） | `evals/ragas/reports/baseline_llm_only_no_qdrant/replay_20260406_010311.jsonl` |
| 同次生成的简要 MD      | `evals/ragas/reports/baseline_llm_only_no_qdrant/EVALUATION_REPORT.md`         |


> 若 `reports/` 下存在更新时间的 `replay_*.jsonl`，以**最新一次全量评测**对应的 `evaluation_summary.json` 为准。

---

## 3. 如何复现本基线（或跑对比实验）

1. 启动助手 API（默认 `http://127.0.0.1:8787`），并在 `server/.env` 中配置 `**LLM_API_KEY`** 等（与本次基线一致即可）。
2. 在仓库根目录或 `evals/ragas` 下执行：

```bash
cd evals/ragas
python run_eval.py --all --dataset datasets/golden_samples.json --output reports/baseline_llm_only_no_qdrant --concurrency 3
```

1. 配置好 **嵌入 + Qdrant** 后，建议**更换输出目录**以免覆盖基线，例如：

```bash
python run_eval.py --all --dataset datasets/golden_samples.json --output reports/baseline_with_qdrant --concurrency 3
```

评测请求会携带 `X-Assistant-Eval: 1`，服务端对该头**不计入**常规定时限流，便于本地全量跑分。

---

## 4. 已知问题（失败样本）

以下 4 条样本在本次运行中返回 **HTTP 400**（请求体验证未通过），**不计入**成功样本与答案/检索的常规统计：

- `paragraph_matching_single`
- `true_false_not_given_single`
- `multiple_choice_single`
- `summary_completion_single`

后续可通过调整 Golden 样本字段或放宽服务端 `assistant` 路由校验来修复，不影响本报告其余 137 条成功样本的结论。

---

## 5. 与后续实验对比时的建议

1. 保留本文件及 `evaluation_summary.json`，新实验使用**新目录名**保存输出。
2. 优先对比：**Question hit rate**、**avg_noise_penalty**、**style match rate**、**平均延迟**；若 Ragas 在 Python 3.12/3.13 下跑通，再增加 **faithfulness / context_precision / context_recall / answer_relevancy**。
3. 差异来源预期：启用 Qdrant 后，检索阶段可能增加**语义召回块**，从而改变 question hit、噪声与 Ragas 上下文类指标。

---

*本报告由评测流水线生成数据整理，指标定义见 `evals/ragas/README.md`。*