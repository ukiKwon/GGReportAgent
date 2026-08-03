import secrets
import sqlite3
from datetime import datetime, timezone

from backend.models import Notification


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_notification(
    conn: sqlite3.Connection,
    recipient: str,
    kind: str,
    content: str,
    institution_id: str | None = None,
    task_id: str | None = None,
    link: str | None = None,
    commit: bool = True,
    stage: int | None = None,
    sender: str | None = None,
) -> Notification:
    notification_id = f"ntf-{secrets.token_hex(4)}"
    created_at = _now()
    conn.execute(
        """INSERT INTO notifications
           (notification_id, recipient, kind, institution_id, task_id, content, link,
            created_at, stage, sender)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (notification_id, recipient, kind, institution_id, task_id, content, link,
         created_at, stage, sender),
    )
    if commit:
        conn.commit()
    return Notification(
        notification_id=notification_id, recipient=recipient, kind=kind,
        institution_id=institution_id, task_id=task_id, content=content,
        link=link, created_at=created_at, stage=stage, sender=sender,
    )


def list_notifications(
    conn: sqlite3.Connection, recipient: str, unread_only: bool = False
) -> list[Notification]:
    sql = "SELECT * FROM notifications WHERE recipient = ?"
    if unread_only:
        sql += " AND read_at IS NULL"
    sql += " ORDER BY created_at DESC"
    return [Notification(**dict(r)) for r in conn.execute(sql, (recipient,)).fetchall()]


def list_notifications_for(
    conn: sqlite3.Connection,
    recipients: list[str],
    unread_only: bool = False,
    limit: int = 50,
) -> list[Notification]:
    """여러 수신자 앞으로 온 것을 한 번에 — 쪽지함은 '내 소속 + 내 이름'을 함께 본다."""
    if not recipients:
        return []
    placeholders = ", ".join("?" for _ in recipients)
    sql = f"SELECT * FROM notifications WHERE recipient IN ({placeholders})"
    if unread_only:
        sql += " AND read_at IS NULL"
    sql += " ORDER BY created_at DESC LIMIT ?"
    rows = conn.execute(sql, (*recipients, limit)).fetchall()
    return [Notification(**dict(r)) for r in rows]


def get_notification(conn: sqlite3.Connection, notification_id: str) -> Notification | None:
    row = conn.execute(
        "SELECT * FROM notifications WHERE notification_id = ?", (notification_id,)
    ).fetchone()
    return Notification(**dict(row)) if row else None


def mark_read(conn: sqlite3.Connection, notification_id: str) -> bool:
    cur = conn.execute(
        "UPDATE notifications SET read_at = ? WHERE notification_id = ? AND read_at IS NULL",
        (_now(), notification_id),
    )
    conn.commit()
    return cur.rowcount > 0
