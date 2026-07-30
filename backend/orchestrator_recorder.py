"""Recorder의 DB 구현 — 그래프의 지시/보고를 registry에 남긴다.

스레드에서 호출되므로 커넥션을 들고 있지 않고 호출마다 열고 닫는다(SQLite 파일 DB).
"""

import secrets
import sqlite3

from backend.db import get_connection
from backend.notification_repository import create_notification
from backend.task_repository import add_message


class DbRecorder:
    def __init__(self, db_path: str, institution_id: str, bid_case_id: str) -> None:
        self.db_path = db_path
        self.institution_id = institution_id
        self.bid_case_id = bid_case_id

    def _conn(self) -> sqlite3.Connection:
        return get_connection(self.db_path)

    def _ensure_task(self, conn: sqlite3.Connection, team: str) -> str:
        row = conn.execute(
            "SELECT task_id FROM tasks WHERE bid_case_id = ? AND team = ?",
            (self.bid_case_id, team),
        ).fetchone()
        if row:
            return row["task_id"]
        task_id = f"task-{secrets.token_hex(4)}"
        conn.execute(
            "INSERT INTO tasks (task_id, bid_case_id, team) VALUES (?, ?, ?)",
            (task_id, self.bid_case_id, team),
        )
        conn.commit()
        return task_id

    def set_stage(self, stage: int) -> None:
        conn = self._conn()
        try:
            conn.execute(
                "UPDATE institutions SET stage = ? WHERE institution_id = ?",
                (stage, self.institution_id),
            )
            conn.commit()
        finally:
            conn.close()

    def task_update(self, team: str, status: str, progress_pct: int) -> None:
        conn = self._conn()
        try:
            task_id = self._ensure_task(conn, team)
            conn.execute(
                "UPDATE tasks SET status = ?, progress_pct = ? WHERE task_id = ?",
                (status, progress_pct, task_id),
            )
            conn.commit()
        finally:
            conn.close()

    def message(self, team: str, role: str, content: str) -> None:
        conn = self._conn()
        try:
            task_id = self._ensure_task(conn, team)
            add_message(conn, task_id, role, content)
        finally:
            conn.close()

    def notify(self, recipient: str, kind: str, content: str) -> None:
        conn = self._conn()
        try:
            create_notification(
                conn, recipient, kind, content, institution_id=self.institution_id
            )
        finally:
            conn.close()
