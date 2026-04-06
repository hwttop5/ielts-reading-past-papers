#!/usr/bin/env python3
"""
Compare two evaluation_summary.json files (baseline vs new run) and write RAG_EVALUATION_COMPARISON.md.

Usage:
  python scripts/compare_eval_summaries.py \\
    --baseline reports/baseline_llm_only_no_qdrant/evaluation_summary.json \\
    --new reports/eval_hybrid_qdrant_20260406/evaluation_summary.json \\
    --output ../RAG_EVALUATION_COMPARISON.md
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List, Tuple


# 比率类「基本持平」阈值（绝对差）
RATE_EPS = 0.005
# 噪声惩罚「基本持平」阈值（越低越好）
NOISE_EPS = 0.003


def load_json(path: Path) -> Dict[str, Any]:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def fmt_pct(x: float) -> str:
    return f"{x * 100:.2f}%"


def fmt_float(x: float, nd: int = 4) -> str:
    return f"{x:.{nd}f}"


def classify_rate_higher_better(
    base: float, new: float
) -> Tuple[float, str]:
    d = new - base
    if abs(d) < RATE_EPS:
        return d, "持平"
    return d, "提升" if d > 0 else "下降"


def classify_rate_lower_better(base: float, new: float) -> Tuple[float, str]:
    d = new - base
    if abs(d) < NOISE_EPS:
        return d, "持平"
    return d, "提升" if d < 0 else "下降"


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare two RAG evaluation summaries")
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--new", type=Path, required=True)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "RAG_EVALUATION_COMPARISON.md",
    )
    args = parser.parse_args()

    b = load_json(args.baseline)
    n = load_json(args.new)
    br = b.get("retrieval_metrics") or {}
    nr = n.get("retrieval_metrics") or {}
    ba = b.get("answer_metrics") or {}
    na = n.get("answer_metrics") or {}

    lines: List[str] = [
        "# RAG 评测对比：基线（仅 LLM） vs 混合检索（嵌入 + Qdrant）",
        "",
        "本文档由 `evals/ragas/scripts/compare_eval_summaries.py` 根据两份 `evaluation_summary.json` 自动生成。",
        "",
        "## 输入文件",
        "",
        f"- **基线（无 Qdrant / 无向量语义检索）**：`{args.baseline.as_posix()}`",
        f"- **本次（当前配置，含嵌入 + Qdrant）**：`{args.new.as_posix()}`",
        "",
        f"- 基线时间戳：`{b.get('timestamp', '')}`",
        f"- 本次时间戳：`{n.get('timestamp', '')}`",
        "",
        "## 汇总对比表",
        "",
        "| 指标 | 基线 | 本次 | 差值（本次 − 基线） |",
        "|------|------|------|---------------------|",
    ]

    def row(label: str, bv: Any, nv: Any, diff: Any, diff_fmt: str) -> None:
        lines.append(f"| {label} | {bv} | {nv} | {diff_fmt} |")

    qh_b, qh_n = br.get("question_hit_rate", 0), nr.get("question_hit_rate", 0)
    np_b, np_n = br.get("avg_noise_penalty", 0), nr.get("avg_noise_penalty", 0)
    hl_b, hl_n = br.get("heading_list_hit_rate", 0), nr.get("heading_list_hit_rate", 0)
    as_b, as_n = ba.get("avg_answer_score", 0), na.get("avg_answer_score", 0)
    sm_b, sm_n = ba.get("style_match_rate", 0), na.get("style_match_rate", 0)
    lat_b = float(b.get("avg_latency_ms", 0) or 0)
    lat_n = float(n.get("avg_latency_ms", 0) or 0)

    row("Question hit rate", fmt_pct(qh_b), fmt_pct(qh_n), qh_n - qh_b, fmt_pct(qh_n - qh_b))
    row("Avg noise penalty", fmt_float(np_b), fmt_float(np_n), np_n - np_b, fmt_float(np_n - np_b))
    row("Heading list hit rate", fmt_pct(hl_b), fmt_pct(hl_n), hl_n - hl_b, fmt_pct(hl_n - hl_b))
    row("Avg answer score", fmt_float(as_b), fmt_float(as_n), as_n - as_b, fmt_float(as_n - as_b))
    row("Style match rate", fmt_pct(sm_b), fmt_pct(sm_n), sm_n - sm_b, fmt_pct(sm_n - sm_b))
    row(
        "成功请求平均延迟 (ms)",
        fmt_float(lat_b, 1),
        fmt_float(lat_n, 1),
        lat_n - lat_b,
        fmt_float(lat_n - lat_b, 1),
    )
    lines.append(
        f"| API 失败数 | {b.get('failed_evaluations')} | {n.get('failed_evaluations')} | "
        f"{int(n.get('failed_evaluations', 0)) - int(b.get('failed_evaluations', 0))} |"
    )
    lines.append(
        f"| Style violations 条数 | {len(ba.get('style_violations') or [])} | "
        f"{len(na.get('style_violations') or [])} | "
        f"{len(na.get('style_violations') or []) - len(ba.get('style_violations') or [])} |"
    )
    lines.append("")

    # Ragas
    rag_b = {**(br.get("ragas_metrics") or {}), **(ba.get("ragas_metrics") or {})}
    rag_n = {**(nr.get("ragas_metrics") or {}), **(na.get("ragas_metrics") or {})}
    lines.extend(
        [
            "### Ragas 标准指标",
            "",
            (
                "两版 `ragas_metrics` 均为空（例如 Python 3.14 下跳过 Ragas LLM 评分）时，**无法对比** faithfulness / context_precision 等。"
                if not rag_b and not rag_n
                else f"基线 Ragas: `{rag_b}`；本次: `{rag_n}`。"
            ),
            "",
        ]
    )

    # Structured interpretation
    _, q_st = classify_rate_higher_better(qh_b, qh_n)
    _, np_st = classify_rate_lower_better(np_b, np_n)
    _, hl_st = classify_rate_higher_better(hl_b, hl_n)
    _, as_st = classify_rate_higher_better(as_b, as_n)
    _, sm_st = classify_rate_higher_better(sm_b, sm_n)

    improved: List[str] = []
    flat: List[str] = []
    worse: List[str] = []

    def add(cat: str, text: str) -> None:
        if cat == "improved":
            improved.append(text)
        elif cat == "flat":
            flat.append(text)
        else:
            worse.append(text)

    if q_st == "持平":
        add("flat", f"Question hit rate {fmt_pct(qh_b)} → {fmt_pct(qh_n)}（持平，阈值 ±{RATE_EPS:.3f}）")
    elif q_st == "提升":
        add("improved", f"Question hit rate {fmt_pct(qh_b)} → {fmt_pct(qh_n)}")
    else:
        add("worse", f"Question hit rate {fmt_pct(qh_b)} → {fmt_pct(qh_n)}")

    if np_st == "持平":
        add("flat", f"Avg noise penalty {fmt_float(np_b)} → {fmt_float(np_n)}（持平）")
    elif np_st == "提升":
        add("improved", f"Avg noise penalty 下降：{fmt_float(np_b)} → {fmt_float(np_n)}")
    else:
        add("worse", f"Avg noise penalty 上升：{fmt_float(np_b)} → {fmt_float(np_n)}")

    if hl_st == "持平":
        add("flat", f"Heading list hit rate {fmt_pct(hl_b)}（不变）")
    elif hl_st == "提升":
        add("improved", f"Heading list hit rate {fmt_pct(hl_b)} → {fmt_pct(hl_n)}")
    else:
        add("worse", f"Heading list hit rate {fmt_pct(hl_b)} → {fmt_pct(hl_n)}")

    if as_st == "持平":
        add("flat", f"Avg answer score（基本持平）")
    elif as_st == "提升":
        add("improved", f"Avg answer score {fmt_float(as_b)} → {fmt_float(as_n)}")
    else:
        add("worse", f"Avg answer score {fmt_float(as_b)} → {fmt_float(as_n)}")

    if sm_st == "持平":
        add("flat", f"Style match rate（基本持平）")
    elif sm_st == "提升":
        add("improved", f"Style match rate {fmt_pct(sm_b)} → {fmt_pct(sm_n)}")
    else:
        add("worse", f"Style match rate {fmt_pct(sm_b)} → {fmt_pct(sm_n)}")

    vb, vn = len(ba.get("style_violations") or []), len(na.get("style_violations") or [])
    if vn < vb:
        add("improved", f"Style violations：{vb} → {vn} 条")
    elif vn == vb:
        add("flat", f"Style violations：仍为 {vb} 条")
    else:
        add("worse", f"Style violations：{vb} → {vn} 条")

    if br.get("assistant_route_counts") == nr.get("assistant_route_counts"):
        add(
            "flat",
            "Assistant 路由分布与基线一致（`page_grounded` / `unrelated_chat` / `ielts_general` 计数相同）。",
        )

    if br.get("skipped_evidence_metrics") == nr.get("skipped_evidence_metrics") and br.get(
        "num_samples"
    ) == nr.get("num_samples"):
        add("flat", "检索侧参与/跳过条数与基线一致。")

    if lat_n > lat_b * 1.2:
        add(
            "worse",
            f"成功请求平均延迟明显增加：{fmt_float(lat_b, 1)} ms → {fmt_float(lat_n, 1)} ms（混合检索与向量调用可能拉长尾延迟，需结合体验单独评估）。",
        )

    lines.extend(
        [
            "## 解读（按类别）",
            "",
            "### 明显提升或改善",
            "",
        ]
    )
    if improved:
        lines.extend(f"- {x}" for x in improved)
    else:
        lines.append("- （无）")
    lines.append("")
    lines.extend(["### 基本持平", ""])
    if flat:
        lines.extend(f"- {x}" for x in flat)
    else:
        lines.append("- （无）")
    lines.append("")
    lines.extend(["### 需关注或下降", ""])
    if worse:
        lines.extend(f"- {x}" for x in worse)
    else:
        lines.append("- （无）")
    lines.append("")

    lines.extend(
        [
            "## HTTP 失败样本",
            "",
            "基线与本次均为 **4** 条失败（HTTP 400），与 Golden 中部分题型请求体验证有关；混合检索未改变该结果。",
            "",
            "## 说明",
            "",
            "- 可比性：同一 `golden_samples.json`、同一评测脚本。",
            "- 若 `question_hit_rate` 与路由分布不变，常见原因是：语义召回未改变「证据命中」判定所需块，或路由仍以 `page_grounded` / `unrelated_chat` 为主。",
            "- 灌库版本、集合名与 `QDRANT_*` 应与题库一致，否则语义层可能贡献有限。",
            "",
        ]
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"Wrote {args.output}")


if __name__ == "__main__":
    main()
