from server.db import init_db
from server.notification_repository import list_notifications
from server.orchestrator_recorder import DbRecorder


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


def test_message_records_model_when_given(tmp_path):
    """LLM을 쓴 노드의 보고는 model이 함께 저장된다."""
    db_path, conn = _setup(tmp_path)
    rec = DbRecorder(db_path, "nowon", "bc-1")
    rec.message("영업", "agent", "초안 작성 완료", model="llama3.2:3b")
    assert conn.execute("SELECT model FROM messages").fetchone()["model"] == "llama3.2:3b"


def test_message_records_no_model_by_default(tmp_path):
    """LLM을 안 쓴 기록(예: 게이트 알림)은 model이 None으로 남는다."""
    db_path, conn = _setup(tmp_path)
    rec = DbRecorder(db_path, "nowon", "bc-1")
    rec.message("영업", "orchestrator", "협력사업 항목 초안 작성 지시")
    assert conn.execute("SELECT model FROM messages").fetchone()["model"] is None


# ── task_open — 행만 보장하고 상태는 건드리지 않는다 (계획 H Task 1) ────

def test_task_open이_없으면_만든다(tmp_path):
    db_path, conn = _setup(tmp_path)
    DbRecorder(db_path, "nowon", "bc-1").task_open("디자이너")
    rows = conn.execute("SELECT * FROM tasks WHERE team='디자이너'").fetchall()
    assert len(rows) == 1
    assert rows[0]["status"] == "대기" and rows[0]["progress_pct"] == 0


def test_task_open은_진행_중인_작업을_되돌리지_않는다(tmp_path):
    """이게 이 함수가 존재하는 이유다 — packager는 최종반려 때 다시 돈다."""
    db_path, conn = _setup(tmp_path)
    rec = DbRecorder(db_path, "nowon", "bc-1")
    rec.task_open("디자이너")
    conn.execute("UPDATE tasks SET status='작성중', progress_pct=60, assignee='최 디자이너'"
                 " WHERE team='디자이너'")
    conn.commit()

    rec.task_open("디자이너")          # 재실행

    row = conn.execute("SELECT * FROM tasks WHERE team='디자이너'").fetchone()
    assert (row["status"], row["progress_pct"], row["assignee"]) == ("작성중", 60, "최 디자이너")


def test_task_open은_행을_중복으로_만들지_않는다(tmp_path):
    db_path, conn = _setup(tmp_path)
    rec = DbRecorder(db_path, "nowon", "bc-1")
    rec.task_open("디자이너"); rec.task_open("디자이너"); rec.task_open("디자이너")
    assert conn.execute("SELECT COUNT(*) n FROM tasks WHERE team='디자이너'").fetchone()["n"] == 1
