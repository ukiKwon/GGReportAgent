"""계정 목록 — 데모 화면의 계정 전환기가 쓴다.

목록을 코드에 박지 않고 **실데이터에서 뽑는다**. 그래야 데모 데이터를 고쳐도 목록이
따라오고, 빈 운영 DB에서는 자동으로 비어(전환기도 숨는다) 엉뚱한 신원이 생기지 않는다.

- 사람: `tasks.assignee`(담당이 정해진 작업)
- 역할: `notifications.recipient` 중 사람 이름이 아닌 것(영업팀·디자이너·인사권자 등).
  시스템 알림은 사람이 아니라 역할 앞으로 오기 때문에 이쪽도 계정이 되어야
  그 역할의 쪽지함을 볼 수 있다.
"""

from fastapi import APIRouter, Request

from server.db import get_connection
from server.teams import inbox_name, known_recipients

router = APIRouter(prefix="/accounts", tags=["accounts"])

# 팀명→쪽지 수신자 변환은 server/teams.py로 옮겼다 — 디자이너 뷰의 '문의' 버튼도
# 같은 답을 써야 하는데, 규칙을 두 벌 두면 한쪽만 고쳤을 때 조용히 갈라진다.
_inbox_team = inbox_name


@router.get("")
def get_accounts(request: Request) -> dict:
    conn = get_connection(request.app.state.db_path)
    try:
        raw_people = [
            {"name": r["assignee"], "team": r["team"]}
            for r in conn.execute(
                "SELECT DISTINCT assignee, team FROM tasks"
                " WHERE assignee IS NOT NULL AND assignee <> ''"
                " ORDER BY assignee, team"
            ).fetchall()
        ]
        recipients = known_recipients(conn)
    finally:
        conn.close()

    people = [{"name": p["name"], "team": _inbox_team(p["team"], recipients)} for p in raw_people]
    names = {p["name"] for p in people}
    roles = [
        {"name": None, "team": r} for r in recipients
        if r not in names   # 사람 이름 앞으로 온 쪽지는 역할이 아니다
    ]
    return {"demo": bool(getattr(request.app.state, "demo", False)), "accounts": people + roles}
