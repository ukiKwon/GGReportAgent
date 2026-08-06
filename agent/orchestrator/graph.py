"""오케스트레이터 supervisor 그래프 — 스펙 §④⑤.

경로: rfi(3·4) → draft 3팀 팬아웃(5) → 🛑기획승인 → [6단계 사람 작업은 그래프 밖]
→ 🛑이관결재 → packager(7) → verifier(8) → 🛑최종결재 → finish(9 대기).
반려는 사유(revision_note)와 함께 앞 단계로 되돌린다.

설치된 langgraph(1.2.10)는 `Command(goto=[Send(...), ...])`를 지원한다
(`Command.goto` 독스트링: "Sequence of `Send` objects") — 그래서 반려 시 팬아웃
재트리거는 별도 통과 노드("refan") 우회 없이, 게이트 노드가 직접 Send 목록을
`Command.goto`에 실어 되돌린다(브리프의 "주의" ① 중 (a) 경로 채택).
"""

from functools import partial

from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, Send, interrupt

from agent.nodes.role_router import ROLES
from agent.orchestrator.state import OrchestratorState
from agent.orchestrator.subagents import draft_team, packager, rfi_agent, verifier


def _fanout_sends(state, revision_note=None):
    """3팀 팬아웃 Send 목록 — 반려 재작성 시 revision_note를 함께 싣는다."""
    return [
        Send("draft", {**state, "sections": [], "role": role, "revision_note": revision_note})
        for role in ROLES
    ]


def _fanout(state: OrchestratorState):
    return _fanout_sends(state)


def build_workflow_graph(recorder, checkpointer):
    g = StateGraph(OrchestratorState)

    g.add_node("rfi", partial(_call, rfi_agent, recorder))
    g.add_node("draft", partial(_call, draft_team, recorder))
    g.add_node("announce_plan", partial(_announce_plan, recorder))
    g.add_node("gate_plan", partial(_gate_plan, recorder))
    g.add_node("gate_handoff", partial(_gate_handoff, recorder))
    g.add_node("packager", partial(_call, packager, recorder))
    g.add_node("verifier", partial(_call, verifier, recorder))
    g.add_node("gate_final", partial(_gate_final, recorder))
    g.add_node("finish", partial(_finish, recorder))

    g.add_edge(START, "rfi")
    g.add_conditional_edges("rfi", _fanout, ["draft"])
    # draft(3팀 팬아웃)는 announce_plan을 거쳐 gate_plan으로 합류한다 — announce_plan은
    # 게이트가 아니라 통과 노드라 재실행(replay)되지 않으므로, 여기서 결재요청 알림을
    # 1회만 보낸다(F7 — 게이트 노드 본문에 두면 resume 재실행 때 중복된다).
    g.add_edge("draft", "announce_plan")
    g.add_edge("announce_plan", "gate_plan")
    # 게이트들은 Command(goto=...)로 스스로 다음을 정한다(정적 엣지 불필요)
    g.add_edge("packager", "verifier")
    g.add_edge("verifier", "gate_final")
    g.add_edge("finish", END)
    return g.compile(checkpointer=checkpointer)


def _call(fn, recorder, state):
    return fn(state, recorder)


def _announce_plan(recorder, state):
    """draft 팬아웃 3팀 합류 후, gate_plan 진입 직전에 딱 1회 결재요청 알림(F7).

    gate_plan 자체에 두면 interrupt 이전 코드라 resume 재실행 시 중복 기록된다
    (게이트 노드 위 주석 참조) — 그래서 별도 통과 노드로 뺐다.
    """
    recorder.notify("영업팀", "결재요청", "기획승인 대기 — 3팀 초안이 준비됐다. 검토 후 승인/반려 바랍니다.")
    return {}


def _decision(gate_name: str, stage: int):
    """게이트 공통 — interrupt로 결재를 기다리고 resume 값을 돌려받는다."""
    return interrupt({"gate": gate_name, "stage": stage})


def _gate_plan(recorder, state):
    # 게이트 노드는 재실행된다(resume 시 처음부터 다시 실행) — interrupt 이전
    # 부수효과는 반드시 멱등이어야 한다. set_stage(5) 중복 호출은 무해하다.
    recorder.set_stage(5)
    decision = _decision("기획승인", 5)
    if decision["approved"]:
        recorder.set_stage(6)
        recorder.message("영업", "human", f"기획 승인 — {decision['by']}", author=decision["by"])
        # interrupt() 이후 코드 — resume 1회당 딱 한 번만 실행되므로 여기서 notify해도
        # 중복이 없다(게이트 재실행은 항상 interrupt() 앞부분까지만 다시 돈다).
        recorder.notify("영업팀", "결재요청", "이관결재 대기 — 기획승인 완료, 이관 여부를 결재해주세요.")
        return Command(goto="gate_handoff", update={"stage": 6, "revision_note": None})
    comment = decision.get("comment")
    recorder.message("영업", "human", f"기획 반려 — {comment or '(사유 없음)'}",
                     author=decision.get("by"))
    # sections는 merge_sections(new=None)로 명시적 리셋 — 구본 3건을 비운 뒤
    # 다음 슈퍼스텝에서 재팬아웃 3건만 쌓이게 한다(리뷰 Major 픽스).
    return Command(
        goto=_fanout_sends(state, comment),
        update={"revision_note": comment, "sections": None},
    )


def _gate_handoff(recorder, state):
    decision = _decision("이관결재", 6)
    if decision["approved"]:
        recorder.message("취합", "human", f"이관 결재 — {decision['by']}", author=decision["by"])
        return Command(goto="packager", update={"stage": 7})
    comment = decision.get("comment")
    recorder.message("영업", "human", f"이관 반려 — {comment or '(사유 없음)'}",
                     author=decision.get("by"))
    return Command(goto="gate_plan", update={"revision_note": comment})


def _gate_final(recorder, state):
    decision = _decision("최종결재", 8)
    if decision["approved"]:
        recorder.message("검증", "human", f"최종 결재 — {decision['by']}", author=decision["by"])
        return Command(goto="finish")
    comment = decision.get("comment")
    recorder.message("검증", "human", f"최종 반려 — {comment or '(사유 없음)'}",
                     author=decision.get("by"))
    return Command(goto="packager", update={"revision_note": comment})


def _finish(recorder, state):
    recorder.set_stage(9)
    # 총괄 지시(C1 이월) — 마지막 단계에도 "다음에 무엇을 하라"가 남아야 한다.
    # 문구 규칙은 subagents._order 참조.
    recorder.message("검증", "orchestrator",
                     "최종 결재 완료. 제출 대기(9단계) — 제출 후 완료 마킹하라.")
    recorder.notify("영업팀", "쪽지", "최종 결재 완료 — 제출 대기(9단계). 제출 후 완료 마킹하세요.")
    return {"stage": 9}
