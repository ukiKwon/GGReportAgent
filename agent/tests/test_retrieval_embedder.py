"""임베딩 클라이언트 테스트 — **Ollama 없이** 통과해야 한다.

실호출(질의 1건 약 1.2초)을 테스트에 넣으면 CI가 느려지고, 임베딩 서버가 없는
환경에서 통째로 빨개진다. HTTP 경계(`_http_post`)만 가짜로 갈아끼운다.
"""

import json
import urllib.error

import pytest

from agent.retrieval import embedder
from agent.retrieval.embedder import EmbeddingUnavailableError, embed_query, embed_texts


def fake_post(monkeypatch, *, dim=4, calls=None, response=None, raises=None):
    """`_http_post`를 가짜로 바꾸고 호출 기록을 `calls`에 남긴다."""

    def _post(url, payload, timeout):
        if calls is not None:
            calls.append((url, payload))
        if raises is not None:
            raise raises
        if response is not None:
            return response
        n = len(payload["input"])
        return {"embeddings": [[float(i)] * dim for i in range(n)]}

    monkeypatch.setattr(embedder, "_http_post", _post)


def test_배치_크기대로_나눠_호출하고_순서를_보존한다(monkeypatch):
    calls = []

    def _post(url, payload, timeout):
        calls.append(list(payload["input"]))
        return {"embeddings": [[float(len(t))] * 3 for t in payload["input"]]}

    monkeypatch.setattr(embedder, "_http_post", _post)

    texts = [f"{'가' * (i + 1)}" for i in range(20)]
    vectors = embed_texts(texts, batch_size=8)

    assert [len(c) for c in calls] == [8, 8, 4]
    assert len(vectors) == 20
    # 결과 순서가 입력 순서와 같아야 한다 — 어긋나면 청크와 벡터가 뒤섞여
    # 유사도가 조용히 엉뚱해진다(눈에 안 보이는 종류의 버그다).
    assert [v[0] for v in vectors] == [float(i + 1) for i in range(20)]


def test_빈_입력은_호출하지_않는다(monkeypatch):
    calls = []
    fake_post(monkeypatch, calls=calls)
    assert embed_texts([]) == []
    assert calls == []


def test_연결_실패는_EmbeddingUnavailableError(monkeypatch):
    fake_post(monkeypatch, raises=urllib.error.URLError("connection refused"))
    with pytest.raises(EmbeddingUnavailableError):
        embed_texts(["가나다"])


def test_모델이_없으면_EmbeddingUnavailableError(monkeypatch):
    err = urllib.error.HTTPError("u", 404, "not found", {}, None)
    fake_post(monkeypatch, raises=err)
    with pytest.raises(EmbeddingUnavailableError):
        embed_texts(["가나다"])


def test_응답에_embeddings가_없으면_실패한다(monkeypatch):
    fake_post(monkeypatch, response={"error": "model not found"})
    with pytest.raises(EmbeddingUnavailableError):
        embed_texts(["가나다"])


def test_개수가_맞지_않으면_실패한다(monkeypatch):
    """2건을 보냈는데 1건이 오면 청크↔벡터 짝이 어긋난다 — 조용히 넘기면 안 된다."""
    fake_post(monkeypatch, response={"embeddings": [[1.0, 2.0]]})
    with pytest.raises(EmbeddingUnavailableError):
        embed_texts(["가나다", "라마바"])


def test_차원이_기대와_다르면_실패한다(monkeypatch):
    """모델을 갈아끼운 채 옛 벡터와 섞이면 유사도가 무의미해진다."""
    fake_post(monkeypatch, dim=4)
    with pytest.raises(EmbeddingUnavailableError):
        embed_texts(["가나다"], expected_dim=1024)


def test_기대_차원이_맞으면_통과한다(monkeypatch):
    fake_post(monkeypatch, dim=4)
    assert len(embed_texts(["가나다"], expected_dim=4)[0]) == 4


def test_embed_query는_벡터_하나를_돌려준다(monkeypatch):
    fake_post(monkeypatch, dim=3)
    v = embed_query("청년 창업 지원")
    assert isinstance(v, list) and len(v) == 3


def test_환경변수로_모델과_주소를_바꾼다(monkeypatch):
    calls = []
    fake_post(monkeypatch, calls=calls)
    monkeypatch.setenv("EMBED_MODEL", "다른모델")
    monkeypatch.setenv("EMBED_BASE_URL", "http://gpu-server:11434")

    embed_texts(["가나다"])

    url, payload = calls[0]
    assert url == "http://gpu-server:11434/api/embed"
    assert payload["model"] == "다른모델"


def test_빈_환경변수는_미설정으로_본다(monkeypatch):
    """`EMBED_BASE_URL=`만 남은 .env가 흔하다 — agent/llm.py의 _env와 같은 관행."""
    calls = []
    fake_post(monkeypatch, calls=calls)
    monkeypatch.setenv("EMBED_BASE_URL", "")

    embed_texts(["가나다"])

    assert calls[0][0].startswith("http://localhost:11434")


def test_주소_끝의_슬래시를_먹어도_경로가_깨지지_않는다(monkeypatch):
    calls = []
    fake_post(monkeypatch, calls=calls)
    monkeypatch.setenv("EMBED_BASE_URL", "http://localhost:11434/")

    embed_texts(["가나다"])

    assert calls[0][0] == "http://localhost:11434/api/embed"


def test_blob_왕복이_값을_보존한다():
    vec = [0.5, -0.25, 1.0, 0.0]
    restored = embedder.from_blob(embedder.to_blob(vec))
    assert restored.tolist() == vec
    # float32 × 4개 = 16바이트. 저장 크기가 예상과 다르면 차원 계산이 어긋난다.
    assert len(embedder.to_blob(vec)) == 16


def test_blob은_리틀엔디언_float32로_고정된다():
    """플랫폼 기본 바이트순서에 맡기면 DB를 다른 기계로 옮길 때 조용히 깨진다."""
    import struct

    assert embedder.to_blob([1.0]) == struct.pack("<f", 1.0)


def test_json_payload가_한글을_그대로_담는다(monkeypatch):
    """ensure_ascii로 이스케이프돼도 서버는 읽지만, 로그를 사람이 못 읽는다."""
    seen = {}

    def _post(url, payload, timeout):
        seen["payload"] = payload
        return {"embeddings": [[1.0]]}

    monkeypatch.setattr(embedder, "_http_post", _post)
    embed_texts(["청년 창업"])
    assert seen["payload"]["input"] == ["청년 창업"]
    # 실제 직렬화 단계에서도 한글이 살아 있는지
    assert "청년" in json.dumps(seen["payload"], ensure_ascii=False)
