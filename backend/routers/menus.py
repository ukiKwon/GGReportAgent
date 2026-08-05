"""역할별 메뉴 권한 조회·저장 (계획 I Task 2).

- `GET /menus?role=영업팀` — 화면이 탭을 켜고 끌 때 쓴다.
- `GET /menus` — 관리 화면이 쓰는 역할×메뉴 격자.
- `PUT /menus` — 바뀐 것만 저장.

⚠️ 이 엔드포인트는 **누가 부르는지 확인하지 않는다.** 권한은 화면 노출 제어이지
보안 경계가 아니다(`backend/menus.py` 상단 참고) — 프로필이 자기신고라 서버가
신원을 확인할 방법이 애초에 없다. 실제 차단은 폐쇄망 + nginx Basic Auth가 맡는다.
"""

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from backend.db import get_connection
from backend.menu_repository import load_overrides, save_changes
from backend.menus import ADMIN_MENU, MENU_KEYS, MENUS, all_roles, menus_for
from backend.teams import ROLES

router = APIRouter(prefix="/menus", tags=["menus"])


class MenuChange(BaseModel):
    role: str
    menu: str
    enabled: bool


class MenuChangesIn(BaseModel):
    changes: list[MenuChange] = []


def _conn(request: Request):
    return get_connection(request.app.state.db_path)


@router.get("")
def get_menus(request: Request, role: str | None = Query(default=None)) -> dict:
    conn = _conn(request)
    try:
        overrides = load_overrides(conn)
    finally:
        conn.close()
    if role is not None:
        return {"role": role, "menus": menus_for(role, overrides)}
    # 관리 화면용 — 메뉴 정의(라벨·서버전용 여부)까지 함께 준다.
    return {"menus": [dict(m) for m in MENUS], "roles": all_roles(overrides)}


@router.put("")
def put_menus(body: MenuChangesIn, request: Request) -> dict:
    for change in body.changes:
        if change.menu not in MENU_KEYS:
            raise HTTPException(status_code=400, detail=f"모르는 메뉴입니다: {change.menu}")
        if change.role not in ROLES:
            raise HTTPException(status_code=400, detail=f"모르는 역할입니다: {change.role}")

    conn = _conn(request)
    try:
        overrides = load_overrides(conn)
        # 저장 뒤의 모습을 미리 그려 자물쇠를 검사한다 — 저장하고 나서 확인하면
        # 이미 아무도 못 들어가는 상태가 된 뒤다.
        after = all_roles(overrides)
        for change in body.changes:
            after.setdefault(change.role, {})[change.menu] = change.enabled
        if not any(row.get(ADMIN_MENU) for row in after.values()):
            raise HTTPException(
                status_code=400,
                detail=("권한관리 메뉴를 모든 역할에서 끌 수 없습니다 — "
                        "그러면 아무도 이 화면에 들어올 수 없어 되돌릴 방법이 없습니다. "
                        "먼저 다른 역할에 권한관리를 켜 주세요."),
            )
        saved = save_changes(conn, [c.model_dump() for c in body.changes])
    finally:
        conn.close()
    return {"saved": saved}
