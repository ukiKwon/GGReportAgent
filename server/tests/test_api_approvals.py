"""결재함 (계획 I Task 5) — 누가 무엇을 결재하는지.

지금까지 `POST /tasks/{id}/approve`는 있는데 **누를 화면이 없어** 팀 Task가 영원히
`1차완료`에 머물렀다. 그래서 디자이너 제출 조건도 '승인완료'로 걸 수가 없었다.
여기서 결재 대상을 역할별로 뽑아 준다.
"""

from unittest.mock import patch

from fastapi.testclient import TestClient

from server.db import get_connection
from server.main import create_app


def _app(tmp_path):
    app = create_app(str(tmp_path / "r.db"), output_root=str(tmp_path / "out"),
                     graph_db_path=str(tmp_path / "g.db"))
    conn = get_connection(str(tmp_path / "r.db"))
    conn.execute("INSERT INTO institutions (institution_id, name_ko, stage)"
                 " VALUES ('nowon','노원구',8)")
    conn.execute("INSERT INTO bid_cases (bid_case_id, institution_id, confirmed_date)"
                 " VALUES ('bc-1','nowon','2026-09-30')")
    for tid, team, status, who, draft in [
        ("t-sales", "영업", "1차완료", "김 차장", "영업팀 제출본"),
        ("t-it", "전산", "작성중", "권 차장", "전산팀 작성 중"),
        ("t-budget", "예산", "1차완료", "정 대리", "예산팀 제출본"),
        ("t-design", "디자이너", "1차완료", "최 디자이너", "표지 시안 설명"),
        ("t-verify", "검증", "1차완료", None, ""),
    ]:
        conn.execute("INSERT INTO tasks (task_id, bid_case_id, team, status, assignee,"
                     " draft_content) VALUES (?,?,?,?,?,?)", (tid, "bc-1", team, status, who, draft))
    conn.commit(); conn.close()
    return app


def _client(tmp_path):
    return TestClient(_app(tmp_path))


# ── 팀장: 자기 팀의 제출된 작업만 ──────────────────────────────────────

def test_팀장은_자기_팀의_제출된_작업만_본다(tmp_path):
    items = _client(tmp_path).get("/approvals", params={"role": "예산팀장"}).json()["items"]
    assert [i["task_id"] for i in items] == ["t-budget"]
    assert items[0]["team"] == "예산" and items[0]["assignee"] == "정 대리"
    assert items[0]["kind"] == "task"


def test_영업팀장은_디자이너_작업도_받는다(tmp_path):
    """디자이너는 **영업팀 소속**이라 1차 결재가 영업팀장에게 간다(사용자 확정)."""
    items = _client(tmp_path).get("/approvals", params={"role": "영업팀장"}).json()["items"]
    assert [i["task_id"] for i in items] == ["t-sales", "t-design"]
    assert [i["final"] for i in items] == [False, False]


def test_아직_작성_중인_작업은_결재_대상이_아니다(tmp_path):
    items = _client(tmp_path).get("/approvals", params={"role": "전산팀장"}).json()["items"]
    assert items == []


def test_팀장은_남의_팀_작업을_보지_않는다(tmp_path):
    items = _client(tmp_path).get("/approvals", params={"role": "예산팀장"}).json()["items"]
    assert "t-sales" not in [i["task_id"] for i in items]


def test_결재에_필요한_맥락이_카드_안에_있다(tmp_path):
    """영업부장 화면에는 워크플로가 없다 — 기관·단계·작성물이 카드에 있어야 한다."""
    item = _client(tmp_path).get("/approvals", params={"role": "영업팀장"}).json()["items"][0]
    assert item["institution_name"] == "노원구" and item["stage"] == 8
    assert item["draft_content"] == "영업팀 제출본"
    assert item["files"] == []


def test_올린_파일도_함께_준다(tmp_path):
    client = _client(tmp_path)
    client.post("/tasks/t-sales/files", files={"file": ("근거.pdf", b"x")},
                data={"by": "김 차장"}, headers={"X-User-Id": "web-user"})
    item = client.get("/approvals", params={"role": "영업팀장"}).json()["items"][0]
    assert [f["name"] for f in item["files"]] == ["근거.pdf"]


# ── 영업부장: 상신된 디자이너 최종본 + 게이트 ──────────────────────────

def _submitted_to_head(tmp_path):
    """영업팀장이 승인해 올린 상태(2차완료)로 만든다 — 그 승인이 곧 상신이다."""
    app = _app(tmp_path)
    conn = get_connection(str(tmp_path / "r.db"))
    conn.execute("UPDATE tasks SET status='2차완료' WHERE task_id='t-design'")
    conn.commit(); conn.close()
    return TestClient(app)


def test_영업부장은_상신된_디자이너_최종본을_본다(tmp_path):
    items = _submitted_to_head(tmp_path).get(
        "/approvals", params={"role": "영업부장"}).json()["items"]
    tasks = [i for i in items if i["kind"] == "task"]
    assert [i["task_id"] for i in tasks] == ["t-design"]
    assert tasks[0]["final"] is True


def test_아직_팀장이_안_본_디자이너_작업은_부장에게_안_간다(tmp_path):
    """같은 작업이 두 결재함에 동시에 뜨면 누가 볼 차례인지 알 수 없다."""
    items = _client(tmp_path).get("/approvals", params={"role": "영업부장"}).json()["items"]
    assert [i.get("task_id") for i in items if i["kind"] == "task"] == []


def test_영업부장은_팀_작업을_대신_결재하지_않는다(tmp_path):
    """팀 작업은 그 팀 팀장 몫이다 — 결재 라인이 겹치면 누가 봤는지 알 수 없다."""
    items = _client(tmp_path).get("/approvals", params={"role": "영업부장"}).json()["items"]
    assert "t-sales" not in [i.get("task_id") for i in items]


def test_대기_중인_게이트도_결재_대상이다(tmp_path):
    app = _app(tmp_path)
    with patch.object(type(app.state.orchestrator), "pending_gate",
                      lambda self, iid: "최종결재"):
        items = TestClient(app).get("/approvals", params={"role": "영업부장"}).json()["items"]
    gates = [i for i in items if i["kind"] == "gate"]
    assert len(gates) == 1
    assert gates[0]["institution_id"] == "nowon" and gates[0]["gate"] == "최종결재"


def test_게이트가_없으면_task만_나온다(tmp_path):
    items = _client(tmp_path).get("/approvals", params={"role": "영업부장"}).json()["items"]
    assert all(i["kind"] == "task" for i in items)


def test_에이전트_단계는_결재_대상이_아니다(tmp_path):
    """검증·취합·RFI분석은 사람 작성물이 아니다."""
    client = _client(tmp_path)
    for role in ("영업팀장", "전산팀장", "예산팀장", "영업부장"):
        items = client.get("/approvals", params={"role": role}).json()["items"]
        assert "t-verify" not in [i.get("task_id") for i in items]


# ── 권한 ───────────────────────────────────────────────────────────────

def test_팀원은_결재할_것이_없다(tmp_path):
    assert _client(tmp_path).get("/approvals", params={"role": "영업팀"}).json()["items"] == []


def test_role은_필수다(tmp_path):
    assert _client(tmp_path).get("/approvals").status_code == 422


# ── 반려하면 담당자가 안다 ─────────────────────────────────────────────

def test_반려하면_담당자에게_쪽지가_간다(tmp_path):
    """지금까지 반려는 status만 '작성중'으로 되돌리고 **아무도 몰랐다** —
    제출이 아무에게도 알리지 않던 것과 같은 종류의 구멍이다."""
    client = _client(tmp_path)
    r = client.post("/tasks/t-sales/approve",
                    json={"approved": False, "comment": "근거 자료를 붙여 주세요",
                          "by": "이 팀장"},
                    headers={"X-User-Id": "web-user"})
    assert r.status_code == 200 and r.json()["status"] == "작성중"

    notes = client.get("/notifications", params={"recipient": "김 차장"}).json()
    assert len(notes) == 1
    assert "반려" in notes[0]["content"] and "근거 자료" in notes[0]["content"]
    assert notes[0]["task_id"] == "t-sales"


def test_승인하면_반려_쪽지가_가지_않는다(tmp_path):
    client = _client(tmp_path)
    client.post("/tasks/t-sales/approve", json={"approved": True, "by": "이 팀장"},
                headers={"X-User-Id": "web-user"})
    assert client.get("/notifications", params={"recipient": "김 차장"}).json() == []


def test_한글_결재자_이름을_by로_받는다(tmp_path):
    """X-User-Id는 ASCII만 — 결재자 실명이 approver에 남아야 누가 봤는지 알 수 있다."""
    client = _client(tmp_path)
    r = client.post("/tasks/t-sales/approve", json={"approved": True, "by": "이 팀장"},
                    headers={"X-User-Id": "web-user"})
    assert r.json()["approver"] == "이 팀장"


def test_담당이_없는_작업을_반려해도_죽지_않는다(tmp_path):
    """미배정 Task는 보낼 상대가 없다 — 조용히 넘어가되 반려 자체는 유효하다."""
    app = _app(tmp_path)
    conn = get_connection(str(tmp_path / "r.db"))
    conn.execute("UPDATE tasks SET assignee=NULL WHERE task_id='t-sales'")
    conn.commit(); conn.close()

    r = TestClient(app).post("/tasks/t-sales/approve", json={"approved": False, "by": "이 팀장"},
                             headers={"X-User-Id": "web-user"})
    assert r.status_code == 200 and r.json()["status"] == "작성중"
