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
        # 기록에 "그때 몇 단계였는지"를 같이 남긴다 — 단계별 수행 내용 뷰(계획 C1-fix)의
        # 유일한 근거다. 포트 시그니처를 늘리지 않으려고 set_stage를 그대로 신뢰한다.
        self.stage = self._read_stage()

    def _read_stage(self) -> int | None:
        conn = self._conn()
        try:
            row = conn.execute(
                "SELECT stage FROM institutions WHERE institution_id = ?",
                (self.institution_id,),
            ).fetchone()
        finally:
            conn.close()
        return row["stage"] if row else None

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
        self.stage = stage

    def task_open(self, team: str) -> None:
        """자리만 연다 — 이미 있으면 상태·진행률·담당자를 **그대로 둔다**.

        `task_update`와 나뉘어 있는 이유가 여기 있다: `packager`는 최종반려 시 다시
        도는데(subagents.verifier의 F7 주석), 그때 `task_update("디자이너","대기",0)`을
        부르면 디자이너가 파일을 올리고 작성중으로 바꿔둔 것이 초기화된다.
        """
        conn = self._conn()
        try:
            self._ensure_task(conn, team)      # 멱등 — 있으면 그 task_id를 돌려줄 뿐이다
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

    def message(
        self, team: str, role: str, content: str,
        author: str | None = None, model: str | None = None,
    ) -> None:
        conn = self._conn()
        try:
            task_id = self._ensure_task(conn, team)
            add_message(conn, task_id, role, content, author=author, stage=self.stage, model=model)
        finally:
            conn.close()

    def notify(self, recipient: str, kind: str, content: str) -> None:
        conn = self._conn()
        try:
            create_notification(
                conn, recipient, kind, content,
                institution_id=self.institution_id, stage=self.stage,
            )
        finally:
            conn.close()
