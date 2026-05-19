# AGENTS.md

本文件仅补充 `evals/ragas/` 目录的局部规则；未提及事项继承仓库根目录 `AGENTS.md`。

## 目录职责

- `run_eval.py`：主评估入口，支持实时调用与 replay 评分
- `dataset_audit.py`：数据集预检
- `report_from_run.py`：根据真实 `evaluation_summary.json` 生成 Markdown 报告
- `scripts/`：辅助对比、回归数据集等脚本
- `reports/` / `results/`：历史评估产物目录

## Python 版本策略

- 官方运行版本：Python 3.13
- Python 3.14+ 仅用于 degraded runs
- 在 Python 3.14+ 下，除非显式设置 `RAGAS_FORCE=1`，否则跳过 RAGAS LLM 指标

## 标准命令

```bash
cd evals/ragas
python run_eval.py --all
python run_eval.py --replay reports/replay_YYYYMMDD_HHMMSS.jsonl
python run_eval.py --replay reports/replay_YYYYMMDD_HHMMSS.jsonl --retrieval
python run_eval.py --replay reports/replay_YYYYMMDD_HHMMSS.jsonl --answers
python dataset_audit.py
python report_from_run.py reports/<run-dir>/evaluation_summary.json
python test_heading_matching.py -v
python test_eval_helpers.py
```

## 输出与报告约束

- 真实运行通常会写出 `replay_*.jsonl`、`evaluation_summary.json`、`EVALUATION_REPORT.md`。
- `report_from_run.py` 默认在同目录生成 `EVALUATION_REPORT.md`，除非显式指定输出路径。
- 报告必须基于真实运行产物生成，不要手写“预期表现”“估算结论”或伪结果。
- 若只做单项 replay 评分并要回写摘要，按 `run_eval.py` 现有参数约束使用 `--merge-summary-from`。
