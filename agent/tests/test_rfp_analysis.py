import json
import os

from agent.nodes.rfp_analysis import rfp_analysis_node

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")


def test_rfp_analysis_node_reads_scoring_json(tmp_path):
    report_dir = tmp_path / "report_new" / "수원시"
    report_dir.mkdir(parents=True)
    scoring_src = os.path.join(FIXTURES, "sample_rfp_scoring.json")
    with open(scoring_src, encoding="utf-8") as f:
        scoring_data = json.load(f)
    (report_dir / "rfp_scoring.json").write_text(
        json.dumps(scoring_data, ensure_ascii=False), encoding="utf-8"
    )
    (report_dir / "rfp_text.txt").write_text(
        "수원시 공고 제2026-1528호", encoding="utf-8"
    )

    state = {"institution_name": "수원시", "report_new_dir": str(tmp_path / "report_new")}
    result = rfp_analysis_node(state)

    assert result["institution_name"] == "수원시"
    assert len(result["scoring_table"]) == 2
    assert result["scoring_table"][0]["item"] == "외부기관의 신용조사 상태평가"
    assert "수원시 공고" in result["rfp_text"]


def test_rfp_analysis_node_raises_if_scoring_json_missing(tmp_path):
    state = {"institution_name": "존재안함기관", "report_new_dir": str(tmp_path / "report_new")}
    try:
        rfp_analysis_node(state)
        assert False, "expected FileNotFoundError"
    except FileNotFoundError:
        pass
