from fastapi import APIRouter, HTTPException, Request

from backend.db import get_connection
from backend.inbox_import import InboxBatchError, import_batch, validate_inbox_batch

router = APIRouter(prefix="/inbox", tags=["inbox"])


@router.post("/{batch_id}/validate")
def post_batch_validate(batch_id: str, request: Request) -> dict:
    """검사만 한다 — DB도 파일도 무변경.

    코퍼스 검증기와 달리 warnings가 없다. 배치는 형식 계약이라 "애매하지만 통과"가
    존재하지 않기 때문이다(설계 §⑨-6).
    """
    try:
        errors = validate_inbox_batch(batch_id, request.app.state.inbox_root)
    except InboxBatchError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.detail) from exc
    return {"ok": not errors, "errors": errors, "batch_id": batch_id}


@router.post("/{batch_id}/import")
def post_batch_import(batch_id: str, request: Request) -> dict:
    conn = get_connection(request.app.state.db_path)
    try:
        return import_batch(
            conn,
            batch_id,
            inbox_root=request.app.state.inbox_root,
            rfp_root=request.app.state.rfp_root,
            batches_root=request.app.state.batches_root,
        )
    except InboxBatchError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.detail) from exc
    finally:
        conn.close()
