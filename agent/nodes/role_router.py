"""6단계 세부기획의 팀 라우터 — 상위 E2E 스펙 §⑤.

배점표 각 항목을 규칙기반 키워드로 3팀(영업/전산/예산)에 배정한다. LLM은 예산·전산
키워드가 동시에 걸리는 애매한 항목의 분류 폴백에만 쓴다 — 자유생성이 아니라 저위험
분류 작업이므로 하이브리드 원칙(본문은 코퍼스 조립, LLM은 다듬기만)과 충돌하지 않는다.
"""

from typing import Literal

from pydantic import BaseModel

from agent.llm import structured_llm

ROLE_SALES = "영업"
ROLE_IT = "전산"
ROLE_BUDGET = "예산"
ROLES = (ROLE_SALES, ROLE_IT, ROLE_BUDGET)

BUDGET_KEYWORDS = ("예산", "가격", "비용")
IT_KEYWORDS = ("IT", "시스템", "전산", "플랫폼")


class RoleResult(BaseModel):
    role: Literal["영업", "전산", "예산"]


ROLE_PROMPT = """다음 배점표 항목을 담당할 팀을 고르세요.

- 예산: 가격/예산/ROI 산정
- 전산: IT/디지털 구현 타당성
- 영업: 협력 취지/기관 수요/관계 형성 (위 둘에 해당하지 않는 모든 항목)

배점 항목: {category} - {item}
설명: {description}
"""


def _rule_role(text: str) -> str | None:
    """규칙 판정. 예산·전산 키워드가 동시에 걸리면 None(애매 → LLM 폴백)."""
    is_budget = any(k in text for k in BUDGET_KEYWORDS)
    is_it = any(k in text for k in IT_KEYWORDS)
    if is_budget and is_it:
        return None
    if is_budget:
        return ROLE_BUDGET
    if is_it:
        return ROLE_IT
    return ROLE_SALES


def role_router_node(state: dict) -> dict:
    assignments = []
    llm = None
    for entry in state["scoring_table"]:
        text = " ".join(
            v for v in (entry.get("category"), entry["item"], entry.get("description")) if v
        )
        role = _rule_role(text)
        if role is None:
            if llm is None:
                llm = structured_llm(RoleResult)
            result: RoleResult = llm.invoke(
                ROLE_PROMPT.format(
                    category=entry.get("category") or "(분류 없음)",
                    item=entry["item"],
                    description=entry.get("description") or "(설명 없음)",
                )
            )
            role = result.role
        assignments.append({"scoring_item": entry["item"], "role": role})
    return {"role_assignments": assignments}
