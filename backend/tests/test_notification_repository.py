from backend.db import init_db
from backend.notification_repository import create_notification, list_notifications, mark_read


def _conn(tmp_path):
    return init_db(str(tmp_path / "registry.db"))


def test_create_and_list_by_recipient(tmp_path):
    conn = _conn(tmp_path)
    create_notification(conn, "전산담당", "쪽지", "노원구청 IT 분석 확인 요망", institution_id="nowon")
    create_notification(conn, "예산담당", "쪽지", "예산 분석 확인 요망", institution_id="nowon")

    mine = list_notifications(conn, "전산담당")
    assert len(mine) == 1
    assert mine[0].kind == "쪽지"
    assert mine[0].institution_id == "nowon"
    assert mine[0].read_at is None
    assert mine[0].created_at  # ISO 문자열이 채워진다


def test_mark_read_and_unread_filter(tmp_path):
    conn = _conn(tmp_path)
    n = create_notification(conn, "영업팀", "되물음", "불리 조건 발견 — 재고 권유", institution_id="nowon")
    assert mark_read(conn, n.notification_id) is True
    assert list_notifications(conn, "영업팀", unread_only=True) == []
    assert list_notifications(conn, "영업팀")[0].read_at is not None


def test_mark_read_unknown_id_returns_false(tmp_path):
    conn = _conn(tmp_path)
    assert mark_read(conn, "no-such") is False
