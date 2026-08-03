"""쪽지함 — 수신자별 조회·발송·읽음 처리 (계획 C2).

수신자는 사람 이름일 수도 **역할**일 수도 있다(영업팀·디자이너·인사권자 — 그래프의
`notify()`가 쓰는 값). 그래서 조회는 항상 `recipient`를 여러 개 받는다.
"""

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from backend.db import get_connection
from backend.models import Notification
from backend.notification_repository import (
    create_notification,
    get_notification,
    list_notifications_for,
    mark_read,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])

NOTE_KIND = "쪽지"


class NoteIn(BaseModel):
    recipient: str
    content: str
    # X-User-Id 헤더는 ASCII만 허용되므로 한글 이름은 body로 받는다(A1 F10과 같은 이유).
    sender: str | None = None
    institution_id: str | None = None
    task_id: str | None = None


def _conn(request: Request):
    return get_connection(request.app.state.db_path)


@router.get("", response_model=list[Notification])
def get_notifications(
    request: Request,
    recipient: list[str] = Query(..., min_length=1),
    unread_only: bool = False,
    limit: int = Query(default=50, ge=1, le=200),
) -> list[Notification]:
    """`recipient`는 필수다 — 없이 열면 남의 쪽지함까지 보이는 전체 조회가 된다."""
    conn = _conn(request)
    try:
        return list_notifications_for(conn, recipient, unread_only=unread_only, limit=limit)
    finally:
        conn.close()


@router.post("", response_model=Notification, status_code=201)
def post_note(body: NoteIn, request: Request) -> Notification:
    """사람이 보내는 쪽지. kind는 '쪽지'로 고정한다 —
    결재요청·되물음·이관은 그래프(시스템)만 만들 수 있어야 흐름을 신뢰할 수 있다."""
    conn = _conn(request)
    try:
        return create_notification(
            conn, body.recipient, NOTE_KIND, body.content,
            institution_id=body.institution_id, task_id=body.task_id, sender=body.sender,
        )
    finally:
        conn.close()


@router.post("/{notification_id}/read")
def post_read(notification_id: str, request: Request) -> dict:
    """이미 읽은 것을 다시 눌러도 안전하다(read=False로 알려줄 뿐)."""
    conn = _conn(request)
    try:
        if get_notification(conn, notification_id) is None:
            raise HTTPException(status_code=404, detail="notification not found")
        return {"read": mark_read(conn, notification_id)}
    finally:
        conn.close()
