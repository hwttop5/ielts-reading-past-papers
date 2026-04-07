# Ragas Evaluation Framework

This directory contains the offline evaluation tooling for the IELTS Reading assistant.

## Workflow

The evaluation flow now has four explicit stages:

1. Dataset preflight
2. Live execution or replay loading
3. Offline scoring
4. Report generation

Invalid dataset samples, such as unknown `questionId` values, are classified before scoring and excluded from the primary denominator.

## Python Version Policy

- Official runs: Python 3.13
- Python 3.14+: allowed for degraded runs only
- On Python 3.14+, RAGAS LLM metrics are skipped unless `RAGAS_FORCE=1` is set

The run summary records whether the run was `full` or `degraded`.

## Setup

```bash
cd evals/ragas
uv venv
.venv\Scripts\activate
uv pip install -r requirements.txt
```

## Commands

### Full run against the assistant API

```bash
cd evals/ragas
python run_eval.py --all
```

This writes:

- `replay_*.jsonl`
- `evaluation_summary.json`
- `EVALUATION_REPORT.md`

### Score a prior replay

```bash
python run_eval.py --replay reports/replay_YYYYMMDD_HHMMSS.jsonl
python run_eval.py --replay reports/replay_YYYYMMDD_HHMMSS.jsonl --retrieval
python run_eval.py --replay reports/replay_YYYYMMDD_HHMMSS.jsonl --answers
```

### Run a style regression subset

```bash
python scripts/build_style_regression_dataset.py
python run_eval.py --all --dataset datasets/style_regression_samples.json
```

Or filter styles directly from the main golden dataset:

```bash
python run_eval.py --replay reports/replay_YYYYMMDD_HHMMSS.jsonl --styles vocab_paraphrase,paragraph_focus,full_tutoring
```

### Dataset audit only

```bash
python dataset_audit.py
```

### Generate a report from a real run summary

```bash
python report_from_run.py reports/some_run/evaluation_summary.json
```

### Legacy alias

```bash
python generate_report.py
```

`generate_report.py` is now only a wrapper to `dataset_audit.py`. It no longer generates static “expected performance” conclusions.

### Compare two real run summaries

```bash
python scripts/compare_eval_summaries.py \
  --baseline reports/baseline/evaluation_summary.json \
  --new reports/current/evaluation_summary.json
```

## Summary Schema

`evaluation_summary.json` now includes:

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

Replay rows now include:

- `sample_status`
- `unsupported_reason`
- `response_kind`
- `assistant_route`
- `timings`
- `deterministic_chunk_count`
- `semantic_chunk_count`
- `cache_hit`

## Unit Tests

```bash
python test_heading_matching.py -v
python test_eval_helpers.py
```
