import json
from unittest.mock import MagicMock, patch

from backend.upload_check import check_upload, write_coverage_map


def _scoring(tmp_path):
    p = tmp_path / "rfp_scoring.json"
    p.write_text(json.dumps({
        "rfp_title": "공고", "total_score": 100,
        "criteria": [
            {"category": "사업", "item": "전산 시스템 구축", "score": 20, "description": None},
            {"category": "기타", "item": "지역 기여", "score": 10, "description": None},
        ],
    }, ensure_ascii=False), encoding="utf-8")
    return str(p)


@patch("backend.upload_check.verification_node")
def test_checks_only_items_routed_to_team(mock_verify, tmp_path):
    mock_verify.return_value = {"coverage_report": [
        {"scoring_item": "전산 시스템 구축", "covered": True, "gap_note": None},
    ], "llm_used": True}
    result = check_upload(_scoring(tmp_path), "전산", "IT 구축 방안 본문")

    assert result["skipped"] is None
    assert [c["scoring_item"] for c in result["coverage"]] == ["전산 시스템 구축"]
    # verification_node에 전산 배정 항목만 들어갔는지
    state = mock_verify.call_args[0][0]
    assert [e["item"] for e in state["scoring_table"]] == ["전산 시스템 구축"]
    assert state["sections"][0]["content"] == "IT 구축 방안 본문"


def test_missing_scoring_skips_coverage_but_scans_pii(tmp_path):
    result = check_upload(str(tmp_path / "none.json"), "예산", "연락처 010-1234-5678")
    assert result["coverage"] == []
    assert result["skipped"] is not None
    assert result["pii"][0]["kind"] == "휴대폰"


def test_write_coverage_map_merges_by_item(tmp_path):
    out = tmp_path / "out"
    write_coverage_map(str(out), "전산", [
        {"scoring_item": "전산 시스템 구축", "covered": True, "gap_note": None},
    ], pii_count=0)
    write_coverage_map(str(out), "예산", [
        {"scoring_item": "비용 적정성", "covered": False, "gap_note": "근거 부족"},
    ], pii_count=1)

    data = json.loads((out / "coverage_map.json").read_text(encoding="utf-8"))
    assert data["전산 시스템 구축"]["team"] == "전산"
    assert data["비용 적정성"]["pii_count"] == 1
