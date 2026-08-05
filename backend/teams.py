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


DESIGNER_TEAM = "디자이너"

# 사람이 글을 쓰는 3팀. **그래프의 role_router.ROLES와 같아야 한다** — 참여확정은
# 이 목록으로, 5단계 draft_team은 ROLES로 Task를 만드는데 이름이 다르면
# tasks의 UNIQUE(bid_case_id, team)이 못 막아 한 공고에 둘 다 생긴다
# (실제로 'IT'와 '전산'이 그랬다 — 계획 I에서 '전산'으로 통일).
AUTHORING_TEAMS = ("영업", "전산", "예산")

# 아직 자기 일을 끝내지 않은 상태. 결재까지 끝난 것은 '2차완료'다.
WORKING_STATUSES = ("대기", "작성중")
SUBMITTED_STATUS = "1차완료"
APPROVED_STATUS = "2차완료"

# ── 사람의 소속(역할) ──────────────────────────────────────────────────
# 프로필의 '소속'이 곧 역할이다(사용자 확정 — 별도 직책 필드를 두지 않는다).
# 화면 노출은 role_menus 테이블이 정하고, 결재 권한은 아래 규칙이 정한다.
TEAM_SUFFIX = "팀"
LEAD_SUFFIX = "팀장"
FINAL_APPROVER = "본부장"
# 개명 전 이름. 이미 쌓인 notifications 행이 이 앞으로 와 있어서, 과거 기록을
# 고쳐 쓰는 대신 조회 쪽에서 같은 것으로 본다.
LEGACY_FINAL_APPROVER = "인사권자"

MEMBER_ROLES = tuple(t + TEAM_SUFFIX for t in AUTHORING_TEAMS)      # 영업팀 …
LEAD_ROLES = tuple(t + LEAD_SUFFIX for t in AUTHORING_TEAMS)        # 영업팀장 …
ROLES = MEMBER_ROLES + LEAD_ROLES + (DESIGNER_TEAM, FINAL_APPROVER)


def is_working(status: str) -> bool:
    return status in WORKING_STATUSES


def team_of(role: str) -> str:
    """소속(역할) → `tasks.team`. `영업팀`·`영업팀장` 둘 다 `영업`이다.

    **접미사를 떼는 순서가 규칙의 전부다** — `영업팀장`에서 `팀`을 먼저 떼면
    `영업장`이라는 없는 팀이 된다. 긴 접미사부터 본다.
    """
    text = (role or "").strip()
    for suffix in (LEAD_SUFFIX, TEAM_SUFFIX):
        if text.endswith(suffix) and len(text) > len(suffix):
            return text[: -len(suffix)]
    return text


def is_lead(role: str) -> bool:
    """결재 권한이 있는 역할인가."""
    text = (role or "").strip()
    return text in LEAD_ROLES or text == FINAL_APPROVER


def lead_of(team: str) -> str:
    """그 팀 작업물을 결재하는 역할. 디자이너에겐 팀장이 없어 본부장이 직접 본다."""
    if team in AUTHORING_TEAMS:
        return team + LEAD_SUFFIX
    return FINAL_APPROVER


def recipient_aliases(role: str) -> list[str]:
    """그 역할 앞으로 온 쪽지를 찾을 때 함께 봐야 하는 이름들(개명 호환)."""
    if role == FINAL_APPROVER:
        return [FINAL_APPROVER, LEGACY_FINAL_APPROVER]
    return [role]


def is_authoring_team(team: str) -> bool:
    """사람이 글을 쓰는 팀인가. 디자이너가 '문의'할 상대이기도 하다."""
    return team not in AGENT_TEAMS


def inbox_name(team: str, recipients: list[str]) -> str:
    """작업의 팀 이름을 **그 팀이 실제로 쪽지를 받는 이름**으로 바꾼다.

    아는 팀(`영업`·`전산`·`예산`)이면 `팀` 접미사가 답이다 — 수신자 목록을 뒤지지
    않는다. **팀장 역할이 생기면서 이게 필요해졌다**: `startswith`로 아무거나 고르면
    `전산` → `전산팀장`이 걸려, 전산 팀원인 사람이 계정 전환기에 팀장으로 나온다
    (데모에서 실제로 그랬다).

    모르는 값(에이전트 단계 이름 등)은 기존 추론을 쓰되 **가장 짧은 후보**를 고른다 —
    긴 쪽은 대개 더 좁은 역할이라 원래 팀과 다른 사람이 된다.
    """
    if team in recipients:
        return team
    if team in AUTHORING_TEAMS:
        return team + TEAM_SUFFIX
    candidates = sorted((r for r in recipients if r != team and r.startswith(team)), key=len)
    return candidates[0] if candidates else team


def known_recipients(conn: sqlite3.Connection) -> list[str]:
    """지금까지 알림이 간 수신자 전부. `inbox_name`의 재료다."""
    return [
        row["recipient"]
        for row in conn.execute(
            "SELECT DISTINCT recipient FROM notifications ORDER BY recipient"
        ).fetchall()
    ]
