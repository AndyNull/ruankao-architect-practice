from __future__ import annotations

import html
import json
import re
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "banks" / "network-web-supplement.json"
PAGES = [
    (
        "2019年下半年",
        "https://ebook.qicoder.com/网络规划设计师/notes/201911网规上午真题.html",
    ),
    (
        "2020年下半年",
        "https://ebook.qicoder.com/网络规划设计师/notes/2020年下半年网络规划设计师考试上午真题（专业解析+参考答案）.html",
    ),
]


def fetch(url: str) -> BeautifulSoup:
    encoded_url = quote(url, safe=":/")
    request = Request(encoded_url, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(request, timeout=30) as response:
        text = response.read().decode("utf-8")
    return BeautifulSoup(html.unescape(text), "html.parser")


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def parse_page(term: str, url: str) -> list[dict]:
    soup = fetch(url)
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
        options: list[dict[str, str]] = []
        for index, label in enumerate(labels):
            end = labels[index + 1].start() if index + 1 < len(labels) else len(option_text)
            options.append({"label": label.group(1), "value": clean(option_text[label.end():end])})
        groups = [options[index:index + 4] for index in range(0, len(options), 4)]
        groups = [group for group in groups if len(group) == 4 and [item["label"] for item in group] == list("ABCD")]
        analysis = ""
        if "试题解析" in answer_text:
            analysis = clean(answer_text.split("试题解析", 1)[1].lstrip("：:"))
        knowledge = ""
        knowledge_match = re.search(r"知识点：(.+?)(?:试题答案|$)", answer_text)
        if knowledge_match:
            knowledge = clean(knowledge_match.group(1))
        for index, group in enumerate(groups):
            if index >= len(answers) or len(stem) < 8:
                continue
            question_no += 1
            records.append({
                "id": f"network-real-{term}-{question_no:03d}",
                "sourceType": "real",
                "term": term,
                "paper": term,
                "questionNo": question_no,
                "module": "network",
                "knowledge": knowledge,
                "difficulty": "",
                "stem": stem,
                "options": {item["label"]: item["value"] for item in group},
                "answer": answers[index],
                "analysis": analysis or "网页参考答案与解析；请结合教材复核。",
                "sourceFile": url,
                "answerSource": "qicoder-web",
            })
    return records


def main() -> None:
    choices: list[dict] = []
    for term, url in PAGES:
        parsed = parse_page(term, url)
        if len(parsed) != 75:
            raise RuntimeError(f"{term}: expected 75 choices, got {len(parsed)}")
        choices.extend(parsed)
        print(f"{term}: {len(parsed)} network web choices")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps({"choices": choices, "cases": [], "essays": []}, ensure_ascii=False), encoding="utf-8")
    print(f"network web supplement: {len(choices)} choices")


if __name__ == "__main__":
    main()
