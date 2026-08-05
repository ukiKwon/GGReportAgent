"""디자이너 작업물 파일 저장 (계획 H Task 4).

이 모듈은 **클라이언트가 준 파일명으로 디스크에 쓴다** — 이 리포에서 가장 위험한
종류의 코드다. 그래서 순수 함수로 떼어내 경로 위생만 따로 고정한다.
"""

import pytest

from backend import task_files as tf


def _root(tmp_path):
    return str(tmp_path / "out")


# ── 파일명 위생 ────────────────────────────────────────────────────────

def test_경로_성분을_떼어낸다():
    assert tf.safe_name("../../etc/passwd.pdf") == "passwd.pdf"
    assert tf.safe_name("C:\\Users\\me\\제안서.pptx") == "제안서.pptx"
    assert tf.safe_name("sub/dir/도면.png") == "도면.png"


def test_허용되지_않은_확장자는_거부한다():
    """폐쇄망이라도 실행파일이 공유 폴더에 쌓이면 안 된다."""
    for bad in ("악성.exe", "script.bat", "a.sh", "무확장자"):
        with pytest.raises(tf.FileRejected):
            tf.safe_name(bad)


def test_확장자_대소문자는_가린다():
    assert tf.safe_name("제안서.PPTX") == "제안서.PPTX"


def test_빈_이름과_숨김파일은_거부한다():
    for bad in ("", "   ", "/", "..", ".hidden.pdf"):
        with pytest.raises(tf.FileRejected):
            tf.safe_name(bad)


def test_거부_사유는_사람이_읽을_수_있다():
    with pytest.raises(tf.FileRejected) as e:
        tf.safe_name("악성.exe")
    assert ".exe" in str(e.value) and "pptx" in str(e.value)   # 무엇이 되는지도 알려준다


# ── 저장 위치 ──────────────────────────────────────────────────────────

def test_기관과_task별로_나뉜다(tmp_path):
    a = tf.task_dir(_root(tmp_path), "노원구", "task-1")
    b = tf.task_dir(_root(tmp_path), "노원구", "task-2")
    c = tf.task_dir(_root(tmp_path), "도봉구", "task-1")
    assert a != b and a != c
    assert a.endswith("task-1")


def test_기관명이_뿌리를_벗어나면_거부한다(tmp_path):
    """기관명은 DB에서 오지만 반입 경로가 있으므로 신뢰하지 않는다
    (backend/archive.py의 M-4 가드와 같은 이유)."""
    with pytest.raises(ValueError):
        tf.task_dir(_root(tmp_path), "../../밖", "task-1")
    with pytest.raises(ValueError):
        tf.task_dir(_root(tmp_path), "노원구", "../../task-1")


# ── 저장·목록·삭제 ────────────────────────────────────────────────────

def test_저장하면_목록에_보인다(tmp_path):
    saved = tf.save(_root(tmp_path), "노원구", "task-1", "제안서.pptx", b"hello")
    assert saved["name"] == "제안서.pptx" and saved["size"] == 5
    assert saved["replaced"] is False

    rows = tf.listing(_root(tmp_path), "노원구", "task-1")
    assert [r["name"] for r in rows] == ["제안서.pptx"]
    assert rows[0]["size"] == 5 and rows[0]["uploaded_at"]


def test_같은_이름은_덮어쓰되_알린다(tmp_path):
    tf.save(_root(tmp_path), "노원구", "task-1", "제안서.pptx", b"v1")
    again = tf.save(_root(tmp_path), "노원구", "task-1", "제안서.pptx", b"version2")

    assert again["replaced"] is True          # 조용히 덮어쓰지 않는다
    rows = tf.listing(_root(tmp_path), "노원구", "task-1")
    assert len(rows) == 1 and rows[0]["size"] == 8


def test_용량_상한을_넘으면_거부한다(tmp_path):
    with pytest.raises(tf.FileRejected) as e:
        tf.save(_root(tmp_path), "노원구", "task-1", "큰것.zip", b"x" * (tf.MAX_BYTES + 1))
    assert "MB" in str(e.value)               # 사람이 이해할 단위로 말한다


def test_상한_경계값은_통과한다(tmp_path):
    tf.save(_root(tmp_path), "노원구", "task-1", "딱맞음.zip", b"x" * tf.MAX_BYTES)
    assert tf.listing(_root(tmp_path), "노원구", "task-1")[0]["size"] == tf.MAX_BYTES


def test_폴더가_없으면_빈_목록이다(tmp_path):
    """아직 아무것도 안 올린 Task도 200이어야 한다 — 없는 것은 오류가 아니다."""
    assert tf.listing(_root(tmp_path), "노원구", "task-none") == []


def test_삭제(tmp_path):
    tf.save(_root(tmp_path), "노원구", "task-1", "제안서.pptx", b"v1")
    assert tf.remove(_root(tmp_path), "노원구", "task-1", "제안서.pptx") is True
    assert tf.listing(_root(tmp_path), "노원구", "task-1") == []
    assert tf.remove(_root(tmp_path), "노원구", "task-1", "제안서.pptx") is False


def test_삭제도_경로를_벗어날_수_없다(tmp_path):
    with pytest.raises(tf.FileRejected):
        tf.remove(_root(tmp_path), "노원구", "task-1", "../../../secret.pdf.exe")


def test_resolve는_실제_경로를_준다(tmp_path):
    tf.save(_root(tmp_path), "노원구", "task-1", "제안서.pptx", b"v1")
    path = tf.resolve(_root(tmp_path), "노원구", "task-1", "제안서.pptx")
    with open(path, "rb") as f:
        assert f.read() == b"v1"


def test_count는_목록_길이다(tmp_path):
    assert tf.count(_root(tmp_path), "노원구", "task-1") == 0
    tf.save(_root(tmp_path), "노원구", "task-1", "a.pdf", b"1")
    tf.save(_root(tmp_path), "노원구", "task-1", "b.png", b"2")
    assert tf.count(_root(tmp_path), "노원구", "task-1") == 2
