import json
from unittest.mock import MagicMock, patch

from backend.upload_check import check_upload, load_coverage_map, write_coverage_map


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
    assert data["version"] == 2
    assert data["items"]["전산 시스템 구축"]["team"] == "전산"
    assert data["items"]["비용 적정성"]["covered"] is False


# ── PII는 항목이 아니라 팀 단위 사실이다 (NEXT.md 항목 7의 근본 수정) ────
# 예전에는 팀 전체 건수를 그 팀의 **모든 배점 항목에 복제 저장**했다. 그래서
# ⓐ화면이 항목 수만큼 부풀려 세고(3건·12항목 → 36건) ⓑ배점표를 다시 뽑아 어떤
# 항목이 그 팀 배정에서 빠지면 옛 값이 stale로 남아 같은 팀 항목끼리 값이 갈렸다.

def test_pii는_팀당_한_번만_저장된다(tmp_path):
    out = tmp_path / "out"
    write_coverage_map(str(out), "전산", [
        {"scoring_item": "a", "covered": True, "gap_note": None},
        {"scoring_item": "b", "covered": True, "gap_note": None},
        {"scoring_item": "c", "covered": True, "gap_note": None},
    ], pii_count=3)

    data = json.loads((out / "coverage_map.json").read_text(encoding="utf-8"))
    assert data["teams"] == {"전산": {"pii_count": 3}}
    # 항목에는 pii_count가 아예 없다 — 있으면 읽는 쪽이 또 합산하게 된다.
    assert all("pii_count" not in row for row in data["items"].values())


def test_다시_올리면_그_팀_값만_갱신된다(tmp_path):
    out = tmp_path / "out"
    write_coverage_map(str(out), "전산", [
        {"scoring_item": "a", "covered": True, "gap_note": None}], pii_count=3)
    write_coverage_map(str(out), "예산", [
        {"scoring_item": "b", "covered": True, "gap_note": None}], pii_count=1)
    write_coverage_map(str(out), "전산", [
        {"scoring_item": "a", "covered": True, "gap_note": None}], pii_count=0)

    data = json.loads((out / "coverage_map.json").read_text(encoding="utf-8"))
    assert data["teams"] == {"전산": {"pii_count": 0}, "예산": {"pii_count": 1}}


def test_옛_파일도_읽을_때_v2로_올라온다(tmp_path):
    """이미 만들어진 산출물(아카이브에 복사된 것 포함)이 그대로 열려야 한다 —
    파일을 고쳐 쓰지 않고 읽을 때 정규화한다."""
    out = tmp_path / "out"
    out.mkdir()
    (out / "coverage_map.json").write_text(json.dumps({
        "a": {"team": "전산", "covered": True, "gap_note": None, "pii_count": 3},
        "b": {"team": "전산", "covered": False, "gap_note": "부족", "pii_count": 3},
    }, ensure_ascii=False), encoding="utf-8")

    data = load_coverage_map(str(out / "coverage_map.json"))

    assert data["version"] == 2
    assert data["items"]["b"]["gap_note"] == "부족"
    assert data["teams"] == {"전산": {"pii_count": 3}}     # 복제값 3개가 1개로


def test_값이_갈린_옛_파일은_큰_쪽을_택한다(tmp_path):
    """stale 키가 남아 같은 팀 항목끼리 값이 다른 파일 — 과소집계로 떨어지지 않게
    큰 쪽을 그 팀의 값으로 본다(개인정보를 놓치는 방향이 더 위험하다)."""
    out = tmp_path / "out"
    out.mkdir()
    (out / "coverage_map.json").write_text(json.dumps({
        "a": {"team": "전산", "covered": True, "gap_note": None, "pii_count": 3},
        "b": {"team": "전산", "covered": True, "gap_note": None, "pii_count": 0},
    }, ensure_ascii=False), encoding="utf-8")

    assert load_coverage_map(str(out / "coverage_map.json"))["teams"]["전산"]["pii_count"] == 3


def test_파일이_없으면_빈_v2다(tmp_path):
    data = load_coverage_map(str(tmp_path / "none.json"))
    assert data == {"version": 2, "items": {}, "teams": {}}
