import json

from backend.archive import archive_institution
from backend.db import get_connection, init_db


def test_archives_artifacts_and_dumps_tasks(tmp_path):
    db = init_db(str(tmp_path / "r.db"))
    db.execute("INSERT INTO institutions (institution_id, name_ko, stage) VALUES ('nowon','노원구',9)")
    db.execute("INSERT INTO bid_cases (bid_case_id, institution_id) VALUES ('bc-1','nowon')")
    db.execute("INSERT INTO tasks (task_id, bid_case_id, team, status, draft_content)"
               " VALUES ('task-1','bc-1','전산','2차완료','IT 본문')")
    db.execute("INSERT INTO messages (message_id, task_id, role, content, created_at)"
               " VALUES ('msg-1','task-1','agent','검사 완료','2026-07-31T00:00:00')")
    db.commit()

    out = tmp_path / "report_new" / "노원구"
    out.mkdir(parents=True)
    (out / "rfp_text.txt").write_text("원문", encoding="utf-8")
    (out / "coverage_map.json").write_text("{}", encoding="utf-8")

    from backend.repository import get_institution
    inst = get_institution(db, "nowon")
    dest = archive_institution(db, inst, str(tmp_path / "report_new"), str(tmp_path / "archive"))

    files = {p.name for p in __import__("pathlib").Path(dest).iterdir()}
    assert {"rfp_text.txt", "coverage_map.json", "tasks_dump.json", "manifest.json"} <= files
    dump = json.loads((__import__("pathlib").Path(dest) / "tasks_dump.json").read_text(encoding="utf-8"))
    assert dump[0]["team"] == "전산" and dump[0]["messages"][0]["content"] == "검사 완료"
    manifest = json.loads((__import__("pathlib").Path(dest) / "manifest.json").read_text(encoding="utf-8"))
    assert "rfp_text.txt" in manifest["files"] and manifest["institution_id"] == "nowon"
