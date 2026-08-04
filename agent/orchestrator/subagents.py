"""subagent 노드 래퍼 — 기존 노드 함수를 그래프 노드로 감싼다.

각 함수는 (state, recorder)를 받고 상태 업데이트 dict를 반환한다. recorder로만
바깥에 말한다(Recorder 포트). subagent끼리 직접 통신하지 않는다 — 스펙 §④.
"""

from agent.llm import current_model
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
    # institution_match_node·role_router_node가 LLM을 쓰므로(기관유형 판정, 애매 항목 분류
    # 폴백) 이 보고는 사용 모델을 남긴다.
    recorder.message(
        "RFI분석", "agent",
        f"배점표 {len(updates.get('scoring_table', []))}항목 분석 완료",
        model=current_model(),
    )
    return updates


def draft_team(state: dict, recorder) -> dict:
    """Send 팬아웃 노드 — state['role'] 팀의 초안만 작성한다.

    기획반려(§⑤ 게이트) 시 Send 페이로드에 실린 revision_note를 content_writer_node
    호출 전 상태에 명시적으로 반영한다 — 3팀이 반려 사유를 모른 채 동일 프롬프트로
    재작성하는 것을 막는다(리뷰 F1 픽스).
    """
    role = state["role"]
    # 3팀 초안 작성은 5단계다(이 모듈 상단·graph.py docstring 참조). set_stage는 멱등이고,
    # 이게 없으면 초안 기록이 직전 단계(4)로 찍혀 단계별 뷰가 어긋난다.
    recorder.set_stage(5)
    recorder.task_update(role, "작성중", 10)
    revision_note = state.get("revision_note")
    result = content_writer_node({**state, "revision_note": revision_note}, role=role)
    recorder.task_update(role, "1차완료", 100)
    # content_writer_node는 LLM으로 섹션을 작성하므로 보고에 사용 모델을 남긴다.
    recorder.message(
        role, "agent", f"{role}팀 초안 {len(result['sections'])}건 작성 완료",
        model=current_model(),
    )
    return {"sections": result["sections"]}


def _ordered_sections(scoring_table: list[dict], sections: list[dict]) -> list[dict]:
    """sections를 scoring_table 원순서로 정렬 — agent/pipeline.py:48과 동일 로직.
    미배정(scoring_table에 없는) 항목은 뒤로 보낸다."""
    order = {e["item"]: i for i, e in enumerate(scoring_table)}
    return sorted(sections, key=lambda s: order.get(s["scoring_item"], len(order)))


def packager(state: dict, recorder) -> dict:
    """7단계 — 승인 작성물을 디자이너 이관 패키지(PPTX 골격)로.

    sections는 3팀 팬아웃 완료 순서대로 병합되어 비결정적이다 — PPTX 슬라이드
    순서가 실행마다 달라지는 것을 막기 위해, 배점표 원순서로 정렬한 뒤
    pptx_builder_node에 넘긴다(리뷰 F2 픽스). 그래프 상태의 sections 채널 자체는
    건드리지 않는다(merge_sections reducer가 이어붙이기라 재저장 시 중복된다).
    """
    recorder.set_stage(7)
    recorder.task_update("취합", "작성중", 50)
    ordered = _ordered_sections(state.get("scoring_table", []), state.get("sections", []))
    updates = pptx_builder_node({**state, "sections": ordered})
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
    # verification_node는 커버리지 판정에 LLM을 쓰므로 보고에 사용 모델을 남긴다.
    recorder.message(
        "검증", "agent",
        f"검증 완료 — 미달 {len(uncovered)}건, PII {len(pii)}건",
        model=current_model(),
    )
    # F7: verifier는 게이트가 아니라 일반 노드라 gate_final 재도달(최종반려 후
    # packager·verifier 재실행 포함) 때마다 정확히 1회씩만 실행된다 — resume replay로
    # 인한 중복 걱정이 없다(게이트 노드 본문과 달리).
    recorder.notify("인사권자", "결재요청", "최종결재 대기 — 검증이 끝났습니다. 최종 결재를 부탁드립니다.")
    return updates
