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
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

# server/.env + LLM_* → OPENAI_* sync happens in evaluator on import
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
    """Use sync HTTP in a worker thread so Ragas/nest_asyncio does not break httpx async."""
    import httpx

    request_payload = build_request_payload(sample)
    headers = {**EVAL_HEADERS, "X-Session-Id": session_id}

    def _post() -> Dict[str, Any]:
        with httpx.Client(timeout=120.0) as client:
            response = client.post(api_url, json=request_payload, headers=headers)
            response.raise_for_status()
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
    """Map sample id -> row dict: {error,} or {response, latency_ms}."""
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
                by_id[sid] = {
                    "response": row.get("response") or {},
                    "latency_ms": float(row.get("latency_ms", 0) or 0),
                }
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
        if "error" in raw:
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
                    error=str(raw["error"]),
                )
            )
            continue
        resp = raw.get("response") or {}
        lat = float(raw.get("latency_ms", 0) or 0)
        out.append(eval_result_from_api_response(sample, resp, lat))
    return out


def write_replay_jsonl(path: str, samples: List[EvalSample], results: List[EvalResult]) -> None:
    with open(path, "w", encoding="utf-8") as f:
        for sample, result in zip(samples, results):
            if result.error:
                f.write(json.dumps({"id": sample.id, "error": result.error}, ensure_ascii=False) + "\n")
            elif result.raw_api_response:
                f.write(
                    json.dumps(
                        {
                            "id": sample.id,
                            "latency_ms": result.latency_ms,
                            "response": result.raw_api_response,
                        },
                        ensure_ascii=False,
                    )
                    + "\n"
                )


def write_metrics_summary_file(
    output_dir: str,
    samples: List[EvalSample],
    results: List[EvalResult],
    retrieval_results: Dict[str, Any],
    answer_results: Dict[str, Any],
    replay_path: str | None,
) -> None:
    """Persist combined summary after retrieval + answer metrics (replay or live)."""
    successful_results = [r for r in results if not r.error]
    failed_results = [r for r in results if r.error]
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
        "replay_file": replay_path,
    }
    summary_path = os.path.join(output_dir, "evaluation_summary.json")
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)


def write_markdown_report(output_dir: str, config_note: str) -> None:
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

    semaphore = asyncio.Semaphore(max_concurrency)

    async def bounded_evaluate(sample: EvalSample) -> EvalResult:
        async with semaphore:
            return await evaluate_sample(sample, ASSISTANT_API_URL)

    tasks = [bounded_evaluate(sample) for sample in samples]
    results = await asyncio.gather(*tasks)

    if write_replay:
        write_replay_jsonl(replay_path, samples, list(results))
        print(f"Wrote replay file: {replay_path}", flush=True)

    successful_results = [r for r in results if not r.error]
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
            "replay_file": None,
        }
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
        write_metrics_summary_file(
            output_dir, samples, results, retrieval_results, answer_results, replay_path
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

    args = parser.parse_args()

    # `--replay` alone should run both metric groups (matches README one-liner)
    if args.replay and not any([args.all, args.retrieval, args.answers]):
        args.retrieval = True
        args.answers = True

    if not any([args.all, args.retrieval, args.answers]):
        parser.print_help()
        print("\nError: Please specify --all, --retrieval, or --answers")
        sys.exit(1)

    print(f"Loading dataset from: {args.dataset}")
    samples = load_golden_dataset(args.dataset)
    print(f"Loaded {len(samples)} evaluation samples")

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
        run_metrics_only(
            samples,
            results,
            args.output,
            retrieval=do_r,
            answers=do_a,
            replay_path=args.replay,
            write_summary=args.write_metrics_summary,
        )
        return

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
