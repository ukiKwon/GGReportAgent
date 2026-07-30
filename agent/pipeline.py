import os

from agent.nodes.content_writer import content_writer_node
from agent.nodes.institution_match import institution_match_node
from agent.nodes.pptx_builder import pptx_builder_node
from agent.nodes.rfp_analysis import rfp_analysis_node
from agent.nodes.rfp_extract import rfp_extract_node
from agent.nodes.role_router import ROLES, role_router_node
from agent.nodes.verification import verification_node

RFP_ARTIFACTS = ("rfp_scoring.json", "rfp_text.txt")


def _artifacts_exist(report_new_dir: str, institution_name: str) -> bool:
    out_dir = os.path.join(report_new_dir, institution_name)
    return all(os.path.isfile(os.path.join(out_dir, name)) for name in RFP_ARTIFACTS)


def run_pipeline(
    institution_name: str,
    giganlist_dir: str = "corpus/institutions",
    archive_dir: str = "report_archive",
    report_new_dir: str = "data/report_new",
    max_revisions: int = 3,
    rfp_path: str | None = None,
) -> dict:
    state = {
        "institution_name": institution_name,
        "giganlist_dir": giganlist_dir,
        "archive_dir": archive_dir,
        "report_new_dir": report_new_dir,
        "rfp_path": rfp_path,
    }

    # 3단계: 산출물이 없을 때만 PDF에서 뽑는다. 이미 있으면 사람이 rfp-locate 스킬로
    # 만들어 둔 것이므로 건드리지 않는다 — 이상 PDF는 여전히 사람이 처리하기 때문에
    # 두 경로가 공존해야 한다.
    if rfp_path and not _artifacts_exist(report_new_dir, institution_name):
        state.update(rfp_extract_node(state))

    state.update(rfp_analysis_node(state))
    state.update(institution_match_node(state))
    state.update(role_router_node(state))

    # 6단계 3팀 분화 — 상위 스펙 §⑤. 팀별 결과를 배점표 원순서로 병합한 뒤
    # verification은 병합본에 1회만 실행한다. 병렬화는 하지 않는다(단일 GPU
    # 로컬 LLM이라 동시 호출이 직렬화됨 — 스펙 편차 기록은 §⑤ 참조).
    order = {e["item"]: i for i, e in enumerate(state["scoring_table"])}
    attempt = 0
    while True:
        sections: list[dict] = []
        for role in ROLES:
            sections.extend(content_writer_node(state, role=role)["sections"])
        sections.sort(key=lambda s: order.get(s["scoring_item"], len(order)))
        state["revision_count"] = state.get("revision_count", 0) + (
            1 if state.get("coverage_report") else 0
        )
        state["sections"] = sections
        state.update(verification_node(state))
        attempt += 1

        all_covered = all(c["covered"] for c in state["coverage_report"])
        if all_covered or attempt > max_revisions:
            break

    state.update(pptx_builder_node(state))
    return state
