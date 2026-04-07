# IELTS Reading Assistant Evaluation Report

- Generated at: 2026-04-06T23:11:25.845940
- Summary file: `evals/ragas/reports/baseline_llm_only_no_qdrant_py312_rescored_v2/evaluation_summary.json`
- Python: 3.12.12
- RAGAS mode: full
- Replay file: `evals/ragas/reports/baseline_llm_only_no_qdrant/replay_20260406_010311.jsonl`

## Run Status

- Total samples: 141
- Valid samples: 137
- Invalid samples: 4
- Unsupported samples: 0
- Assistant error samples: 0
- Successful evaluations: 137
- Failed evaluations: 4
- Avg latency (successful): 1156.4 ms

## Config Note

Run generated from replay or live evaluation artifacts. Official full-score runs should use Python 3.13.

## Retrieval

- Question hit rate: 45.10%
- Legacy question hit rate: 2.94%
- Avg noise penalty: 0.0241
- Heading list hit rate: 100.00%
- Retrieval denominator: 102

## Answer Quality

- Avg answer score: 0.8818
- Style match rate: 75.18%
- Style violations: 56

## Semantic Retrieval

- Samples with semantic hits: 0
- Avg semantic chunk count: 0.00
- Avg semantic candidate count: 0.00
- Avg deterministic chunk count: 0.00
- Semantic contribution rate: 0.00%
- Semantic skip rate: 0.00%

## By Question Type

- `heading_matching`: hit=100.00%, style=100.00%, answer=1.000, valid=5, invalid=0, unsupported=0, retrieval_n=5
- `general`: hit=62.12%, style=88.00%, answer=0.976, valid=100, invalid=0, unsupported=0, retrieval_n=66
- `paragraph_matching`: hit=0.00%, style=0.00%, answer=0.000, valid=0, invalid=1, unsupported=0, retrieval_n=0
- `true_false_not_given`: hit=0.00%, style=0.00%, answer=0.000, valid=0, invalid=1, unsupported=0, retrieval_n=0
- `multiple_choice`: hit=0.00%, style=0.00%, answer=0.000, valid=0, invalid=1, unsupported=0, retrieval_n=0
- `sentence_completion`: hit=0.00%, style=100.00%, answer=1.000, valid=1, invalid=0, unsupported=0, retrieval_n=0

## By Route

- `page_grounded`: hit=45.10%, style=66.99%, answer=0.934, valid=103, invalid=0, unsupported=0, retrieval_n=102
- `unrelated_chat`: hit=0.00%, style=100.00%, answer=1.000, valid=33, invalid=0, unsupported=0, retrieval_n=0
- `unknown`: hit=0.00%, style=0.00%, answer=0.000, valid=0, invalid=4, unsupported=0, retrieval_n=0
- `ielts_general`: hit=0.00%, style=100.00%, answer=1.000, valid=1, invalid=0, unsupported=0, retrieval_n=0

## By Style

- `paragraph_focus`: hit=0.00%, style=100.00%, answer=1.000, valid=1, invalid=1, unsupported=0, retrieval_n=1
- `full_tutoring`: hit=65.22%, style=88.46%, answer=0.977, valid=104, invalid=3, unsupported=0, retrieval_n=69
- `vocab_paraphrase`: hit=3.12%, style=31.25%, answer=0.863, valid=32, invalid=0, unsupported=0, retrieval_n=32
