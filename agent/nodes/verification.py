from pydantic import BaseModel

from agent.llm import get_llm


class CoverageResult(BaseModel):
    covered: bool
    gap_note: str | None = None


COVERAGE_PROMPT = """다음 배점 항목이 아래 섹션 내용으로 충분히 다뤄졌는지 판단하세요.

배점 항목: {category} - {item}
섹션 제목: {title}
섹션 내용: {content}

충분히 다뤄지지 않았다면 covered=false와 구체적인 gap_note를 반환하세요.
"""


def verification_node(state: dict) -> dict:
    scoring_table = state["scoring_table"]
    sections_by_item = {s["scoring_item"]: s for s in state["sections"]}

    coverage_report = []
    for entry in scoring_table:
        item = entry["item"]
        section = sections_by_item.get(item)

        if section is None:
            coverage_report.append({
                "scoring_item": item,
                "covered": False,
                "gap_note": f"'{item}' 항목에 대한 섹션이 누락됨",
            })
            continue

        llm = get_llm().with_structured_output(CoverageResult)
        result: CoverageResult = llm.invoke(
            COVERAGE_PROMPT.format(
                category=entry["category"],
                item=item,
                title=section["title"],
                content=section["content"],
            )
        )
        coverage_report.append({
            "scoring_item": item,
            "covered": result.covered,
            "gap_note": result.gap_note,
        })

    return {"coverage_report": coverage_report}
