"""임베딩 클라이언트 — 하이브리드 검색에서 '뜻이 가까운가'를 재는 쪽(계획 F).

FTS(trigram)는 **글자가 겹칠 때만** 찾는다. `"청년 자립 지원"` 으로는
`"청년 창업 자금 융자"` 를 영영 못 찾는다 — 3-gram이 하나도 안 겹치기 때문이다.
그 절반을 메우는 것이 이 모듈이다.

**의존성을 늘리지 않는다.** HTTP는 stdlib `urllib`로 충분하다. `agent/llm.py`가 쓰는
langchain은 채팅 모델용이고, 임베딩 한 종류 때문에 그쪽을 끌어올 이유가 없다.

**엔드포인트가 없는 것은 오류가 아니다.** 폐쇄망에는 임베딩 모델이 안 올라가 있을 수
있다. 그때는 `EmbeddingUnavailableError`를 올리고, 호출부가 FTS 단독으로 폴백한다
(`agent/retrieval/search.py` 참조). 검색 기능 자체가 죽으면 안 된다.

테스트는 `_http_post`를 monkeypatch해서 Ollama 없이 돈다 — 실호출은 CPU에서 질의
1건에 약 1.2초라, 테스트에 넣으면 CI가 못 쓰게 된다.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from collections.abc import Sequence

import numpy as np

DEFAULT_MODEL = "bge-m3"
DEFAULT_BASE_URL = "http://localhost:11434"
# 실측(이 PC, CPU): 단건 2.27초/청크, 배치 8 → 1.24초/청크, 배치 32 → 1.60초/청크.
# 무작정 크게 묶는다고 빨라지지 않는다. 8이 바닥이다.
DEFAULT_BATCH_SIZE = 8
# CPU 추론은 느리다. 배치 8이 10초쯤 걸리므로 넉넉히 잡되 무한대는 두지 않는다.
TIMEOUT_SEC = 300


class EmbeddingUnavailableError(Exception):
    """임베딩을 얻지 못했다 — 호출부가 FTS 단독 폴백을 결정한다."""


def _env(name: str, default: str) -> str:
    """빈 문자열도 미설정으로 본다 — `EMBED_BASE_URL=`만 남은 .env가 흔하다."""
    return os.environ.get(name) or default


def model_name() -> str:
    return _env("EMBED_MODEL", DEFAULT_MODEL)


def base_url() -> str:
    return _env("EMBED_BASE_URL", DEFAULT_BASE_URL).rstrip("/")


def _http_post(url: str, payload: dict, timeout: int) -> dict:
    """이 함수가 유일한 네트워크 경계다 — 테스트는 여기만 갈아끼운다."""
    request = urllib.request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def embed_texts(
    texts: Sequence[str],
    *,
    batch_size: int = DEFAULT_BATCH_SIZE,
    expected_dim: int | None = None,
) -> list[list[float]]:
    """여러 텍스트를 임베딩한다. **입력 순서를 그대로 유지**해 돌려준다.

    순서가 어긋나면 청크와 벡터의 짝이 틀어지는데, 그건 예외 없이 조용히 잘못된
    검색 결과로만 드러난다 — 그래서 개수 검사를 배치마다 한다.

    `expected_dim`을 주면 차원이 다를 때 즉시 실패한다. 모델을 갈아끼운 채 옛 벡터와
    섞이면 유사도가 무의미해지는데, 이것도 눈에 보이지 않는 종류의 고장이다.
    """
    if not texts:
        return []

    url = f"{base_url()}/api/embed"
    model = model_name()
    out: list[list[float]] = []

    for start in range(0, len(texts), batch_size):
        batch = list(texts[start : start + batch_size])
        payload = {"model": model, "input": batch}
        try:
            data = _http_post(url, payload, TIMEOUT_SEC)
        except urllib.error.HTTPError as exc:
            raise EmbeddingUnavailableError(
                f"임베딩 요청 실패({exc.code}) — 모델 '{model}'이 {url}에 없을 수 있습니다."
                f" 'ollama pull {model}'로 받으세요."
            ) from exc
        except (urllib.error.URLError, OSError) as exc:
            raise EmbeddingUnavailableError(
                f"임베딩 엔드포인트에 닿지 못했습니다: {url} ({exc})"
            ) from exc
        except json.JSONDecodeError as exc:
            raise EmbeddingUnavailableError(f"임베딩 응답이 JSON이 아닙니다: {url}") from exc

        vectors = data.get("embeddings")
        if not isinstance(vectors, list):
            detail = data.get("error", data)
            raise EmbeddingUnavailableError(f"임베딩 응답에 embeddings가 없습니다: {detail}")
        if len(vectors) != len(batch):
            raise EmbeddingUnavailableError(
                f"임베딩 개수가 맞지 않습니다: 요청 {len(batch)}건, 응답 {len(vectors)}건"
            )
        for vector in vectors:
            if expected_dim is not None and len(vector) != expected_dim:
                raise EmbeddingUnavailableError(
                    f"임베딩 차원이 다릅니다: 기대 {expected_dim}, 실제 {len(vector)}"
                    f" — 인덱스를 만든 모델과 지금 모델('{model}')이 다릅니다."
                )
            out.append([float(x) for x in vector])

    return out


def embed_query(text: str, *, expected_dim: int | None = None) -> list[float]:
    """질의 1건. 실측 약 1.2초(CPU) — GPU 엔드포인트면 20ms급이다."""
    vectors = embed_texts([text], expected_dim=expected_dim)
    if not vectors:
        raise EmbeddingUnavailableError("질의 임베딩이 비었습니다")
    return vectors[0]


def to_blob(vector: Sequence[float]) -> bytes:
    """벡터 → BLOB. **리틀엔디언 float32 고정**.

    플랫폼 기본 바이트순서에 맡기면 DB 파일을 다른 기계로 옮겼을 때 값이 조용히
    뒤집힌다. float64는 정확도가 남아돌고 파일이 2배가 된다.
    """
    return np.asarray(vector, dtype="<f4").tobytes()


def from_blob(blob: bytes) -> np.ndarray:
    return np.frombuffer(blob, dtype="<f4")
