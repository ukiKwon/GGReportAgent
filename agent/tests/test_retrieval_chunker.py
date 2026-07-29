from agent.retrieval.chunker import MAX_CHUNK_CHARS, chunk_text


def test_short_paragraphs_merge_into_one_chunk():
    text = "1장 개요\n\n2장 사업목록\n\n3장 예산"
    assert chunk_text(text) == ["1장 개요\n\n2장 사업목록\n\n3장 예산"]


def test_merge_stops_at_max_chars():
    para_a = "가" * 500
    para_b = "나" * 500
    chunks = chunk_text(f"{para_a}\n\n{para_b}")
    assert chunks == [para_a, para_b]


def test_oversize_paragraph_is_hard_split():
    text = "다" * (MAX_CHUNK_CHARS * 2 + 10)
    chunks = chunk_text(text)
    assert [len(c) for c in chunks] == [MAX_CHUNK_CHARS, MAX_CHUNK_CHARS, 10]


def test_empty_and_whitespace_only_text_yield_no_chunks():
    assert chunk_text("") == []
    assert chunk_text("\n\n   \n\n") == []


def test_deterministic():
    text = "사업 A 설명\n\n" + "라" * 900 + "\n\n사업 B 설명"
    assert chunk_text(text) == chunk_text(text)
