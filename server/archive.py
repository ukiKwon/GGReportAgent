"""완료 아카이브 — 스펙 §② 17. 최종 승인 후 작업물 일체를 내부 저장소에 남긴다.

FTS 색인 확장은 지식시스템 탭(계획 C)과 함께 — 여기서는 실물 보존과 manifest까지.
"""

import json
import os
import shutil
import sqlite3
from datetime import datetime, timezone

from server.models import Institution

ARTIFACT_NAMES = ("rfp_text.txt", "rfp_scoring.json", "coverage_map.json")


def archive_institution(
    conn: sqlite3.Connection,
    institution: Institution,
    output_root: str,
    archive_root: str,
    bid_case_id: str | None = None,
) -> str:
    """기관의 완료 산출물을 아카이브한다.

    I-2: tasks 덤프는 기관 전체가 아니라 `bid_case_id`로 지정한 단일 bid_case로
    스코프한다(코드베이스는 1:N 기관:bid_case를 전제 — OrchestratorService._latest_bid_case
    참고). bid_case_id가 None이면(해당 기관에 bid_case가 아직 없는 경우) tasks 덤프는
    빈 배열이다 — 산출물 파일 복사와 manifest 작성은 그대로 수행된다.
    """
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    dest = os.path.join(archive_root, institution.name_ko, day)
    # M-4: dest는 name_ko로 조립되는데 바로 아래에서 rmtree한다 — 기관명에 `..`가 섞이면
    # 아카이브 밖 디렉터리를 지운다. 지우기 전에 뿌리 안쪽인지 확인한다.
    root_abs = os.path.abspath(archive_root)
    if os.path.commonpath([root_abs, os.path.abspath(dest)]) != root_abs:
        raise ValueError(f"아카이브 경로가 뿌리를 벗어납니다: {institution.name_ko!r}")
    shutil.rmtree(dest, ignore_errors=True)
    os.makedirs(dest, exist_ok=True)

    src_dir = os.path.join(output_root, institution.name_ko)
    copied = []
    if os.path.isdir(src_dir):
        for name in os.listdir(src_dir):
            # M-5: 확장자 대소문자로 제안서를 놓치면 아카이브에서 통째로 빠진다.
            if name in ARTIFACT_NAMES or name.lower().endswith(".pptx"):
                shutil.copy2(os.path.join(src_dir, name), os.path.join(dest, name))
                copied.append(name)

    tasks = []
    if bid_case_id is not None:
        for t in conn.execute(
            "SELECT * FROM tasks WHERE bid_case_id = ?", (bid_case_id,)
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
