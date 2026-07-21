from unittest.mock import patch

from agent.pipeline import run_pipeline


@patch("agent.pipeline.pptx_builder_node")
@patch("agent.pipeline.verification_node")
@patch("agent.pipeline.content_writer_node")
@patch("agent.pipeline.institution_match_node")
@patch("agent.pipeline.rfp_analysis_node")
def test_pipeline_stops_when_fully_covered(
    mock_rfp, mock_match, mock_write, mock_verify, mock_build
):
    mock_rfp.return_value = {"scoring_table": [{"item": "a"}], "rfp_text": "text"}
    mock_match.return_value = {"institution_spec_dir": "giganlist/dobong/spec", "archive_pptx_path": None}
    mock_write.return_value = {"sections": [{"scoring_item": "a"}], "revision_count": 0}
    mock_verify.return_value = {"coverage_report": [{"scoring_item": "a", "covered": True, "gap_note": None}]}
    mock_build.return_value = {"pptx_path": "report_new/dobong/dobong_제안서.pptx"}

    result = run_pipeline("dobong")

    assert mock_write.call_count == 1
    assert mock_verify.call_count == 1
    assert result["pptx_path"] == "report_new/dobong/dobong_제안서.pptx"


@patch("agent.pipeline.pptx_builder_node")
@patch("agent.pipeline.verification_node")
@patch("agent.pipeline.content_writer_node")
@patch("agent.pipeline.institution_match_node")
@patch("agent.pipeline.rfp_analysis_node")
def test_pipeline_retries_up_to_max_then_stops(
    mock_rfp, mock_match, mock_write, mock_verify, mock_build
):
    mock_rfp.return_value = {"scoring_table": [{"item": "a"}], "rfp_text": "text"}
    mock_match.return_value = {"institution_spec_dir": "giganlist/dobong/spec", "archive_pptx_path": None}
    mock_write.side_effect = [
        {"sections": [{"scoring_item": "a"}], "revision_count": i} for i in range(4)
    ]
    mock_verify.return_value = {"coverage_report": [{"scoring_item": "a", "covered": False, "gap_note": "부족"}]}
    mock_build.return_value = {"pptx_path": "report_new/dobong/dobong_제안서.pptx"}

    result = run_pipeline("dobong", max_revisions=3)

    # initial write + up to 3 retries = 4 calls to content_writer
    assert mock_write.call_count == 4
    assert mock_verify.call_count == 4
    assert result["coverage_report"][0]["covered"] is False
