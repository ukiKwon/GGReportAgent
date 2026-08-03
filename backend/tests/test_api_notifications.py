"""쪽지함 API — 수신자별 조회·발송·읽음 처리 (계획 C2)."""

from fastapi.testclient import TestClient

from backend.db import get_connection
from backend.main import create_app
from backend.notification_repository import create_notification


def _app(tmp_path):
    app = create_app(str(tmp_path / "r.db"), output_root=str(tmp_path / "out"),
                     graph_db_path=str(tmp_path / "g.db"))
    conn = get_connection(str(tmp_path / "r.db"))
    conn.execute("INSERT INTO institutions (institution_id, name_ko, stage) VALUES ('nowon','노원구',6)")
    conn.commit(); conn.close()
    return app


def _seed(tmp_path):
    conn = get_connection(str(tmp_path / "r.db"))
    try:
        create_notification(conn, "영업팀", "결재요청", "기획승인 대기", institution_id="nowon", stage=5)
        create_notification(conn, "김 차장", "쪽지", "자료 확인 부탁드립니다", sender="정 대리")
        create_notification(conn, "전산팀", "이관", "남의 쪽지")
    finally:
        conn.close()


def test_lists_only_my_recipients(tmp_path):
    """소속과 이름 둘 다로 조회한다 — 시스템 알림은 역할 앞으로 오기 때문."""
    app = _app(tmp_path); _seed(tmp_path)
    r = TestClient(app).get("/notifications", params=[("recipient", "영업팀"), ("recipient", "김 차장")])
    assert r.status_code == 200

    body = r.json()
    assert {n["recipient"] for n in body} == {"영업팀", "김 차장"}      # 전산팀 것은 안 온다
    쪽지 = [n for n in body if n["kind"] == "쪽지"][0]
    assert 쪽지["sender"] == "정 대리"
    결재 = [n for n in body if n["kind"] == "결재요청"][0]
    assert 결재["stage"] == 5 and 결재["sender"] is None   # 시스템이 보낸 것


def test_recipient_is_required(tmp_path):
    """수신자 없이 전체 조회를 열면 남의 쪽지함이 된다."""
    assert TestClient(_app(tmp_path)).get("/notifications").status_code == 422


def test_unread_only_filter(tmp_path):
    app = _app(tmp_path); _seed(tmp_path)
    client = TestClient(app)
    first = client.get("/notifications", params={"recipient": "영업팀"}).json()[0]

    assert client.post(f"/notifications/{first['notification_id']}/read").json() == {"read": True}
    left = client.get("/notifications", params={"recipient": "영업팀", "unread_only": True}).json()
    assert left == []


def test_read_is_idempotent_and_404s_on_unknown(tmp_path):
    app = _app(tmp_path); _seed(tmp_path)
    client = TestClient(app)
    nid = client.get("/notifications", params={"recipient": "영업팀"}).json()[0]["notification_id"]

    assert client.post(f"/notifications/{nid}/read").json() == {"read": True}
    assert client.post(f"/notifications/{nid}/read").json() == {"read": False}   # 이미 읽음
    assert client.post("/notifications/ntf-ghost/read").status_code == 404


def test_send_note(tmp_path):
    app = _app(tmp_path)
    client = TestClient(app)
    r = client.post("/notifications", json={
        "recipient": "전산팀", "content": "이중화 자료 부탁드립니다",
        "sender": "김 차장", "institution_id": "nowon",
    })
    assert r.status_code == 201
    body = r.json()
    assert body["kind"] == "쪽지"        # 결재요청·되물음·이관은 시스템만 만든다
    assert body["sender"] == "김 차장" and body["read_at"] is None

    got = client.get("/notifications", params={"recipient": "전산팀"}).json()
    assert got[0]["content"] == "이중화 자료 부탁드립니다"
