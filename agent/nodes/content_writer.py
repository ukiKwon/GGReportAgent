import os

from pydantic import BaseModel

from agent.llm import get_llm


class SectionResult(BaseModel):
    title: str
    content: str
    sources: list[str]


SECTION_PROMPT = """다음 배점표 항목에 대한 제안서 섹션을 작성하세요.

배점 항목: {category} - {item} ({score}점)
설명: {description}

기관 spec 자료:
{spec_content}

{gap_context}

institution-corpus-format Skill의 포맷 규칙을 따르세요: 번호 섹션, "근거자료: spec/NN" 형태의
출처 인용을 본문에 포함하고, sources 필드에도 인용한 파일명을 나열하세요.
"""


def _load_spec_content(institution_spec_dir: str | None) -> str:
    if not institution_spec_dir or not os.path.isdir(institution_spec_dir):
        return "(spec 자료 없음 — 신규 기관, 조사 결과 미제공)"
    parts = []
    for fname in sorted(os.listdir(institution_spec_dir)):
        if fname.endswith(".txt"):
            with open(os.path.join(institution_spec_dir, fname), encoding="utf-8") as f:
                parts.append(f"[{fname}]\n{f.read()}")
    return "\n\n".join(parts)


def content_writer_node(state: dict) -> dict:
    scoring_table = state["scoring_table"]
    spec_content = _load_spec_content(state.get("institution_spec_dir"))
    coverage_report = state.get("coverage_report", [])
    gap_by_item = {c["scoring_item"]: c["gap_note"] for c in coverage_report if not c["covered"]}

    llm = get_llm().with_structured_output(SectionResult)
    sections = []
    for entry in scoring_table:
        gap_context = ""
        if entry["item"] in gap_by_item:
            gap_context = f"이전 시도에서 누락된 점: {gap_by_item[entry['item']]}"

        result: SectionResult = llm.invoke(
            SECTION_PROMPT.format(
                category=entry["category"],
                item=entry["item"],
                score=entry["score"],
                description=entry.get("description") or "(설명 없음)",
                spec_content=spec_content,
                gap_context=gap_context,
            )
        )
        sections.append({
            "scoring_item": entry["item"],
            "title": result.title,
            "content": result.content,
            "sources": result.sources,
        })

    return {
        "sections": sections,
        "revision_count": state.get("revision_count", 0) + (1 if coverage_report else 0),
    }
