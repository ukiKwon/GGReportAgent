from unittest.mock import MagicMock, patch

from backend.agent_adapter import stream_chat_reply


@patch("backend.agent_adapter.get_llm")
def test_stream_chat_reply_yields_chunks_from_llm(mock_get_llm, tmp_path):
    giganlist_dir = tmp_path / "mapo"
    (giganlist_dir / "spec").mkdir(parents=True)
    (giganlist_dir / "spec" / "01_개요.txt").write_text("마포구 개요", encoding="utf-8")

    mock_chunk_1 = MagicMock(content="안녕")
    mock_chunk_2 = MagicMock(content="하세요")
    mock_llm = MagicMock()
    mock_llm.stream.return_value = [mock_chunk_1, mock_chunk_2]
    mock_get_llm.return_value = mock_llm

    chunks = list(
        stream_chat_reply("영업", str(giganlist_dir), history=[], user_message="소개해줘")
    )

    assert chunks == ["안녕", "하세요"]
    prompt = mock_llm.stream.call_args[0][0]
    assert "마포구 개요" in prompt
    assert "소개해줘" in prompt


@patch("backend.agent_adapter.get_llm")
def test_stream_chat_reply_it_team_reads_plan_02_files_only(mock_get_llm, tmp_path):
    giganlist_dir = tmp_path / "mapo"
    plan_dir = giganlist_dir / "plan"
    plan_dir.mkdir(parents=True)
    (plan_dir / "02_IT디지털 기획 사업 제안.txt").write_text("IT 계획 내용", encoding="utf-8")
    (plan_dir / "03_금전적 지원 사업 제안.txt").write_text("예산 계획 내용", encoding="utf-8")

    mock_llm = MagicMock()
    mock_llm.stream.return_value = [MagicMock(content="ok")]
    mock_get_llm.return_value = mock_llm

    list(stream_chat_reply("IT", str(giganlist_dir), history=[], user_message="정리해줘"))

    prompt = mock_llm.stream.call_args[0][0]
    assert "IT 계획 내용" in prompt
    assert "예산 계획 내용" not in prompt


@patch("backend.agent_adapter.get_llm")
def test_stream_chat_reply_handles_missing_giganlist_dir(mock_get_llm):
    mock_llm = MagicMock()
    mock_llm.stream.return_value = [MagicMock(content="ok")]
    mock_get_llm.return_value = mock_llm

    chunks = list(stream_chat_reply("예산", None, history=[], user_message="시작해줘"))
    assert chunks == ["ok"]
    prompt = mock_llm.stream.call_args[0][0]
    assert "자료 없음" in prompt


def _mock_llm(mock_get_llm):
    mock_llm = MagicMock()
    mock_llm.stream.return_value = [MagicMock(content="ok")]
    mock_get_llm.return_value = mock_llm
    return mock_llm


def _build_test_index(tmp_path, institution_id="testinst"):
    from agent.retrieval import build_index

    root = tmp_path / "corpus"
    spec = root / "institutions" / institution_id / "spec"
    spec.mkdir(parents=True)
    (spec / "02_사업목록.txt").write_text("청년 창업 지원 센터 운영", encoding="utf-8")
    db = tmp_path / "corpus_index.db"
    build_index(root, db)
    return str(db)


@patch("backend.agent_adapter.get_llm")
def test_registered_corpus_uses_search_with_citation_paths(mock_get_llm, tmp_path):
    db = _build_test_index(tmp_path)
    mock_llm = _mock_llm(mock_get_llm)

    list(
        stream_chat_reply(
            "영업",
            "corpus/institutions/testinst",
            history=[],
            user_message="청년 창업 관련 근거 찾아줘",
            index_db_path=db,
        )
    )
    prompt = mock_llm.stream.call_args[0][0]
    assert "[corpus/institutions/testinst/spec/02_사업목록.txt#0]" in prompt
    assert "청년 창업 지원 센터 운영" in prompt


@patch("backend.agent_adapter.get_llm")
def test_search_zero_hits_falls_back_to_legacy_load(mock_get_llm, tmp_path):
    db = _build_test_index(tmp_path)
    mock_llm = _mock_llm(mock_get_llm)

    # 인덱스에 없는 어휘 → 검색 0건 → legacy 통째-읽기 (폴더도 없으므로 "자료 없음")
    list(
        stream_chat_reply(
            "영업",
            "corpus/institutions/testinst_없는폴더",
            history=[],
            user_message="존재하지않는어휘조합",
            index_db_path=db,
        )
    )
    prompt = mock_llm.stream.call_args[0][0]
    assert "자료 없음" in prompt


@patch("backend.agent_adapter.get_llm")
def test_missing_index_falls_back_to_legacy_load(mock_get_llm, tmp_path):
    mock_llm = _mock_llm(mock_get_llm)

    list(
        stream_chat_reply(
            "영업",
            "corpus/institutions/testinst_없는폴더",
            history=[],
            user_message="청년 창업 관련",
            index_db_path=str(tmp_path / "없는인덱스.db"),
        )
    )
    prompt = mock_llm.stream.call_args[0][0]
    assert "자료 없음" in prompt
