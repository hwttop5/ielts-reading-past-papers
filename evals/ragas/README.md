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

Start the assistant API first (default `http://127.0.0.1:8787`). From repo root:

```bash
npm run dev:assistant
```

Retrieval chunks are returned when **`X-Assistant-Eval: 1`** is sent (development or localhost) **or** when `ASSISTANT_INCLUDE_RETRIEVAL=true` is set in `server/.env` (e.g. CI). The Python runner sets this header automatically.

### Full Evaluation (live API + replay JSONL)

```bash
cd evals/ragas
python run_eval.py --all
```

Writes metrics under `--output` (default `evals/ragas/reports/`) and a `replay_<timestamp>.jsonl` for offline re-scoring. Use `--no-replay-file` to skip the JSONL.

### Retrieval or answer metrics from a prior replay (no server)

```bash
python run_eval.py --replay reports/replay_YYYYMMDD_HHMMSS.jsonl
python run_eval.py --replay reports/replay_YYYYMMDD_HHMMSS.jsonl --retrieval
python run_eval.py --replay reports/replay_YYYYMMDD_HHMMSS.jsonl --answers
```

### NPM shortcuts (from repo root)

```bash
npm run eval:rag
```

### Generate Report (No Backend Required)

```bash
python generate_report.py
```

### Run Unit Tests

```bash
python test_heading_matching.py -v
python test_eval_helpers.py
```

## Output

Results are saved to `evals/ragas/results/`:
- `retrieval_eval.json` - Retrieval quality metrics
- `answer_eval.json` - Answer quality metrics
- `ragas_*.json` - Standard Ragas metrics
- `ragas_*_details.csv` - Per-sample breakdown
- `rag_evaluation_*.json` - Comprehensive report (JSON)
- `rag_evaluation_*.md` - Comprehensive report (Markdown)

## Metrics

### Custom Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| `question_hit_rate` | Percentage of queries that retrieved correct evidence | >80% |
| `heading_list_hit_rate` | heading_matching题型 heading list 检索成功率 | >85% |
| `noise_penalty` | Penalty for irrelevant retrievals (0 = no noise, 1 = all noise) | <0.2 |
| `style_match_rate` | Answer style matches expected (vocab_paraphrase/paragraph_focus/full_tutoring) | >90% |

### Ragas Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| `context_precision` | How well the retrieval ranks relevant contexts higher | >0.75 |
| `context_recall` | How much of the ground truth is covered by retrieved contexts | >0.75 |
| `faithfulness` | Whether the answer is factually consistent with the contexts | >0.85 |
| `answer_relevancy` | How relevant the answer is to the question | >0.85 |
| `answer_similarity` | Semantic similarity between generated and expected answer | >0.80 |

## Golden Dataset

The golden evaluation dataset is at `datasets/golden_samples.json`.

The `mode` field (`hint` / `explain` / `review`) is **legacy documentation only**; the server infers behaviour from `userQuery`, `attemptContext`, `surface`, `action`, `promptKind`, etc. Prefer those when adding samples.

**Current size**: 141 samples (as of 2026-04-05) - Expanded from 21 samples

### Coverage

| Category | Count | Percentage |
|----------|-------|------------|
| **Modes** | | |
| - hint | 103 | 73.0% |
| - explain | 37 | 26.2% |
| - review | 1 | 0.7% |
| **Question Types** | | |
| - general | 100 | 70.9% |
| - vocabulary | 31 | 22.0% |
| - heading_matching | 5 | 3.5% |
| - paragraph_matching | 1 | 0.7% |
| - true_false_not_given | 1 | 0.7% |
| - multiple_choice | 1 | 0.7% |
| - sentence_completion | 1 | 0.7% |
| - summary_completion | 1 | 0.7% |
| **Answer Styles** | | |
| - full_tutoring | 107 | 75.9% |
| - vocab_paraphrase | 32 | 22.7% |
| - paragraph_focus | 2 | 1.4% |
| **Languages** | | |
| - zh | 139 | 98.6% |
| - en | 2 | 1.4% |

### Article Coverage

- **Total articles**: 36 (P1: 6, P2: 10, P3: 10, plus existing p1-high-01)
- **P1 articles**: p1-high-01 (existing), p1-high-24, p1-high-27, p1-high-31, p1-high-79, p1-high-82, p1-medium-20, p1-medium-29, p1-medium-33, p1-medium-57, p1-medium-60, p1-low-02, p1-low-11, p1-low-13, p1-low-30, p1-low-34
- **P2 articles**: p2-high-09, p2-high-14, p2-high-16, p2-high-17, p2-high-19, p2-medium-10, p2-medium-58, p2-medium-86, p2-medium-93, p2-medium-121, p2-low-06, p2-low-08, p2-low-37, p2-low-39, p2-low-41
- **P3 articles**: p3-high-03, p3-high-04, p3-high-15, p3-high-32, p3-medium-18, p3-medium-22, p3-medium-66, p3-low-07, p3-low-12, p3-low-28

### Sample Structure

```json
{
  "id": "heading_matching_single",
  "questionId": "p1-high-01",
  "mode": "hint",
  "locale": "zh",
  "userQuery": "列出所有标题选项并匹配段落 A",
  "focusQuestionNumbers": ["1"],
  "expectedQuestionType": "heading_matching",
  "headingListRequired": true,
  "expected_answer": "viii (A chance discovery)",
  "expected_evidence": {
    "paragraphLabels": ["A"],
    "chunkType": "question_item",
    "keyPhrases": ["A chance discovery"]
  },
  "official_explanation": "段落 A 讲述神农帝偶然发现茶的故事",
  "query_variants": [
    "第 1 题标题匹配",
    "段落 A 对应哪个标题？",
    "heading for paragraph A"
  ],
  "expectedStyle": "full_tutoring"
}
```

## heading_matching 题型专项支持

### 评估规则

1. **Question Hit**: 必须同时满足
   - heading list 被检索（包含"List of Headings"或 questionType='heading_matching'）
   - 目标段落被检索（paragraphLabels 匹配或 keyPhrases 匹配）

2. **Noise Penalty**: 放宽惩罚
   - 同题目组的其他题目 chunk 不视为 noise（heading list 是共享的）
   - 段落距离容忍度从 2 扩大到 4

3. **Style Match**: full_tutoring 风格应包含
   - 完整的 heading list 展示
   - 标题选项与段落的匹配分析
   - 干扰项排除说明

### 测试用例

运行 heading_matching 专项测试：

```bash
python test_heading_matching.py -v
```

测试覆盖：
- `test_heading_list_hit_*` - heading list 检测
- `test_question_hit_heading_*` - heading_matching question hit 逻辑
- `test_noise_penalty_heading_matching_relaxed` - noise penalty 放宽
- `test_style_match_*` - 答案风格匹配

## 优化建议

### 检索质量
- 确保向量库已正确 ingest 所有题目和段落数据
- 对于 heading_matching 题型，确保 heading list 完整包含在 context 中
- 考虑增加 retrieval budget 对于多问题请求
- 验证 `heading_list_hit_rate` 指标，确保 > 85%

### 答案质量
- 对于 vocab_paraphrase 模式，确保提供足够的同义词候选
- 对于 review 模式，确保包含官方解析和错因分析
- 保持答案与检索证据的一致性，避免幻觉
- 监控 `style_match_rate` 指标，确保 > 90%

### 性能优化
- 启用语义搜索缓存以减少重复查询延迟
- 对于简单查询使用本地模板而非 LLM
- 考虑使用流式响应以提升用户体验

### 评估改进
- 扩展 Golden 数据集至 141+ 样本（已完成，覆盖 36 篇文章）
- 定期运行评估并跟踪 heading_list_hit_rate 和 style_match_rate 指标
- 实现自动化回归测试流程
- 针对 T/F/NG、multiple_choice、sentence_completion 等题型增加专项测试

## Files

| File | Description |
|------|-------------|
| `evaluator.py` | Core evaluation logic with heading_matching support |
| `generate_report.py` | Simplified report generator (no backend required) |
| `run_eval.py` | Full evaluation runner (requires backend service) |
| `test_heading_matching.py` | Unit tests for heading_matching evaluation |
| `datasets/golden_samples.json` | Golden evaluation dataset (141 samples) |
| `scripts/analyze_question_types.py` | Analyze question type distribution across articles |
| `scripts/expand_golden_dataset.py` | Expand Golden dataset with templates |
| `scripts/cleanup_golden_dataset.py` | Clean up null/None question types |

## Version History

### v1.2 (2026-04-05)
- **Expanded Golden dataset**: 21 -> 141 samples (+120)
- **Article coverage**: 6 -> 36 articles (P1: 6, P2: 10, P3: 10)
- Added analysis script for question type distribution
- Added expansion scripts with template generation
- Question type coverage: general(100), vocabulary(31), heading_matching(5), etc.

### v1.1 (2026-04-05)
- Added heading_matching question type support
- New `heading_list_hit_rate` metric
- New `style_match_rate` metric
- Extended Golden dataset to 21 samples (from 10)
- Optimized `noise_penalty` calculation for heading_matching
- Added `evaluate_style_match()` function
- Added comprehensive unit tests

### v1.0 (2026-04-01)
- Initial release
- Basic Ragas metrics integration
- 10 Golden samples
