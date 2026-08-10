"""배점 합계 검증 — **모델 성능에 기대지 않는 방어**.

2026-08-04 실측(수원시 공고문, 정답 6항목 합 100):
  llama3.1:8b → 16항목 합 **96**
  qwen3:14b   → 15항목 합 **108**
둘 다 분류는 맞췄고 숫자만 지어냈다. 모델을 키워도 같은 양상이 반복됐으므로
규칙으로 잡는다. 이 파일의 두 케이스가 그 실측값 그대로다.

2026-08-10 실측: `qwen3.5:9b`는 반대로 표를 **정확히** 읽어 계+대분류+세부를
평면 목록에 담았고(합 300), 옛 규칙이 정확한 추출을 오탐했다. 그래서 규칙이
레벨 그룹별 합산으로 바뀌었다(스펙 2026-08-10-scoring-schema-hierarchy §③) —
아래 계층 케이스들이 그 실측 구조 그대로다.
"""

from agent.nodes.rfp_extract import main_criteria, scoring_consistency


def scoring(total, scores):
    return {
        "total_score": total,
        "criteria": [{"category": "c", "item": f"i{n}", "score": s}
                     for n, s in enumerate(scores)],
    }


def leveled(total, rows):
    """rows: (level, score) 목록. level=None이면 필드 자체를 뺀다(옛 파일 모양)."""
    criteria = []
    for n, (lv, s) in enumerate(rows):
        c = {"category": "c", "item": f"i{n}", "score": s}
        if lv is not None:
            c["level"] = lv
        criteria.append(c)
    return {"total_score": total, "criteria": criteria}


# ── 실측 재현 ──────────────────────────────────────────────────────────

def test_llama_실측_합계_96을_잡는다():
    msg = scoring_consistency(scoring(100, [0, 4, 4, 4, 5, 5, 5, 6, 6, 7, 8, 8, 8, 8, 9, 9]))
    assert msg is not None
    assert "96" in msg and "100" in msg
    assert "-4" in msg          # 얼마나 어긋났는지 부호까지 보여준다


def test_qwen_실측_합계_108을_잡는다():
    """총점을 **넘긴** 경우 — 더 큰 모델이 더 자신 있게 지어낸 결과다."""
    msg = scoring_consistency(scoring(100, [1, 2, 3, 5, 5, 6, 7, 7, 7, 8, 8, 8, 8, 8, 25]))
    assert msg is not None
    assert "108" in msg and "+8" in msg


def test_정답은_통과한다():
    assert scoring_consistency(scoring(100, [7, 8, 17, 21, 22, 25])) is None


# ── 계층 배점표 (2026-08-10 qwen3.5:9b 실측 구조 재현) ─────────────────

# 수원시 공고문을 정확히 읽은 결과: 계(100) + 대분류 5개(합 100) + 세부 15개(합 100).
QWEN35_ROWS = ([(1, 100)]
               + [(2, s) for s in (25, 21, 22, 25, 7)]
               + [(3, s) for s in (8, 17, 8, 7, 5, 1, 7, 8, 7, 6, 8, 8, 3, 2, 5)])


def test_qwen35_실측_계층_합300은_오탐하지_않는다():
    """전체 합 300이지만 각 레벨이 전부 총점 100과 일치한다 — 정확한 추출이다."""
    assert scoring_consistency(leveled(100, QWEN35_ROWS)) is None


def test_한_레벨만_맞아도_통과한다():
    """세부 레벨이 불완전해도(표 일부만 옮김) 대분류가 맞으면 경고하지 않는다."""
    rows = [(2, 50), (2, 50), (3, 30)]
    assert scoring_consistency(leveled(100, rows)) is None


def test_계_행이_총점과_일치하면_그것만으로도_통과한다():
    """계 행은 총점의 재진술이라 사실상 항상 맞는 그룹이다 — 하위 레벨이 불완전해도
    경고하지 않는다(불완전 != 조작. 조작 방어의 최종선은 5·8단계 사람 승인이다)."""
    rows = [(1, 100), (2, 45), (2, 45), (3, 95)]
    assert scoring_consistency(leveled(100, rows)) is None


def test_계층인데_모든_레벨이_어긋나면_그룹별_합계를_보여주며_잡는다():
    rows = [(1, 110), (2, 45), (2, 45), (3, 95)]
    msg = scoring_consistency(leveled(100, rows))
    assert msg is not None
    assert "계 합 110점" in msg and "대분류 합 90점" in msg and "세부 합 95점" in msg


def test_레벨과_무레벨이_섞여도_그룹으로_다룬다():
    """무레벨 행은 '단층' 그룹 — 그 그룹이 총점과 맞으면 통과한다."""
    rows = [(None, 60), (None, 40), (2, 30)]
    assert scoring_consistency(leveled(100, rows)) is None


# ── main_criteria — 하류가 쓸 대표 레벨 필터 ───────────────────────────

def test_대분류가_있으면_대분류만_남는다():
    picked = main_criteria(leveled(100, QWEN35_ROWS)["criteria"])
    assert len(picked) == 5
    assert all(c["level"] == 2 for c in picked)
    assert sum(c["score"] for c in picked) == 100


def test_대분류가_없으면_세부만_남는다():
    rows = [(1, 100), (3, 60), (3, 40)]
    picked = main_criteria(leveled(100, rows)["criteria"])
    assert [c["score"] for c in picked] == [60, 40]


def test_평면_목록은_전부_남는다():
    flat = scoring(100, [7, 8, 17, 21, 22, 25])["criteria"]
    assert main_criteria(flat) == flat


def test_계_행만_있으면_빈_목록이다():
    """총계 행은 매칭·섹션 생성의 대상이 아니다 — 빈 목록이 정직하다."""
    rows = [(1, 100)]
    assert main_criteria(leveled(100, rows)["criteria"]) == []


def test_빈_목록은_빈_목록이다():
    assert main_criteria([]) == []


# ── 오탐 금지 (경고가 한 번이라도 틀리면 아무도 안 읽는다) ──────────────

def test_배점표가_없는_공고문은_정상이다():
    """프롬프트가 '빈 목록은 실패가 아니라 정당한 결과'라고 명시하고 있다."""
    assert scoring_consistency(scoring(100, [])) is None
    assert scoring_consistency({"total_score": 0, "criteria": []}) is None


def test_총점을_못_뽑았으면_할_말이_없다():
    assert scoring_consistency(scoring(0, [10, 20])) is None
    assert scoring_consistency(scoring(-1, [10])) is None


def test_빈_입력도_안전하다():
    assert scoring_consistency({}) is None
    assert scoring_consistency(None) is None


def test_score가_없거나_None인_항목도_죽지_않는다():
    data = {"total_score": 10, "criteria": [{"item": "a"}, {"item": "b", "score": None}]}
    # 합 0 ≠ 10 이므로 잡히되, 예외로 죽지는 않는다.
    assert scoring_consistency(data) is not None


# ── 노드 통합 ──────────────────────────────────────────────────────────

def test_노드가_어긋난_배점을_경고하고_상태에_남긴다(tmp_path, capsys, monkeypatch):
    """막지는 않는다 — 본문은 그대로 쓸모가 있고 5·8단계에 사람 승인이 있다."""
    from unittest.mock import patch

    from agent.nodes import rfp_extract as node
    from agent.tests.test_rfp_extract import SAMPLE_RFP, _mock_llm
    # _mock_llm은 model_dump()가 넘긴 값을 그대로 돌려주므로 dict를 준다.
    bad = [{"category": "c", "item": "i", "score": 30}]      # 합 30 ≠ 총점 100
    with patch.object(node, "structured_llm", return_value=_mock_llm(bad)):
        out = node.rfp_extract_node({
            "rfp_path": str(SAMPLE_RFP), "institution_name": "수원시",
            "report_new_dir": str(tmp_path),
        })

    assert "다릅니다" in out["score_check"]
    assert "경고" in capsys.readouterr().err


def test_저장파일의_키는_그대로다(tmp_path):
    """rfp_scoring.json은 rfp-locate 스킬이 사람 손으로도 만드는 규격이다 —
    자동 경로만 필드를 늘리면 두 경로의 모양이 갈린다."""
    import json
    from unittest.mock import patch

    from agent.nodes import rfp_extract as node
    from agent.tests.test_rfp_extract import SAMPLE_RFP, _mock_llm
    ok = [{"category": "c", "item": "i", "score": 100}]
    with patch.object(node, "structured_llm", return_value=_mock_llm(ok)):
        node.rfp_extract_node({
            "rfp_path": str(SAMPLE_RFP), "institution_name": "수원시",
            "report_new_dir": str(tmp_path),
        })

    saved = json.loads((tmp_path / "수원시" / "rfp_scoring.json").read_text(encoding="utf-8"))
    assert set(saved) == {"institution", "rfp_title", "total_score", "criteria"}
