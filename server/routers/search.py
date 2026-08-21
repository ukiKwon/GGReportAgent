from dataclasses import asdict

from fastapi import APIRouter, HTTPException, Query, Request, Response

from agent.retrieval import IndexNotBuiltError, embedder, search

router = APIRouter(prefix="/search", tags=["search"])


def _header_safe(value: str) -> str:
    """HTTP 헤더 값으로 쓸 수 있게 latin-1 밖 문자를 걷어낸다.

    `EMBED_MODEL`은 환경변수라 무엇이든 들어올 수 있는데, 한글이 섞이면 응답을
    내보내는 단계에서 인코딩 에러가 나 **검색 자체가 500으로 죽는다**. 모델명은
    부가 표시일 뿐이므로, 표시를 포기할지언정 검색을 죽이지 않는다.
    """
    try:
        value.encode("latin-1")
        return value
    except UnicodeEncodeError:
        stripped = value.encode("latin-1", "ignore").decode("latin-1").strip()
        return stripped or "?"     # 전부 걸러졌으면 최소한 "값은 있었다"는 표시만


@router.get("")
def get_search(
    request: Request,
    response: Response,
    q: str = Query(..., min_length=1),
    institution_id: str | None = None,
    doctype: list[str] | None = Query(default=None),
    filename_prefix: str | None = None,
    limit: int = Query(default=8, ge=1, le=50),
) -> list[dict]:
    try:
        chunks = search(
            q,
            institution_id=institution_id,
            doctypes=doctype,
            filename_prefix=filename_prefix,
            limit=limit,
            db_path=request.app.state.index_db_path,
        )
    except IndexNotBuiltError:
        raise HTTPException(
            status_code=503,
            detail="검색 인덱스가 없습니다 — 'py -3.14 -m agent.retrieval build'로 생성하세요",
        )
    # 응답 배열 형태는 바꾸지 않는다 — 프런트·기존 테스트가 배열을 전제로 쓰여 있다.
    # 검색 모드·임베딩 모델명은 대신 헤더로 싣는다(Task 4). 결과가 비면 chunks[0]이
    # 없어 모드를 판단할 근거가 없으므로 헤더 자체를 생략한다.
    if chunks:
        mode = chunks[0].score_kind
        response.headers["X-Search-Mode"] = mode
        if mode == "rrf":
            response.headers["X-Embed-Model"] = _header_safe(embedder.model_name())
    return [asdict(chunk) for chunk in chunks]
