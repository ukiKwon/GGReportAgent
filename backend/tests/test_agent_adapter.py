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
