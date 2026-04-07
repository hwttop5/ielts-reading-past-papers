# IELTS Reading Assistant Evaluation Report

- Generated at: 2026-04-06T23:42:28.037872
- Summary file: `evals/ragas/reports/eval_hybrid_qdrant_20260406_latest/evaluation_summary.json`
- Python: 3.14.3
- RAGAS mode: degraded
- Replay file: `evals/ragas/reports/eval_hybrid_qdrant_20260406/replay_20260406_171754.jsonl`

## Run Status

- Total samples: 141
- Valid samples: 137
- Invalid samples: 4
- Unsupported samples: 0
- Assistant error samples: 0
- Successful evaluations: 137
- Failed evaluations: 4
- Avg latency (successful): 4384.5 ms

## Config Note

Run generated from replay or live evaluation artifacts. Official full-score runs should use Python 3.13.

## Environment Note

- Python 3.14+ skips Ragas LLM metrics; use Python 3.13 for official runs (Python 3.12 is acceptable for local fallback).

## Retrieval

- Question hit rate: 45.10%
- Legacy question hit rate: 2.94%
- Avg noise penalty: 0.0258
- Heading list hit rate: 100.00%
- Retrieval denominator: 102

## Answer Quality

- Avg answer score: 0.8891
- Style match rate: 81.02%
- Style violations: 44

## Semantic Retrieval

- Samples with semantic hits: 0
- Avg semantic chunk count: 0.00
- Avg semantic candidate count: 0.00
- Avg deterministic chunk count: 0.00
- Semantic contribution rate: 0.00%
- Semantic skip rate: 0.00%

## By Question Type

- `heading_matching`: hit=100.00%, style=100.00%, answer=1.000, valid=5, invalid=0, unsupported=0, retrieval_n=5
- `general`: hit=62.12%, style=92.00%, answer=0.984, valid=100, invalid=0, unsupported=0, retrieval_n=66
- `paragraph_matching`: hit=0.00%, style=0.00%, answer=0.000, valid=0, invalid=1, unsupported=0, retrieval_n=0
- `true_false_not_given`: hit=0.00%, style=0.00%, answer=0.000, valid=0, invalid=1, unsupported=0, retrieval_n=0
- `multiple_choice`: hit=0.00%, style=0.00%, answer=0.000, valid=0, invalid=1, unsupported=0, retrieval_n=0
- `sentence_completion`: hit=0.00%, style=100.00%, answer=1.000, valid=1, invalid=0, unsupported=0, retrieval_n=0

## By Route

- `page_grounded`: hit=45.10%, style=74.76%, answer=0.950, valid=103, invalid=0, unsupported=0, retrieval_n=102
- `unrelated_chat`: hit=0.00%, style=100.00%, answer=1.000, valid=33, invalid=0, unsupported=0, retrieval_n=0
- `unknown`: hit=0.00%, style=0.00%, answer=0.000, valid=0, invalid=4, unsupported=0, retrieval_n=0
- `ielts_general`: hit=0.00%, style=100.00%, answer=1.000, valid=1, invalid=0, unsupported=0, retrieval_n=0

## By Style

- `paragraph_focus`: hit=0.00%, style=100.00%, answer=1.000, valid=1, invalid=1, unsupported=0, retrieval_n=1
- `full_tutoring`: hit=65.22%, style=92.31%, answer=0.985, valid=104, invalid=3, unsupported=0, retrieval_n=69
- `vocab_paraphrase`: hit=3.12%, style=43.75%, answer=0.888, valid=32, invalid=0, unsupported=0, retrieval_n=32
