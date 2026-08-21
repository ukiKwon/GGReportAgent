"""정합성 점검 — 규칙으로 적을 수 있는 것만 본다(LLM 아님).

사용자가 발견한 "9단계까지 갔는데 참여 결정은 검토중" 같은 앞뒤 안 맞는 상태를
기존 데이터에서도 찾아낸다. 가드(E Task 1)가 앞으로를 막는다면, 이건 이미 생긴 것을 찾는다.
"""

import pytest

from server.consistency import RULES, check_all
from server.db import init_db


@pytest.fixture
def conn(tmp_path):
    c = init_db(str(tmp_path / "r.db"))
    yield c
    c.close()


def _inst(conn, iid, name, stage):
    conn.execute("INSERT INTO institutions (institution_id, name_ko, stage) VALUES (?,?,?)",
                 (iid, name, stage))


def _bid(conn, bid_case_id, iid, status="검토중"):
    conn.execute("INSERT INTO bid_cases (bid_case_id, institution_id, participation_status)"
                 " VALUES (?,?,?)", (bid_case_id, iid, status))


def _rules(findings):
    return sorted(f["rule"] for f in findings)


def test_healthy_data_has_no_findings(conn):
    _inst(conn, "dobong", "도봉구", 9)
    _bid(conn, "bc-1", "dobong", "참여확정")
    conn.execute("INSERT INTO tasks (task_id, bid_case_id, team) VALUES ('t1','bc-1','영업')")
    conn.commit()

    assert check_all(conn) == []


def test_stage_advanced_without_participation_confirmation(conn):
    """사용자가 실제로 발견한 그 상태."""
    _inst(conn, "dobong", "도봉구", 9)
    _bid(conn, "bc-1", "dobong", "검토중")
    conn.execute("INSERT INTO tasks (task_id, bid_case_id, team) VALUES ('t1','bc-1','영업')")
    conn.commit()

    findings = check_all(conn)
    assert "stage_without_confirmation" in _rules(findings)
    hit = [f for f in findings if f["rule"] == "stage_without_confirmation"][0]
    assert hit["institution_id"] == "dobong"
    assert "도봉구" in hit["message"] and "검토중" in hit["message"]


def test_stage_advanced_with_no_bid_case_at_all(conn):
    _inst(conn, "nowon", "노원구", 5)
    conn.commit()
    assert "stage_without_bid_case" in _rules(check_all(conn))


def test_declined_but_stage_moved_on(conn):
    _inst(conn, "gwangjin", "광진구", 6)
    _bid(conn, "bc-2", "gwangjin", "미참여확정")
    conn.commit()
    assert "declined_but_advanced" in _rules(check_all(conn))


def test_confirmed_and_researched_but_no_tasks(conn):
    """조사까지 끝났으면 팀 Task가 만들어졌어야 한다."""
    _inst(conn, "dongjak", "동작구", 6)
    _bid(conn, "bc-3", "dongjak", "참여확정")
    conn.execute("UPDATE bid_cases SET research_status = '완료' WHERE bid_case_id='bc-3'")
    conn.commit()
    assert "confirmed_without_tasks" in _rules(check_all(conn))


def test_confirmed_while_waiting_for_corpus_is_not_flagged(conn):
    """research_status가 '대기'인 채 참여확정된 것은 **정상**이다 —
    코퍼스가 반입되면 activate_pending_bid_cases가 그때 Task를 만든다.
    이걸 경고로 띄우면 오탐이 되고, 오탐이 나오면 아무도 경고를 안 읽는다."""
    _inst(conn, "nowon", "노원구", 1)
    _bid(conn, "bc-4", "nowon", "참여확정")      # research_status 기본값 '대기'
    conn.commit()

    assert "confirmed_without_tasks" not in _rules(check_all(conn))


def test_stage_1_or_2_is_never_flagged(conn):
    """아직 시작 전인 기관은 참여 결정이 없어도 정상이다."""
    _inst(conn, "nowon", "노원구", 1)
    _bid(conn, "bc-4", "nowon", "검토중")
    _inst(conn, "jongno", "종로구", 2)
    conn.commit()
    assert check_all(conn) == []


def test_can_filter_by_institution(conn):
    _inst(conn, "a", "가구", 5)
    _inst(conn, "b", "나구", 5)
    conn.commit()

    only_a = check_all(conn, institution_id="a")
    assert {f["institution_id"] for f in only_a} == {"a"}


def test_every_rule_is_documented(conn):
    """규칙마다 '무엇이 왜 문제인지'가 붙어 있어야 사람이 고칠 수 있다."""
    for rule in RULES:
        assert rule.name and rule.why, rule


def test_api_reports_findings(tmp_path):
    from fastapi.testclient import TestClient

    from server.db import get_connection
    from server.main import create_app

    app = create_app(str(tmp_path / "r.db"), output_root=str(tmp_path / "out"),
                     graph_db_path=str(tmp_path / "g.db"))
    c = get_connection(str(tmp_path / "r.db"))
    c.execute("INSERT INTO institutions (institution_id, name_ko, stage) VALUES ('dobong','도봉구',9)")
    c.execute("INSERT INTO bid_cases (bid_case_id, institution_id) VALUES ('bc-1','dobong')")
    c.commit(); c.close()

    body = TestClient(app).get("/consistency").json()
    assert body["ok"] is False
    assert body["findings"][0]["rule"] == "stage_without_confirmation"

    scoped = TestClient(app).get("/consistency", params={"institution_id": "nope"}).json()
    assert scoped == {"findings": [], "ok": True}


# ── 배점표 합계 규칙 (2026-08-04 실측 기반) ────────────────────────────
# llama3.1:8b는 합 96, qwen3:14b는 합 108을 냈다(정답 100). 분류는 둘 다 맞고
# 숫자만 지어냈는데, 모델을 키워도 같은 양상이 반복돼 규칙으로 잡기로 했다.

def _scoring_file(tmp_path, name_ko, total, scores):
    import json

    out = tmp_path / "out" / name_ko
    out.mkdir(parents=True, exist_ok=True)
    (out / "rfp_scoring.json").write_text(json.dumps({
        "total_score": total,
        "criteria": [{"category": "c", "item": f"i{n}", "score": s}
                     for n, s in enumerate(scores)],
    }, ensure_ascii=False), encoding="utf-8")
    return str(tmp_path / "out")


def test_배점_합계가_총점과_다르면_잡는다(conn, tmp_path):
    _inst(conn, "dobong", "도봉구", 1)
    root = _scoring_file(tmp_path, "도봉구", 100,
                         [1, 2, 3, 5, 5, 6, 7, 7, 7, 8, 8, 8, 8, 8, 25])   # qwen 실측 = 108

    findings = check_all(conn, output_root=root)

    assert "scoring_sum_mismatch" in _rules(findings)
    assert "108" in findings[0]["message"]


def test_배점이_맞으면_조용하다(conn, tmp_path):
    _inst(conn, "dobong", "도봉구", 1)
    root = _scoring_file(tmp_path, "도봉구", 100, [7, 8, 17, 21, 22, 25])   # 정답

    assert check_all(conn, output_root=root) == []


def test_산출물이_없으면_아무_말도_안_한다(conn, tmp_path):
    """3단계 전이면 안 만들어진 게 정상 — 여기서 경고를 내면 25개 기관이 전부 빨개진다."""
    _inst(conn, "dobong", "도봉구", 1)

    assert check_all(conn, output_root=str(tmp_path / "없는폴더")) == []
    assert check_all(conn) == []          # output_root를 안 주면 DB 규칙만 돈다


def test_깨진_json은_무시한다(conn, tmp_path):
    _inst(conn, "dobong", "도봉구", 1)
    out = tmp_path / "out" / "도봉구"
    out.mkdir(parents=True)
    (out / "rfp_scoring.json").write_text("{깨짐", encoding="utf-8")

    assert check_all(conn, output_root=str(tmp_path / "out")) == []
