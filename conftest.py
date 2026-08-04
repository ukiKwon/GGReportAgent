"""테스트가 리포의 **실제 데이터 파일**을 건드리지 않는지 감시한다.

계획 F에서 `POST /institutions/{id}/complete`가 백그라운드 재색인을 걸게 되면서,
`create_app(...)`에 `index_db_path`를 안 넘긴 테스트가 **개발자의 실제 검색 인덱스**
(`data/corpus_index.db`)에 테스트 산출물을 써 넣는 일이 실제로 벌어졌다.

`tmp_path`를 쓰라는 관행만으로는 못 막는다 — 빠뜨린 인자는 조용히 **기본값=운영 경로**가
되고, 그 파일이 없는 CI에서는 아무 일도 안 일어나 눈에 띄지도 않는다(있는 개발 PC에서만
오염된다). 그래서 파일 자체를 감시한다.

**리포 루트에 두는 이유**: `backend/tests/`에 두면 그 디렉터리의 테스트가 시작될 때에야
스냅샷을 찍어서, 그 전에 도는 `agent/tests/`가 오염시키면 못 잡는다(`build_index`·
`reindex`도 기본 인자가 운영 경로다). 루트 conftest여야 세션 맨 앞에서 찍는다.
"""

import os

import pytest

# 테스트가 절대 바꾸면 안 되는 실제 데이터 파일들.
GUARDED = ("data/corpus_index.db", "data/registry.db", "data/report_archive")


def _fingerprint(path: str):
    try:
        stat = os.stat(path)
    except OSError:
        return None
    return (stat.st_mtime_ns, stat.st_size)


@pytest.fixture(scope="session", autouse=True)
def 실제_데이터_파일_변경_감시():
    before = {path: _fingerprint(path) for path in GUARDED}
    yield
    changed = [p for p in GUARDED if _fingerprint(p) != before[p]]
    if changed:
        pytest.fail(
            "테스트가 리포의 실제 데이터 파일을 변경했습니다: "
            + ", ".join(changed)
            + " — create_app()에 db_path·index_db_path·archive_root 등을 tmp_path로"
            " 넘겼는지 확인하세요(빠뜨리면 조용히 기본값=운영 경로가 됩니다)."
        )
