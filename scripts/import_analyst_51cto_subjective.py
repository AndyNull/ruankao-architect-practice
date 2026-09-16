from __future__ import annotations

import html
import json
import re
from pathlib import Path
from typing import Any

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "exam-materials" / "系统分析师" / "raw" / "51cto" / "真题"
OUTPUT = ROOT / "data" / "banks" / "analyst-51cto-subjective.json"
TRIAL_NUMBERS = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5}


def _plain_html(value: str) -> str:
    """Convert the captured article HTML to readable text."""
    text = re.sub(r"<(?:br|/p|/div|/li|/h\d)\b[^>]*>", "\n", value, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text).replace("\xa0", " ")
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _split_questions(value: str) -> tuple[str, list[tuple[str, str]]]:
    """Split a case block into its background and numbered questions."""
    matches = list(re.finditer(r"^【问题\s*(\d+)】[^\n]*$", value, re.M))
    if not matches:
        return value.strip(), []
    questions = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(value)
        questions.append((match.group(1), value[match.start():end].strip()))
    return value[: matches[0].start()].strip(), questions


def _parse_html_case(file: Path, number: int) -> dict[str, Any] | None:
    """Parse one 51CTO article containing a case and source answers."""
    raw = file.read_text(encoding="utf-8")
    canonical = re.search(r'<link rel="canonical" href="([^"]+)"', raw)
    start = raw.find('id="container"')
    start = raw.find(">", start) + 1
    end = raw.find('<div class="line">', start)
    if start <= 0 or end < start or not canonical:
        raise ValueError(f"无法解析 51CTO 页面：{file}")
    text = _plain_html(raw[start:end])
    question_text, marker, answer_text = text.partition("答案及解析")
    if not marker:
        return None
    answer_text = answer_text.lstrip(" ：:\n")
    start = re.search(r"\d+\.\s*阅读", question_text)
    question_text = question_text[start.start():] if start else question_text
    description, prompts = _split_questions(question_text)
    _, answer_blocks = _split_questions(answer_text)
    answers = {label: re.sub(r"^【问题\s*\d+】[^\n]*\n?", "", body).removeprefix("参考答案：").strip() for label, body in answer_blocks}
    return {
        "id": f"analyst-case-real-2025年上半年-51cto-{number}",
        "sourceType": "real",
        "term": "2025年上半年",
        "paper": "2025年上半年案例分析",
        "module": "software_engineering",
        "title": f"试题{number}",
        "description": description,
        "subQuestions": [
            {"question_label": f"问题{label}", "prompt": prompt, "reference_answer": answers.get(label, "")}
            for label, prompt in prompts
        ],
        "sourceFile": canonical.group(1),
        "collection": "51cto",
    }


def _pdf_text(file: Path) -> str:
    """Extract text from a locally archived PDF without changing page content."""
    document = PdfReader(file)
    text = "\n".join(page.extract_text() or "" for page in document.pages)
    text = re.sub(r"非学员版本[^\n]*\n51CTO 软考教研团队出品\n51CTO 软考：rk\.51cto\.com\n\d+\n", "", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _trial_sections(value: str) -> list[tuple[int, str]]:
    """Split a PDF text stream into trial sections."""
    matches = list(re.finditer(r"^试题([一二三四五])(?:[^\n]*)$", value, re.M))
    result = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(value)
        result.append((TRIAL_NUMBERS[match.group(1)], value[match.start():end].strip()))
    return result


def _parse_pdf_cases(file: Path) -> list[dict[str, Any]]:
    """Parse the 2025 second-half case paper and its answer section."""
    text = _pdf_text(file)
    question_text, answer_text = re.split(r"案例分析参考答案", text, maxsplit=1)
    answers_by_trial = dict(_trial_sections(answer_text))
    cases = []
    for number, body in _trial_sections(question_text):
        description, prompts = _split_questions(body)
        _, answer_blocks = _split_questions(answers_by_trial.get(number, ""))
        answers = {label: re.sub(r"^【问题\s*\d+】[^\n]*\n?", "", block).removeprefix("参考答案：").strip() for label, block in answer_blocks}
        cases.append({
            "id": f"analyst-case-real-2025年下半年-51cto-{number}",
            "sourceType": "real",
            "term": "2025年下半年",
            "paper": "2025年下半年案例分析",
            "module": "software_engineering",
            "title": f"试题{number}",
            "description": description,
            "subQuestions": [
                {"question_label": f"问题{label}", "prompt": prompt, "reference_answer": answers.get(label, "")}
                for label, prompt in prompts
            ],
            "sourceFile": "https://rk.51cto.com/",
            "collection": "51cto",
        })
    return cases


def _parse_pdf_essays(file: Path) -> list[dict[str, Any]]:
    """Parse every essay prompt from the 2025 second-half paper."""
    essays = []
    for number, prompt in _trial_sections(_pdf_text(file)):
        lines = [line.strip() for line in prompt.splitlines() if line.strip()]
        title = lines[1] if len(lines) > 1 else f"论文{number}"
        essays.append({
            "id": f"analyst-essay-real-2025年下半年-51cto-{number}",
            "sourceType": "real",
            "term": "2025年下半年",
            "paper": "2025年下半年论文",
            "module": "software_engineering",
            "title": title,
            "prompt": prompt,
            "writingPoints": "",
            "sourceFile": "https://rk.51cto.com/",
            "collection": "51cto",
        })
    return essays


def _is_complete_case(item: dict[str, Any]) -> bool:
    """Return whether the captured prompt still contains all answerable subquestions."""
    questions = item["subQuestions"]
    labels = [question["question_label"].removeprefix("问题") for question in questions]
    return (
        len(item["description"]) >= 120
        and labels == [str(number) for number in range(1, len(questions) + 1)]
        and all(len(question["prompt"].strip()) >= 8 for question in questions)
    )


def main() -> None:
    """Build the structured 51CTO analyst supplement."""
    cases = [item for number in range(1, 6) if (item := _parse_html_case(SOURCE / "2025年上半年" / f"案例分析-试题{number}.html", number))]
    cases.extend(_parse_pdf_cases(SOURCE / "2025年下半年" / "案例分析.pdf"))
    cases = [item for item in cases if _is_complete_case(item)]
    essays = _parse_pdf_essays(SOURCE / "2025年下半年" / "论文.pdf")
    OUTPUT.write_text(json.dumps({"schemaVersion": 1, "cases": cases, "essays": essays}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"系统分析师 51CTO：{len(cases)} cases, {len(essays)} essays")


if __name__ == "__main__":
    main()
