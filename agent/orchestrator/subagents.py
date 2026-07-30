"""subagent 노드 래퍼 — 기존 노드 함수를 그래프 노드로 감싼다.

각 함수는 (state, recorder)를 받고 상태 업데이트 dict를 반환한다. recorder로만
바깥에 말한다(Recorder 포트). subagent끼리 직접 통신하지 않는다 — 스펙 §④.
"""

from agent.nodes.content_writer import content_writer_node
from agent.nodes.institution_match import institution_match_node
from agent.nodes.pptx_builder import pptx_builder_node
from agent.nodes.rfp_analysis import rfp_analysis_node
from agent.nodes.rfp_extract import rfp_extract_node
from agent.nodes.role_router import ROLES, role_router_node
from agent.nodes.verification import verification_node
from agent.orchestrator.pii import scan_pii
from agent.pipeline import artifacts_exist


def rfi_agent(state: dict, recorder) -> dict:
    """3·4단계 — 공고 해부와 요구사항 분석. 불리 조건은 되물음(비차단)으로 알린다."""
    updates: dict = {}
    recorder.task_update("RFI분석", "작성중", 10)
    recorder.set_stage(3)

    if state.get("rfp_path") and not artifacts_exist(
        state["report_new_dir"], state["institution_name"]
    ):
        updates.update(rfp_extract_node({**state, **updates}))

    updates.update(rfp_analysis_node({**state, **updates}))
    updates.update(institution_match_node({**state, **updates}))
    updates.update(role_router_node({**state, **updates}))

    risks = [r for r in updates.get("requirements", []) if r.get("risk_flag")]
    if risks:
        detail = "; ".join(f"{r['item']}: {r['risk_flag']}" for r in risks)
        recorder.notify("영업팀", "되물음", f"불리 조건 발견 — 재고 권유: {detail}")

    updates["stage"] = 4
    recorder.set_stage(4)
    recorder.task_update("RFI분석", "1차완료", 100)
    recorder.message("RFI분석", "agent", f"배점표 {len(updates.get('scoring_table', []))}항목 분석 완료")
    return updates


def draft_team(state: dict, recorder) -> dict:
    """Send 팬아웃 노드 — state['role'] 팀의 초안만 작성한다."""
    role = state["role"]
    recorder.task_update(role, "작성중", 10)
    result = content_writer_node(state, role=role)
    recorder.task_update(role, "1차완료", 100)
    recorder.message(role, "agent", f"{role}팀 초안 {len(result['sections'])}건 작성 완료")
    return {"sections": result["sections"]}


def packager(state: dict, recorder) -> dict:
    """7단계 — 승인 작성물을 디자이너 이관 패키지(PPTX 골격)로."""
    recorder.set_stage(7)
    recorder.task_update("취합", "작성중", 50)
    updates = pptx_builder_node(state)
    recorder.task_update("취합", "1차완료", 100)
    recorder.notify("디자이너", "이관", f"이관 패키지 준비 완료: {updates.get('pptx_path', '')}")
    return updates


def verifier(state: dict, recorder) -> dict:
    """검증가 — 커버리지 + PII. 8단계 전체 검사에 쓰인다(업로드 즉시 검사는 A2)."""
    recorder.set_stage(8)
    updates = verification_node(state)
    pii: list[dict] = []
    for section in state.get("sections", []):
        pii.extend(scan_pii(section.get("content", "")))
    updates["pii_findings"] = pii
    uncovered = [c for c in updates["coverage_report"] if not c["covered"]]
    recorder.message(
        "검증", "agent",
        f"검증 완료 — 미달 {len(uncovered)}건, PII {len(pii)}건",
    )
    return updates
