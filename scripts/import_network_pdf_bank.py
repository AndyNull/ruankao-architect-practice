from __future__ import annotations

import json
import re
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
RAW_ROOT = ROOT / "data" / "exam-materials"
ANSWER_OUTPUT = ROOT / "data" / "banks" / "network-pdf-answer-keys.json"
SUPPLEMENT_OUTPUT = ROOT / "data" / "banks" / "network-pdf-supplement.json"


def pdf_text(path: Path) -> str:
    return "\n".join(page.extract_text() or "" for page in PdfReader(str(path)).pages)


def answer_tokens(text: str) -> list[str]:
    tokens: list[str] = []
    marker = re.compile(r"(?:【答案】|^\s*(?:解析|答案|[^A-D0-9\n]{2,8})[：: ]*)\s*([A-D](?:\s*[、,]\s*[A-D])*)", re.M)
    for match in marker.finditer(text):
        values = re.findall(r"[A-D]", match.group(1).upper())
        if values and len(values) <= 5:
            tokens.extend(values)
        if len(tokens) >= 75:
            break
    return tokens[:75]


def clean(value: str) -> str:
    value = value.replace("手机端题库：微信搜索「软考达人」  /  PC端题库：www.ruankaodaren.com", "")
    value = re.sub(r"20\d{2} 年(?:上|下)半年 网络规划设计师 上午试卷 第 \d+页（共 \d+页）", "", value)
    return re.sub(r"\s+", " ", value).strip(" ●-：:")


def option_map(block: str) -> dict[str, str]:
    labels = list(re.finditer(r"(?<![A-Za-z0-9])([A-D])\s*[.、．]\s*", block))
    for index in range(len(labels) - 3):
        if [item.group(1) for item in labels[index:index + 4]] != list("ABCD"):
            continue
        selected = labels[index:index + 4]
        values = {}
        for offset, label in enumerate(selected):
            end = selected[offset + 1].start() if offset < 3 else len(block)
            value = clean(block[label.end():end])
            value = re.split(r"\n\s*[（(]\d{1,2}[）)]", value, maxsplit=1)[0].strip()
            values[label.group(1)] = value
        if all(values.values()):
            return values
    return {}


def parse_legacy_choice_pdf(path: Path, term: str, answers: dict[str, dict]) -> list[dict]:
    text = pdf_text(path)
    records = {}
    for group in re.split(r"●", text):
        markers = list(re.finditer(r"(?m)^\s*[（(](\d{1,2})[）)]\s*A\s*[.、．]", group))
        if not markers:
            continue
        shared_stem = clean(group[:markers[0].start()])
        for index, marker in enumerate(markers):
            number = int(marker.group(1))
            if not 1 <= number <= 75:
                continue
            end = markers[index + 1].start() if index + 1 < len(markers) else len(group)
            options = option_map(group[marker.start():end])
            answer_record = answers.get(f"network|{term}|{number}", {})
            answer = answer_record.get("answer", "")
            if len(shared_stem) < 8 or set(options) != set("ABCD") or not re.match(r"^[A-D]$", answer):
                continue
            records.setdefault(number, {
                "id": f"network-real-{term}-{number:03d}",
                "sourceType": "real",
                "term": term,
                "paper": term,
                "questionNo": number,
                "module": "network",
                "knowledge": "",
                "difficulty": "",
                "stem": shared_stem,
                "options": options,
                "answer": answer,
                "analysis": "PDF 参考答案；请结合教材与原题解析复核。",
                "sourceFile": str(path.relative_to(ROOT)).replace("\\", "/"),
                "answerSource": answer_record.get("source", "xiaomabenten-pdf-answer"),
            })
    return [records[number] for number in sorted(records)]


def clean_paper_text(text: str) -> str:
    """Remove repeated PDF headers and source watermarks."""
    text = re.sub(r"20\d{2} 年(?:上|下)半年 网络规划设计师 .+?第 \d+页（共 \d+页）", "", text)
    text = re.sub(r"手机端题库：微信搜索「软考达人」\s*/\s*PC端题库：www\.ruankaodaren\.com", "", text)
    return re.sub(r"[ \t]+", " ", text).strip()


def split_numbered_papers(text: str, max_number: int = 6) -> list[tuple[int, str]]:
    """Split afternoon papers on Chinese numbered question headings."""
    pattern = re.compile(r"(?m)^试题([一二三四五六])(?:\s|$)")
    numbers = "一二三四五六"
    cleaned = clean_paper_text(text)
    matches = list(pattern.finditer(cleaned))
    result = []
    for index, match in enumerate(matches):
        number = numbers.index(match.group(1)) + 1
        if number > max_number:
            continue
        end = matches[index + 1].start() if index + 1 < len(matches) else len(cleaned)
        block = cleaned[match.end():end].strip()
        if len(block) >= 80:
            result.append((number, block))
    return result


def parse_case_pdf(path: Path, answer_path: Path | None, term: str) -> list[dict]:
    """Parse complete legacy case prompts and matching answer sections."""
    prompts = dict(split_numbered_papers(pdf_text(path)))
    answer_text = clean_paper_text(pdf_text(answer_path)) if answer_path else ""
    essay_start = re.search(r"(?m)^试题一\s+论", answer_text)
    answers = dict(split_numbered_papers(answer_text[:essay_start.start()] if essay_start else answer_text))
    records = []
    for number, prompt in prompts.items():
        question_marks = list(re.finditer(r"【问题\s*(\d+)】", prompt))
        sub_questions = []
        for index, marker in enumerate(question_marks):
            end = question_marks[index + 1].start() if index + 1 < len(question_marks) else len(prompt)
            sub_questions.append({
                "question_label": f"问题{marker.group(1)}",
                "prompt": prompt[marker.end():end].strip(),
                "reference_answer": answers.get(number, "暂无参考答案"),
            })
        if not sub_questions:
            sub_questions = [{"question_label": "问题", "prompt": prompt, "reference_answer": answers.get(number, "暂无参考答案")}]
        records.append({
            "id": f"network-case-real-{term}-{number}", "sourceType": "real", "term": term,
            "paper": term, "module": "network", "title": f"试题{number}", "description": prompt,
            "subQuestions": sub_questions,
            "sourceFile": str(path.relative_to(ROOT)).replace("\\", "/"),
        })
    return records


def parse_essay_pdf(path: Path, answer_path: Path | None, term: str) -> list[dict]:
    """Parse complete legacy essay prompts and available writing points."""
    prompts = split_numbered_papers(pdf_text(path), 4)
    answer_text = clean_paper_text(pdf_text(answer_path)) if answer_path else ""
    records = []
    for number, prompt in prompts:
        title = prompt.splitlines()[0].strip()
        writing_match = re.search(rf"{re.escape(title)}[\s\S]*?写作要点([\s\S]*?)(?=\n试题[一二三四]|$)", answer_text)
        records.append({
            "id": f"network-essay-real-{term}-{number}", "sourceType": "real", "term": term,
            "paper": term, "module": "network", "title": title, "prompt": prompt,
            "writingPoints": writing_match.group(1).strip() if writing_match else "暂无写作要点",
            "sourceFile": str(path.relative_to(ROOT)).replace("\\", "/"),
        })
    return records


def parse_paper(year_dir: Path) -> dict[str, dict]:
    answer_file = None
    answers = []
    for candidate in year_dir.glob("*.pdf"):
        candidate_answers = answer_tokens(pdf_text(candidate))
        if len(candidate_answers) == 75:
            answer_file, answers = candidate, candidate_answers
            break
    if not answer_file:
        return {}
    year = re.search(r"20[0-9]{2}", year_dir.name)
    if not year:
        return {}
    term = f"{year.group(0)}年上半年" if "上半年" in year_dir.name else f"{year.group(0)}年下半年"
    return {f"network|{term}|{number}": {
        "answer": answers[number - 1],
        "source": "xiaomabenten-pdf-answer",
        "sourceUrl": str(answer_file.relative_to(ROOT)).replace("\\", "/"),
    } for number in range(1, 76)}


def main() -> None:
    answers = {}
    for answer_file in sorted(RAW_ROOT.rglob("*.pdf")):
        subject_dir = next((parent.name for parent in answer_file.parents if parent.name == "网络规划设计师"), "")
        if ("xiaomabenten" not in answer_file.parts
                or subject_dir != "网络规划设计师"
                or not any(token in answer_file.name for token in ("答案", "解析"))):
            continue
        answers.update(parse_paper(answer_file.parent))

    supplements = []
    cases = []
    essays = []
    source_root = RAW_ROOT / "网络规划设计师" / "raw" / "xiaomabenten" / "真题"
    for year_dir in sorted(source_root.iterdir()):
        if not year_dir.is_dir() or not re.search(r"20\d{2}", year_dir.name):
            continue
        year = re.search(r"20\d{2}", year_dir.name).group(0)
        term = f"{year}年上半年" if "上半年" in year_dir.name else f"{year}年下半年"
        candidates = [file for file in year_dir.glob("*.pdf")
                      if re.search(r"综合知识|上午", file.name)
                      and not re.search(r"答案|解析", file.name)]
        if not candidates:
            continue
        parsed = max((parse_legacy_choice_pdf(file, term, answers) for file in candidates), key=len, default=[])
        supplements.extend(parsed)
        print(f"{term}: {len(parsed)} network PDF choices")

        answer_candidates = [file for file in year_dir.glob("*.pdf") if re.search(r"答案详解|下午真题（专业解析", file.name)]
        answer_path = answer_candidates[0] if answer_candidates else None
        case_candidates = [file for file in year_dir.glob("*.pdf") if re.search(r"案例分析|下午真题\.pdf", file.name) and "解析" not in file.name]
        essay_candidates = [file for file in year_dir.glob("*.pdf") if "论文" in file.name and "解析" not in file.name]
        if int(year) <= 2020 and case_candidates:
            cases.extend(parse_case_pdf(case_candidates[0], answer_path, term))
        if int(year) <= 2020 and essay_candidates:
            essays.extend(parse_essay_pdf(essay_candidates[0], answer_path, term))

    SUPPLEMENT_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    SUPPLEMENT_OUTPUT.write_text(json.dumps({"choices": supplements, "cases": cases, "essays": essays}, ensure_ascii=False), encoding="utf-8")
    ANSWER_OUTPUT.write_text(json.dumps(answers, ensure_ascii=False), encoding="utf-8")
    print(f"network PDF answer keys: {len(answers)}; choices: {len(supplements)}; cases: {len(cases)}; essays: {len(essays)}")


if __name__ == "__main__":
    main()
