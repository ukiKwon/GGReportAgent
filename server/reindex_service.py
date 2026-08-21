"""완료 후 지식 인덱스 자동 갱신 — 스펙 §② 17.

**왜 필요했나.** `POST /institutions/{id}/complete`가 산출물을
`{archive_root}/{기관명}/{날짜}/`에 남기는데, 색인기가 훑는 곳은 `corpus/`였다.
즉 재색인을 돌려도 아카이브물은 지식 탭에 **영영 안 잡혔다** — "자동화가 없어서"가
아니라 "경로상 대상이 아니어서"다. 그래서 이 서비스는 아카이브 루트를 색인 루트로
함께 넘긴다(계획 F Task 5, ⓐ안 — 파일을 `corpus/`로 복사해 승격하지 않는다).

**실패해도 완료 처리는 되돌리지 않는다.** 계획 D에서 확정한 원칙과 같다 —
*부수 작업의 실패가 결재를 되돌리면 안 된다.* 대신 실패 사유를 쪽지로 남겨,
조용히 안 되는 상태로 방치되지 않게 한다.
"""

from __future__ import annotations

import sqlite3
import threading
import traceback

from agent.retrieval import reindex
from agent.retrieval.indexer import ARCHIVE_LABEL, DEFAULT_CORPUS_ROOT
from server.db import get_connection
from server.notification_repository import create_notification

# SQLite 쓰기가 겹치면 'database is locked'가 난다. 재색인은 드물게 일어나는
# 무거운 작업이라, 큐를 만들 것 없이 프로세스 내 잠금 하나로 직렬화한다.
_LOCK = threading.Lock()


def institution_name_map(conn: sqlite3.Connection) -> dict[str, str]:
    """아카이브 폴더명(한글 `name_ko`) → `institution_id`(슬러그).

    `agent/`는 `server/`를 import하지 않으므로, 이 매핑은 server가 만들어 넘긴다.
    없으면 아카이브 청크의 기관 필터가 동작하지 않는다.
    """
    return {
        row["name_ko"]: row["institution_id"]
        for row in conn.execute("SELECT institution_id, name_ko FROM institutions")
    }


def reindex_archive(
    db_path: str,
    index_db_path: str,
    archive_root: str,
    *,
    notify_recipient: str | None = None,
    corpus_root: str = DEFAULT_CORPUS_ROOT,
) -> dict | None:
    """아카이브 루트를 증분 재색인한다. 실패하면 쪽지를 남기고 None을 돌려준다.

    `corpus/`는 **넘기지 않는다** — 완료 한 번에 코퍼스 전체를 훑을 이유가 없고,
    reindex는 넘기지 않은 루트를 건드리지 않는다.
    """
    conn = get_connection(db_path)
    try:
        names = institution_name_map(conn)
    finally:
        conn.close()

    with _LOCK:
        try:
            return reindex(
                [(archive_root, ARCHIVE_LABEL)],
                index_db_path,
                institution_names=names,
            )
        except Exception as exc:  # noqa: BLE001 - 어떤 실패도 완료를 되돌리면 안 된다
            _notify_failure(db_path, notify_recipient, exc)
            return None


def _notify_failure(db_path: str, recipient: str | None, exc: Exception) -> None:
    """실패를 쪽지로 알린다. 쪽지 발송마저 실패해도 예외를 밖으로 내보내지 않는다."""
    if not recipient:
        return
    try:
        conn = get_connection(db_path)
        try:
            create_notification(
                conn,
                recipient=recipient,
                kind="쪽지",
                content=(
                    "완료 산출물의 지식 인덱스 갱신에 실패했습니다."
                    f" 사유: {exc}."
                    " 'py -3.14 -m agent.retrieval reindex'로 수동 갱신하세요."
                ),
            )
            conn.commit()
        finally:
            conn.close()
    except Exception:  # noqa: BLE001
        # 여기서 또 터지면 알릴 방법이 없다 — 서버 로그에만 남긴다.
        traceback.print_exc()
