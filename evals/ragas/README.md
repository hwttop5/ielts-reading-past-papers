# Ragas Evaluation Framework for IELTS Reading AI Assistant

## Requirements

- Python 3.10+
- uv (recommended for dependency management)

## Setup

```bash
cd evals/ragas
uv venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
uv pip install ragas datasets openai httpx
```

## Running Evaluation

### Full Evaluation (Retrieval + Answer Quality)

```bash
python run_eval.py --all
```

### Retrieval Quality Only

```bash
python run_eval.py --retrieval
```

### Answer Quality Only

```bash
python run_eval.py --answers
```

### Compare Vector Backends (Qdrant vs Chroma)

```bash
python run_eval.py --compare --backend qdrant chroma
```

## Output

Results are saved to `evals/ragas/reports/`:
- `retrieval_eval.json` - Retrieval quality metrics
- `answer_eval.json` - Answer quality metrics
- `ragas_*.json` - Standard Ragas metrics
- `ragas_*_details.csv` - Per-sample breakdown

## Metrics

### Custom Metrics

- **question_hit_rate**: Percentage of queries that retrieved correct evidence
- **noise_penalty**: Penalty for irrelevant retrievals (0 = no noise, 1 = all noise)

### Ragas Metrics

- **context_precision**: How well the retrieval ranks relevant contexts higher
- **context_recall**: How much of the ground truth is covered by retrieved contexts
- **faithfulness**: Whether the answer is factually consistent with the contexts
- **answer_relevancy**: How relevant the answer is to the question
- **answer_similarity**: Semantic similarity between generated and expected answer

## Golden Dataset

The golden evaluation dataset is at `datasets/golden_samples.json`.

Each sample includes:
- `id`: Unique identifier
- `questionId`: Target question
- `mode`: hint/explain/review
- `userQuery`: User's question
- `expected_answer`: Expected response content
- `expected_evidence`: Expected retrieved chunks
- `expectedStyle`: Expected answer style (full_tutoring/vocab_paraphrase/paragraph_focus)
- `query_variants`: Alternative phrasings for data augmentation
