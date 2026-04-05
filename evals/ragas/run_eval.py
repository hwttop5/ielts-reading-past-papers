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
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

sys.path.insert(0, str(Path(__file__).parent))

from evaluator import (
    EvalResult,
    EvalSample,
    evaluate_answer_quality,
    evaluate_retrieval_quality,
    load_golden_dataset,
)

ASSISTANT_API_URL = "http://127.0.0.1:8787/api/assistant/query"

EVAL_HEADERS = {
    "Content-Type": "application/json",
    "X-Assistant-Eval": "1",
}


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
    import httpx

    request_payload = build_request_payload(sample)
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                api_url,
                json=request_payload,
                headers={**EVAL_HEADERS, "X-Session-Id": session_id},
            )
            response.raise_for_status()
            return response.json()
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
            raw_api_response=response,
        )
    answer = response.get("answer", "")
    retrieved_chunks = extract_retrieved_chunks(response)
    route = response.get("assistantRoute")
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
        assistant_route=route,
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
    """Map sample id -> raw API JSON object (or {'error': ...})."""
    by_id: Dict[str, Dict[str, Any]] = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            sid = row["id"]
            if "error" in row:
                by_id[sid] = {"error": row["error"]}
            else:
                by_id[sid] = row.get("response") or {}
    return by_id


def results_from_replay(samples: List[EvalSample], by_id: Dict[str, Dict[str, Any]]) -> List[EvalResult]:
    out: List[EvalResult] = []
    for sample in samples:
        raw = by_id.get(sample.id)
        if raw is None:
            out.append(
                EvalResult(
                    sample_id=sample.id,
                    question_id=sample.questionId,
                    mode=sample.mode,
                    user_query=sample.userQuery,
                    retrieved_chunks=[],
                    generated_answer="",
                    expected_answer=sample.expected_answer,
                    expected_evidence=sample.expected_evidence,
                    latency_ms=0.0,
                    error="missing_replay_row",
                )
            )
            continue
        out.append(eval_result_from_api_response(sample, raw, 0.0))
    return out


def write_replay_jsonl(path: str, samples: List[EvalSample], results: List[EvalResult]) -> None:
    with open(path, "w", encoding="utf-8") as f:
        for sample, result in zip(samples, results):
            if result.error:
                f.write(json.dumps({"id": sample.id, "error": result.error}, ensure_ascii=False) + "\n")
            elif result.raw_api_response:
                f.write(
                    json.dumps({"id": sample.id, "response": result.raw_api_response}, ensure_ascii=False)
                    + "\n"
                )


async def run_full_evaluation(
    samples: List[EvalSample],
    output_dir: str,
    max_concurrency: int,
    write_replay: bool,
) -> Dict[str, Any]:
    os.makedirs(output_dir, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    replay_path = os.path.join(output_dir, f"replay_{ts}.jsonl")

    semaphore = asyncio.Semaphore(max_concurrency)

    async def bounded_evaluate(sample: EvalSample) -> EvalResult:
        async with semaphore:
            return await evaluate_sample(sample, ASSISTANT_API_URL)

    tasks = [bounded_evaluate(sample) for sample in samples]
    results = await asyncio.gather(*tasks)

    if write_replay:
        write_replay_jsonl(replay_path, samples, list(results))
        print(f"Wrote replay file: {replay_path}")

    successful_results = [r for r in results if not r.error]
    failed_results = [r for r in results if r.error]

    if failed_results:
        print(f"\n{len(failed_results)} evaluations failed:")
        for r in failed_results[:5]:
            print(f"  - {r.sample_id}: {r.error}")

    print("\nRunning retrieval quality evaluation...")
    retrieval_results = evaluate_retrieval_quality(samples, list(results), output_dir)

    print("\nRunning answer quality evaluation...")
    answer_results = evaluate_answer_quality(samples, list(results), output_dir)

    summary = {
        "timestamp": datetime.now().isoformat(),
        "total_samples": len(samples),
        "successful_evaluations": len(successful_results),
        "failed_evaluations": len(failed_results),
        "avg_latency_ms": sum(r.latency_ms for r in successful_results) / len(successful_results)
        if successful_results
        else 0,
        "retrieval_metrics": retrieval_results,
        "answer_metrics": answer_results,
        "replay_file": replay_path if write_replay else None,
    }

    summary_path = os.path.join(output_dir, "evaluation_summary.json")
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)

    print("\n" + "=" * 60)
    print("EVALUATION SUMMARY")
    print("=" * 60)
    print(f"Total samples: {len(samples)}")
    print(f"Successful: {len(successful_results)}")
    print(f"Failed: {len(failed_results)}")
    print(f"Avg latency: {summary['avg_latency_ms']:.1f}ms")
    print(f"\nRetrieval:")
    print(f"  Question hit rate: {retrieval_results['question_hit_rate']:.2%}")
    print(f"  Avg noise penalty: {retrieval_results['avg_noise_penalty']:.3f}")
    print(f"  Skipped (no evidence / general / social): {retrieval_results.get('skipped_evidence_metrics', 0)}")
    print(f"\nAnswer Quality:")
    print(f"  Avg answer score: {answer_results['avg_answer_score']:.2f}")
    print(f"  Style violations: {len(answer_results['style_violations'])}")
    print(f"\nResults saved to: {output_dir}")

    return summary


def run_metrics_only(
    samples: List[EvalSample],
    results: List[EvalResult],
    output_dir: str,
    retrieval: bool,
    answers: bool,
) -> None:
    os.makedirs(output_dir, exist_ok=True)
    if retrieval:
        print("Running retrieval quality evaluation (replay)...")
        retrieval_results = evaluate_retrieval_quality(samples, results, output_dir)
        print(json.dumps(retrieval_results, indent=2, ensure_ascii=False))
    if answers:
        print("Running answer quality evaluation (replay)...")
        answer_results = evaluate_answer_quality(samples, results, output_dir)
        print(json.dumps(answer_results, indent=2, ensure_ascii=False))


async def main() -> None:
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
        "--output",
        type=str,
        default=str(Path(__file__).parent / "reports"),
        help="Output directory for results",
    )
    parser.add_argument("--concurrency", type=int, default=5, help="Max concurrent API requests")
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

    args = parser.parse_args()

    if not any([args.all, args.retrieval, args.answers]):
        parser.print_help()
        print("\nError: Please specify --all, --retrieval, or --answers")
        sys.exit(1)

    print(f"Loading dataset from: {args.dataset}")
    samples = load_golden_dataset(args.dataset)
    print(f"Loaded {len(samples)} evaluation samples")

    global ASSISTANT_API_URL
    ASSISTANT_API_URL = args.api_url

    if args.replay:
        by_id = load_replay_file(args.replay)
        results = results_from_replay(samples, by_id)
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
        run_metrics_only(samples, results, args.output, retrieval=do_r, answers=do_a)
        return

    if (args.retrieval or args.answers) and not args.all:
        print("For --retrieval / --answers without live API, pass --replay <replay_*.jsonl>.")
        sys.exit(1)

    if args.all:
        await run_full_evaluation(
            samples,
            args.output,
            args.concurrency,
            write_replay=not args.no_replay_file,
        )


if __name__ == "__main__":
    asyncio.run(main())
