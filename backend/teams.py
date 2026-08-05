"""팀 이름 ↔ 쪽지 수신자 이름 — 두 이름 체계 사이의 유일한 변환 자리.

`tasks.team`은 `영업`인데 그래프의 `notify()`는 `영업팀` 앞으로 보낸다
(`agent/orchestrator/graph.py`·`subagents.py`). 이 어긋남을 화면마다 따로 풀면
(`'영업' + '팀'` 같은 규칙 복제) 한쪽만 고쳤을 때 조용히 갈라진다. 계정 전환기와
디자이너 뷰의 '문의' 버튼이 같은 답을 써야 해서 여기로 모았다.
"""

from __future__ import annotations

import sqlite3


# 사람이 작성물을 쓰는 팀이 아니라 **에이전트가 도는 단계**의 이름들.
# `DbRecorder._ensure_task`가 이 이름으로도 tasks 행을 만들기 때문에(agent/orchestrator/
# subagents.py의 rfi_agent·packager·verifier), 팀 목록을 그냥 뽑으면 사람 작성물 자리에
# 섞여 들어온다. 이들의 산출물은 draft_content가 아니라 파일이고(rfp_scoring.json ·
# 제안서 pptx · coverage_map.json), 이관 패키지에서 따로 실어 보여준다.
AGENT_TEAMS = ("RFI분석", "취합", "검증")


def is_authoring_team(team: str) -> bool:
    """사람이 글을 쓰는 팀인가. 디자이너가 '문의'할 상대이기도 하다."""
    return team not in AGENT_TEAMS


def inbox_name(team: str, recipients: list[str]) -> str:
    """작업의 팀 이름을 **그 팀이 실제로 쪽지를 받는 이름**으로 바꾼다.

    하드코딩하지 않고 실제 수신자 목록에서 찾는다 — 팀 이름으로 시작하는 것이 있으면
    그것이고, 없으면 원래 값을 그대로 쓴다(디자이너처럼 접미사가 없는 역할도 있다).
    """
    if team in recipients:
        return team
    for r in recipients:
        if r != team and r.startswith(team):
            return r
    return team


def known_recipients(conn: sqlite3.Connection) -> list[str]:
    """지금까지 알림이 간 수신자 전부. `inbox_name`의 재료다."""
    return [
        row["recipient"]
        for row in conn.execute(
            "SELECT DISTINCT recipient FROM notifications ORDER BY recipient"
        ).fetchall()
    ]
