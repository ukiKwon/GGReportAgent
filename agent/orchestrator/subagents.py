"""subagent 노드 래퍼 — 기존 노드 함수를 그래프 노드로 감싼다.

각 함수는 (state, recorder)를 받고 상태 업데이트 dict를 반환한다. recorder로만
바깥에 말한다(Recorder 포트). subagent끼리 직접 통신하지 않는다 — 스펙 §④.
"""

from agent.llm import current_model, last_used_model, reset_last_model
from agent.nodes.content_writer import content_writer_node
from agent.nodes.institution_match import institution_match_node
from agent.nodes.pptx_builder import pptx_builder_node
from agent.nodes.rfp_analysis import rfp_analysis_node
from agent.nodes.rfp_extract import rfp_extract_node
from agent.nodes.role_router import ROLES, role_router_node
from agent.nodes.verification import verification_node
from agent.orchestrator.pii import scan_pii
from agent.pipeline import artifacts_exist


def _assigned(state: dict, role: str) -> tuple[int, int]:
    """그 팀에 배정된 배점 (항목 수, 점수 합). 총괄 지시에 실을 근거다."""
    scores = {e["item"]: e.get("score") or 0 for e in state.get("scoring_table", [])}
    items = [a["scoring_item"] for a in state.get("role_assignments", []) if a["role"] == role]
    return len(items), sum(scores.get(i, 0) for i in items)


def _order(recorder, team: str, text: str) -> None:
    """총괄(오케스트레이터)의 **지시**를 기록한다 — C1 이월 해소.

    지금까지 실행 기록에는 subagent의 *보고*(`agent`)와 사람의 *결재*(`human`)만
    있었다. 그래서 워크플로 탭의 단계별 뷰가 "누가 시켰는지" 없이 답만 나열됐고,
    `orchestrator` role은 **데모 시드에만** 존재했다(실행하면 사라지는 화면).

    지시는 일을 **하기 전에** 남긴다 — 로그에서 보고 위에 와야 순서가 읽힌다.
    LLM이 쓴 문장이 아니므로 `model`은 붙이지 않는다(🧠 표시의 의미를 지킨다).
    """
    recorder.message(team, "orchestrator", text)


def rfi_agent(state: dict, recorder) -> dict:
    """3·4단계 — 공고 해부와 요구사항 분석. 불리 조건은 되물음(비차단)으로 알린다."""
    updates: dict = {}
    reset_last_model()          # 이 노드에서 LLM을 실제로 썼는지 새로 센다
    recorder.set_stage(3)
    _order(recorder, "RFI분석",
           f"{state['institution_name']} 입찰 건이다. 공고문을 해부해 배점표를 구조화하라.")
    recorder.task_update("RFI분석", "작성중", 10)

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
    _order(recorder, "RFI분석", "배점 항목을 영업·전산·예산 3팀에 배정하고 요구사항을 정리하라.")
    recorder.task_update("RFI분석", "1차완료", 100)
    # institution_match_node·role_router_node가 LLM을 쓰므로(기관유형 판정, 애매 항목 분류
    # 폴백) 이 보고는 사용 모델을 남긴다. **1순위가 아니라 실제로 답을 만든 모델**이다
    # (폴백이 돌면 둘이 다르다 — agent/llm.py의 _ModelTracker 참고).
    recorder.message(
        "RFI분석", "agent",
        f"배점표 {len(updates.get('scoring_table', []))}항목 분석 완료",
        model=last_used_model() or current_model(),
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
    reset_last_model()
    recorder.set_stage(5)
    count, points = _assigned(state, role)
    note = state.get("revision_note")
    _order(recorder, role,
           f"{role}: 배정 {count}항목({points}점)을 맡아 초안을 작성하라."
           + (f" 반려 사유 반영: {note}" if note else ""))
    recorder.task_update(role, "작성중", 10)
    revision_note = state.get("revision_note")
    result = content_writer_node({**state, "revision_note": revision_note}, role=role)
    sections = result["sections"]
    recorder.task_update(role, "1차완료", 100)
    # content_writer_node는 LLM으로 섹션을 작성하지만, 이 role에 배정된 배점 항목이
    # 0건이면 LLM 호출 전에 빈 리스트로 조기 반환한다(content_writer.py:79-81) — 그때는
    # model을 넘기지 않는다(리뷰 픽스: "LLM을 실제로 쓴 보고에만" 원칙 위반이었음).
    model_kwargs = {"model": last_used_model() or current_model()} if sections else {}
    recorder.message(
        role, "agent", f"{role}팀 초안 {len(sections)}건 작성 완료",
        **model_kwargs,
    )
    return {"sections": sections}


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
    _order(recorder, "취합", "승인된 3팀 작성물을 배점표 순서대로 하나의 제안서로 취합하라.")
    recorder.task_update("취합", "작성중", 50)
    ordered = _ordered_sections(state.get("scoring_table", []), state.get("sections", []))
    updates = pptx_builder_node({**state, "sections": ordered})
    recorder.task_update("취합", "1차완료", 100)
    # 디자이너 몫의 Task 자리를 연다 — 알림만으로는 "받은 것을 열어보고 작업물을 올릴"
    # 대상이 없다(계획 H). task_update가 **아니라** task_open인 이유는 이 노드가
    # 최종반려 때 다시 돌기 때문이다(아래 verifier의 F7 주석 참고).
    recorder.task_open("디자이너")
    recorder.notify("디자이너", "이관", f"이관 패키지 준비 완료: {updates.get('pptx_path', '')}")
    return updates


def verifier(state: dict, recorder) -> dict:
    """검증가 — 커버리지 + PII. 8단계 전체 검사에 쓰인다(업로드 즉시 검사는 A2)."""
    reset_last_model()
    recorder.set_stage(8)
    _order(recorder, "검증", "오탈자·개인정보(PII)와 배점 역대조를 수행하고 최종 결재로 올려라.")
    updates = verification_node(state)
    # llm_used는 이 호출 한 번의 사실이지 파이프라인 상태가 아니다 —
    # OrchestratorState에 없는 키를 그래프 채널로 흘려보내지 않는다.
    llm_used = updates.pop("llm_used", False)
    pii: list[dict] = []
    for section in state.get("sections", []):
        pii.extend(scan_pii(section.get("content", "")))
    updates["pii_findings"] = pii
    uncovered = [c for c in updates["coverage_report"] if not c["covered"]]
    # verification_node는 커버리지 판정에 LLM을 쓰지만 **안 쓰는 경우가 두 가지**다 —
    # scoring_table이 비었거나, 배점표는 있는데 매칭되는 섹션이 하나도 없거나.
    # 여기서 그 조건을 다시 계산하면 노드의 매칭 규칙을 복제하게 되므로, 노드가
    # 알려주는 llm_used를 그대로 믿는다("LLM을 실제로 쓴 보고에만 model" 원칙).
    model_kwargs = {"model": last_used_model() or current_model()} if llm_used else {}
    recorder.message(
        "검증", "agent",
        f"검증 완료 — 미달 {len(uncovered)}건, PII {len(pii)}건",
        **model_kwargs,
    )
    # F7: verifier는 게이트가 아니라 일반 노드라 gate_final 재도달(최종반려 후
    # packager·verifier 재실행 포함) 때마다 정확히 1회씩만 실행된다 — resume replay로
    # 인한 중복 걱정이 없다(게이트 노드 본문과 달리).
    # 수신자는 '영업부장'이다 — 최종 결재자. ('인사권자' → 잠깐 '본부장' → 사용자가
    # 본부장 개념을 없애고 영업부장으로 확정.) agent 층은 server를 import하지
    # 않으므로(ports.py의 분리 관행) 이름을 리터럴로 둔다 — server 쪽 정본은
    # server/teams.py의 FINAL_APPROVER이고, 옛 이름은 recipient_aliases가 잇는다.
    recorder.notify("영업부장", "결재요청", "최종결재 대기 — 검증이 끝났습니다. 최종 결재를 부탁드립니다.")
    return updates
