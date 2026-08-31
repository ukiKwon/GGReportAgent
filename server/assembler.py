"""7단계 취합 — 3팀 Task의 초안을 하나의 제안서 PPTX로 묶는다.

슬라이드 생성 자체는 `agent/nodes/pptx_builder.py`의 `build_pptx()`를 그대로 재사용한다
(E2E 스펙 §④ "7 취합: 재사용 pptx_builder_node").
"""

import os
import sqlite3

from agent.nodes.pptx_builder import build_pptx
from server.teams import AUTHORING_TEAMS

# ⚠️ 팀 이름을 여기에 다시 적지 말 것 — `server/teams.AUTHORING_TEAMS`가 유일한 출처다.
# 예전에는 `TEAM_ORDER = ["영업", "IT", "예산"]`으로 박혀 있었는데, 계획 I에서 `IT`가
# `전산`으로 개명된 뒤(`server/db.py`에 `UPDATE tasks SET team='전산' WHERE team='IT'`
# 마이그레이션까지 있다) 이 목록만 옛 이름으로 남아 **취합에서 전산팀 초안이 통째로
# 빠졌다.** 오류도 경고도 없이 슬라이드 한 장이 없어질 뿐이라 아무도 몰랐다
# (2026-08-27 Java 이관 중 발견).


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
        for team in AUTHORING_TEAMS
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
