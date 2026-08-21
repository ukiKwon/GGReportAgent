"""`role_menus` 읽고 쓰기 (계획 I Task 2).

저장하는 것은 **기본값과 다른 것만**이 아니라 사용자가 명시적으로 정한 값 전부다.
읽을 때 `server/menus.menus_for`가 기본값 위에 덮어쓴다.
"""

from __future__ import annotations

import sqlite3


def load_overrides(conn: sqlite3.Connection) -> dict[str, dict[str, bool]]:
    """{역할: {메뉴: 켜짐}} — 저장된 것만. 없으면 빈 dict."""
    out: dict[str, dict[str, bool]] = {}
    for row in conn.execute("SELECT role, menu, enabled FROM role_menus"):
        out.setdefault(row["role"], {})[row["menu"]] = bool(row["enabled"])
    return out


def save_changes(conn: sqlite3.Connection, changes: list[dict]) -> int:
    """바뀐 것만 upsert한다. 전체 덮어쓰기를 하지 않는 이유: 두 사람이 같은 화면을
    열어 두었을 때 나중에 저장한 쪽이 상대의 변경을 통째로 지우는 것을 막는다."""
    for change in changes:
        conn.execute(
            """INSERT INTO role_menus (role, menu, enabled) VALUES (?, ?, ?)
               ON CONFLICT(role, menu) DO UPDATE SET enabled = excluded.enabled""",
            (change["role"], change["menu"], 1 if change["enabled"] else 0),
        )
    conn.commit()
    return len(changes)
