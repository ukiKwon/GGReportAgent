"""원문 열람 — 지식 탭이 검색 결과의 **파일 전체**를 보여주기 위한 창구.

검색은 200자 스니펫만 준다. 그런데 지식 탭의 목적은 "제안서에 인용할 근거를 눈으로
확인하는 것"이라, 출처 경로(`corpus/institutions/jongno/plan/03…#2`)만 알고 열 수 없으면
반쪽이다.

**경로 탈출을 반드시 막는다.** 클라이언트가 준 문자열로 파일을 읽는 엔드포인트라,
가드가 없으면 `../../` 하나로 리포 바깥(설정 파일·키)이 읽힌다. 두 겹으로 막는다:
① 첫 조각이 **허용된 루트 이름**이어야 하고, ② 최종 절대경로가 그 루트 **안쪽**이어야
한다(`backend/archive.py`의 M-4 가드와 같은 방식).

본문 추출은 색인기와 **같은 파서**(`agent.retrieval.parsers.parse_file`)를 쓴다. 그래야
검색에 걸린 그 텍스트를 그대로 보게 되고, `.pptx`·`.json` 산출물도 열린다.
"""

from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException, Query, Request

from agent.retrieval.indexer import DEFAULT_CORPUS_ROOT
from agent.retrieval.parsers import parse_file
from pathlib import Path

router = APIRouter(prefix="/documents", tags=["documents"])

# 아주 큰 파일을 통째로 실어 보내면 브라우저가 멈춘다. 잘랐다는 사실은 응답에 알린다.
MAX_CHARS = 200_000


def allowed_roots(request: Request) -> dict[str, str]:
    """{저장 경로의 첫 조각: 실제 디렉터리}.

    색인기가 청크 경로를 `{루트 폴더명}/{상대경로}`로 저장하므로(indexer.index_file),
    되짚을 때도 폴더명이 열쇠가 된다. 데모는 아카이브 루트가
    `data/demo_report_archive`라 첫 조각이 `demo_report_archive`가 된다 — 그래서
    상수로 박지 않고 실제 설정에서 만든다.
    """
    corpus_root = getattr(request.app.state, "corpus_root", DEFAULT_CORPUS_ROOT)
    archive_root = request.app.state.archive_root
    return {
        os.path.basename(os.path.normpath(corpus_root)): corpus_root,
        os.path.basename(os.path.normpath(archive_root)): archive_root,
    }


def resolve(stored_path: str, roots: dict[str, str]) -> str:
    """저장 경로 → 실제 파일의 절대경로. 벗어나면 ValueError."""
    parts = stored_path.replace("\\", "/").split("/")
    if len(parts) < 2 or parts[0] not in roots:
        raise ValueError(f"열람이 허용되지 않은 위치입니다: {stored_path}")

    root_dir = os.path.abspath(roots[parts[0]])
    target = os.path.abspath(os.path.join(root_dir, *parts[1:]))
    # `..`가 섞이면 join 뒤에도 형태는 멀쩡해 보인다 — 절대경로로 편 다음 비교해야 한다.
    if os.path.commonpath([root_dir, target]) != root_dir:
        raise ValueError(f"열람이 허용되지 않은 위치입니다: {stored_path}")
    return target


@router.get("")
def get_document(request: Request, path: str = Query(..., min_length=1)) -> dict:
    try:
        target = resolve(path, allowed_roots(request))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not os.path.isfile(target):
        raise HTTPException(status_code=404, detail=f"파일이 없습니다: {path}")

    text = parse_file(Path(target))
    if text is None:
        raise HTTPException(
            status_code=415,
            detail=f"이 형식은 본문을 읽을 수 없습니다: {os.path.basename(target)}",
        )

    truncated = len(text) > MAX_CHARS
    return {
        "path": path,
        "filename": os.path.basename(target),
        "text": text[:MAX_CHARS],
        "truncated": truncated,
        "chars": len(text),
    }
