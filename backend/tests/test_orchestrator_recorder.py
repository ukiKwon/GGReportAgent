from backend.db import init_db
from backend.notification_repository import list_notifications
from backend.orchestrator_recorder import DbRecorder


def _setup(tmp_path):
    db_path = str(tmp_path / "registry.db")
    conn = init_db(db_path)
    conn.execute(
        "INSERT INTO institutions (institution_id, name_ko, stage) VALUES ('nowon', '노원구', 2)"
    )
    conn.execute(
        "INSERT INTO bid_cases (bid_case_id, institution_id) VALUES ('bc-1', 'nowon')"
    )
    conn.commit()
    return db_path, conn


def test_set_stage_updates_institution(tmp_path):
    db_path, conn = _setup(tmp_path)
    DbRecorder(db_path, "nowon", "bc-1").set_stage(4)
    row = conn.execute("SELECT stage FROM institutions WHERE institution_id='nowon'").fetchone()
    assert row["stage"] == 4


def test_task_update_creates_then_updates_team_task(tmp_path):
    db_path, conn = _setup(tmp_path)
    rec = DbRecorder(db_path, "nowon", "bc-1")
    rec.task_update("영업", "작성중", 30)
    rec.task_update("영업", "1차완료", 100)
    rows = conn.execute("SELECT * FROM tasks WHERE bid_case_id='bc-1' AND team='영업'").fetchall()
    assert len(rows) == 1
    assert rows[0]["status"] == "1차완료"
    assert rows[0]["progress_pct"] == 100


def test_message_appends_to_team_task_thread(tmp_path):
    db_path, conn = _setup(tmp_path)
    rec = DbRecorder(db_path, "nowon", "bc-1")
    rec.message("영업", "orchestrator", "협력사업 항목 초안 작성 지시")
    task = conn.execute("SELECT task_id FROM tasks WHERE team='영업'").fetchone()
    msgs = conn.execute("SELECT * FROM messages WHERE task_id=?", (task["task_id"],)).fetchall()
    assert len(msgs) == 1
    assert msgs[0]["role"] == "orchestrator"


def test_notify_writes_notification(tmp_path):
    db_path, conn = _setup(tmp_path)
    DbRecorder(db_path, "nowon", "bc-1").notify("영업팀", "되물음", "불리 조건 발견")
    notes = list_notifications(conn, "영업팀")
    assert len(notes) == 1
    assert notes[0].kind == "되물음"
    assert notes[0].institution_id == "nowon"


def test_message_records_author_and_current_stage(tmp_path):
    """단계별 수행 내용 뷰(계획 C1-fix)를 위해 메시지에 작성자와 단계가 남아야 한다."""
    db_path, conn = _setup(tmp_path)
    rec = DbRecorder(db_path, "nowon", "bc-1")
    rec.set_stage(6)
    rec.message("영업", "human", "기획 승인 — 김 차장", author="김 차장")

    row = conn.execute("SELECT * FROM messages").fetchone()
    assert row["author"] == "김 차장"
    assert row["stage"] == 6


def test_recorder_starts_from_institution_stage(tmp_path):
    """set_stage 없이 기록해도 DB의 현재 단계로 찍힌다(기관 stage=2로 시딩됨)."""
    db_path, conn = _setup(tmp_path)
    DbRecorder(db_path, "nowon", "bc-1").message("영업", "agent", "초안 작성 완료")
    assert conn.execute("SELECT stage FROM messages").fetchone()["stage"] == 2


def test_notify_records_current_stage(tmp_path):
    db_path, conn = _setup(tmp_path)
    rec = DbRecorder(db_path, "nowon", "bc-1")
    rec.set_stage(8)
    rec.notify("인사권자", "결재요청", "최종결재 대기")
    assert conn.execute("SELECT stage FROM notifications").fetchone()["stage"] == 8
