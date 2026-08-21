"""결재함 — 그 역할이 결재할 것 전부 (계획 I Task 5).

`POST /tasks/{id}/approve`는 진작 있었는데 **누를 화면이 없어** 팀 Task가 영원히
`1차완료`에 머물렀다. 그래서 디자이너 제출 조건도 '승인완료'로 걸 수 없었다.
여기서 결재 대상을 역할별로 뽑아 준다.

결재 라인 (사용자 확정):
  팀원 → **그 팀의 팀장**,  디자이너 → **영업팀장** → **영업부장**(최종, 흐름 종료)

디자이너는 영업팀 소속이라 1차 결재를 영업팀장이 받는다. 영업팀장의 승인이 곧
영업부장에게 올리는 **상신**이고(별도 버튼을 두면 승인해 놓고 안 올리는 상태가
생긴다), 영업부장의 승인이 흐름의 끝이다.

**영업부장 화면에는 워크플로가 없다.** 그래서 결재에 필요한 맥락(기관·단계·작성물·
파일)을 목록 응답에 통째로 실어 카드 하나로 판단할 수 있게 한다.
"""

from fastapi import APIRouter, Query, Request

from server import task_files
from server.db import get_connection
from server.teams import (
    APPROVED_STATUS,
    AUTHORING_TEAMS,
    DESIGNER_TEAM,
    FINAL_APPROVER,
    LEAD_ROLES,
    SUBMITTED_STATUS,
    lead_of,
    team_of,
)

router = APIRouter(prefix="/approvals", tags=["approvals"])


def _queue_for(role: str) -> list[tuple[str, str]]:
    """그 역할이 결재할 (`tasks.team`, `status`) 쌍.

    상태까지 함께 정하는 이유: 같은 디자이너 작업이 **단계마다 다른 사람**에게
    간다. `1차완료`는 영업팀장 몫이고 `2차완료`는 영업부장 몫이다. 팀만으로 거르면
    둘의 결재함에 같은 카드가 동시에 뜬다.

    - 팀장: 자기 팀 하나. 남의 팀을 대신 보면 누가 봤는지 알 수 없어진다.
    - 영업팀장: 거기에 **디자이너 작업**(디자이너는 영업팀 소속).
    - 영업부장: 영업팀장이 승인해 올린 디자이너 최종본만. 팀 작업은 겹쳐 갖지 않는다.
    """
    if role == FINAL_APPROVER:
        return [(DESIGNER_TEAM, APPROVED_STATUS)]
    if role in LEAD_ROLES:
        team = team_of(role)
        pairs = [(team, SUBMITTED_STATUS)] if team in AUTHORING_TEAMS else []
        if role == lead_of(DESIGNER_TEAM):
            pairs.append((DESIGNER_TEAM, SUBMITTED_STATUS))
        return pairs
    return []


@router.get("")
def get_approvals(request: Request, role: str = Query(..., min_length=1)) -> dict:
    queue = _queue_for(role)
    items: list[dict] = []
    output_root = request.app.state.output_root

    conn = get_connection(request.app.state.db_path)
    try:
        if queue:
            where = " OR ".join(["(t.team = ? AND t.status = ?)"] * len(queue))
            params = [value for pair in queue for value in pair]
            rows = conn.execute(
                f"""SELECT t.task_id, t.team, t.status, t.assignee, t.approver,
                           t.draft_content, b.institution_id, i.name_ko, i.stage
                    FROM tasks t
                    JOIN bid_cases b ON b.bid_case_id = t.bid_case_id
                    JOIN institutions i ON i.institution_id = b.institution_id
                    WHERE {where}
                    ORDER BY i.name_ko, t.rowid""",
                params,
            ).fetchall()
            items = [{
                "kind": "task",
                "task_id": r["task_id"], "team": r["team"], "status": r["status"],
                "assignee": r["assignee"], "approver": r["approver"],
                # 이 카드가 최종 결재인지 — 화면이 상태 문자열을 다시 해석하지 않게
                # 서버가 정한다(같은 규칙이 tasks.py의 `_is_final_stage`에도 있다).
                "final": r["team"] == DESIGNER_TEAM and r["status"] == APPROVED_STATUS,
                "draft_content": r["draft_content"],
                "institution_id": r["institution_id"], "institution_name": r["name_ko"],
                "stage": r["stage"],
                "files": task_files.listing(output_root, r["name_ko"], r["task_id"]),
            } for r in rows]

        # 게이트는 영업부장만 본다(8단계 최종결재). 그래프 상태를 기관마다 물어야 해서
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
