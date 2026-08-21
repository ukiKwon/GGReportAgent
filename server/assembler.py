"""7단계 취합 — 3팀 Task의 초안을 하나의 제안서 PPTX로 묶는다.

슬라이드 생성 자체는 `agent/nodes/pptx_builder.py`의 `build_pptx()`를 그대로 재사용한다
(E2E 스펙 §④ "7 취합: 재사용 pptx_builder_node").
"""

import os
import sqlite3

from agent.nodes.pptx_builder import build_pptx

TEAM_ORDER = ["영업", "IT", "예산"]


def assemble_deliverable(
    conn: sqlite3.Connection, bid_case_id: str, output_root: str = "data/report_new"
) -> str:
    """입찰건의 팀별 초안을 PPTX로 취합하고, 그 경로를 기관에 기록한 뒤 반환한다."""
    row = conn.execute(
        """SELECT i.institution_id, i.name_ko
           FROM bid_cases bc JOIN institutions i ON i.institution_id = bc.institution_id
           WHERE bc.bid_case_id = ?""",
        (bid_case_id,),
    ).fetchone()
    if row is None:
        raise KeyError(f"bid case not found: {bid_case_id}")

    drafts = {
        r["team"]: r["draft_content"]
        for r in conn.execute(
            "SELECT team, draft_content FROM tasks WHERE bid_case_id = ?", (bid_case_id,)
        )
    }
    sections = [
        {"title": f"{team} 파트", "content": drafts[team], "sources": []}
        for team in TEAM_ORDER
        if team in drafts
    ]

    institution_id = row["institution_id"]
    output_path = os.path.join(output_root, institution_id, f"{institution_id}_제안서.pptx")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    build_pptx(sections, [], output_path, institution_name=row["name_ko"])

    conn.execute(
        "UPDATE institutions SET pptx_path = ? WHERE institution_id = ?",
        (output_path, institution_id),
    )
    conn.commit()
    return output_path
