from __future__ import annotations

import contextlib
import io
import json
import re
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = ROOT / "data" / "exam-materials" / "系统规划与管理师" / "raw" / "xiaomabenten" / "真题"
OUTPUT = ROOT / "data" / "banks" / "planner-pdf-supplement.json"


def extract(path: Path) -> str:
    with contextlib.redirect_stderr(io.StringIO()):
        return "\n".join(page.extract_text() or "" for page in PdfReader(str(path)).pages)


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip(" -：:")


def parse_choice_pdf(path: Path, term: str) -> list[dict]:
    text = extract(path)
    starts = list(re.finditer(r"(?m)^\s*(\d{1,2})\s*[、.．]\s*", text))
    records: dict[int, dict] = {}
    for index, start in enumerate(starts):
        number = int(start.group(1))
        if number < 1 or number > 75:
            continue
        block = text[start.end() : starts[index + 1].start() if index + 1 < len(starts) else len(text)]
        option_matches = list(re.finditer(r"(?m)^\s*([A-D])[、.．]\s*(.+)$", block))
        options: dict[str, str] = {}
        for match in option_matches:
            options.setdefault(match.group(1), clean(match.group(2)))
        if set(options) != {"A", "B", "C", "D"}:
            continue
        answer = ""
        for line in block.splitlines():
            if re.search(r"(?:参考答案|答案)", line):
                values = re.findall(r"\b([A-D])\b", line.upper())
                if values:
                    answer = values[-1]
        if not answer:
            continue
        first_option = option_matches[0].start()
        stem = clean(block[:first_option])
        stem = re.sub(r"^(?:\[[^]]+\]|\([^)]*\))\s*", "", stem)
        if len(stem) < 8:
            continue
        records.setdefault(number, {
            "id": f"planner-real-{term}-{number:03d}",
            "sourceType": "real",
            "term": term,
            "paper": term,
            "questionNo": number,
            "module": "other",
            "knowledge": "",
            "difficulty": "",
            "stem": stem,
            "options": options,
            "answer": answer,
            "analysis": "PDF 参考答案；请结合教材与原题解析复核。",
            "sourceFile": str(path.relative_to(ROOT)).replace("\\", "/"),
            "answerSource": "xiaomabenten-pdf-answer",
        })
    return [records[number] for number in sorted(records)]


def main() -> None:
    choices: list[dict] = []
    for year_dir in sorted(SOURCE_ROOT.iterdir()):
        if not year_dir.is_dir() or not re.search(r"20\d{2}", year_dir.name):
            continue
        year = re.search(r"20\d{2}", year_dir.name).group(0)
        term = f"{year}年上半年" if "上半年" in year_dir.name else f"{year}年下半年"
        candidates = [file for file in year_dir.glob("*.pdf") if re.search(r"上午|综合知识", file.name) and not re.search(r"案例|论文", file.name)]
        if not candidates:
            continue
        parsed = max((parse_choice_pdf(file, term) for file in candidates), key=len, default=[])
        if len(parsed) >= 20:
            choices.extend(parsed)
            print(f"{term}: {len(parsed)} choices")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps({"choices": choices, "cases": [], "essays": []}, ensure_ascii=False), encoding="utf-8")
    print(f"planner PDF supplement: {len(choices)} choices")


if __name__ == "__main__":
    main()
