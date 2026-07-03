import json
import re
import sys
import argparse
from pathlib import Path

try:
    import cv2
    import fitz
    from rapidocr_onnxruntime import RapidOCR
except ModuleNotFoundError as error:
    missing = error.name or str(error)
    raise SystemExit(
        "Missing PDF OCR dependency: "
        f"{missing}\n"
        "Install locally with:\n"
        "  python -m pip install --user pymupdf opencv-python-headless rapidocr_onnxruntime\n"
    ) from error

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except AttributeError:
    pass

ROOT = Path(__file__).resolve().parents[1]
INDEX_PATH = ROOT / "src" / "utils" / "questionIndex.json"
NATIVE_EXAMS_DIR = ROOT / "src" / "generated" / "reading-native" / "exams"
PDF_ROOT = ROOT / "public"
EXPLANATIONS_DIR = ROOT / "public" / "assets" / "generated" / "reading-explanations"
EXPLANATION_MANIFEST_PATH = EXPLANATIONS_DIR / "manifest.js"
OCR_TMP_DIR = ROOT / "tmp" / "pdfs" / "p2-answer-ocr"

OCR_SCALE = 2
OCR_RETRY_SCALE = 4
MAX_ANSWER_PAGES_TO_SCAN = 4

PDF_ROW_OVERRIDES = {
    "p3-high-180": {
        29: {
            "raw": '段落讲述 Kuhn 指出科学进步会受社会因素影响：“...shift... can include social factors...” - 引库恩是为了说明科学可受非科学因素影响。',
            "evidence": '段落讲述 Kuhn 指出科学进步会受社会因素影响：“...shift... can include social factors...” - 引库恩是为了说明科学可受非科学因素影响。',
            "explanation": "",
        },
        39: {
            "raw": '支持者引语：“...evidence for harm is limited and dubious... likely benefits outweigh dangers...” - 认为证据不足以采取保守策略。',
            "evidence": '支持者引语：“...evidence for harm is limited and dubious... likely benefits outweigh dangers...” - 认为证据不足以采取保守策略。',
            "explanation": "",
        },
        40: {
            "raw": '反对者引语：“...I oppose fluoridation ... and favor the voluntary use of fluoride tablets...” - 主张个人自愿选择是否摄入氟化物。',
            "evidence": '反对者引语：“...I oppose fluoridation ... and favor the voluntary use of fluoride tablets...” - 主张个人自愿选择是否摄入氟化物。',
            "explanation": "",
        },
    },
}


def clean_text(value):
    text = str(value or "")
    replacements = {
        "\u00a0": " ",
        "\u2010": "-",
        "\u2011": "-",
        "\u2012": "-",
        "\u2013": "-",
        "\u2014": "-",
        "\u2212": "-",
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\ufeff": "",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)
    return re.sub(r"\s+", " ", text).strip()


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json_js_payload(exam_id, payload):
    target = EXPLANATIONS_DIR / f"{exam_id}.js"
    json_payload = json.dumps(payload, ensure_ascii=False, indent=2)
    source = f"""(function registerReadingExplanationData(global) {{
  'use strict';
  if (!global.__READING_EXPLANATION_DATA__ || typeof global.__READING_EXPLANATION_DATA__.register !== "function") {{
    throw new Error("reading_explanation_registry_missing");
  }}
  global.__READING_EXPLANATION_DATA__.register({json.dumps(exam_id)}, {json_payload}
  );
}})(typeof window !== "undefined" ? window : globalThis);
"""
    target.write_text(source, encoding="utf-8")


def load_explanation_manifest():
    source = EXPLANATION_MANIFEST_PATH.read_text(encoding="utf-8")
    match = re.search(
        r"__READING_EXPLANATION_MANIFEST__\s*=\s*(\{[\s\S]*?\})\s*;",
        source,
    )
    if not match:
        raise RuntimeError(f"Unable to parse explanation manifest: {EXPLANATION_MANIFEST_PATH}")
    return json.loads(match.group(1))


def write_explanation_manifest(manifest):
    sorted_manifest = dict(sorted(manifest.items(), key=lambda entry: entry[0]))
    payload = json.dumps(sorted_manifest, ensure_ascii=False, indent=2)
    source = f"""(function registerReadingExplanationManifest(global) {{
  'use strict';
  global.__READING_EXPLANATION_MANIFEST__ = {payload};
}})(typeof window !== "undefined" ? window : globalThis);
"""
    EXPLANATION_MANIFEST_PATH.write_text(source, encoding="utf-8")


def ensure_question_index_coverage(manifest, category, unavailable_ids=None):
    unavailable_ids = set(unavailable_ids or [])
    items = read_json(INDEX_PATH)
    next_items = []
    for item in items:
        if item.get("category") != category or item.get("launchMode") != "unified":
            next_items.append(item)
            continue

        if item.get("id") in unavailable_ids:
            next_item = {
                key: value
                for key, value in item.items()
                if key not in {"explanationKey", "hasExplanation"}
            }
            next_item["hasExplanation"] = False
            next_items.append(next_item)
            continue

        if item.get("id") not in manifest:
            next_items.append(item)
            continue

        next_item = {}
        inserted = False
        for key, value in item.items():
            if key == "explanationKey":
                continue
            if key == "hasExplanation":
                next_item["explanationKey"] = item["id"]
                next_item["hasExplanation"] = True
                inserted = True
                continue
            next_item[key] = value
        if not inserted:
            next_item["explanationKey"] = item["id"]
            next_item["hasExplanation"] = True
        next_items.append(next_item)

    INDEX_PATH.write_text(json.dumps(next_items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def format_answer(value):
    if isinstance(value, list):
        parts = [clean_text(entry) for entry in value if clean_text(entry)]
        return " / ".join(parts) if parts else "N/A"
    text = clean_text(value)
    return text or "N/A"


def render_page_for_ocr(document, page_index, target, scale=OCR_SCALE):
    page = document[page_index]
    pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
    pixmap.save(target)
    image = cv2.imread(str(target))
    if image is None:
        raise RuntimeError(f"Unable to read rendered OCR image: {target}")
    return image, pixmap.width, pixmap.height


def ocr_page(ocr, document, pdf_path, page_index, temp_prefix, scale=OCR_SCALE):
    OCR_TMP_DIR.mkdir(parents=True, exist_ok=True)
    suffix = f"page-{page_index + 1}" if scale == OCR_SCALE else f"page-{page_index + 1}-scale-{scale}"
    target = OCR_TMP_DIR / f"{temp_prefix}-{suffix}.png"
    image, width, height = render_page_for_ocr(document, page_index, target, scale)
    result, _ = ocr(image)
    items = []
    for box, text, score in result or []:
        label = clean_text(text)
        if not label:
            continue
        xs = [float(point[0]) for point in box]
        ys = [float(point[1]) for point in box]
        left = min(xs)
        top = min(ys)
        right = max(xs)
        bottom = max(ys)
        items.append(
            {
                "text": label,
                "score": float(score),
                "x": left,
                "y": top,
                "w": right - left,
                "h": bottom - top,
            }
        )
    return items, width, height


def question_number_rows(items, width, question_numbers):
    expected = set(question_numbers)
    rows = []

    def marker_numbers(text):
        compact = clean_text(text)
        range_match = re.fullmatch(r"(\d{1,2})\s*[-–]\s*(\d{1,2})", compact)
        if range_match:
            start = int(range_match.group(1))
            end = int(range_match.group(2))
            if start <= end and end - start <= 3:
                return [number for number in range(start, end + 1) if number in expected]

        joined_match = re.fullmatch(r"(\d{2})(\d{2})", compact)
        if joined_match:
            numbers = [int(joined_match.group(1)), int(joined_match.group(2))]
            if all(number in expected for number in numbers):
                return numbers

        if re.match(r"^\d{1,2}\s*[-–]\s*\d", compact):
            return []

        start_match = re.match(r"^(\d{1,2})(?:\b|\s|[\(\[（A-Za-z])", compact)
        if start_match:
            number = int(start_match.group(1))
            if number in expected:
                return [number]

        return []

    for item in items:
        if item["x"] >= width * 0.25:
            continue
        for number in marker_numbers(item["text"]):
            rows.append((number, item["y"], item["x"]))

    deduped = []
    for number, y, x in sorted(rows, key=lambda entry: (entry[1], entry[0])):
        if deduped and deduped[-1][0] == number and abs(deduped[-1][1] - y) < 10:
            continue
        deduped.append((number, y, x))
    return deduped


def looks_like_section_header(item, width):
    text = item["text"]
    if item["x"] > width * 0.48:
        return False
    if re.search(r"\bQuestions?\s*\d", text, re.IGNORECASE):
        return True
    if re.search(r"\bQ\s*\d", text, re.IGNORECASE):
        return True
    if re.search(r"\b(Summary|completion|Match|matching|heading|headings|choice|TRUE|FALSE|NOT GIVEN)\b", text, re.IGNORECASE):
        return True
    if re.search(r"\d+\s*[-/]\s*\d+", text) and item["x"] < width * 0.25:
        return True
    return False


def line_clusters(items):
    clusters = []
    for item in sorted(items, key=lambda current: (current["y"], current["x"])):
        if clusters and abs(clusters[-1]["y"] - item["y"]) <= 9:
            clusters[-1]["items"].append(item)
            clusters[-1]["y"] = min(clusters[-1]["y"], item["y"])
            clusters[-1]["x_min"] = min(clusters[-1]["x_min"], item["x"])
            continue
        clusters.append(
            {
                "y": item["y"],
                "x_min": item["x"],
                "items": [item],
            }
        )

    for cluster in clusters:
        cluster["items"].sort(key=lambda current: current["x"])
        cluster["text"] = clean_text(" ".join(item["text"] for item in cluster["items"]))
    return clusters


def parse_question_range(text):
    compact = clean_text(text)
    match = re.search(r"Questions?\s*(\d{1,2})\s*[-–—~－]\s*(\d{1,2})", compact, re.IGNORECASE)
    if not match:
        match = re.search(r"[（(]\s*(\d{1,2})\s*[-–—~－]\s*(\d{1,2})\s*[)）]", compact)
    if not match:
        joined = re.search(r"Questions?\s*(\d{2})(\d{2})", compact.replace(" ", ""), re.IGNORECASE)
        if joined:
            match = joined
    if not match:
        return None
    start = int(match.group(1))
    end = int(match.group(2))
    if start > end or end - start > 12:
        return None
    return start, end


def is_multi_choice_header(item, width):
    if item["x"] > width * 0.42:
        return False
    text = clean_text(item["text"])
    if not parse_question_range(text):
        return False
    return bool(re.search(r"多选|Choose\s*TWO|ChooseTWO|multi", text, re.IGNORECASE))


def option_marker_pattern(answer):
    escaped = re.escape(clean_text(answer))
    return re.compile(rf"^{escaped}(?:\b|\s|[（(A-Za-z\u4e00-\u9fff])", re.IGNORECASE)


def multi_choice_markers(items, width, height, question_info):
    answer_by_number = {
        entry["number"]: format_answer(entry.get("answer"))
        for entry in question_info
    }
    expected_numbers = set(answer_by_number)
    headers = [
        item
        for item in items
        if is_multi_choice_header(item, width)
    ]
    if not headers:
        return []

    clusters = line_clusters(items)
    all_section_ys = sorted(
        item["y"]
        for item in items
        if looks_like_section_header(item, width) or is_multi_choice_header(item, width)
    )
    synthetic = []

    for header in sorted(headers, key=lambda current: current["y"]):
        q_range = parse_question_range(header["text"])
        if not q_range:
            continue
        start, end = q_range
        numbers = [number for number in range(start, end + 1) if number in expected_numbers]
        if not numbers:
            continue
        section_end = next(
            (y - 4 for y in all_section_ys if y > header["y"] + 18),
            height,
        )

        section_clusters = [
            cluster
            for cluster in clusters
            if header["y"] + 18 < cluster["y"] < section_end
        ]
        for number in numbers:
            answer = answer_by_number.get(number)
            if not answer or len(answer) > 2:
                continue
            pattern = option_marker_pattern(answer)
            match = next(
                (
                    cluster
                    for cluster in section_clusters
                    if cluster["x_min"] < width * 0.28 and pattern.search(cluster["text"])
                ),
                None,
            )
            if match:
                synthetic.append((number, match["y"], match["x_min"]))

    return synthetic


def is_row_start_candidate(cluster, width):
    text = clean_text(cluster.get("text", ""))
    if not text:
        return False
    if re.search(
        r"Questions?|题号|答案$|^答案[:：]|解析$|定位句|关键定位|选项$|判断$|题干关键词|每题",
        text,
        re.IGNORECASE,
    ):
        return False
    if cluster["x_min"] < width * 0.36:
        return True
    if re.match(r"^[A-H](?:\b|\s|[（(A-Za-z\u4e00-\u9fff])", text, re.IGNORECASE):
        return True
    if re.match(r"^[ivx]+\b", text, re.IGNORECASE):
        return True
    if text.startswith("同上"):
        return True
    return False


def choose_synthetic_rows(candidates, count, start_y, end_y, used_ys):
    available = [
        candidate
        for candidate in sorted(candidates, key=lambda current: current["y"])
        if not any(abs(candidate["y"] - used_y) < 14 for used_y in used_ys)
    ]
    if count <= 0 or not available:
        return []
    if len(available) <= count:
        return available

    selected = []
    remaining = available[:]
    for index in range(1, count + 1):
        target_y = start_y + ((end_y - start_y) * index / (count + 1))
        best = min(remaining, key=lambda candidate: abs(candidate["y"] - target_y))
        tolerance = max(90, (end_y - start_y) / max(count + 1, 1))
        if abs(best["y"] - target_y) <= tolerance:
            selected.append(best)
            remaining.remove(best)
    return sorted(selected, key=lambda current: current["y"])


def augment_missing_markers(markers, items, width, height, question_info, section_header_ys):
    expected_numbers = [entry["number"] for entry in question_info]
    expected_set = set(expected_numbers)
    augmented = list(markers)
    used_ys = [entry[1] for entry in augmented]
    existing_numbers = {entry[0] for entry in augmented}

    for marker in multi_choice_markers(items, width, height, question_info):
        if marker[0] in expected_set and marker[0] not in existing_numbers:
            augmented.append(marker)
            used_ys.append(marker[1])
            existing_numbers.add(marker[0])

    clusters = [
        cluster
        for cluster in line_clusters(items)
        if is_row_start_candidate(cluster, width)
    ]

    def add_missing_between(start_number, end_number, start_y, end_y):
        nonlocal augmented, used_ys, existing_numbers
        missing = [
            number
            for number in expected_numbers
            if start_number < number < end_number and number not in existing_numbers
        ]
        if not missing:
            return
        candidates = [
            cluster
            for cluster in clusters
            if start_y + 14 < cluster["y"] < end_y - 8
        ]
        for number, cluster in zip(missing, choose_synthetic_rows(candidates, len(missing), start_y, end_y, used_ys)):
            augmented.append((number, cluster["y"], cluster["x_min"]))
            used_ys.append(cluster["y"])
            existing_numbers.add(number)

    augmented.sort(key=lambda entry: (entry[1], entry[0]))

    for index, (number, start_y, _x) in enumerate(list(augmented)):
        next_marker = next(
            (marker for marker in augmented[index + 1:] if marker[1] > start_y + 10 and marker[0] in expected_set),
            None,
        )
        next_header_y = next((y for y in section_header_ys if y > start_y + 14), None)

        if next_marker and (next_header_y is None or next_marker[1] < next_header_y):
            add_missing_between(number, next_marker[0], start_y, next_marker[1])
            continue

        if next_header_y is not None:
            next_existing_after_header = next(
                (
                    marker
                    for marker in augmented
                    if marker[1] > next_header_y + 14 and marker[0] in expected_set
                ),
                None,
            )
            upper_number = next_existing_after_header[0] if next_existing_after_header else max(expected_numbers) + 1
            add_missing_between(number, upper_number, start_y, next_header_y)

    augmented.sort(key=lambda entry: (entry[1], entry[0]))

    for header_y in section_header_ys:
        next_marker = next(
            (marker for marker in augmented if marker[1] > header_y + 14 and marker[0] in expected_set),
            None,
        )
        previous_marker = next(
            (marker for marker in reversed(augmented) if marker[1] < header_y - 8 and marker[0] in expected_set),
            None,
        )
        if not next_marker:
            continue
        lower_number = previous_marker[0] if previous_marker else min(expected_numbers) - 1
        missing = [
            number
            for number in expected_numbers
            if lower_number < number < next_marker[0] and number not in existing_numbers
        ]
        if not missing:
            continue
        candidates = [
            cluster
            for cluster in clusters
            if header_y + 14 < cluster["y"] < next_marker[1] - 8
        ]
        for number, cluster in zip(missing, choose_synthetic_rows(candidates, len(missing), header_y, next_marker[1], used_ys)):
            augmented.append((number, cluster["y"], cluster["x_min"]))
            used_ys.append(cluster["y"])
            existing_numbers.add(number)

    return sorted(augmented, key=lambda entry: (entry[1], entry[0]))


def infer_explanation_x(items, width):
    right_text_starts = [
        item["x"]
        for item in items
        if item["x"] > width * 0.40 and len(item["text"]) >= 2
    ]
    if right_text_starts:
        return min(right_text_starts)
    return width * 0.52


def parse_answer_rows(items, width, height, question_info):
    question_numbers = [entry["number"] for entry in question_info]
    markers = question_number_rows(items, width, question_numbers)
    section_header_ys = sorted(
        item["y"]
        for item in items
        if looks_like_section_header(item, width)
    )
    markers = augment_missing_markers(markers, items, width, height, question_info, section_header_ys)
    if len(markers) < 3:
        return {}

    answer_x = width * 0.105
    evidence_x = width * 0.16
    explanation_x = infer_explanation_x(items, width)
    rows = {}

    for index, (number, start_y, _x) in enumerate(markers):
        later_marker_y = next((marker[1] for marker in markers[index + 1:] if marker[1] > start_y + 6), None)
        next_marker_y = later_marker_y - 3 if later_marker_y is not None else min(height, start_y + 110)
        next_section_y = next(
            (header_y - 3 for header_y in section_header_ys if start_y + 12 < header_y < next_marker_y),
            next_marker_y,
        )
        end_y = min(next_marker_y, next_section_y)
        row_items = [
            item
            for item in items
            if start_y - 5 <= item["y"] < end_y
        ]
        columns = {
            "answer": [],
            "evidence": [],
            "explanation": [],
            "raw": [],
        }

        for item in sorted(row_items, key=lambda current: (current["y"], current["x"])):
            text = item["text"]
            if item["x"] < width * 0.25 and re.match(rf"^{number}(?:\b|\s|[\(\[（A-Za-z])", text):
                continue
            columns["raw"].append(text)
            if item["x"] >= explanation_x - 10:
                columns["explanation"].append(text)
            elif item["x"] >= evidence_x - 10:
                columns["evidence"].append(text)
            elif item["x"] >= answer_x - 15:
                columns["answer"].append(text)

        rows[number] = {
            "answer": clean_text(" ".join(columns["answer"])),
            "evidence": clean_text(" ".join(columns["evidence"])),
            "explanation": clean_text(" ".join(columns["explanation"])),
            "raw": clean_text(" ".join(columns["raw"])),
        }

    return rows


def parse_display_numbers(value):
    text = clean_text(value)
    numbers = [int(entry) for entry in re.findall(r"\d+", text)]
    return numbers


def build_question_info(exam):
    info = []
    for question_id in exam.get("questionOrder", []):
        display_value = exam.get("questionDisplayMap", {}).get(question_id, question_id)
        display_numbers = parse_display_numbers(display_value)
        if not display_numbers:
            display_numbers = parse_display_numbers(question_id)
        if not display_numbers:
            raise ValueError(f"Unable to derive question number for {exam.get('examId', '')}:{question_id}")
        display_label = clean_text(display_value)
        info.append(
            {
                "questionId": question_id,
                "number": display_numbers[0],
                "displayLabel": display_label or str(display_numbers[0]),
                "answer": exam.get("answerKey", {}).get(question_id),
            }
        )
    return info


def should_skip_text_question_page(page):
    text = clean_text(page.get_text("text") or "")
    if len(text) < 160:
        return False
    if any(marker in text for marker in ["答案", "解析", "解释", "定位"]):
        return False
    return bool(re.search(r"\bQuestions?\s+\d", text, re.IGNORECASE))


def extract_pdf_rows(ocr, exam_id, pdf_path, question_info):
    document = fitz.open(pdf_path)
    rows = {}
    pages_with_rows = []
    start_page = max(0, len(document) - MAX_ANSWER_PAGES_TO_SCAN)
    expected_numbers = {entry["number"] for entry in question_info}
    for page_index in range(len(document) - 1, start_page - 1, -1):
        if should_skip_text_question_page(document[page_index]):
            continue
        items, width, height = ocr_page(ocr, document, pdf_path, page_index, exam_id)
        page_rows = parse_answer_rows(items, width, height, question_info)
        if page_rows:
            rows.update(page_rows)
            pages_with_rows.append(page_index + 1)
            if expected_numbers.issubset(rows.keys()):
                break

    incomplete_numbers = {
        number
        for number in expected_numbers
        if not rows.get(number) or not clean_text(rows[number].get("raw"))
    }
    if incomplete_numbers and pages_with_rows:
        for page_number in pages_with_rows:
            items, width, height = ocr_page(
                ocr,
                document,
                pdf_path,
                page_number - 1,
                f"{exam_id}-retry",
                scale=OCR_RETRY_SCALE,
            )
            retry_rows = parse_answer_rows(items, width, height, question_info)
            for number in list(incomplete_numbers):
                retry_row = retry_rows.get(number)
                if retry_row and clean_text(retry_row.get("raw")):
                    rows[number] = retry_row
                    incomplete_numbers.remove(number)
            if not incomplete_numbers:
                break
    for number, override in PDF_ROW_OVERRIDES.get(exam_id, {}).items():
        if number in expected_numbers and not clean_text(rows.get(number, {}).get("raw")):
            rows[number] = override
    pages_with_rows.sort()
    return rows, pages_with_rows, len(document)


def build_item_text(number, official_answer, row, display_label=None):
    answer = format_answer(official_answer)
    evidence = clean_text(row.get("evidence") if row else "")
    explanation = clean_text(row.get("explanation") if row else "")
    raw = clean_text(row.get("raw") if row else "")
    title_label = clean_text(display_label) or str(number)

    lines = [
        f"题目 {title_label}",
        f"答案：{answer}",
    ]

    if evidence and explanation:
        lines.append(f"PDF 定位：{evidence}")
        lines.append(f"PDF 解析：{explanation}")
    elif evidence:
        lines.append(f"PDF 定位/解析：{evidence}")
    elif explanation:
        lines.append(f"PDF 解析：{explanation}")
    elif raw:
        lines.append(f"PDF 解析页 OCR：{raw}")
    else:
        lines.append("PDF 解析：未能从 PDF 答案解析页可靠识别该题的完整解析，请以 PDF 原始解析页为准。")

    return "\n".join(lines)


def group_range(exam, group):
    numbers = []
    for question_id in group.get("questionIds", []):
        display_numbers = parse_display_numbers(exam.get("questionDisplayMap", {}).get(question_id, question_id))
        numbers.extend(display_numbers)
    if not numbers:
        return None
    return {
        "start": min(numbers),
        "end": max(numbers),
    }


def build_explanation_payload(item, exam, pdf_rows, pages_with_rows, total_pages):
    question_info = build_question_info(exam)
    by_question_id = {entry["questionId"]: entry for entry in question_info}
    question_explanations = []
    fallback_count = 0

    for group_index, group in enumerate(exam.get("questionGroups", []), start=1):
        question_ids = group.get("questionIds") or []
        items = []
        for question_id in question_ids:
            info = by_question_id.get(question_id)
            if not info:
                continue
            row = pdf_rows.get(info["number"])
            if not row or not clean_text(row.get("raw")):
                fallback_count += 1
            items.append(
                {
                    "questionNumber": info["number"],
                    "text": build_item_text(info["number"], info["answer"], row, info.get("displayLabel")),
                    "questionId": question_id,
                }
            )

        if not items:
            continue

        q_range = group_range(exam, group)
        range_label = f"Questions {q_range['start']}-{q_range['end']}" if q_range else f"Group {group_index}"
        section_title = f"{group_index}. {clean_text(group.get('kind', 'questions')).replace('_', ' ')} ({range_label})"
        question_explanations.append(
            {
                "sectionTitle": section_title,
                "mode": "group",
                "items": items,
                "questionRange": q_range,
                "text": "\n\n".join(entry["text"] for entry in items),
            }
        )

    pdf_name = Path(item.get("pdfPath", "")).name
    return {
        "schemaVersion": "ReadingExplanationV1",
        "examId": item["id"],
        "meta": {
            "examId": item["id"],
            "title": exam.get("meta", {}).get("originalTitle") or exam.get("meta", {}).get("title") or item.get("displayTitle") or item["id"],
            "category": item.get("category") or exam.get("meta", {}).get("category") or "",
            "sourceDoc": pdf_name,
            "noteType": "pdf_answer_explanation_ocr",
            "matchedTitle": exam.get("meta", {}).get("originalTitle") or item.get("displayTitle") or item["id"],
            "ocrPages": pages_with_rows,
            "pdfPageCount": total_pages,
            "fallbackQuestionCount": fallback_count,
        },
        "passageNotes": [
            {
                "label": "Source",
                "text": "Explanations were extracted from the answer-analysis table in the source PDF by OCR. Minor OCR mistakes may remain; the official answer key is used for the answer field.",
            }
        ],
        "questionExplanations": question_explanations,
    }


def parse_args():
    parser = argparse.ArgumentParser(
        description="Backfill reading explanations from source PDF answer-analysis pages by OCR."
    )
    parser.add_argument(
        "--category",
        default="P2",
        choices=["P2", "P3"],
        help="Question category to backfill. Defaults to P2.",
    )
    return parser.parse_args()


def main():
    global OCR_TMP_DIR
    args = parse_args()
    category = args.category
    label = category.lower()
    OCR_TMP_DIR = ROOT / "tmp" / "pdfs" / f"{label}-answer-ocr"

    question_index = read_json(INDEX_PATH)
    manifest = load_explanation_manifest()
    category_items = [
        item
        for item in question_index
        if item.get("category") == category and item.get("launchMode") == "unified"
    ]
    ocr = RapidOCR()

    generated = 0
    total_fallback = 0
    missing_pdf = []
    sparse = []
    unavailable = []

    for item in category_items:
        exam_path = NATIVE_EXAMS_DIR / f"{item['id']}.json"
        if not exam_path.exists():
            raise RuntimeError(f"Native exam JSON missing: {exam_path}")
        exam = read_json(exam_path)
        question_info = build_question_info(exam)
        pdf_path = PDF_ROOT / item["pdfPath"].lstrip("/")
        if not pdf_path.exists():
            missing_pdf.append(item["id"])
            continue

        pdf_rows, pages_with_rows, total_pages = extract_pdf_rows(ocr, item["id"], pdf_path, question_info)
        payload = build_explanation_payload(item, exam, pdf_rows, pages_with_rows, total_pages)
        fallback_count = payload["meta"]["fallbackQuestionCount"]
        if fallback_count == len(question_info) and not pages_with_rows:
            unavailable.append(item["id"])
            manifest.pop(item["id"], None)
            target = EXPLANATIONS_DIR / f"{item['id']}.js"
            if target.exists():
                target.unlink()
            print(
                f"[{label}-pdf] {item['id']}: no PDF answer-analysis rows found; leaving explanation unavailable",
                flush=True,
            )
            continue
        if fallback_count:
            sparse.append(f"{item['id']}:{fallback_count}")
        total_fallback += fallback_count
        write_json_js_payload(item["id"], payload)
        manifest[item["id"]] = {
            "examId": item["id"],
            "dataKey": item["id"],
            "script": f"../reading-explanations/{item['id']}.js",
            "title": exam.get("meta", {}).get("title") or item.get("displayTitle") or item["id"],
            "sourceDoc": Path(item["pdfPath"]).name,
            "matchedTitle": exam.get("meta", {}).get("title") or item.get("displayTitle") or item["id"],
        }
        generated += 1
        print(
            f"[{label}-pdf] {item['id']}: rows={len(pdf_rows)}/{len(question_info)}, "
            f"pages={pages_with_rows or '-'}, fallback={fallback_count}",
            flush=True,
        )

    write_explanation_manifest(manifest)
    ensure_question_index_coverage(manifest, category, unavailable)

    print(
        f"[backfill-pdf-explanations] generated {generated} {category} PDF explanation file(s), "
        f"fallback question(s): {total_fallback}",
        flush=True,
    )
    if sparse:
        print(f"[backfill-pdf-explanations] OCR fallback details: {', '.join(sparse)}", flush=True)
    if unavailable:
        print(f"[backfill-pdf-explanations] PDF answer-analysis unavailable: {', '.join(unavailable)}", flush=True)
    if missing_pdf:
        raise SystemExit(f"Missing PDF(s): {', '.join(missing_pdf)}")


if __name__ == "__main__":
    main()
