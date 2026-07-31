from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.db import get_connection
from backend.main import create_app


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


@patch("backend.routers.chat.stream_consult_reply")
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


@patch("backend.routers.chat.stream_consult_reply")
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
