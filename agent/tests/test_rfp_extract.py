"""재정의된 3단계 노드 — PDF → rfp_text.txt + rfp_scoring.json."""

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from agent.nodes.rfp_extract import RfpExtractError, rfp_extract_node

REPO_ROOT = Path(__file__).resolve().parents[2]
SAMPLE_RFP = REPO_ROOT / "corpus" / "rfp" / "수원시 금고 지정 계획 공고문.pdf"

pytestmark = pytest.mark.skipif(not SAMPLE_RFP.is_file(), reason="샘플 공고문 PDF가 없다")


def _mock_llm(criteria, *, rfp_title="수원시 금고 지정 계획 공고문", total_score=100):
    result = MagicMock()
    result.rfp_title = rfp_title
    result.total_score = total_score
    result.criteria = [
        MagicMock(model_dump=MagicMock(return_value=c)) for c in criteria
    ]
    llm = MagicMock()
    llm.with_structured_output.return_value.invoke.return_value = result
    return llm


CRITERION = {"category": "신용도", "item": "외부기관 신용조사", "score": 8, "description": None}


@patch("agent.nodes.rfp_extract.get_llm")
def test_writes_both_artifacts_and_fills_state(mock_get_llm, tmp_path):
    mock_get_llm.return_value = _mock_llm([CRITERION])

    result = rfp_extract_node({
        "rfp_path": str(SAMPLE_RFP),
        "institution_name": "수원시",
        "report_new_dir": str(tmp_path),
    })

    out = tmp_path / "수원시"
    assert "수원시" in (out / "rfp_text.txt").read_text(encoding="utf-8")
    assert result["scoring_table"] == [CRITERION]
    assert result["total_score"] == 100
    assert "수원시" in result["rfp_text"]


@patch("agent.nodes.rfp_extract.get_llm")
def test_saved_json_matches_scoring_schema_shape(mock_get_llm, tmp_path):
    """rfp_analysis_node와 스킬의 scoring_schema.json이 기대하는 키를 그대로 갖춰야 한다."""
    mock_get_llm.return_value = _mock_llm([CRITERION])
    rfp_extract_node({
        "rfp_path": str(SAMPLE_RFP),
        "institution_name": "수원시",
        "report_new_dir": str(tmp_path),
    })

    saved = json.loads((tmp_path / "수원시" / "rfp_scoring.json").read_text(encoding="utf-8"))
    assert set(saved) == {"institution", "rfp_title", "total_score", "criteria"}
    assert set(saved["criteria"][0]) == {"category", "item", "score", "description"}
    assert saved["institution"] == "수원시"


@patch("agent.nodes.rfp_extract.get_llm")
def test_empty_scoring_table_is_a_valid_result(mock_get_llm, tmp_path):
    """배점표 없는 공고문도 있다 — 빈 목록은 실패가 아니다(SKILL.md와 같은 규칙)."""
    mock_get_llm.return_value = _mock_llm([], total_score=0)

    result = rfp_extract_node({
        "rfp_path": str(SAMPLE_RFP),
        "institution_name": "수원시",
        "report_new_dir": str(tmp_path),
    })

    assert result["scoring_table"] == []
    assert (tmp_path / "수원시" / "rfp_scoring.json").is_file()


@patch("agent.nodes.rfp_extract.get_llm")
@patch("agent.nodes.rfp_extract.extract_pdf_text")
def test_abnormal_pdf_stops_and_writes_nothing(mock_extract, mock_get_llm, tmp_path):
    """이상 PDF는 비전이 필요하다. 빈 텍스트로 진행하면 이후 전부가 근거 없는 문서가 된다."""
    mock_extract.return_value = {
        "pages": [""], "full_text": "", "avg_chars_per_page": 0.0,
        "is_abnormal": True, "abnormal_reason": "avg chars/page 0.0 is below 50 threshold",
    }

    with pytest.raises(RfpExtractError, match="rfp-locate"):
        rfp_extract_node({
            "rfp_path": str(SAMPLE_RFP),
            "institution_name": "수원시",
            "report_new_dir": str(tmp_path),
        })

    assert not (tmp_path / "수원시").exists()
    mock_get_llm.assert_not_called()


def test_missing_rfp_path_is_refused(tmp_path):
    with pytest.raises(RfpExtractError, match="rfp_path"):
        rfp_extract_node({"institution_name": "수원시", "report_new_dir": str(tmp_path)})


def test_nonexistent_pdf_is_refused(tmp_path):
    with pytest.raises(RfpExtractError, match="찾을 수 없습니다"):
        rfp_extract_node({
            "rfp_path": str(tmp_path / "없는파일.pdf"),
            "institution_name": "수원시",
            "report_new_dir": str(tmp_path),
        })
