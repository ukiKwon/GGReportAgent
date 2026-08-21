from server.chat_repository import add_chat_message, list_chat_messages
from server.db import init_db


def test_add_and_list_in_order(tmp_path):
    conn = init_db(str(tmp_path / "registry.db"))
    add_chat_message(conn, "dobong", "user", "올해 도봉구청 입찰 어떻게 생각해?")
    add_chat_message(conn, "dobong", "agent", "배점 상위는 협력사업…")
    add_chat_message(conn, "nowon", "user", "노원은?")

    msgs = list_chat_messages(conn, "dobong")
    assert [m.role for m in msgs] == ["user", "agent"]
    assert msgs[0].content.startswith("올해")
    assert msgs[0].created_at  # ISO 문자열


def test_list_empty_institution(tmp_path):
    conn = init_db(str(tmp_path / "registry.db"))
    assert list_chat_messages(conn, "ghost") == []
