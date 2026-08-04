from dataclasses import asdict

from fastapi import APIRouter, HTTPException, Query, Request, Response

from agent.retrieval import IndexNotBuiltError, embedder, search

router = APIRouter(prefix="/search", tags=["search"])


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
            response.headers["X-Embed-Model"] = embedder.model_name()
    return [asdict(chunk) for chunk in chunks]
