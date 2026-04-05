#!/usr/bin/env python3
"""
Main evaluation runner for Ragas-based RAG evaluation.

Usage:
    python run_eval.py --all                    # Run full evaluation
    python run_eval.py --retrieval              # Retrieval quality only
    python run_eval.py --answers                # Answer quality only
    python run_eval.py --compare --backend qdrant chroma  # Compare backends
"""

import argparse
import asyncio
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

# Add evaluator module to path
sys.path.insert(0, str(Path(__file__).parent))

from evaluator import (
    EvalResult,
    EvalSample,
    load_golden_dataset,
    evaluate_retrieval_quality,
    evaluate_answer_quality,
)


ASSISTANT_API_URL = "http://localhost:3001/api/assistant/query"


async def call_assistant_api(
    sample: EvalSample,
    session_id: str = "eval-session"
) -> Dict[str, Any]:
    """Call the assistant API with the sample query."""
    import httpx

    request_payload = {
        "questionId": sample.questionId,
        "mode": sample.mode,
        "locale": sample.locale,
        "userQuery": sample.userQuery,
        "focusQuestionNumbers": sample.focusQuestionNumbers if sample.focusQuestionNumbers else None,
        "sessionId": session_id,
    }

    # Add attachments if present
    if sample.attachments:
        request_payload["attachments"] = sample.attachments

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                ASSISTANT_API_URL,
                json=request_payload,
                headers={"Content-Type": "application/json"}
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as e:
        return {"error": f"HTTP error: {e}"}
    except Exception as e:
        return {"error": f"Request failed: {e}"}


def extract_retrieved_chunks(api_response: Dict[str, Any]) -> List[Dict]:
    """Extract retrieved chunks from API response metadata."""
    # The API response may include retrieval metadata
    # For now, we'll need to capture this from internal service logs
    # This is a placeholder - actual implementation depends on API response structure
    return api_response.get("retrievedChunks", [])


async def evaluate_sample(
    sample: EvalSample,
    session_id: str = "eval-session"
) -> EvalResult:
    """Evaluate a single sample by calling the assistant API."""
    start_time = time.time()

    # Call assistant API
    response = await call_assistant_api(sample, session_id)
    latency_ms = (time.time() - start_time) * 1000

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
            error=response["error"]
        )

    # Extract response data
    answer = response.get("answer", "")
    retrieved_chunks = extract_retrieved_chunks(response)

    return EvalResult(
        sample_id=sample.id,
        question_id=sample.questionId,
        mode=sample.mode,
        user_query=sample.userQuery,
        retrieved_chunks=retrieved_chunks,
        generated_answer=answer,
        expected_answer=sample.expected_answer,
        expected_evidence=sample.expected_evidence,
        latency_ms=latency_ms
    )


async def run_full_evaluation(
    samples: List[EvalSample],
    output_dir: str,
    max_concurrency: int = 5
) -> Dict[str, Any]:
    """Run full evaluation on all samples."""
    os.makedirs(output_dir, exist_ok=True)

    # Process samples with concurrency limit
    semaphore = asyncio.Semaphore(max_concurrency)

    async def bounded_evaluate(sample: EvalSample) -> EvalResult:
        async with semaphore:
            return await evaluate_sample(sample)

    tasks = [bounded_evaluate(sample) for sample in samples]
    results = await asyncio.gather(*tasks)

    # Separate successful and failed evaluations
    successful_results = [r for r in results if not r.error]
    failed_results = [r for r in results if r.error]

    # Log failures
    if failed_results:
        print(f"\n{len(failed_results)} evaluations failed:")
        for r in failed_results[:5]:
            print(f"  - {r.sample_id}: {r.error}")

    # Run retrieval evaluation
    print("\nRunning retrieval quality evaluation...")
    retrieval_results = evaluate_retrieval_quality(samples, results, output_dir)

    # Run answer evaluation
    print("\nRunning answer quality evaluation...")
    answer_results = evaluate_answer_quality(samples, results, output_dir)

    # Compile summary
    summary = {
        "timestamp": datetime.now().isoformat(),
        "total_samples": len(samples),
        "successful_evaluations": len(successful_results),
        "failed_evaluations": len(failed_results),
        "avg_latency_ms": sum(r.latency_ms for r in successful_results) / len(successful_results) if successful_results else 0,
        "retrieval_metrics": retrieval_results,
        "answer_metrics": answer_results
    }

    # Save summary
    summary_path = os.path.join(output_dir, "evaluation_summary.json")
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)

    # Print summary
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
    print(f"\nAnswer Quality:")
    print(f"  Avg answer score: {answer_results['avg_answer_score']:.2f}")
    print(f"  Style violations: {len(answer_results['style_violations'])}")
    print(f"\nResults saved to: {output_dir}")

    return summary


async def main():
    parser = argparse.ArgumentParser(description="Ragas-based RAG evaluation")
    parser.add_argument(
        "--all",
        action="store_true",
        help="Run full evaluation (retrieval + answer quality)"
    )
    parser.add_argument(
        "--retrieval",
        action="store_true",
        help="Run retrieval quality evaluation only"
    )
    parser.add_argument(
        "--answers",
        action="store_true",
        help="Run answer quality evaluation only"
    )
    parser.add_argument(
        "--dataset",
        type=str,
        default=str(Path(__file__).parent / "datasets" / "golden_samples.json"),
        help="Path to golden dataset JSON"
    )
    parser.add_argument(
        "--output",
        type=str,
        default=str(Path(__file__).parent / "reports"),
        help="Output directory for results"
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=5,
        help="Max concurrent API requests"
    )
    parser.add_argument(
        "--api-url",
        type=str,
        default=ASSISTANT_API_URL,
        help="Assistant API URL"
    )

    args = parser.parse_args()

    if not any([args.all, args.retrieval, args.answers]):
        parser.print_help()
        print("\nError: Please specify --all, --retrieval, or --answers")
        sys.exit(1)

    # Load dataset
    print(f"Loading dataset from: {args.dataset}")
    samples = load_golden_dataset(args.dataset)
    print(f"Loaded {len(samples)} evaluation samples")

    # Update API URL if provided
    global ASSISTANT_API_URL
    ASSISTANT_API_URL = args.api_url

    # Run evaluation
    if args.all:
        await run_full_evaluation(samples, args.output, args.concurrency)
    elif args.retrieval:
        # For retrieval-only, we need mock responses or cached results
        print("Retrieval-only evaluation requires cached API responses or mock data")
        print("Use --all for full evaluation with live API calls")
    elif args.answers:
        # For answer-only, we need mock responses or cached results
        print("Answer-only evaluation requires cached API responses or mock data")
        print("Use --all for full evaluation with live API calls")


if __name__ == "__main__":
    asyncio.run(main())
