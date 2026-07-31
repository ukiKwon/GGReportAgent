from unittest.mock import MagicMock, patch

from backend.agent_adapter import stream_consult_reply


def _collect(gen):
    return "".join(gen)


@patch("backend.agent_adapter.get_llm")
def test_consult_prompt_carries_three_perspectives_and_corpus(mock_get_llm, tmp_path):
    inst = tmp_path / "dobong"
    (inst / "spec").mkdir(parents=True)
    (inst / "spec" / "01_개요.txt").write_text("도봉구 개요", encoding="utf-8")

    chunk = MagicMock(); chunk.content = "답변"
    mock_get_llm.return_value.stream.return_value = [chunk]

    out = _collect(stream_consult_reply(
        institution_name="도봉구",
        giganlist_dir=str(inst),
        rfp_text_path=None,
        history=[],
        user_message="올해 도봉구청 입찰에 대해 어떻게 생각해?",
        index_db_path=str(tmp_path / "no-index.db"),
    ))

    assert out == "답변"
    prompt = mock_get_llm.return_value.stream.call_args[0][0]
    for word in ("영업", "전산", "예산", "도봉구 개요", "도봉구"):
        assert word in prompt
    assert "지어내지" in prompt  # 할루시네이션 금지 문구


@patch("backend.agent_adapter.get_llm")
def test_consult_includes_rfp_text_when_present(mock_get_llm, tmp_path):
    rfp = tmp_path / "rfp_text.txt"
    rfp.write_text("공고 원문: 협력사업 25점", encoding="utf-8")
    chunk = MagicMock(); chunk.content = "ok"
    mock_get_llm.return_value.stream.return_value = [chunk]

    _collect(stream_consult_reply(
        institution_name="수원시", giganlist_dir=None, rfp_text_path=str(rfp),
        history=[{"role": "user", "content": "이전 질문"}],
        user_message="참여할까?", index_db_path=str(tmp_path / "no.db"),
    ))

    prompt = mock_get_llm.return_value.stream.call_args[0][0]
    assert "협력사업 25점" in prompt
    assert "이전 질문" in prompt


@patch("backend.agent_adapter.get_llm")
def test_consult_without_any_source_says_so(mock_get_llm, tmp_path):
    chunk = MagicMock(); chunk.content = "ok"
    mock_get_llm.return_value.stream.return_value = [chunk]
    _collect(stream_consult_reply(
        institution_name="신규기관", giganlist_dir=None, rfp_text_path=None,
        history=[], user_message="어때?", index_db_path=str(tmp_path / "no.db"),
    ))
    prompt = mock_get_llm.return_value.stream.call_args[0][0]
    assert "자료 없음" in prompt


@patch("backend.agent_adapter.get_llm")
def test_consult_keeps_real_corpus_containing_no_data_phrase(mock_get_llm, tmp_path):
    """I-1 회귀: spec 파일 본문에 "자료 없음"이 부분 포함돼도(예: 강동·강남·성북 실측
    "일부 자료 없음 상태") 근거 전체가 폐기되면 안 된다 — 정확 비교로 sentinel만 걸러야 함."""
    inst = tmp_path / "gangdong"
    (inst / "spec").mkdir(parents=True)
    (inst / "spec" / "01_개요.txt").write_text(
        "강동구 개요 — 일부 자료 없음 상태이나 조사는 계속 진행", encoding="utf-8"
    )

    chunk = MagicMock(); chunk.content = "답변"
    mock_get_llm.return_value.stream.return_value = [chunk]

    _collect(stream_consult_reply(
        institution_name="강동구",
        giganlist_dir=str(inst),
        rfp_text_path=None,
        history=[],
        user_message="강동구 입찰 참여할까?",
        index_db_path=str(tmp_path / "no-index.db"),
    ))

    prompt = mock_get_llm.return_value.stream.call_args[0][0]
    assert "일부 자료 없음 상태이나 조사는 계속 진행" in prompt
