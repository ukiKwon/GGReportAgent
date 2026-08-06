"""오케스트레이터 그래프 상태 — Task 5의 LangGraph 배선이 이 스키마를 쓴다.

sections는 팬아웃(Send) 병합용 커스텀 reducer(merge_sections)를 붙인다 — 3팀이
각자 {"sections": [...]}를 반환하면 그래프가 리스트를 이어붙인다(operator.add와
동일). 다만 순수 operator.add는 "리셋"이 불가능하다 — Command(update={"sections": []})는
old + [] = old라 아무것도 지우지 못한다. 기획반려(§⑤)로 3팀 초안을 다시 쓸 때는 구본을
비워야 하므로, new=None을 "명시적 리셋" 신호로 해석하는 커스텀 reducer를 쓴다
(리뷰 Major 픽스 — Task 5 후속).
"""

from typing import Annotated, TypedDict


def merge_sections(old: list[dict] | None, new: list[dict] | None) -> list[dict]:
    """sections 채널 reducer. new가 None이면 명시적 리셋 신호(반려 재작성 시 구본을
    비운다) — 그 외에는 operator.add와 동일하게 이어붙인다(팬아웃 병합)."""
    if new is None:
        return []
    return (old or []) + new


class OrchestratorState(TypedDict, total=False):
    institution_id: str
    institution_name: str
    giganlist_dir: str                # corpus/institutions (루트)
    archive_dir: str                  # 이전 PPTX를 찾는 곳(기본 agent.paths.DEFAULT_ARCHIVE_ROOT)
    report_new_dir: str
    rfp_path: str | None
    stage: int
    rfp_text: str
    scoring_table: list[dict]
    requirements: list[dict]          # [{item, category, weight, risk_flag}]
    institution_spec_dir: str | None
    matched_district: str | None
    archive_pptx_path: str | None
    role_assignments: list[dict]
    role: str                         # Send 페이로드 전용(draft_team이 읽음)
    sections: Annotated[list[dict], merge_sections]  # 팬아웃 병합 + None=리셋(reducer)
    coverage_report: list[dict]
    pii_findings: list[dict]
    pptx_path: str
    revision_note: str | None         # 결재 반려 사유 — 재작성 지시에 실린다
