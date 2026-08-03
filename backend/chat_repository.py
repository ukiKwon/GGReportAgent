import secrets
import sqlite3
from datetime import datetime, timezone

from backend.models import ChatMessage


def add_chat_message(
    conn: sqlite3.Connection, institution_id: str, role: str, content: str,
    author: str | None = None,
) -> ChatMessage:
    chat_message_id = f"chat-{secrets.token_hex(4)}"
    created_at = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "INSERT INTO chat_messages"
        " (chat_message_id, institution_id, role, content, created_at, author)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        (chat_message_id, institution_id, role, content, created_at, author),
    )
    conn.commit()
    return ChatMessage(
        chat_message_id=chat_message_id, institution_id=institution_id,
        role=role, content=content, created_at=created_at, author=author,
    )


def list_chat_messages(conn: sqlite3.Connection, institution_id: str) -> list[ChatMessage]:
    rows = conn.execute(
        "SELECT * FROM chat_messages WHERE institution_id = ? ORDER BY created_at",
        (institution_id,),
    ).fetchall()
    return [ChatMessage(**dict(r)) for r in rows]
