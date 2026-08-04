"""정합성 점검 조회 — 규칙으로 어긋난 상태를 찾는다(계획 E).

`POST /run` 가드가 앞으로를 막고, 이 엔드포인트는 이미 어긋나 있는 것을 보여준다.
"""

from fastapi import APIRouter, Request

from backend.consistency import check_all
from backend.db import get_connection

router = APIRouter(prefix="/consistency", tags=["consistency"])


@router.get("")
def get_consistency(request: Request, institution_id: str | None = None) -> dict:
    conn = get_connection(request.app.state.db_path)
    try:
        findings = check_all(
            conn,
            institution_id=institution_id,
            output_root=request.app.state.output_root,
        )
    finally:
        conn.close()
    return {"findings": findings, "ok": not findings}
