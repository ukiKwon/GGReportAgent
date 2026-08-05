"""결재함 — 그 역할이 결재할 것 전부 (계획 I Task 5).

`POST /tasks/{id}/approve`는 진작 있었는데 **누를 화면이 없어** 팀 Task가 영원히
`1차완료`에 머물렀다. 그래서 디자이너 제출 조건도 '승인완료'로 걸 수 없었다.
여기서 결재 대상을 역할별로 뽑아 준다.

결재 라인 (사용자 확정):
  팀원 → **그 팀의 팀장** → 디자이너 → **본부장**

**본부장 화면에는 워크플로가 없다.** 그래서 결재에 필요한 맥락(기관·단계·작성물·
파일)을 목록 응답에 통째로 실어 카드 하나로 판단할 수 있게 한다.
"""

from fastapi import APIRouter, Query, Request

from backend import task_files
from backend.db import get_connection
from backend.teams import (
    AUTHORING_TEAMS,
    DESIGNER_TEAM,
    FINAL_APPROVER,
    LEAD_ROLES,
    SUBMITTED_STATUS,
    team_of,
)

router = APIRouter(prefix="/approvals", tags=["approvals"])


def _teams_for(role: str) -> list[str]:
    """그 역할이 결재하는 `tasks.team` 목록.

    - 팀장: 자기 팀 하나. 남의 팀을 대신 보면 누가 봤는지 알 수 없어진다.
    - 본부장: 디자이너 작업. **팀 작업은 겹쳐 갖지 않는다** — 그건 팀장 몫이다.
    """
    if role in LEAD_ROLES:
        team = team_of(role)
        return [team] if team in AUTHORING_TEAMS else []
    if role == FINAL_APPROVER:
        return [DESIGNER_TEAM]
    return []


@router.get("")
def get_approvals(request: Request, role: str = Query(..., min_length=1)) -> dict:
    teams = _teams_for(role)
    items: list[dict] = []
    output_root = request.app.state.output_root

    conn = get_connection(request.app.state.db_path)
    try:
        if teams:
            placeholders = ",".join("?" * len(teams))
            rows = conn.execute(
                f"""SELECT t.task_id, t.team, t.status, t.assignee, t.approver,
                           t.draft_content, b.institution_id, i.name_ko, i.stage
                    FROM tasks t
                    JOIN bid_cases b ON b.bid_case_id = t.bid_case_id
                    JOIN institutions i ON i.institution_id = b.institution_id
                    WHERE t.status = ? AND t.team IN ({placeholders})
                    ORDER BY i.name_ko, t.rowid""",
                [SUBMITTED_STATUS, *teams],
            ).fetchall()
            items = [{
                "kind": "task",
                "task_id": r["task_id"], "team": r["team"], "status": r["status"],
                "assignee": r["assignee"], "approver": r["approver"],
                "draft_content": r["draft_content"],
                "institution_id": r["institution_id"], "institution_name": r["name_ko"],
                "stage": r["stage"],
                "files": task_files.listing(output_root, r["name_ko"], r["task_id"]),
            } for r in rows]

        # 게이트는 본부장만 본다(8단계 최종결재). 그래프 상태를 기관마다 물어야 해서
        # 대상 역할이 아닐 때는 아예 돌지 않는다.
        if role == FINAL_APPROVER:
            institutions = conn.execute(
                "SELECT institution_id, name_ko, stage FROM institutions ORDER BY name_ko"
            ).fetchall()
        else:
            institutions = []
    finally:
        conn.close()

    svc = request.app.state.orchestrator
    for inst in institutions:
        if svc.is_running(inst["institution_id"]):
            continue                      # 아직 도는 중이면 결재할 것이 아니다
        gate = svc.pending_gate(inst["institution_id"])
        if not gate:
            continue
        items.append({
            "kind": "gate", "gate": gate,
            "institution_id": inst["institution_id"],
            "institution_name": inst["name_ko"], "stage": inst["stage"],
        })
    return {"role": role, "items": items}
