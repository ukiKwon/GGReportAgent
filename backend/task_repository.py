import secrets
import sqlite3
from datetime import datetime, timezone

from backend.models import Message, Task


def _row_to_task(row: sqlite3.Row) -> Task:
    return Task(**dict(row))


def get_task(conn: sqlite3.Connection, task_id: str) -> Task | None:
    cursor = conn.execute("SELECT * FROM tasks WHERE task_id = ?", (task_id,))
    row = cursor.fetchone()
    return _row_to_task(row) if row else None


def list_messages(conn: sqlite3.Connection, task_id: str) -> list[Message]:
    cursor = conn.execute(
        "SELECT * FROM messages WHERE task_id = ? ORDER BY created_at", (task_id,)
    )
    return [Message(**dict(row)) for row in cursor.fetchall()]


def add_message(
    conn: sqlite3.Connection,
    task_id: str,
    role: str,
    content: str,
    author: str | None = None,
    stage: int | None = None,
    model: str | None = None,
) -> Message:
    """author·stage·model은 선택 인자다 — 모르는 호출부는 안 넘기면 되고, 그 행은 NULL로 남는다.

    model은 LLM을 실제로 쓴 기록에만 채운다(Task 5) — 호출부가 안 넘기면 NULL 그대로다.
    """
    message_id = f"msg-{secrets.token_hex(4)}"
    created_at = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "INSERT INTO messages (message_id, task_id, role, content, created_at, author, stage, model) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (message_id, task_id, role, content, created_at, author, stage, model),
    )
    conn.commit()
    return Message(
        message_id=message_id, task_id=task_id, role=role, content=content,
        created_at=created_at, author=author, stage=stage, model=model,
    )


def claim_assignee_if_unset(conn: sqlite3.Connection, task_id: str, user_id: str) -> None:
    conn.execute(
        """UPDATE tasks
           SET assignee = ?, status = CASE WHEN status = '대기' THEN '작성중' ELSE status END
           WHERE task_id = ? AND assignee IS NULL""",
        (user_id, task_id),
    )
    conn.commit()


def update_draft_content(conn: sqlite3.Connection, task_id: str, draft_content: str) -> None:
    conn.execute("UPDATE tasks SET draft_content = ? WHERE task_id = ?", (draft_content, task_id))
    conn.commit()


def submit_task(conn: sqlite3.Connection, task_id: str) -> None:
    conn.execute("UPDATE tasks SET status = '1차완료' WHERE task_id = ?", (task_id,))
    conn.commit()


def claim_approver_if_unset(conn: sqlite3.Connection, task_id: str, user_id: str) -> None:
    conn.execute(
        "UPDATE tasks SET approver = ? WHERE task_id = ? AND approver IS NULL",
        (user_id, task_id),
    )
    conn.commit()


def approve_task(conn: sqlite3.Connection, task_id: str, approved: bool) -> None:
    new_status = "2차완료" if approved else "작성중"
    conn.execute("UPDATE tasks SET status = ? WHERE task_id = ?", (new_status, task_id))
    conn.commit()
