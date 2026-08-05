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
    """커버리지 판정. 섹션이 있는 항목만 LLM에 묻는다.

    `llm_used`를 함께 돌려주는 이유: 기록에 "이 결과를 만든 모델"을 남기는 쪽
    (`agent/orchestrator/subagents.py`의 `verifier`, `backend/routers/tasks.py`의
    업로드 즉시검사)이 **호출이 실제로 있었는지**를 바깥에서 다시 추론해야 했다.
    그 추론은 여기 매칭 규칙을 복제하는 것이라, 규칙이 바뀌면 조용히 어긋난다.
    배점표가 있어도 매칭되는 섹션이 하나도 없으면 LLM은 한 번도 안 불린다.
    """
    scoring_table = state["scoring_table"]
    sections_by_item = {s["scoring_item"]: s for s in state["sections"]}

    llm_used = False
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

        llm_used = True
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

    return {"coverage_report": coverage_report, "llm_used": llm_used}
