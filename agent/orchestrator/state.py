"""오케스트레이터 그래프 상태 — Task 5의 LangGraph 배선이 이 스키마를 쓴다.

sections는 팬아웃(Send) 병합용 reducer(operator.add)를 붙인다 — 3팀이 각자
{"sections": [...]}를 반환해도 그래프가 리스트를 이어붙인다.
"""

import operator
from typing import Annotated, TypedDict


class OrchestratorState(TypedDict, total=False):
    institution_id: str
    institution_name: str
    giganlist_dir: str                # corpus/institutions (루트)
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
    sections: Annotated[list[dict], operator.add]   # 팬아웃 병합(reducer)
    coverage_report: list[dict]
    pii_findings: list[dict]
    pptx_path: str
    revision_note: str | None         # 결재 반려 사유 — 재작성 지시에 실린다
