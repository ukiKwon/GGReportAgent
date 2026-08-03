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
) -> Notification:
    notification_id = f"ntf-{secrets.token_hex(4)}"
    created_at = _now()
    conn.execute(
        """INSERT INTO notifications
           (notification_id, recipient, kind, institution_id, task_id, content, link,
            created_at, stage)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (notification_id, recipient, kind, institution_id, task_id, content, link,
         created_at, stage),
    )
    if commit:
        conn.commit()
    return Notification(
        notification_id=notification_id, recipient=recipient, kind=kind,
        institution_id=institution_id, task_id=task_id, content=content,
        link=link, created_at=created_at, stage=stage,
    )


def list_notifications(
    conn: sqlite3.Connection, recipient: str, unread_only: bool = False
) -> list[Notification]:
    sql = "SELECT * FROM notifications WHERE recipient = ?"
    if unread_only:
        sql += " AND read_at IS NULL"
    sql += " ORDER BY created_at DESC"
    return [Notification(**dict(r)) for r in conn.execute(sql, (recipient,)).fetchall()]


def mark_read(conn: sqlite3.Connection, notification_id: str) -> bool:
    cur = conn.execute(
        "UPDATE notifications SET read_at = ? WHERE notification_id = ? AND read_at IS NULL",
        (_now(), notification_id),
    )
    conn.commit()
    return cur.rowcount > 0
