from unittest.mock import patch

from fastapi.testclient import TestClient

from server.db import get_connection
from server.main import create_app


def _app(tmp_path):
    app = create_app(str(tmp_path / "registry.db"), output_root=str(tmp_path / "out"),
                     graph_db_path=str(tmp_path / "graph.db"))
    conn = get_connection(str(tmp_path / "registry.db"))
    conn.execute(
        "INSERT INTO institutions (institution_id, name_ko, giganlist_dir, stage)"
        " VALUES ('dobong', '도봉구', 'corpus/institutions/dobong', 2)"
    )
    conn.commit(); conn.close()
    return app


@patch("server.routers.chat.stream_consult_reply")
def test_chat_streams_and_persists_both_sides(mock_stream, tmp_path):
    mock_stream.return_value = iter(["참여 ", "권장"])
    client = TestClient(_app(tmp_path))

    r = client.post("/institutions/dobong/chat", json={"content": "어떻게 생각해?"})
    assert r.status_code == 200
    assert r.text == "참여 권장"

    history = client.get("/institutions/dobong/chat").json()
    assert [(m["role"], m["content"]) for m in history] == [
        ("user", "어떻게 생각해?"), ("agent", "참여 권장"),
    ]
    # 어댑터에 기관명·질문이 전달됐는지
    kwargs = mock_stream.call_args
    assert kwargs.kwargs.get("institution_name") or kwargs.args[0] == "도봉구"


def test_chat_unknown_institution_404(tmp_path):
    client = TestClient(_app(tmp_path))
    assert client.post("/institutions/ghost/chat", json={"content": "hi"}).status_code == 404
    assert client.get("/institutions/ghost/chat").status_code == 404


@patch("server.routers.chat.stream_consult_reply")
def test_second_question_carries_history(mock_stream, tmp_path):
    mock_stream.side_effect = [iter(["첫 답"]), iter(["둘째 답"])]
    client = TestClient(_app(tmp_path))
    client.post("/institutions/dobong/chat", json={"content": "질문1"})
    client.post("/institutions/dobong/chat", json={"content": "질문2"})

    second_call = mock_stream.call_args_list[1]
    history_arg = second_call.kwargs.get("history") or second_call.args[3]
    assert [(m["role"], m["content"]) for m in history_arg] == [
        ("user", "질문1"), ("agent", "첫 답"),
    ]


@patch("server.routers.chat.stream_consult_reply")
def test_chat_media_type_is_plain_text_not_sse(mock_stream, tmp_path):
    """EventSource는 POST를 못 해 SSE로 만들 이유가 없다 — 이름만 SSE인 거짓말을 없앤다."""
    mock_stream.return_value = iter(["ok"])
    client = TestClient(_app(tmp_path))

    r = client.post("/institutions/dobong/chat", json={"content": "질문"})
    assert r.headers["content-type"].startswith("text/plain")


@patch("server.routers.chat.stream_consult_reply")
def test_chat_records_author(mock_stream, tmp_path):
    """여러 사람이 같은 방을 쓰므로 누가 썼는지가 없으면 대화가 성립하지 않는다."""
    mock_stream.return_value = iter(["네"])
    client = TestClient(_app(tmp_path))

    client.post("/institutions/dobong/chat", json={"content": "질문", "author": "김 차장"})
    history = client.get("/institutions/dobong/chat").json()
    assert history[0]["author"] == "김 차장"
    assert history[1]["author"] is None          # 에이전트 답변은 작성자가 없다


@patch("server.routers.chat.stream_consult_reply")
def test_interrupted_stream_keeps_partial_reply(mock_stream, tmp_path):
    """중단돼도 받은 만큼은 이력에 남아야 한다 — 지금은 질문만 남고 답이 통째로 사라진다(M-2)."""
    def chunks():
        yield "앞부분 "
        raise GeneratorExit          # 클라이언트 끊김과 같은 경로

    mock_stream.return_value = chunks()
    client = TestClient(_app(tmp_path))
    try:
        client.post("/institutions/dobong/chat", json={"content": "질문"})
    except GeneratorExit:
        pass

    history = client.get("/institutions/dobong/chat").json()
    assert len(history) == 2
    assert history[1]["content"].startswith("앞부분 ")
    assert "중단" in history[1]["content"]        # 끊긴 답변임을 읽는 사람이 알 수 있어야 한다
