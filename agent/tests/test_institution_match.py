from unittest.mock import MagicMock, patch

from agent.nodes.institution_match import institution_match_node


def _make_giganlist(tmp_path):
    d = tmp_path / "giganlist" / "dobong"
    (d / "spec").mkdir(parents=True)
    (d / "plan").mkdir(parents=True)
    return str(tmp_path / "giganlist")


@patch("agent.nodes.institution_match.get_llm")
def test_institution_match_exact_match_reuses_existing(mock_get_llm, tmp_path):
    giganlist_dir = _make_giganlist(tmp_path)
    mock_llm = MagicMock()
    mock_llm.invoke.return_value.content = "구"
    mock_get_llm.return_value = mock_llm

    state = {
        "institution_name": "dobong",
        "rfp_text": "도봉구청 공고",
        "giganlist_dir": giganlist_dir,
        "archive_dir": str(tmp_path / "report_archive"),
    }
    result = institution_match_node(state)

    assert result["institution_type"] == "구"
    assert result["matched_district"] == "dobong"
    assert result["institution_spec_dir"] == giganlist_dir + "/dobong/spec"


@patch("agent.nodes.institution_match.get_llm")
def test_institution_match_no_match_returns_none_spec_dir(mock_get_llm, tmp_path):
    giganlist_dir = _make_giganlist(tmp_path)
    mock_llm = MagicMock()
    mock_llm.invoke.return_value.content = "시"
    mock_get_llm.return_value = mock_llm

    state = {
        "institution_name": "suwon",
        "rfp_text": "수원시 공고",
        "giganlist_dir": giganlist_dir,
        "archive_dir": str(tmp_path / "report_archive"),
    }
    result = institution_match_node(state)

    assert result["institution_type"] == "시"
    assert result["matched_district"] is None
    assert result["institution_spec_dir"] is None


@patch("agent.nodes.institution_match.get_llm")
def test_institution_match_finds_archive_pptx(mock_get_llm, tmp_path):
    giganlist_dir = _make_giganlist(tmp_path)
    archive_dir = tmp_path / "report_archive"
    archive_dir.mkdir()
    (archive_dir / "suwon_이전제안서.pptx").write_bytes(b"fake")

    mock_llm = MagicMock()
    mock_llm.invoke.return_value.content = "시"
    mock_get_llm.return_value = mock_llm

    state = {
        "institution_name": "suwon",
        "rfp_text": "수원시 공고",
        "giganlist_dir": giganlist_dir,
        "archive_dir": str(archive_dir),
    }
    result = institution_match_node(state)

    assert result["archive_pptx_path"] is not None
    assert "suwon_이전제안서.pptx" in result["archive_pptx_path"]
