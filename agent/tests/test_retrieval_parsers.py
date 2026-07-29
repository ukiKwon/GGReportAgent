from agent.retrieval.parsers import parse_file


def test_parse_txt_reads_utf8(tmp_path):
    path = tmp_path / "00_인덱스.txt"
    path.write_text("도봉구 사업목록", encoding="utf-8")
    assert parse_file(path) == "도봉구 사업목록"


def test_parse_txt_returns_none_for_non_utf8(tmp_path):
    path = tmp_path / "broken.txt"
    path.write_bytes("한글".encode("cp949"))
    assert parse_file(path) is None


def test_unsupported_extension_returns_none(tmp_path):
    path = tmp_path / "공고문.pdf"
    path.write_bytes(b"%PDF-1.4")
    assert parse_file(path) is None


def test_extension_match_is_case_insensitive(tmp_path):
    path = tmp_path / "NOTE.TXT"
    path.write_text("내용", encoding="utf-8")
    assert parse_file(path) == "내용"
