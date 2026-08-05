"""역할별 메뉴 정의와 기본 권한 (계획 I Task 2).

지금까지 탭 노출은 코드에 박혀 있었다(`app.SERVER_ONLY_IDS`·`applyDesignerUI`).
사용자 확정으로 **전산팀이 화면에서 관리**하게 되면서, 값은 `role_menus` 테이블로
가고 여기에는 **정의와 기본값**만 남는다.

기본값을 코드에 두는 이유: 빈 운영 DB에서도 화면이 정상이어야 하고, 나중에 메뉴를
하나 추가했을 때 **아무도 그걸 못 보는 상태**가 되면 안 된다(DB에 행이 없다는 것은
'꺼짐'이 아니라 '아직 정하지 않음'이다).

⚠️ **권한은 화면 노출 제어이지 보안 경계가 아니다.** 프로필은 자기신고
(localStorage)이고 API는 그대로 열려 있다. 실제 차단은 폐쇄망 + nginx Basic Auth가
맡는다(계획 G). 메뉴를 껐다고 그 데이터가 보호되는 것은 아니다.
"""

from __future__ import annotations

from backend.teams import (
    DESIGNER_TEAM,
    FINAL_APPROVER,
    LEAD_ROLES,
    MEMBER_ROLES,
    ROLES,
)

# 관리 화면 자신. 이걸 모든 역할에서 끄면 되돌릴 수 없어 저장을 거부한다.
ADMIN_MENU = "admin"

# key는 탭 버튼 id의 꼬리(`tab-btn-<key>`)와 같다 — 화면이 그대로 조립한다.
# server_only=True면 `file://`에서는 켜져 있어도 숨는다(API가 없으므로).
MENUS: tuple[dict, ...] = (
    {"key": "map", "label": "전국 지도", "server_only": False},
    {"key": "regions", "label": "전국 지역별", "server_only": False},
    {"key": "workflow", "label": "워크플로", "server_only": True},
    {"key": "chat", "label": "대화", "server_only": True},
    {"key": "knowledge", "label": "지식", "server_only": True},
    {"key": "tasks", "label": "작업함", "server_only": True},
    {"key": "approvals", "label": "결재함", "server_only": True},
    {"key": ADMIN_MENU, "label": "권한관리", "server_only": True},
)

MENU_KEYS: tuple[str, ...] = tuple(m["key"] for m in MENUS)

# 누구나 보는 것 — 지도와 지역별은 이 시스템의 기본 화면이다.
_COMMON = {"map": True, "regions": True}


def _row(**on: bool) -> dict:
    """켜진 것만 적고 나머지는 꺼진 것으로 채운다."""
    base = {key: False for key in MENU_KEYS}
    base.update(_COMMON)
    base.update(on)
    return base


def _defaults() -> dict[str, dict]:
    out: dict[str, dict] = {}
    # 팀원: 자기 작업함 + 협업 도구. 결재는 하지 않는다.
    for role in MEMBER_ROLES:
        out[role] = _row(workflow=True, chat=True, knowledge=True, tasks=True)
    # 팀장: 거기에 결재함.
    for role in LEAD_ROLES:
        out[role] = _row(workflow=True, chat=True, knowledge=True, tasks=True, approvals=True)
    # 디자이너: 받은 것을 열어보고 작업물을 올린다. 워크플로 현황판은 필요 없다.
    out[DESIGNER_TEAM] = _row(chat=True, knowledge=True, tasks=True)
    # 본부장: **결재만 본다**(사용자 확정 — 9단계 현황판은 필요 없다).
    out[FINAL_APPROVER] = _row(approvals=True)
    # 전산팀이 시스템 운영자를 겸한다(사용자 확정).
    out["전산팀"][ADMIN_MENU] = True
    return out


DEFAULT_MENUS: dict[str, dict] = _defaults()

# 모르는 역할(오타·옛 소속)에게 주는 값. 관리 화면이나 결재함을 열어주지 않는다.
FALLBACK_MENUS: dict = _row()


def menus_for(role: str, overrides: dict[str, dict] | None = None) -> dict:
    """그 역할이 볼 메뉴. DB에 저장된 값이 기본값을 덮어쓴다."""
    base = dict(DEFAULT_MENUS.get(role, FALLBACK_MENUS))
    for key, enabled in ((overrides or {}).get(role, {})).items():
        if key in base:              # 정의에서 사라진 옛 메뉴 키는 조용히 무시한다
            base[key] = enabled
    return base


def all_roles(overrides: dict[str, dict] | None = None) -> dict[str, dict]:
    return {role: menus_for(role, overrides) for role in ROLES}
