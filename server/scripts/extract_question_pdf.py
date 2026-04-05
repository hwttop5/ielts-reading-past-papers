import json
import os
import re
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np
import pdfplumber
from rapidocr_onnxruntime import RapidOCR

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except AttributeError:
    pass


def normalize_text(value: str) -> str:
    return (
        value.replace("\u2013", "-")
        .replace("\u2014", "-")
        .replace("\u2212", "-")
        .replace("每", "-")
        .replace("\u00a0", " ")
    )


def clean_line(value: str) -> str:
    value = normalize_text(value)
    value = re.sub(r"\s+", " ", value).strip()
    return value


def extract_text_page(page):
    text = page.extract_text() or ""
    lines = [clean_line(line) for line in text.splitlines()]
    lines = [line for line in lines if line]
    return {
        "pageNumber": page.page_number,
        "kind": "text",
        "text": "\n".join(lines),
        "lines": lines,
        "items": [],
    }


def render_page_to_image(page) -> str:
    handle = tempfile.NamedTemporaryFile(prefix="assistant-pdf-", suffix=".png", delete=False)
    handle.close()
    image = page.to_image(resolution=220)
    image.save(handle.name, format="PNG")
    return handle.name


def to_ocr_item(raw_item):
    box, text, score = raw_item
    xs = [point[0] for point in box]
    ys = [point[1] for point in box]
    return {
        "text": clean_line(str(text)),
        "score": float(score),
        "x": float(min(xs)),
        "y": float(min(ys)),
        "w": float(max(xs) - min(xs)),
        "h": float(max(ys) - min(ys)),
    }


def group_items_to_lines(items):
    groups = []

    for item in sorted(items, key=lambda current: (current["y"], current["x"])):
        if not item["text"]:
            continue

        if not groups:
            groups.append({"y": item["y"], "items": [item]})
            continue

        previous = groups[-1]
        tolerance = max(18.0, item["h"] * 0.7)

        if abs(item["y"] - previous["y"]) <= tolerance:
            previous["items"].append(item)
            previous["y"] = min(previous["y"], item["y"])
            continue

        groups.append({"y": item["y"], "items": [item]})

    lines = []
    for group in groups:
        ordered = sorted(group["items"], key=lambda current: current["x"])
        text = clean_line(" ".join(item["text"] for item in ordered))
        if text:
            lines.append(text)

    return lines


def extract_ocr_page(page, ocr):
    image_path = render_page_to_image(page)
    try:
        image = cv2.imread(image_path)
        result, _ = ocr(image)
        items = [to_ocr_item(item) for item in (result or []) if clean_line(str(item[1]))]
        lines = group_items_to_lines(items)
        return {
            "pageNumber": page.page_number,
            "kind": "ocr",
            "text": "\n".join(lines),
            "lines": lines,
            "items": items,
        }
    finally:
        if os.path.exists(image_path):
            os.remove(image_path)


def main():
    if len(sys.argv) < 2:
        raise SystemExit("Usage: extract_question_pdf.py <pdf_path>")

    pdf_path = Path(sys.argv[1])
    if not pdf_path.exists():
        raise SystemExit(f"PDF does not exist: {pdf_path}")

    ocr = RapidOCR()
    pages = []

    with pdfplumber.open(str(pdf_path)) as document:
        for page in document.pages:
            text = clean_line(page.extract_text() or "")
            if text:
                pages.append(extract_text_page(page))
                continue

            if page.images:
                pages.append(extract_ocr_page(page, ocr))
                continue

            pages.append(
                {
                    "pageNumber": page.page_number,
                    "kind": "empty",
                    "text": "",
                    "lines": [],
                    "items": [],
                }
            )

    sys.stdout.write(json.dumps({"pages": pages}, ensure_ascii=False))


if __name__ == "__main__":
    main()
