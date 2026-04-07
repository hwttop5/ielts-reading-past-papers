# RAG Evaluation Comparison

This report compares two real `evaluation_summary.json` artifacts.

- Baseline: `evals/ragas/reports/baseline_llm_only_no_qdrant_full313/evaluation_summary.json`
- New run: `evals/ragas/reports/eval_hybrid_qdrant_20260406_full313/evaluation_summary.json`
- Baseline mode: full
- New mode: full

| Metric | Baseline | New | Delta |
| --- | --- | --- | --- |
| Question hit rate | 45.10% | 45.10% | 0.00% |
| Legacy question hit rate | 2.94% | 2.94% | 0.00% |
| Avg noise penalty | 0.0241 | 0.0258 | 0.0018 |
| Heading list hit rate | 100.00% | 100.00% | 0.00% |
| Avg answer score | 0.8818 | 0.8891 | 0.0073 |
| Style match rate | 75.18% | 81.02% | 5.84% |
| Avg latency (ms) | 1156.3576 | 4384.5305 | 3228.1729 |

## Sample Status

- Baseline valid/invalid/unsupported: 137 / 4 / 0
- New valid/invalid/unsupported: 137 / 4 / 0

## Semantic Retrieval Contribution

- Baseline: hits=0, avg_used=0.00, avg_candidates=0.00, contribution=0.00%, skip_rate=0.00%
- New: hits=0, avg_used=0.00, avg_candidates=0.00, contribution=0.00%, skip_rate=0.00%

## Interpretation

- The new run improved at least one primary effectiveness metric on valid samples.
- Latency increased by 3228.2 ms on successful samples.
- Invalid dataset samples are separated from the primary denominator; compare valid-sample metrics first.
- Semantic retrieval got more expensive without increasing contribution; keep it gated or disabled by default.

## New Run: By Question Type

- `heading_matching`: hit=100.00%, style=100.00%, answer=1.000, valid=5, invalid=0, retrieval_n=5
- `general`: hit=62.12%, style=92.00%, answer=0.984, valid=100, invalid=0, retrieval_n=66
- `paragraph_matching`: hit=0.00%, style=0.00%, answer=0.000, valid=0, invalid=1, retrieval_n=0
- `true_false_not_given`: hit=0.00%, style=0.00%, answer=0.000, valid=0, invalid=1, retrieval_n=0
- `multiple_choice`: hit=0.00%, style=0.00%, answer=0.000, valid=0, invalid=1, retrieval_n=0

## New Run: By Route

- `page_grounded`: hit=45.10%, style=74.76%, answer=0.950, valid=103, invalid=0, retrieval_n=102
- `unrelated_chat`: hit=0.00%, style=100.00%, answer=1.000, valid=33, invalid=0, retrieval_n=0
- `unknown`: hit=0.00%, style=0.00%, answer=0.000, valid=0, invalid=4, retrieval_n=0
- `ielts_general`: hit=0.00%, style=100.00%, answer=1.000, valid=1, invalid=0, retrieval_n=0

## New Run: By Style

- `paragraph_focus`: hit=0.00%, style=100.00%, answer=1.000, valid=1, invalid=1, retrieval_n=1
- `full_tutoring`: hit=65.22%, style=92.31%, answer=0.985, valid=104, invalid=3, retrieval_n=69
- `vocab_paraphrase`: hit=3.12%, style=43.75%, answer=0.888, valid=32, invalid=0, retrieval_n=32
