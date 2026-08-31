from unittest.mock import MagicMock, patch

from server.agent_adapter import BUDGET_TEAM, IT_TEAM, SALES_TEAM, stream_chat_reply


@patch("server.agent_adapter.get_llm")
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
        stream_chat_reply(SALES_TEAM, str(giganlist_dir), history=[], user_message="소개해줘")
    )

    assert chunks == ["안녕", "하세요"]
    prompt = mock_llm.stream.call_args[0][0]
    assert "마포구 개요" in prompt
    assert "소개해줘" in prompt


def _plan_fixture(tmp_path):
    giganlist_dir = tmp_path / "mapo"
    plan_dir = giganlist_dir / "plan"
    plan_dir.mkdir(parents=True)
    (plan_dir / "02_IT디지털 기획 사업 제안.txt").write_text("IT 계획 내용", encoding="utf-8")
    (plan_dir / "03_금전적 지원 사업 제안.txt").write_text("예산 계획 내용", encoding="utf-8")
    return giganlist_dir


@patch("server.agent_adapter.get_llm")
def test_stream_chat_reply_it_team_reads_plan_02_files_only(mock_get_llm, tmp_path):
    """⚠️ 팀 이름을 손으로 적지 않는다.

    예전에는 여기가 `"IT"`(옛 이름)였고 구현도 같은 옛 이름을 읽어 **둘이 나란히
    틀린 채로 통과**했다. 실제로는 개명된 `전산` 팀이 어느 분기에도 안 걸려
    **예산팀 문서(`03_`)를 근거로 받고 있었다** — 오류 없이 근거만 바뀐다.
    """
    giganlist_dir = _plan_fixture(tmp_path)

    mock_llm = MagicMock()
    mock_llm.stream.return_value = [MagicMock(content="ok")]
    mock_get_llm.return_value = mock_llm

    list(stream_chat_reply(IT_TEAM, str(giganlist_dir), history=[], user_message="정리해줘"))

    prompt = mock_llm.stream.call_args[0][0]
    assert "IT 계획 내용" in prompt
    assert "예산 계획 내용" not in prompt


@patch("server.agent_adapter.get_llm")
def test_stream_chat_reply_budget_team_reads_plan_03_files_only(mock_get_llm, tmp_path):
    """예산팀은 `03_`을 본다 — 전산팀과 **다른 근거**를 받아야 한다.

    위 테스트만으로는 부족하다: 전산이 폴백으로 떨어져 둘이 **같은 문서**를 보게 돼도
    예산 쪽 기대는 그대로 통과하기 때문이다. 두 팀을 각각 고정해야 갈라짐이 잡힌다.
    """
    giganlist_dir = _plan_fixture(tmp_path)

    mock_llm = MagicMock()
    mock_llm.stream.return_value = [MagicMock(content="ok")]
    mock_get_llm.return_value = mock_llm

    list(stream_chat_reply(BUDGET_TEAM, str(giganlist_dir), history=[], user_message="정리해줘"))

    prompt = mock_llm.stream.call_args[0][0]
    assert "예산 계획 내용" in prompt
    assert "IT 계획 내용" not in prompt


@patch("server.agent_adapter.get_llm")
def test_stream_chat_reply_handles_missing_giganlist_dir(mock_get_llm):
    mock_llm = MagicMock()
    mock_llm.stream.return_value = [MagicMock(content="ok")]
    mock_get_llm.return_value = mock_llm

    chunks = list(stream_chat_reply(BUDGET_TEAM, None, history=[], user_message="시작해줘"))
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


@patch("server.agent_adapter.get_llm")
def test_registered_corpus_uses_search_with_citation_paths(mock_get_llm, tmp_path):
    db = _build_test_index(tmp_path)
    mock_llm = _mock_llm(mock_get_llm)

    list(
        stream_chat_reply(
            SALES_TEAM,
            "corpus/institutions/testinst",
            history=[],
            user_message="청년 창업 관련 근거 찾아줘",
            index_db_path=db,
        )
    )
    prompt = mock_llm.stream.call_args[0][0]
    assert "[corpus/institutions/testinst/spec/02_사업목록.txt#0]" in prompt
    assert "청년 창업 지원 센터 운영" in prompt


@patch("server.agent_adapter.get_llm")
def test_search_zero_hits_falls_back_to_legacy_load(mock_get_llm, tmp_path):
    db = _build_test_index(tmp_path)
    mock_llm = _mock_llm(mock_get_llm)

    # 인덱스에 없는 어휘 → 검색 0건 → legacy 통째-읽기 (폴더도 없으므로 "자료 없음")
    list(
        stream_chat_reply(
            SALES_TEAM,
            "corpus/institutions/testinst_없는폴더",
            history=[],
            user_message="존재하지않는어휘조합",
            index_db_path=db,
        )
    )
    prompt = mock_llm.stream.call_args[0][0]
    assert "자료 없음" in prompt


@patch("server.agent_adapter.get_llm")
def test_missing_index_falls_back_to_legacy_load(mock_get_llm, tmp_path):
    mock_llm = _mock_llm(mock_get_llm)

    list(
        stream_chat_reply(
            SALES_TEAM,
            "corpus/institutions/testinst_없는폴더",
            history=[],
            user_message="청년 창업 관련",
            index_db_path=str(tmp_path / "없는인덱스.db"),
        )
    )
    prompt = mock_llm.stream.call_args[0][0]
    assert "자료 없음" in prompt
