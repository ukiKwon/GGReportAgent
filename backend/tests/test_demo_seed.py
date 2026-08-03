"""데모 시드는 화면 확인용이지만, 재실행·삭제가 깨지면 실데이터를 오염시킬 수 있다."""

import json

from backend.db import get_connection, init_db
from backend.demo_seed import (
    DEMO_BID_CASE,
    MESSAGES,
    NOTIFICATIONS,
    TEAMS,
    clear,
    seed,
)


def _db(tmp_path):
    db_path = str(tmp_path / "r.db")
    conn = init_db(db_path)
    conn.execute("INSERT INTO institutions (institution_id, name_ko, stage) VALUES ('dobong','도봉구',1)")
    conn.commit(); conn.close()
    return db_path


def _counts(db_path):
    conn = get_connection(db_path)
    try:
        return tuple(
            conn.execute(f"SELECT COUNT(*) AS n FROM {t}").fetchone()["n"]
            for t in ("tasks", "messages", "notifications")
        )
    finally:
        conn.close()


def test_seed_is_idempotent(tmp_path):
    db_path = _db(tmp_path)
    out = str(tmp_path / "out")

    assert seed(db_path, out, "dobong", 9) == "도봉구"
    first = _counts(db_path)
    assert first == (len(TEAMS), len(MESSAGES), len(NOTIFICATIONS))

    seed(db_path, out, "dobong", 9)          # 두 번째 실행이 중복을 쌓지 않는다
    assert _counts(db_path) == first


def test_seed_writes_scoring_and_coverage(tmp_path):
    db_path = _db(tmp_path)
    out = tmp_path / "out"
    seed(db_path, str(out), "dobong", 9)

    assert (out / "도봉구" / "rfp_scoring.json").is_file()
    assert (out / "도봉구" / "coverage_map.json").is_file()
    # rfp_text.txt는 일부러 안 만든다 — 있으면 POST /run이 통과해 LLM이 돌아버린다.
    assert not (out / "도봉구" / "rfp_text.txt").exists()


def test_clear_removes_everything(tmp_path):
    db_path = _db(tmp_path)
    out = tmp_path / "out"
    seed(db_path, str(out), "dobong", 9)

    clear(db_path, str(out), "도봉구")
    assert _counts(db_path) == (0, 0, 0)
    assert not (out / "도봉구" / "rfp_scoring.json").exists()


def test_clear_keeps_non_demo_rows(tmp_path):
    """demo- 접두사가 아닌 실데이터는 건드리지 않는다."""
    db_path = _db(tmp_path)
    conn = get_connection(db_path)
    conn.execute("INSERT INTO bid_cases (bid_case_id, institution_id) VALUES ('bc-real','dobong')")
    conn.execute("INSERT INTO tasks (task_id, bid_case_id, team) VALUES ('task-real','bc-real','영업')")
    conn.commit(); conn.close()

    seed(db_path, str(tmp_path / "out"), "dobong", 9)
    clear(db_path, str(tmp_path / "out"), "도봉구")

    conn = get_connection(db_path)
    try:
        assert conn.execute("SELECT COUNT(*) AS n FROM tasks").fetchone()["n"] == 1
        assert conn.execute("SELECT COUNT(*) AS n FROM bid_cases").fetchone()["n"] == 1
    finally:
        conn.close()


def test_demo_state_is_internally_coherent(tmp_path):
    """9단계까지 간 기관이 '검토중'으로 남아 있으면 앞뒤가 안 맞는다.

    참여확정(3차 결재)이 팀 Task를 만들고 그 뒤에야 5·6단계가 진행되므로,
    stage가 3 이상이면 참여 결정은 이미 끝나 있어야 한다.
    """
    db_path = _db(tmp_path)
    seed(db_path, str(tmp_path / "out"), "dobong", 9)

    conn = get_connection(db_path)
    try:
        stage = conn.execute(
            "SELECT stage FROM institutions WHERE institution_id='dobong'").fetchone()["stage"]
        row = conn.execute(
            "SELECT participation_status, participation_decision FROM bid_cases"
            " WHERE bid_case_id = ?", (DEMO_BID_CASE,)).fetchone()
    finally:
        conn.close()

    assert stage == 9
    assert row["participation_status"] == "참여확정"
    tiers = [d["tier"] for d in json.loads(row["participation_decision"])]
    assert tiers == [1, 2, 3]
