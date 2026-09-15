from __future__ import annotations

import html
import json
import re
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "banks" / "qicoder-supplements.json"
PAGES = {
    "planner": (
        "系统规划与管理师",
        "2020年下半年",
        "系统规划与管理师/notes/2020年系统规划与管理师考试上午真题（专业解析+参考答案）.html",
    ),
    "itpm": (
        "信息系统项目管理师",
        "2020年下半年",
        "信息系统项目管理师/notes/2020年信息系统项目管理师考试上午真题（专业解析+参考答案）.html",
    ),
    "analyst": (
        "系统分析师",
        "2020年上半年",
        "系统分析师/notes/2020年上半年系统分析师考试上午真题（专业解析+参考答案）.html",
    ),
    "network": (
        "网络规划设计师",
        "2019年下半年",
        "网络规划设计师/notes/201911网规上午真题.html",
    ),
}
ANALYST_OLD_PAGES = [
    (f"{year}年上半年", f"系统分析师/notes/{year}05系分上午真题.html")
    for year in range(2009, 2018)
]
NETWORK_2020 = (
    "2020年下半年",
    "网络规划设计师/notes/2020年下半年网络规划设计师考试上午真题（专业解析+参考答案）.html",
)


def fetch(relative_url: str) -> tuple[BeautifulSoup, str]:
    url = "https://ebook.qicoder.com/" + quote(relative_url, safe="/")
    request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(request, timeout=30) as response:
        text = response.read().decode("utf-8")
    return BeautifulSoup(html.unescape(text), "html.parser"), url


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def parse_page(term: str, relative_url: str, subject: str) -> list[dict]:
    soup, source_url = fetch(relative_url)
    records: list[dict] = []
    question_no = 0
    for heading in soup.select("h3"):
        if not re.search(r"\d+", heading.get_text()):
            continue
        sibling = heading.find_next_sibling()
        stem = ""
        option_text = ""
        answer_text = ""
        while sibling and sibling.name != "h3":
            if sibling.name == "p" and not stem:
                stem = clean(sibling.get_text(" ", strip=True))
            elif sibling.name == "blockquote":
                option_text = clean(sibling.get_text(" ", strip=True))
            elif sibling.name == "ul":
                value = clean(sibling.get_text(" ", strip=True))
                if "试题答案" in value:
                    answer_text = value
            sibling = sibling.find_next_sibling()

        answer_match = re.search(r"试题答案：(.+?)(?:试题解析|$)", answer_text)
        answers = re.findall(r"['\"]([A-D])['\"]", answer_match.group(1)) if answer_match else []
        labels = list(re.finditer(r"\(([A-D])\)\s*", option_text))
        options = []
        for index, label in enumerate(labels):
            end = labels[index + 1].start() if index + 1 < len(labels) else len(option_text)
            options.append((label.group(1), clean(option_text[label.end():end])))
        groups = [options[index:index + 4] for index in range(0, len(options), 4)]
        groups = [group for group in groups if len(group) == 4 and [item[0] for item in group] == list("ABCD")]
        analysis = clean(answer_text.split("试题解析", 1)[1].lstrip("：:")) if "试题解析" in answer_text else ""
        knowledge_match = re.search(r"知识点：(.+?)(?:试题答案|$)", answer_text)
        knowledge = clean(knowledge_match.group(1)) if knowledge_match else ""
        for index, group in enumerate(groups):
            if index >= len(answers) or len(stem) < 4:
                continue
            question_no += 1
            records.append({
                "id": f"{subject}-real-{term}-{question_no:03d}",
                "sourceType": "real",
                "term": term,
                "paper": term,
                "questionNo": question_no,
                "module": "other",
                "knowledge": knowledge,
                "difficulty": "",
                "stem": stem,
                "options": {label: value for label, value in group},
                "answer": answers[index],
                "analysis": analysis or "网页参考答案与解析；请结合教材复核。",
                "sourceFile": source_url,
                "answerSource": "qicoder-web",
            })
    return records


def main() -> None:
    result: dict[str, dict[str, list[dict]]] = {}
    for subject, (_, term, relative_url) in PAGES.items():
        choices = parse_page(term, relative_url, subject)
        if len(choices) != 75:
            raise RuntimeError(f"{subject} {term}: expected 75 choices, got {len(choices)}")
        result[subject] = {"choices": choices, "cases": [], "essays": []}
        print(f"{subject} {term}: {len(choices)} choices")
    for term, relative_url in ANALYST_OLD_PAGES:
        choices = parse_page(term, relative_url, "analyst")
        if len(choices) < 20:
            raise RuntimeError(f"analyst {term}: too few choices, got {len(choices)}")
        result["analyst"]["choices"].extend(choices)
        print(f"analyst {term}: {len(choices)} choices")
    term, relative_url = NETWORK_2020
    choices = parse_page(term, relative_url, "network")
    if len(choices) != 75:
        raise RuntimeError(f"network {term}: expected 75 choices, got {len(choices)}")
    result["network"]["choices"].extend(choices)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    print(f"qicoder supplements: {sum(len(value['choices']) for value in result.values())} choices")


if __name__ == "__main__":
    main()
