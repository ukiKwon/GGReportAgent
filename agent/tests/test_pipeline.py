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
    mock_match.return_value = {"institution_spec_dir": "corpus/institutions/dobong/spec", "archive_pptx_path": None}
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
    mock_match.return_value = {"institution_spec_dir": "corpus/institutions/dobong/spec", "archive_pptx_path": None}
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


@patch("agent.pipeline.pptx_builder_node")
@patch("agent.pipeline.verification_node")
@patch("agent.pipeline.content_writer_node")
@patch("agent.pipeline.institution_match_node")
@patch("agent.pipeline.rfp_analysis_node")
@patch("agent.pipeline.rfp_extract_node")
def _run(mock_extract, mock_rfp, mock_match, mock_write, mock_verify, mock_build, **kwargs):
    """3단계 분기만 보기 위한 공통 배선. 반환값은 (추출노드 mock, 결과)."""
    mock_extract.return_value = {"scoring_table": [{"item": "a"}], "rfp_text": "추출된 본문"}
    mock_rfp.return_value = {"scoring_table": [{"item": "a"}], "rfp_text": "읽은 본문"}
    mock_match.return_value = {"institution_spec_dir": "corpus/institutions/dobong/spec", "archive_pptx_path": None}
    mock_write.return_value = {"sections": [{"scoring_item": "a"}], "revision_count": 0}
    mock_verify.return_value = {"coverage_report": [{"scoring_item": "a", "covered": True, "gap_note": None}]}
    mock_build.return_value = {"pptx_path": "data/report_new/dobong/dobong_제안서.pptx"}
    return mock_extract, run_pipeline("dobong", **kwargs)


def test_pipeline_extracts_when_artifacts_missing(tmp_path):
    """PDF는 있는데 산출물이 없으면 뽑는다 — 배치로 갓 반입된 기관의 경로."""
    pdf = tmp_path / "공고문.pdf"
    pdf.write_bytes(b"%PDF-1.4")

    mock_extract, _ = _run(report_new_dir=str(tmp_path / "out"), rfp_path=str(pdf))

    assert mock_extract.call_count == 1


def test_pipeline_skips_extract_when_artifacts_exist(tmp_path):
    """사람이 rfp-locate 스킬로 만들어 둔 산출물은 덮지 않는다(이상 PDF의 유일한 경로)."""
    out = tmp_path / "out" / "dobong"
    out.mkdir(parents=True)
    (out / "rfp_scoring.json").write_text("{}", encoding="utf-8")
    (out / "rfp_text.txt").write_text("사람이 비전으로 읽은 본문", encoding="utf-8")
    pdf = tmp_path / "공고문.pdf"
    pdf.write_bytes(b"%PDF-1.4")

    mock_extract, _ = _run(report_new_dir=str(tmp_path / "out"), rfp_path=str(pdf))

    assert mock_extract.call_count == 0


def test_pipeline_skips_extract_without_rfp_path(tmp_path):
    """PDF가 아직 반입되지 않았으면 추출할 것이 없다 — 기존 동작 그대로."""
    mock_extract, _ = _run(report_new_dir=str(tmp_path / "out"))

    assert mock_extract.call_count == 0
