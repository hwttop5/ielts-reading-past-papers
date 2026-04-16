#!/usr/bin/env python3
"""
Main evaluation runner for Ragas-based RAG evaluation.

Usage:
    python run_eval.py --all
    python run_eval.py --retrieval --replay reports/replay_*.jsonl
    python run_eval.py --answers --replay reports/replay_*.jsonl
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import subprocess
import sys
import time
from copy import deepcopy
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

# server/.env + LLM_* → OPENAI_* sync happens in evaluator on import
sys.path.insert(0, str(Path(__file__).parent))

if "--local-only-report" in sys.argv:
    os.environ.setdefault("RAGAS_SUPPRESS_IMPORT_WARNING", "1")

from evaluator import (
    EvalResult,
    EvalSample,
    compute_heading_list_hit,
    compute_legacy_question_hit,
    compute_noise_penalty,
    compute_question_hit,
    effective_assistant_route,
    evaluate_answer_quality,
    evaluate_retrieval_quality,
    evaluate_style_match,
    load_golden_dataset,
    should_skip_evidence_retrieval_metrics,
)

ASSISTANT_API_URL = "http://127.0.0.1:8787/api/assistant/query"

EVAL_HEADERS = {
    "Content-Type": "application/json",
    "X-Assistant-Eval": "1",
}

REPO_ROOT = Path(__file__).resolve().parents[2]
QUESTION_INDEX_PATH = REPO_ROOT / "src" / "utils" / "questionIndex.json"
SAMPLE_STATUS_EVALUATED = "evaluated"
SAMPLE_STATUS_DATASET_INVALID = "dataset_invalid"
SAMPLE_STATUS_UNSUPPORTED = "unsupported"
SAMPLE_STATUS_REQUEST_INVALID = "request_invalid"
SAMPLE_STATUS_ASSISTANT_ERROR = "assistant_error"


def load_valid_question_ids() -> set[str]:
    with open(QUESTION_INDEX_PATH, encoding="utf-8") as f:
        return {item["id"] for item in json.load(f)}


def build_status_only_result(
    sample: EvalSample,
    status: str,
    *,
    error: str,
    unsupported_reason: str | None = None,
) -> EvalResult:
    return EvalResult(
        sample_id=sample.id,
        question_id=sample.questionId,
        mode=sample.mode,
        user_query=sample.userQuery,
        retrieved_chunks=[],
        generated_answer="",
        expected_answer=sample.expected_answer,
        expected_evidence=sample.expected_evidence,
        error=error,
        sample_status=status,
        unsupported_reason=unsupported_reason,
    )


def preflight_sample(sample: EvalSample, valid_question_ids: set[str]) -> EvalResult | None:
    if sample.questionId not in valid_question_ids:
        return build_status_only_result(
            sample,
            SAMPLE_STATUS_DATASET_INVALID,
            error=f"dataset_invalid: unknown questionId {sample.questionId}",
            unsupported_reason="unknown_question_id",
        )
    if not sample.userQuery.strip():
        return build_status_only_result(
            sample,
            SAMPLE_STATUS_REQUEST_INVALID,
            error="request_invalid: empty userQuery",
            unsupported_reason="empty_user_query",
        )
    return None


def ragas_capability() -> Dict[str, Any]:
    forced = os.getenv("RAGAS_FORCE", "").strip().lower() in {"1", "true", "yes"}
    supported = sys.version_info < (3, 14) or forced
    return {
        "python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        "full_metrics_supported": supported,
        "forced": forced,
        "mode": "full" if supported else "degraded",
        "reason": None if supported else "Python 3.14+ skips Ragas LLM metrics; use Python 3.13 for official runs (Python 3.12 is acceptable for local fallback).",
    }


def classify_error_status(response: Dict[str, Any]) -> tuple[str, str | None]:
    error = str(response.get("error") or "")
    error_code = response.get("error_code")
    error_message = str(response.get("error_message") or "")
    combined = f"{error} {error_message}".lower()

    if "unknown questionid" in combined:
        return SAMPLE_STATUS_DATASET_INVALID, "unknown_question_id"
    if error_code == "invalid_request" or "invalid request" in combined:
        return SAMPLE_STATUS_REQUEST_INVALID, "invalid_request"
    if "unsupported" in combined:
        return SAMPLE_STATUS_UNSUPPORTED, "unsupported"
    return SAMPLE_STATUS_ASSISTANT_ERROR, None


def build_request_payload(sample: EvalSample) -> Dict[str, Any]:
    """Mirror server AssistantQueryRequest (no legacy `mode` / `sessionId`)."""
    payload: Dict[str, Any] = {
        "questionId": sample.questionId,
        "locale": sample.locale,
        "userQuery": sample.userQuery,
    }
    if sample.focusQuestionNumbers:
        payload["focusQuestionNumbers"] = sample.focusQuestionNumbers
    if sample.attachments:
        payload["attachments"] = sample.attachments
    if sample.attemptContext:
        payload["attemptContext"] = sample.attemptContext
    if sample.surface:
        payload["surface"] = sample.surface
    if sample.action:
        payload["action"] = sample.action
    if sample.promptKind:
        payload["promptKind"] = sample.promptKind
    if sample.practiceContext:
        payload["practiceContext"] = sample.practiceContext
    return payload


def extract_retrieved_chunks(api_response: Dict[str, Any]) -> List[Dict]:
    return api_response.get("retrievedChunks") or []


async def call_assistant_api(
    sample: EvalSample,
    api_url: str,
    session_id: str = "eval-session",
) -> Dict[str, Any]:
    """Use sync HTTP in a worker thread so Ragas/nest_asyncio does not break httpx async."""
    import httpx

    request_payload = build_request_payload(sample)
    headers = {**EVAL_HEADERS, "X-Session-Id": session_id}

    def _post() -> Dict[str, Any]:
        with httpx.Client(timeout=120.0) as client:
            response = client.post(api_url, json=request_payload, headers=headers)
            if response.is_error:
                try:
                    payload = response.json()
                except Exception:
                    payload = {"message": response.text}
                return {
                    "error": f"HTTP error: {response.status_code}",
                    "http_status": response.status_code,
                    "error_code": payload.get("error"),
                    "error_message": payload.get("message") or response.text,
                }
            return response.json()

    try:
        return await asyncio.to_thread(_post)
    except httpx.HTTPError as e:
        return {"error": f"HTTP error: {e}"}
    except Exception as e:
        return {"error": f"Request failed: {e}"}


def eval_result_from_api_response(
    sample: EvalSample,
    response: Dict[str, Any],
    latency_ms: float,
) -> EvalResult:
    if "error" in response:
        status, unsupported_reason = classify_error_status(response)
        return EvalResult(
            sample_id=sample.id,
            question_id=sample.questionId,
            mode=sample.mode,
            user_query=sample.userQuery,
            retrieved_chunks=[],
            generated_answer="",
            expected_answer=sample.expected_answer,
            expected_evidence=sample.expected_evidence,
            latency_ms=latency_ms,
            error=str(response["error"]),
            sample_status=status,
            unsupported_reason=unsupported_reason,
            raw_api_response=response,
        )
    answer = response.get("answer", "")
    retrieved_chunks = extract_retrieved_chunks(response)
    route = response.get("assistantRoute")
    retrieval_diagnostics = response.get("retrievalDiagnostics") or {}
    timings = response.get("timings") or {}
    return EvalResult(
        sample_id=sample.id,
        question_id=sample.questionId,
        mode=sample.mode,
        user_query=sample.userQuery,
        retrieved_chunks=retrieved_chunks,
        generated_answer=answer,
        expected_answer=sample.expected_answer,
        expected_evidence=sample.expected_evidence,
        latency_ms=latency_ms,
        sample_status=SAMPLE_STATUS_EVALUATED,
        assistant_route=route,
        response_kind=response.get("responseKind"),
        answer_source=response.get("answerSource"),
        timings=timings,
        deterministic_chunk_count=int(retrieval_diagnostics.get("deterministicChunkCount") or 0),
        semantic_chunk_count=int(retrieval_diagnostics.get("semanticChunkCount") or 0),
        semantic_candidate_count=int(retrieval_diagnostics.get("semanticCandidateCount") or 0),
        cache_hit=bool(retrieval_diagnostics.get("cacheHit") or timings.get("cache_hit")),
        missing_context_codes=response.get("missingContextCodes") or [],
        retrieval_diagnostics=retrieval_diagnostics,
        style_applied=response.get("styleApplied"),
        raw_api_response=response,
    )


async def evaluate_sample(
    sample: EvalSample,
    api_url: str,
    session_id: str = "eval-session",
) -> EvalResult:
    start_time = time.time()
    response = await call_assistant_api(sample, api_url, session_id=session_id)
    latency_ms = (time.time() - start_time) * 1000
    return eval_result_from_api_response(sample, response, latency_ms)


def load_replay_file(path: str) -> Dict[str, Dict[str, Any]]:
    """Map sample id -> replay row."""
    by_id: Dict[str, Dict[str, Any]] = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            sid = row["id"]
            by_id[sid] = row
    return by_id


def results_from_replay(samples: List[EvalSample], by_id: Dict[str, Dict[str, Any]]) -> List[EvalResult]:
    out: List[EvalResult] = []
    valid_question_ids = load_valid_question_ids()
    for sample in samples:
        preflight = preflight_sample(sample, valid_question_ids)
        if preflight is not None:
            out.append(preflight)
            continue
        raw = by_id.get(sample.id)
        if raw is None:
            out.append(
                build_status_only_result(
                    sample,
                    SAMPLE_STATUS_ASSISTANT_ERROR,
                    error="missing_replay_row",
                )
            )
            continue
        if "error" in raw:
            status = raw.get("sample_status") or SAMPLE_STATUS_ASSISTANT_ERROR
            out.append(build_status_only_result(sample, status, error=str(raw["error"]), unsupported_reason=raw.get("unsupported_reason")))
            continue
        resp = raw.get("response") or {}
        lat = float(raw.get("latency_ms", 0) or 0)
        result = eval_result_from_api_response(sample, resp, lat)
        if raw.get("sample_status"):
            result.sample_status = raw["sample_status"]
        if raw.get("unsupported_reason"):
            result.unsupported_reason = raw["unsupported_reason"]
        out.append(result)
    return out


def write_replay_jsonl(path: str, samples: List[EvalSample], results: List[EvalResult]) -> None:
    with open(path, "w", encoding="utf-8") as f:
        for sample, result in zip(samples, results):
            row: Dict[str, Any] = {
                "id": sample.id,
                "sample_status": result.sample_status,
                "unsupported_reason": result.unsupported_reason,
                "latency_ms": result.latency_ms,
                "assistant_route": result.assistant_route,
                "response_kind": result.response_kind,
                "answer_source": result.answer_source,
                "timings": result.timings,
                "deterministic_chunk_count": result.deterministic_chunk_count,
                "semantic_chunk_count": result.semantic_chunk_count,
                "semantic_candidate_count": result.semantic_candidate_count,
                "cache_hit": result.cache_hit,
                "missing_context_codes": result.missing_context_codes or [],
                "style_applied": result.style_applied,
            }
            if result.error:
                row["error"] = result.error
            if result.raw_api_response:
                row["response"] = result.raw_api_response
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def build_bucket_summaries(samples: List[EvalSample], results: List[EvalResult], bucket_kind: str) -> Dict[str, Any]:
    buckets: Dict[str, Dict[str, Any]] = {}
    for sample, result in zip(samples, results):
        if bucket_kind == "question_type":
            key = sample.expectedQuestionType or "general"
        elif bucket_kind == "style":
            key = sample.expectedStyle or "full_tutoring"
        else:
            key = effective_assistant_route(sample, result) or "unknown"
        bucket = buckets.setdefault(
            key,
            {
                "total_samples": 0,
                "status_counts": {},
                "retrieval_denominator": 0,
                "question_hits": 0,
                "legacy_question_hits": 0,
                "heading_list_denominator": 0,
                "heading_list_hits": 0,
                "noise_penalties": [],
                "answer_denominator": 0,
                "answer_scores": [],
                "style_matches": 0,
            },
        )
        bucket["total_samples"] += 1
        bucket["status_counts"][result.sample_status] = bucket["status_counts"].get(result.sample_status, 0) + 1

        if result.error or result.sample_status != SAMPLE_STATUS_EVALUATED:
            continue

        response_kind = result.response_kind or sample.expectedResponseKind
        style_match = evaluate_style_match(
            result.generated_answer,
            sample.expectedStyle,
            question_type=sample.expectedQuestionType,
            response_kind=response_kind,
        )
        score = 1.0
        if not style_match:
            score = max(0.0, score - 0.2)

        bucket["answer_denominator"] += 1
        bucket["answer_scores"].append(score)
        bucket["style_matches"] += 1 if style_match else 0

        if should_skip_evidence_retrieval_metrics(sample, result):
            continue

        bucket["retrieval_denominator"] += 1
        bucket["question_hits"] += 1 if compute_question_hit(
            result.retrieved_chunks,
            result.expected_evidence,
            sample.focusQuestionNumbers,
            question_type=sample.expectedQuestionType,
            heading_list_required=sample.headingListRequired,
        ) else 0
        bucket["legacy_question_hits"] += 1 if compute_legacy_question_hit(
            result.retrieved_chunks,
            result.expected_evidence,
            sample.focusQuestionNumbers,
            question_type=sample.expectedQuestionType,
            heading_list_required=sample.headingListRequired,
        ) else 0
        bucket["noise_penalties"].append(
            compute_noise_penalty(
                result.retrieved_chunks,
                result.expected_evidence,
                sample.questionId,
                question_type=sample.expectedQuestionType,
            )
        )

        if sample.headingListRequired or sample.expectedQuestionType == "heading_matching":
            bucket["heading_list_denominator"] += 1
            bucket["heading_list_hits"] += 1 if compute_heading_list_hit(result.retrieved_chunks) else 0

    summarized: Dict[str, Any] = {}
    for key, bucket in buckets.items():
        answer_denominator = bucket["answer_denominator"]
        retrieval_denominator = bucket["retrieval_denominator"]
        summarized[key] = {
            "total_samples": bucket["total_samples"],
            "status_counts": bucket["status_counts"],
            "avg_answer_score": (sum(bucket["answer_scores"]) / answer_denominator) if answer_denominator else 0.0,
            "style_match_rate": (bucket["style_matches"] / answer_denominator) if answer_denominator else 0.0,
            "question_hit_rate": (bucket["question_hits"] / retrieval_denominator) if retrieval_denominator else 0.0,
            "legacy_question_hit_rate": (bucket["legacy_question_hits"] / retrieval_denominator) if retrieval_denominator else 0.0,
            "avg_noise_penalty": (sum(bucket["noise_penalties"]) / len(bucket["noise_penalties"])) if bucket["noise_penalties"] else 0.0,
            "heading_list_hit_rate": (
                bucket["heading_list_hits"] / bucket["heading_list_denominator"]
            ) if bucket["heading_list_denominator"] else 0.0,
            "metric_denominators": {
                "answer": answer_denominator,
                "retrieval": retrieval_denominator,
                "heading_list": bucket["heading_list_denominator"],
            },
        }
    return summarized


def build_summary_payload(
    samples: List[EvalSample],
    results: List[EvalResult],
    retrieval_results: Dict[str, Any],
    answer_results: Dict[str, Any],
    replay_path: str | None,
) -> Dict[str, Any]:
    status_counts: Dict[str, int] = {}
    for result in results:
        status_counts[result.sample_status] = status_counts.get(result.sample_status, 0) + 1

    successful_results = [r for r in results if not r.error and r.sample_status == SAMPLE_STATUS_EVALUATED]
    failed_results = [r for r in results if r.error]
    valid_results = [r for r in results if r.sample_status == SAMPLE_STATUS_EVALUATED]
    invalid_results = [
        r for r in results if r.sample_status in {SAMPLE_STATUS_DATASET_INVALID, SAMPLE_STATUS_REQUEST_INVALID}
    ]
    unsupported_results = [r for r in results if r.sample_status == SAMPLE_STATUS_UNSUPPORTED]
    assistant_error_results = [r for r in results if r.sample_status == SAMPLE_STATUS_ASSISTANT_ERROR]
    retrieval_denominator = sum(
        1
        for sample, result in zip(samples, results)
        if result.sample_status == SAMPLE_STATUS_EVALUATED
        and not result.error
        and not should_skip_evidence_retrieval_metrics(sample, result)
    )

    semantic_samples = [r for r in valid_results if r.semantic_chunk_count > 0]
    semantic_skipped = [
        r for r in valid_results
        if (r.retrieval_diagnostics or {}).get("semanticSearchSkipped")
    ]

    return {
        "timestamp": datetime.now().isoformat(),
        "environment": ragas_capability(),
        "total_samples": len(samples),
        "valid_samples": len(valid_results),
        "invalid_samples": len(invalid_results),
        "unsupported_samples": len(unsupported_results),
        "assistant_error_samples": len(assistant_error_results),
        "successful_evaluations": len(successful_results),
        "failed_evaluations": len(failed_results),
        "sample_status_counts": status_counts,
        "avg_latency_ms": (
            sum(r.latency_ms for r in successful_results) / len(successful_results)
            if successful_results
            else 0.0
        ),
        "retrieval_metrics": retrieval_results,
        "answer_metrics": answer_results,
        "metric_denominators": {
            "answer_primary": len(successful_results),
            "retrieval_primary": retrieval_denominator,
            "heading_list_primary": retrieval_results.get("heading_matching_total", 0),
        },
        "by_question_type": build_bucket_summaries(samples, results, "question_type"),
        "by_route": build_bucket_summaries(samples, results, "route"),
        "by_style": build_bucket_summaries(samples, results, "style"),
        "semantic_retrieval": {
            "samples_with_semantic_hits": len(semantic_samples),
            "avg_semantic_chunk_count": (
                sum(r.semantic_chunk_count for r in semantic_samples) / len(semantic_samples)
                if semantic_samples
                else 0.0
            ),
            "avg_semantic_candidate_count": (
                sum(r.semantic_candidate_count for r in valid_results) / len(valid_results)
                if valid_results
                else 0.0
            ),
            "avg_deterministic_chunk_count": (
                sum(r.deterministic_chunk_count for r in valid_results) / len(valid_results)
                if valid_results
                else 0.0
            ),
            "semantic_contribution_rate": (
                len(semantic_samples) / len(valid_results)
                if valid_results
                else 0.0
            ),
            "semantic_skip_rate": (
                len(semantic_skipped) / len(valid_results)
                if valid_results
                else 0.0
            ),
        },
        "replay_file": replay_path,
    }


def load_summary_file(path: str | Path) -> Dict[str, Any]:
    summary_path = Path(path)
    with open(summary_path, encoding="utf-8") as f:
        return json.load(f)


def merge_summary_payload(
    base_summary: Dict[str, Any],
    *,
    retrieval_results: Dict[str, Any] | None = None,
    answer_results: Dict[str, Any] | None = None,
    replay_path: str | None = None,
) -> Dict[str, Any]:
    merged = deepcopy(base_summary)
    merged["timestamp"] = datetime.now().isoformat()
    merged["environment"] = ragas_capability()
    if retrieval_results is not None:
        merged["retrieval_metrics"] = retrieval_results
    if answer_results is not None:
        merged["answer_metrics"] = answer_results
    if replay_path is not None:
        merged["replay_file"] = replay_path
    return merged


def write_summary_payload(output_dir: str, summary: Dict[str, Any]) -> None:
    os.makedirs(output_dir, exist_ok=True)
    summary_path = os.path.join(output_dir, "evaluation_summary.json")
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)


def write_metrics_summary_file(
    output_dir: str,
    samples: List[EvalSample],
    results: List[EvalResult],
    retrieval_results: Dict[str, Any],
    answer_results: Dict[str, Any],
    replay_path: str | None,
) -> None:
    """Persist combined summary after retrieval + answer metrics (replay or live)."""
    summary = build_summary_payload(samples, results, retrieval_results, answer_results, replay_path)
    write_summary_payload(output_dir, summary)


def write_merged_metrics_summary_file(
    output_dir: str,
    merge_from_path: str,
    *,
    retrieval_results: Dict[str, Any] | None,
    answer_results: Dict[str, Any] | None,
    replay_path: str | None,
) -> None:
    base_summary = load_summary_file(merge_from_path)
    merged_summary = merge_summary_payload(
        base_summary,
        retrieval_results=retrieval_results,
        answer_results=answer_results,
        replay_path=replay_path,
    )
    write_summary_payload(output_dir, merged_summary)


def write_markdown_report(output_dir: str, config_note: str) -> None:
    from report_from_run import write_run_report

    _ = config_note
    write_run_report(
        Path(output_dir) / "evaluation_summary.json",
        Path(output_dir) / "EVALUATION_REPORT.md",
        config_note="Run generated from replay or live evaluation artifacts. Official full-score runs should use Python 3.13.",
    )
    return

    """Readable Chinese report for humans; compare with a future full RAG+Qdrant run."""
    summary_path = os.path.join(output_dir, "evaluation_summary.json")
    with open(summary_path, encoding="utf-8") as f:
        summary: Dict[str, Any] = json.load(f)

    rev = summary.get("retrieval_metrics") or {}
    ans = summary.get("answer_metrics") or {}
    ragas_r = rev.get("ragas_metrics") or {}
    ragas_a = ans.get("ragas_metrics") or {}

    lines: List[str] = [
        "# IELTS Reading 助手 RAG 评测报告",
        "",
        f"**生成时间**: {summary.get('timestamp', '')}",
        "",
        "## 运行配置说明",
        "",
        config_note,
        "",
        "## 样本与请求",
        "",
        f"- 总样本数: {summary.get('total_samples', 0)}",
        f"- 成功调用: {summary.get('successful_evaluations', 0)}",
        f"- 失败调用: {summary.get('failed_evaluations', 0)}",
        f"- 平均延迟 (ms): {summary.get('avg_latency_ms', 0):.1f}",
        f"- Replay 文件: `{summary.get('replay_file') or '无'}`",
        "",
        "## 检索质量（自定义指标）",
        "",
        f"- **Question hit rate**: {rev.get('question_hit_rate', 0):.2%}",
        f"- **Avg noise penalty**: {rev.get('avg_noise_penalty', 0):.4f}",
        f"- **Heading list hit rate**: {rev.get('heading_list_hit_rate', 0):.2%}",
        f"- 参与统计条数: {rev.get('num_samples', 0)}",
        f"- 跳过证据类指标条数: {rev.get('skipped_evidence_metrics', 0)}",
        f"- Assistant 路由分布: `{rev.get('assistant_route_counts', {})}`",
        "",
        "### Ragas 检索阶段指标",
        "",
        ("（无）" if not ragas_r else "\n".join(f"- **{k}**: {v}" for k, v in sorted(ragas_r.items()))),
        "",
        "## 答案质量（自定义指标）",
        "",
        f"- **Avg answer score**: {ans.get('avg_answer_score', 0):.4f}",
        f"- **Style match rate**: {ans.get('style_match_rate', 0):.2%}",
        f"- **Style violations 条数**: {len(ans.get('style_violations') or [])}",
        "",
        "### Ragas 答案阶段指标",
        "",
        ("（无）" if not ragas_a else "\n".join(f"- **{k}**: {v}" for k, v in sorted(ragas_a.items()))),
        "",
        "## 与后续「嵌入 + Qdrant」对比时建议",
        "",
        "- 保留本报告路径与 `evaluation_summary.json`，全量配置后重跑同一命令，对比两项 `question_hit_rate`、Ragas 分数及延迟。",
        "- 若仅开启 Qdrant 而未改评测集，差异主要来自检索上下文是否包含语义召回块。",
        "",
    ]
    out = os.path.join(output_dir, "EVALUATION_REPORT.md")
    with open(out, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"Wrote {out}")


async def run_full_evaluation(
    samples: List[EvalSample],
    output_dir: str,
    max_concurrency: int,
    write_replay: bool,
    dataset_path: str,
) -> Dict[str, Any]:
    os.makedirs(output_dir, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    replay_path = os.path.join(output_dir, f"replay_{ts}.jsonl")
    valid_question_ids = load_valid_question_ids()
    preflight_results: Dict[str, EvalResult] = {}
    runnable_samples: List[EvalSample] = []
    for sample in samples:
        preflight = preflight_sample(sample, valid_question_ids)
        if preflight is not None:
            preflight_results[sample.id] = preflight
        else:
            runnable_samples.append(sample)

    semaphore = asyncio.Semaphore(max_concurrency)

    async def bounded_evaluate(sample: EvalSample) -> EvalResult:
        async with semaphore:
            return await evaluate_sample(sample, ASSISTANT_API_URL)

    tasks = [bounded_evaluate(sample) for sample in runnable_samples]
    live_results = await asyncio.gather(*tasks)
    live_by_id = {result.sample_id: result for result in live_results}
    results = [preflight_results.get(sample.id) or live_by_id[sample.id] for sample in samples]

    if write_replay:
        write_replay_jsonl(replay_path, samples, list(results))
        print(f"Wrote replay file: {replay_path}", flush=True)

    successful_results = [r for r in results if not r.error and r.sample_status == SAMPLE_STATUS_EVALUATED]
    failed_results = [r for r in results if r.error]

    if failed_results:
        print(f"\n{len(failed_results)} evaluations failed:")
        for r in failed_results[:5]:
            print(f"  - {r.sample_id}: {r.error}")

    # Ragas 在 asyncio.run() 同进程内会与 nest_asyncio 冲突；子进程仅跑同步 metrics + Ragas
    if not write_replay:
        print("\nSkipping metrics (no replay file).")
        retrieval_results: Dict[str, Any] = {}
        answer_results: Dict[str, Any] = {}
        summary = build_summary_payload(samples, list(results), retrieval_results, answer_results, None)
        summary_path = os.path.join(output_dir, "evaluation_summary.json")
        with open(summary_path, "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2, ensure_ascii=False)
    else:
        print("\nRunning retrieval + answer metrics + Ragas in subprocess (avoids asyncio/nest_asyncio conflict)...")
        script = Path(__file__).resolve()
        subprocess.check_call(
            [
                sys.executable,
                str(script),
                "--replay",
                replay_path,
                "--output",
                output_dir,
                "--dataset",
                dataset_path,
                "--write-metrics-summary",
            ],
            cwd=str(script.parent),
        )
        summary_path = os.path.join(output_dir, "evaluation_summary.json")
        with open(summary_path, encoding="utf-8") as f:
            summary = json.load(f)
        # Replay 路径里 latency 为 0；用父进程实测结果覆盖
        summary["avg_latency_ms"] = (
            sum(r.latency_ms for r in successful_results) / len(successful_results)
            if successful_results
            else 0
        )
        summary["successful_evaluations"] = len(successful_results)
        summary["failed_evaluations"] = len(failed_results)
        with open(summary_path, "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2, ensure_ascii=False)
        retrieval_results = summary["retrieval_metrics"]
        answer_results = summary["answer_metrics"]
        write_markdown_report(
            output_dir,
            config_note=(
                "本次为 **基线**：仅配置 **LLM API**（`LLM_*`），"
                "未单独配置嵌入专用 key；**未配置 Qdrant**（向量语义检索未启用）。"
                "助手运行时为 `llm-enabled`，检索以题号/段落等确定性上下文为主。\n\n"
                "**Ragas LLM 指标**：当前 Python 为 3.14 时已自动跳过（见 `ragas_*_skipped.txt`）；"
                "若需 faithfulness / context_precision 等，请用 Python 3.12/3.13 重跑或设置 `RAGAS_FORCE=1` 尝试。"
            ),
        )

    print("\n" + "=" * 60)
    print("EVALUATION SUMMARY")
    print("=" * 60)
    print(f"Total samples: {len(samples)}")
    print(f"Successful: {len(successful_results)}")
    print(f"Failed: {len(failed_results)}")
    print(f"Avg latency: {summary['avg_latency_ms']:.1f}ms")
    print(f"\nRetrieval:")
    print(f"  Question hit rate: {retrieval_results.get('question_hit_rate', 0):.2%}")
    print(f"  Avg noise penalty: {retrieval_results.get('avg_noise_penalty', 0):.3f}")
    print(f"  Skipped (no evidence / general / social): {retrieval_results.get('skipped_evidence_metrics', 0)}")
    print(f"\nAnswer Quality:")
    print(f"  Avg answer score: {answer_results.get('avg_answer_score', 0):.2f}")
    print(f"  Style violations: {len(answer_results.get('style_violations', []))}")
    print(f"\nResults saved to: {output_dir}")

    return summary


def run_metrics_only(
    samples: List[EvalSample],
    results: List[EvalResult],
    output_dir: str,
    retrieval: bool,
    answers: bool,
    replay_path: str | None = None,
    write_summary: bool = False,
    merge_summary_from: str | None = None,
) -> None:
    os.makedirs(output_dir, exist_ok=True)
    retrieval_results: Dict[str, Any] = {}
    answer_results: Dict[str, Any] = {}
    if retrieval:
        print("Running retrieval quality evaluation (replay)...")
        retrieval_results = evaluate_retrieval_quality(samples, results, output_dir)
        print(json.dumps(retrieval_results, indent=2, ensure_ascii=False))
    if answers:
        print("Running answer quality evaluation (replay)...")
        answer_results = evaluate_answer_quality(samples, results, output_dir)
        print(json.dumps(answer_results, indent=2, ensure_ascii=False))
    if write_summary and retrieval and answers:
        write_metrics_summary_file(output_dir, samples, results, retrieval_results, answer_results, replay_path)
        print(f"Wrote {os.path.join(output_dir, 'evaluation_summary.json')}")
        write_markdown_report(
            output_dir,
            config_note=(
                "鏈涓?**鍩虹嚎**锛氫粎閰嶇疆 **LLM API**锛坄LLM_*`锛夛紝"
                "鏈崟鐙厤缃祵鍏ヤ笓鐢?key锛?*鏈厤缃?Qdrant**锛堝悜閲忚涔夋绱㈡湭鍚敤锛夈€?"
                "鍔╂墜杩愯鏃朵负 `llm-enabled`锛屾绱互棰樺彿/娈佃惤绛夌‘瀹氭€т笂涓嬫枃涓轰富銆?"
            ),
        )
    elif write_summary and merge_summary_from:
        write_merged_metrics_summary_file(
            output_dir,
            merge_summary_from,
            retrieval_results=retrieval_results if retrieval else None,
            answer_results=answer_results if answers else None,
            replay_path=replay_path,
        )
        print(f"Wrote {os.path.join(output_dir, 'evaluation_summary.json')}")
        write_markdown_report(
            output_dir,
            config_note=(
                "本次为 **基线**：仅配置 **LLM API**（`LLM_*`），"
                "未单独配置嵌入专用 key；**未配置 Qdrant**（向量语义检索未启用）。"
                "助手运行时为 `llm-enabled`，检索以题号/段落等确定性上下文为主。"
            ),
        )


def write_local_only_report(
    output_dir: str,
    samples: List[EvalSample],
    results: List[EvalResult],
    replay_path: str | None,
) -> Dict[str, Any]:
    """Write deterministic local-response diagnostics without Ragas, embeddings, or LLM calls."""
    os.makedirs(output_dir, exist_ok=True)

    def confidence_of(result: EvalResult) -> str:
        raw = result.raw_api_response or {}
        return str(raw.get("confidence") or "missing")

    def recommended_count(result: EvalResult) -> int:
        raw = result.raw_api_response or {}
        items = raw.get("recommendedQuestions")
        return len(items) if isinstance(items, list) else 0

    status_counts: Dict[str, int] = {}
    source_counts: Dict[str, int] = {}
    kind_counts: Dict[str, int] = {}
    route_counts: Dict[str, int] = {}
    confidence_counts: Dict[str, int] = {}
    style_counts: Dict[str, int] = {}
    missing_code_counts: Dict[str, int] = {}
    concern_counts: Dict[str, int] = {}
    phrase_counts: Dict[str, int] = {}
    confidence_by_kind: Dict[str, Dict[str, int]] = {}
    missing_codes_by_confidence: Dict[str, Dict[str, int]] = {}
    concern_examples: List[Dict[str, Any]] = []
    phrase_examples: List[Dict[str, Any]] = []

    for result in results:
      status_counts[result.sample_status] = status_counts.get(result.sample_status, 0) + 1
      source_key = result.answer_source or "missing"
      source_counts[source_key] = source_counts.get(source_key, 0) + 1

    local_pairs = [
        (sample, result)
        for sample, result in zip(samples, results)
        if result.answer_source == "local"
    ]

    bad_phrases = {
        "english_cited_evidence_placeholder": "the cited evidence area",
        "mixed_q_current_set": "Qthe current set",
        "generic_ielts_question_type": "雅思阅读题",
    }

    api_latencies = [result.latency_ms for _, result in local_pairs if result.latency_ms]
    service_total_ms = [
        float((result.timings or {}).get("total_ms"))
        for _, result in local_pairs
        if isinstance((result.timings or {}).get("total_ms"), (int, float))
    ]
    retrieved_counts = [len(result.retrieved_chunks) for _, result in local_pairs]
    deterministic_counts = [result.deterministic_chunk_count for _, result in local_pairs]
    semantic_counts = [result.semantic_chunk_count for _, result in local_pairs]

    for sample, result in local_pairs:
        kind = result.response_kind or sample.expectedResponseKind or "missing"
        route = result.assistant_route or sample.expectedAssistantRoute or "missing"
        confidence = confidence_of(result)
        style = result.style_applied or sample.expectedStyle or "missing"

        kind_counts[kind] = kind_counts.get(kind, 0) + 1
        route_counts[route] = route_counts.get(route, 0) + 1
        confidence_counts[confidence] = confidence_counts.get(confidence, 0) + 1
        style_counts[style] = style_counts.get(style, 0) + 1
        confidence_by_kind.setdefault(kind, {})[confidence] = confidence_by_kind.setdefault(kind, {}).get(confidence, 0) + 1

        codes = result.missing_context_codes or []
        for code in codes:
            missing_code_counts[code] = missing_code_counts.get(code, 0) + 1
            bucket = missing_codes_by_confidence.setdefault(confidence, {})
            bucket[code] = bucket.get(code, 0) + 1

        if confidence == "high" and codes:
            concern_counts["high_confidence_with_missing_context"] = concern_counts.get("high_confidence_with_missing_context", 0) + 1
            if len(concern_examples) < 8:
                concern_examples.append({
                    "id": sample.id,
                    "codes": codes,
                    "preview": result.generated_answer.replace("\n", " ")[:220],
                })

        for label, phrase in bad_phrases.items():
            if phrase in result.generated_answer:
                phrase_counts[label] = phrase_counts.get(label, 0) + 1
                if len(phrase_examples) < 8:
                    phrase_examples.append({
                        "id": sample.id,
                        "phrase": label,
                        "preview": result.generated_answer.replace("\n", " ")[:220],
                    })

    similar_card_rows = sum(1 for _, result in local_pairs if recommended_count(result) > 0)
    similar_dataset_rows = sum(1 for sample, _ in local_pairs if sample.action == "recommend_drills")

    def avg(values: List[float]) -> float:
        return (sum(values) / len(values)) if values else 0.0

    summary: Dict[str, Any] = {
        "timestamp": datetime.now().isoformat(),
        "mode": "local_only_no_llm",
        "replay_file": replay_path,
        "total_rows": len(results),
        "local_rows": len(local_pairs),
        "status_counts": status_counts,
        "answer_source_counts": source_counts,
        "response_kind_counts": kind_counts,
        "assistant_route_counts": route_counts,
        "confidence_counts": confidence_counts,
        "style_counts": style_counts,
        "missing_context_code_counts": missing_code_counts,
        "concern_counts": concern_counts,
        "phrase_defect_counts": phrase_counts,
        "confidence_by_kind": confidence_by_kind,
        "missing_codes_by_confidence": missing_codes_by_confidence,
        "similar_dataset_rows": similar_dataset_rows,
        "similar_card_rows": similar_card_rows,
        "avg_api_latency_ms": avg(api_latencies),
        "max_api_latency_ms": max(api_latencies) if api_latencies else 0.0,
        "avg_service_total_ms": avg(service_total_ms),
        "avg_retrieved_chunks": avg([float(v) for v in retrieved_counts]),
        "avg_deterministic_chunks": avg([float(v) for v in deterministic_counts]),
        "avg_semantic_chunks": avg([float(v) for v in semantic_counts]),
        "concern_examples": concern_examples,
        "phrase_examples": phrase_examples,
    }

    json_path = os.path.join(output_dir, "local_only_metrics.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)

    lines = [
        "# Local-only AI Assistant Metrics",
        "",
        f"- Replay: `{replay_path or 'n/a'}`",
        f"- Total rows: {summary['total_rows']}",
        f"- Local rows: {summary['local_rows']}",
        f"- Similar recommendation dataset rows: {similar_dataset_rows}",
        f"- Similar recommendation rows with cards: {similar_card_rows}",
        f"- Average API replay latency: {summary['avg_api_latency_ms']:.1f}ms",
        f"- Average service total_ms: {summary['avg_service_total_ms']:.1f}ms",
        f"- Average semantic chunks: {summary['avg_semantic_chunks']:.2f}",
        "",
    ]

    for title, payload in [
        ("Response Kinds", kind_counts),
        ("Routes", route_counts),
        ("Confidence", confidence_counts),
        ("Applied Styles", style_counts),
        ("Missing Context Codes", missing_code_counts),
        ("Concerns", concern_counts),
        ("Phrase Defects", phrase_counts),
    ]:
        lines.append(f"## {title}")
        if payload:
            for key, value in sorted(payload.items(), key=lambda item: (-item[1], item[0])):
                lines.append(f"- {key}: {value}")
        else:
            lines.append("- none")
        lines.append("")

    lines.append("## Examples")
    for example in concern_examples:
        lines.append(f"- high_confidence_with_missing_context: `{example['id']}` codes={example['codes']} preview={example['preview']}")
    for example in phrase_examples:
        lines.append(f"- {example['phrase']}: `{example['id']}` preview={example['preview']}")
    if not concern_examples and not phrase_examples:
        lines.append("- none")

    markdown_path = os.path.join(output_dir, "LOCAL_ONLY_METRICS.md")
    with open(markdown_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print(f"Wrote {json_path}")
    print(f"Wrote {markdown_path}")
    return summary


def main() -> None:
    global ASSISTANT_API_URL
    parser = argparse.ArgumentParser(description="Ragas-based RAG evaluation")
    parser.add_argument("--all", action="store_true", help="Live API: full evaluation + replay JSONL")
    parser.add_argument("--retrieval", action="store_true", help="Replay or live: retrieval metrics only")
    parser.add_argument("--answers", action="store_true", help="Replay or live: answer metrics only")
    parser.add_argument(
        "--replay",
        type=str,
        default=None,
        help="Path to replay_*.jsonl from a prior --all run (skips HTTP)",
    )
    parser.add_argument(
        "--dataset",
        type=str,
        default=str(Path(__file__).parent / "datasets" / "golden_samples.json"),
        help="Path to golden dataset JSON",
    )
    parser.add_argument(
        "--styles",
        type=str,
        default="",
        help="Optional comma-separated expectedStyle filter, e.g. vocab_paraphrase,paragraph_focus,full_tutoring",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=str(Path(__file__).parent / "reports"),
        help="Output directory for results",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=2,
        help="Max concurrent API requests (lower avoids 429 if server rate-limits)",
    )
    parser.add_argument(
        "--api-url",
        type=str,
        default=ASSISTANT_API_URL,
        help="Assistant API URL",
    )
    parser.add_argument(
        "--no-replay-file",
        action="store_true",
        help="With --all, do not write replay JSONL",
    )
    parser.add_argument(
        "--write-metrics-summary",
        action="store_true",
        help="With --replay, write evaluation_summary.json after metrics",
    )
    parser.add_argument(
        "--merge-summary-from",
        type=str,
        default=None,
        help="With --replay and a single metric group, merge updated metrics into an existing evaluation_summary.json",
    )
    parser.add_argument(
        "--local-only-report",
        action="store_true",
        help="Replay only: write local deterministic diagnostics without Ragas, embeddings, or LLM calls",
    )

    args = parser.parse_args()

    # `--replay` alone should run both metric groups (matches README one-liner)
    if args.replay and not any([args.all, args.retrieval, args.answers, args.local_only_report]):
        args.retrieval = True
        args.answers = True

    if not any([args.all, args.retrieval, args.answers, args.local_only_report]):
        parser.print_help()
        print("\nError: Please specify --all, --retrieval, --answers, or --local-only-report")
        sys.exit(1)

    print(f"Loading dataset from: {args.dataset}")
    samples = load_golden_dataset(args.dataset)
    if args.styles.strip():
        requested_styles = {part.strip() for part in args.styles.split(",") if part.strip()}
        samples = [sample for sample in samples if sample.expectedStyle in requested_styles]
        print(f"Filtered dataset to styles {sorted(requested_styles)} -> {len(samples)} samples")
    print(f"Loaded {len(samples)} evaluation samples")

    ASSISTANT_API_URL = args.api_url

    if args.replay:
        by_id = load_replay_file(args.replay)
        results = results_from_replay(samples, by_id)
        if args.local_only_report:
            write_local_only_report(args.output, samples, results, args.replay)
            return
        if args.all:
            print("Note: --all is ignored when --replay is set; metrics are computed from the replay file.")
        if args.retrieval and args.answers:
            do_r, do_a = True, True
        elif args.retrieval:
            do_r, do_a = True, False
        elif args.answers:
            do_r, do_a = False, True
        else:
            do_r, do_a = True, True
        if args.merge_summary_from and not args.write_metrics_summary:
            parser.error("--merge-summary-from requires --write-metrics-summary.")
        if args.write_metrics_summary and (do_r ^ do_a) and not args.merge_summary_from:
            parser.error(
                "Single-group replay summary writes require --merge-summary-from <existing evaluation_summary.json>."
            )
        if args.merge_summary_from and not (do_r ^ do_a):
            parser.error("--merge-summary-from only applies when exactly one metric group is selected.")
        run_metrics_only(
            samples,
            results,
            args.output,
            retrieval=do_r,
            answers=do_a,
            replay_path=args.replay,
            write_summary=args.write_metrics_summary,
            merge_summary_from=args.merge_summary_from,
        )
        return

    if args.local_only_report:
        print("--local-only-report requires --replay <replay_*.jsonl>; it never calls the live API.")
        sys.exit(1)

    if (args.retrieval or args.answers) and not args.all:
        print("For --retrieval / --answers without live API, pass --replay <replay_*.jsonl>.")
        sys.exit(1)

    if args.all:
        asyncio.run(
            run_full_evaluation(
                samples,
                args.output,
                args.concurrency,
                write_replay=not args.no_replay_file,
                dataset_path=args.dataset,
            )
        )


if __name__ == "__main__":
    main()
