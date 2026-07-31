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
    dest = archive_institution(
        db, inst, str(tmp_path / "report_new"), str(tmp_path / "archive"), bid_case_id="bc-1"
    )

    files = {p.name for p in __import__("pathlib").Path(dest).iterdir()}
    assert {"rfp_text.txt", "coverage_map.json", "tasks_dump.json", "manifest.json"} <= files
    dump = json.loads((__import__("pathlib").Path(dest) / "tasks_dump.json").read_text(encoding="utf-8"))
    assert dump[0]["team"] == "전산" and dump[0]["messages"][0]["content"] == "검사 완료"
    manifest = json.loads((__import__("pathlib").Path(dest) / "manifest.json").read_text(encoding="utf-8"))
    assert "rfp_text.txt" in manifest["files"] and manifest["institution_id"] == "nowon"


def test_archive_scopes_tasks_dump_to_given_bid_case(tmp_path):
    """I-2 회귀: archive_institution은 bid_case_id로 스코프된 tasks만 덤프해야 한다
    — 과거 bid_case(bc-old)의 task가 최신 bid_case(bc-new) 아카이브에 섞이면 안 됨."""
    db = init_db(str(tmp_path / "r.db"))
    db.execute("INSERT INTO institutions (institution_id, name_ko, stage) VALUES ('nowon','노원구',9)")
    db.execute("INSERT INTO bid_cases (bid_case_id, institution_id) VALUES ('bc-old','nowon')")
    db.execute("INSERT INTO bid_cases (bid_case_id, institution_id) VALUES ('bc-new','nowon')")
    db.execute("INSERT INTO tasks (task_id, bid_case_id, team, status, draft_content)"
               " VALUES ('task-old','bc-old','영업','2차완료','과거 건')")
    db.execute("INSERT INTO tasks (task_id, bid_case_id, team, status, draft_content)"
               " VALUES ('task-new','bc-new','전산','2차완료','최신 건')")
    db.commit()

    out = tmp_path / "report_new" / "노원구"
    out.mkdir(parents=True)

    from backend.repository import get_institution
    inst = get_institution(db, "nowon")
    dest = archive_institution(
        db, inst, str(tmp_path / "report_new"), str(tmp_path / "archive"), bid_case_id="bc-new"
    )

    dump = json.loads((__import__("pathlib").Path(dest) / "tasks_dump.json").read_text(encoding="utf-8"))
    assert [t["task_id"] for t in dump] == ["task-new"]


def test_same_day_rearchive_removes_old_files(tmp_path):
    """같은 날 재아카이브 시 이전 아카이브의 잔여 파일이 정리되는지 확인."""
    db = init_db(str(tmp_path / "r.db"))
    db.execute("INSERT INTO institutions (institution_id, name_ko, stage) VALUES ('nowon','노원구',9)")
    db.execute("INSERT INTO bid_cases (bid_case_id, institution_id) VALUES ('bc-1','nowon')")
    db.execute("INSERT INTO tasks (task_id, bid_case_id, team, status, draft_content)"
               " VALUES ('task-1','bc-1','전산','2차완료','IT 본문')")
    db.commit()

    out = tmp_path / "report_new" / "노원구"
    out.mkdir(parents=True)

    from backend.repository import get_institution
    inst = get_institution(db, "nowon")

    # 1차 아카이브: old.pptx 포함
    (out / "rfp_text.txt").write_text("원문1", encoding="utf-8")
    (out / "old.pptx").write_text("pptx1", encoding="utf-8")
    dest1 = archive_institution(
        db, inst, str(tmp_path / "report_new"), str(tmp_path / "archive"), bid_case_id="bc-1"
    )
    files1 = {p.name for p in __import__("pathlib").Path(dest1).iterdir()}
    assert "old.pptx" in files1

    # 소스 갱신: old.pptx 삭제, new.pptx 추가
    (out / "old.pptx").unlink()
    (out / "new.pptx").write_text("pptx2", encoding="utf-8")

    # 2차 아카이브: 같은 날
    dest2 = archive_institution(
        db, inst, str(tmp_path / "report_new"), str(tmp_path / "archive"), bid_case_id="bc-1"
    )
    assert dest1 == dest2  # 같은 경로

    files2 = {p.name for p in __import__("pathlib").Path(dest2).iterdir()}
    assert "old.pptx" not in files2, "old.pptx가 정리되지 않았음"
    assert "new.pptx" in files2, "new.pptx가 아카이브되지 않았음"

    # manifest.files와 디렉터리 내용이 일치 (manifest.json 제외)
    manifest = json.loads((__import__("pathlib").Path(dest2) / "manifest.json").read_text(encoding="utf-8"))
    manifest_files = set(manifest["files"])
    actual_files = {p.name for p in __import__("pathlib").Path(dest2).iterdir() if p.name != "manifest.json"}
    assert manifest_files == actual_files, f"manifest {manifest_files} != actual {actual_files}"
