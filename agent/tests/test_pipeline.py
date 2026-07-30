from unittest.mock import patch

from agent.pipeline import run_pipeline


@patch("agent.pipeline.pptx_builder_node")
@patch("agent.pipeline.verification_node")
@patch("agent.pipeline.content_writer_node")
@patch("agent.pipeline.role_router_node")
@patch("agent.pipeline.institution_match_node")
@patch("agent.pipeline.rfp_analysis_node")
def test_pipeline_stops_when_fully_covered(
    mock_rfp, mock_match, mock_router, mock_write, mock_verify, mock_build
):
    mock_rfp.return_value = {"scoring_table": [{"item": "a"}], "rfp_text": "text"}
    mock_match.return_value = {"institution_spec_dir": "corpus/institutions/dobong/spec", "archive_pptx_path": None}
    mock_router.return_value = {"role_assignments": [{"scoring_item": "a", "role": "영업"}]}
    mock_write.return_value = {"sections": [{"scoring_item": "a"}]}
    mock_verify.return_value = {"coverage_report": [{"scoring_item": "a", "covered": True, "gap_note": None}]}
    mock_build.return_value = {"pptx_path": "report_new/dobong/dobong_제안서.pptx"}

    result = run_pipeline("dobong")

    # 3팀 writer가 한 회차에 각 1회씩 = 3회, verification은 병합본에 1회
    assert mock_router.call_count == 1
    assert mock_write.call_count == 3
    assert mock_verify.call_count == 1
    assert result["revision_count"] == 0
    assert result["pptx_path"] == "report_new/dobong/dobong_제안서.pptx"


@patch("agent.pipeline.pptx_builder_node")
@patch("agent.pipeline.verification_node")
@patch("agent.pipeline.content_writer_node")
@patch("agent.pipeline.role_router_node")
@patch("agent.pipeline.institution_match_node")
@patch("agent.pipeline.rfp_analysis_node")
def test_pipeline_retries_up_to_max_then_stops(
    mock_rfp, mock_match, mock_router, mock_write, mock_verify, mock_build
):
    mock_rfp.return_value = {"scoring_table": [{"item": "a"}], "rfp_text": "text"}
    mock_match.return_value = {"institution_spec_dir": "corpus/institutions/dobong/spec", "archive_pptx_path": None}
    mock_router.return_value = {"role_assignments": [{"scoring_item": "a", "role": "영업"}]}
    mock_write.return_value = {"sections": [{"scoring_item": "a"}]}
    mock_verify.return_value = {"coverage_report": [{"scoring_item": "a", "covered": False, "gap_note": "부족"}]}
    mock_build.return_value = {"pptx_path": "report_new/dobong/dobong_제안서.pptx"}

    result = run_pipeline("dobong", max_revisions=3)

    # (최초 1 + 재시도 3) 회차 × 3팀 = 12회
    assert mock_write.call_count == 12
    assert mock_verify.call_count == 4
    # revision_count는 이제 파이프라인이 계산: 재시도 회차(2~4번째)마다 +1
    assert result["revision_count"] == 3
    assert result["coverage_report"][0]["covered"] is False


@patch("agent.pipeline.pptx_builder_node")
@patch("agent.pipeline.verification_node")
@patch("agent.pipeline.content_writer_node")
@patch("agent.pipeline.role_router_node")
@patch("agent.pipeline.institution_match_node")
@patch("agent.pipeline.rfp_analysis_node")
def test_pipeline_merges_role_sections_in_scoring_table_order(
    mock_rfp, mock_match, mock_router, mock_write, mock_verify, mock_build
):
    """3팀 결과는 팀 순서(영업→전산→예산)가 아니라 배점표 원순서로 병합된다."""
    mock_rfp.return_value = {
        "scoring_table": [{"item": "비용 적정성"}, {"item": "지역 기여"}],
        "rfp_text": "text",
    }
    mock_match.return_value = {"institution_spec_dir": None, "archive_pptx_path": None}
    mock_router.return_value = {"role_assignments": [
        {"scoring_item": "비용 적정성", "role": "예산"},
        {"scoring_item": "지역 기여", "role": "영업"},
    ]}

    def write(state, role=None):
        by_role = {
            "영업": [{"scoring_item": "지역 기여"}],
            "예산": [{"scoring_item": "비용 적정성"}],
        }
        return {"sections": by_role.get(role, [])}

    mock_write.side_effect = write
    mock_verify.return_value = {"coverage_report": [
        {"scoring_item": "비용 적정성", "covered": True, "gap_note": None},
        {"scoring_item": "지역 기여", "covered": True, "gap_note": None},
    ]}
    mock_build.return_value = {"pptx_path": "x.pptx"}

    result = run_pipeline("dobong")

    # 영업팀이 먼저 실행돼도 배점표 순서(비용 적정성 → 지역 기여)로 정렬된다
    assert [s["scoring_item"] for s in result["sections"]] == ["비용 적정성", "지역 기여"]


@patch("agent.pipeline.pptx_builder_node")
@patch("agent.pipeline.verification_node")
@patch("agent.pipeline.content_writer_node")
@patch("agent.pipeline.role_router_node")
@patch("agent.pipeline.institution_match_node")
@patch("agent.pipeline.rfp_analysis_node")
@patch("agent.pipeline.rfp_extract_node")
def _run(mock_extract, mock_rfp, mock_match, mock_router, mock_write, mock_verify, mock_build, **kwargs):
    """3단계 분기만 보기 위한 공통 배선. 반환값은 (추출노드 mock, 결과)."""
    mock_extract.return_value = {"scoring_table": [{"item": "a"}], "rfp_text": "추출된 본문"}
    mock_rfp.return_value = {"scoring_table": [{"item": "a"}], "rfp_text": "읽은 본문"}
    mock_match.return_value = {"institution_spec_dir": "corpus/institutions/dobong/spec", "archive_pptx_path": None}
    mock_router.return_value = {"role_assignments": [{"scoring_item": "a", "role": "영업"}]}
    mock_write.return_value = {"sections": [{"scoring_item": "a"}]}
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
