# Ragas 评估框架

> 本目录的执行约束、命令使用规则和 Python 版本策略由同目录 [`AGENTS.md`](./AGENTS.md) 维护。

本目录包含 IELTS 阅读助教的离线评估工具。

## 工作流

当前评估流程分为四个明确阶段：

1. 数据集预检
2. 实时执行或加载 replay
3. 离线打分
4. 生成报告

无效数据样本，例如未知 `questionId`，会在打分前被分类，并从主统计分母中排除。

## Python 版本策略

- 官方运行版本：Python 3.13
- Python 3.14+：仅允许用于 degraded runs
- 在 Python 3.14+ 下，除非显式设置 `RAGAS_FORCE=1`，否则跳过 RAGAS LLM 指标

运行摘要会记录当前运行是 `full` 还是 `degraded`。

## 安装

```bash
cd evals/ragas
uv venv
.venv\Scripts\activate
uv pip install -r requirements.txt
```

## 命令

### 针对助教 API 执行完整评估

```bash
cd evals/ragas
python run_eval.py --all
```

该命令会写出：

- `replay_*.jsonl`
- `evaluation_summary.json`
- `EVALUATION_REPORT.md`

### 对历史 replay 重新打分

```bash
python run_eval.py --replay reports/replay_YYYYMMDD_HHMMSS.jsonl
python run_eval.py --replay reports/replay_YYYYMMDD_HHMMSS.jsonl --retrieval
python run_eval.py --replay reports/replay_YYYYMMDD_HHMMSS.jsonl --answers
```

### 运行 style regression 子集

```bash
python scripts/build_style_regression_dataset.py
python run_eval.py --all --dataset datasets/style_regression_samples.json
```

也可以直接从主 golden dataset 中筛选 style：

```bash
python run_eval.py --replay reports/replay_YYYYMMDD_HHMMSS.jsonl --styles vocab_paraphrase,paragraph_focus,full_tutoring
```

### 仅做数据集审计

```bash
python dataset_audit.py
```

### 基于真实运行摘要生成报告

```bash
python report_from_run.py reports/some_run/evaluation_summary.json
```

### 旧别名

```bash
python generate_report.py
```

`generate_report.py` 现在只是 `dataset_audit.py` 的包装器，不再生成静态的“expected performance”结论。

### 对比两个真实运行摘要

```bash
python scripts/compare_eval_summaries.py \
  --baseline reports/baseline/evaluation_summary.json \
  --new reports/current/evaluation_summary.json
```

## 摘要 Schema

`evaluation_summary.json` 当前包含：

- `valid_samples`
- `invalid_samples`
- `unsupported_samples`
- `sample_status_counts`
- `metric_denominators`
- `by_question_type`
- `by_route`
- `by_style`
- `semantic_retrieval`
- `environment`

replay 行当前包含：

- `sample_status`
- `unsupported_reason`
- `response_kind`
- `assistant_route`
- `timings`
- `deterministic_chunk_count`
- `semantic_chunk_count`
- `cache_hit`

## 单元测试

```bash
python test_heading_matching.py -v
python test_eval_helpers.py
```
