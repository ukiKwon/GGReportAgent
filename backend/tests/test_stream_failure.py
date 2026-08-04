"""LLM 호출이 실패했을 때 **사용자가 이유를 알 수 있어야 한다** (계획 F 후속 G1).

실측 배경(2026-08-04): 기본 모델 `gpt-oss-120b`가 개발 PC에 없어 404가 났는데,
화면에는 아무 설명 없는 **빈 말풍선**만 남고 이력에도 아무것도 저장되지 않았다.
스트리밍은 첫 바이트를 보낸 뒤라 HTTP 상태를 바꿀 수 없으므로, 사유를 200 본문에
실어 보내는 것이 유일한 방법이다.
"""

import sqlite3
from unittest import mock

import pytest
from fastapi.testclient import TestClient

from backend.agent_adapter import failure_notice
from backend.main import create_app


class FakeNotFound(Exception):
    status_code = 404

    def __str__(self):
        return "Error code: 404 - model 'gpt-oss-120b' not found"


@pytest.fixture
def client(tmp_path):
    app = create_app(
        str(tmp_path / "r.db"),
        output_root=str(tmp_path / "out"),
        index_db_path=str(tmp_path / "idx.db"),
        graph_db_path=str(tmp_path / "g.db"),
        archive_root=str(tmp_path / "arch"),
    )
    conn = sqlite3.connect(tmp_path / "r.db")
    conn.execute(
        "INSERT INTO institutions (institution_id, name_ko, stage) VALUES ('dobong','도봉구',6)"
    )
    conn.commit()
    conn.close()
    return TestClient(app)


# ── failure_notice 순수 함수 ────────────────────────────────────────────

def test_모델_부재는_무엇을_하면_되는지_알려준다():
    notice = failure_notice(FakeNotFound())
    assert "찾을 수 없습니다" in notice
    assert "LLM_MODEL" in notice          # 무엇을 바꾸면 되는지
    assert "ollama list" in notice        # 무엇이 있는지 보는 법


def test_연결_실패는_엔드포인트를_짚어준다():
    notice = failure_notice(ConnectionError("connection refused"))
    assert "닿지 못했습니다" in notice
    assert "LLM_BASE_URL" in notice


def test_알_수_없는_실패도_유형과_앞부분은_보여준다():
    """통째로 감추면 아무도 못 고친다."""
    notice = failure_notice(ValueError("이상한 일"))
    assert "ValueError" in notice
    assert "이상한 일" in notice


def test_아주_긴_오류는_잘라서_보여준다():
    notice = failure_notice(ValueError("가" * 5000))
    assert len(notice) < 500


# ── 대화창(chat) ───────────────────────────────────────────────────────

def test_대화_실패시_빈_응답_대신_사유가_스트림된다(client):
    with mock.patch(
        "backend.routers.chat.stream_consult_reply",
        side_effect=lambda *a, **k: (_ for _ in ()).throw(FakeNotFound()),
    ):
        r = client.post("/institutions/dobong/chat", json={"content": "질문", "author": "김 차장"})

    assert r.status_code == 200
    assert "[답변 실패]" in r.text
    assert "gpt-oss-120b" in r.text


def test_답이_하나도_없으면_이력에_저장하지_않는다(client):
    """오류 문구가 agent 발언으로 남으면 **다음 질문 때 대화 맥락으로 다시 들어간다.**"""
    with mock.patch(
        "backend.routers.chat.stream_consult_reply",
        side_effect=lambda *a, **k: (_ for _ in ()).throw(FakeNotFound()),
    ):
        client.post("/institutions/dobong/chat", json={"content": "질문"})

    roles = [m["role"] for m in client.get("/institutions/dobong/chat").json()]
    assert roles == ["user"]


def test_부분_응답이_있으면_사유와_함께_남긴다(client):
    """M-2 관례: 받은 만큼은 남기되, 왜 끊겼는지도 함께 적는다."""

    def half_then_fail(*a, **k):
        yield "영업 관점: 도봉구는"
        raise FakeNotFound()

    with mock.patch("backend.routers.chat.stream_consult_reply", side_effect=half_then_fail):
        r = client.post("/institutions/dobong/chat", json={"content": "질문"})

    assert "영업 관점" in r.text and "[답변 실패]" in r.text
    saved = [m for m in client.get("/institutions/dobong/chat").json() if m["role"] == "agent"]
    assert len(saved) == 1
    assert "영업 관점: 도봉구는" in saved[0]["content"]
    assert "[답변 실패]" in saved[0]["content"]


def test_정상_응답에는_실패_문구가_붙지_않는다(client):
    with mock.patch(
        "backend.routers.chat.stream_consult_reply",
        side_effect=lambda *a, **k: iter(["정상 ", "답변"]),
    ):
        r = client.post("/institutions/dobong/chat", json={"content": "질문"})

    assert r.text == "정상 답변"
    assert "[답변 실패]" not in r.text
    saved = [m for m in client.get("/institutions/dobong/chat").json() if m["role"] == "agent"]
    assert saved[0]["content"] == "정상 답변"


# ── 팀 작업 대화(tasks) — 같은 규칙이어야 한다 ──────────────────────────

def test_팀_대화도_실패_사유를_보여준다(client, tmp_path):
    conn = sqlite3.connect(tmp_path / "r.db")
    conn.execute("INSERT INTO bid_cases (bid_case_id, institution_id) VALUES ('bc-1','dobong')")
    conn.execute(
        "INSERT INTO tasks (task_id, bid_case_id, team, status) VALUES ('t-1','bc-1','영업','대기')"
    )
    conn.commit()
    conn.close()

    with mock.patch(
        "backend.routers.tasks.stream_chat_reply",
        side_effect=lambda *a, **k: (_ for _ in ()).throw(FakeNotFound()),
    ):
        r = client.post(
            "/tasks/t-1/messages", json={"content": "질문"}, headers={"X-User-Id": "kim"}
        )

    assert r.status_code == 200
    assert "[답변 실패]" in r.text
