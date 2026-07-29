from dataclasses import asdict

from fastapi import APIRouter, HTTPException, Query, Request

from agent.retrieval import IndexNotBuiltError, search

router = APIRouter(prefix="/search", tags=["search"])


@router.get("")
def get_search(
    request: Request,
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
    return [asdict(chunk) for chunk in chunks]
