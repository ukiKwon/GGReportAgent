import pytest
from pptx import Presentation

from server.assembler import assemble_deliverable
from server.db import init_db


@pytest.fixture
def conn(tmp_path):
    connection = init_db(str(tmp_path / "test.db"))
    connection.execute(
        "INSERT INTO institutions (institution_id, name_ko, stage) VALUES ('mapo', '마포구', 6)"
    )
    connection.execute(
        "INSERT INTO bid_cases (bid_case_id, institution_id) VALUES ('bc-1', 'mapo')"
    )
    for team, draft in [("영업", "영업 초안 본문"), ("IT", "IT 초안 본문"), ("예산", "예산 초안 본문")]:
        connection.execute(
            """INSERT INTO tasks (task_id, bid_case_id, team, status, draft_content)
               VALUES (?, 'bc-1', ?, '2차완료', ?)""",
            (f"task-{team}", team, draft),
        )
    connection.commit()
    yield connection
    connection.close()


def _slide_texts(path):
    return [
        "\n".join(shape.text_frame.text for shape in slide.shapes if shape.has_text_frame)
        for slide in Presentation(path).slides
    ]


def test_assemble_writes_one_slide_per_team_in_영업_IT_예산_order(conn, tmp_path):
    path = assemble_deliverable(conn, "bc-1", output_root=str(tmp_path / "out"))

    texts = _slide_texts(path)
    team_slides = [t for t in texts if "초안 본문" in t]
    assert len(team_slides) == 3
    assert "영업 초안 본문" in team_slides[0]
    assert "IT 초안 본문" in team_slides[1]
    assert "예산 초안 본문" in team_slides[2]


def test_assemble_titles_the_deck_with_the_institution_name(conn, tmp_path):
    path = assemble_deliverable(conn, "bc-1", output_root=str(tmp_path / "out"))

    assert "마포구" in _slide_texts(path)[0]


def test_assemble_records_pptx_path_on_the_institution(conn, tmp_path):
    path = assemble_deliverable(conn, "bc-1", output_root=str(tmp_path / "out"))

    stored = conn.execute(
        "SELECT pptx_path FROM institutions WHERE institution_id = 'mapo'"
    ).fetchone()["pptx_path"]
    assert stored == path


def test_assemble_raises_when_bid_case_is_missing(conn, tmp_path):
    with pytest.raises(KeyError):
        assemble_deliverable(conn, "bc-nope", output_root=str(tmp_path / "out"))
