"""완료 아카이브 — 스펙 §② 17. 최종 승인 후 작업물 일체를 내부 저장소에 남긴다.

FTS 색인 확장은 지식시스템 탭(계획 C)과 함께 — 여기서는 실물 보존과 manifest까지.
"""

import json
import os
import shutil
import sqlite3
from datetime import datetime, timezone

from backend.models import Institution

ARTIFACT_NAMES = ("rfp_text.txt", "rfp_scoring.json", "coverage_map.json")


def archive_institution(
    conn: sqlite3.Connection, institution: Institution, output_root: str, archive_root: str
) -> str:
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    dest = os.path.join(archive_root, institution.name_ko, day)
    shutil.rmtree(dest, ignore_errors=True)
    os.makedirs(dest, exist_ok=True)

    src_dir = os.path.join(output_root, institution.name_ko)
    copied = []
    if os.path.isdir(src_dir):
        for name in os.listdir(src_dir):
            if name in ARTIFACT_NAMES or name.endswith(".pptx"):
                shutil.copy2(os.path.join(src_dir, name), os.path.join(dest, name))
                copied.append(name)

    tasks = []
    for t in conn.execute(
        """SELECT t.* FROM tasks t JOIN bid_cases b ON b.bid_case_id = t.bid_case_id
           WHERE b.institution_id = ?""", (institution.institution_id,)
    ).fetchall():
        messages = [dict(m) for m in conn.execute(
            "SELECT role, content, created_at FROM messages WHERE task_id = ? ORDER BY created_at",
            (t["task_id"],),
        ).fetchall()]
        tasks.append({**dict(t), "messages": messages})
    with open(os.path.join(dest, "tasks_dump.json"), "w", encoding="utf-8") as f:
        json.dump(tasks, f, ensure_ascii=False, indent=2)

    manifest = {
        "institution_id": institution.institution_id,
        "name_ko": institution.name_ko,
        "archived_at": datetime.now(timezone.utc).isoformat(),
        "files": copied + ["tasks_dump.json"],
    }
    with open(os.path.join(dest, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    return dest
