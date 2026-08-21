"""산출물 경로 기본값 — **값이 두 벌이 되지 않게** 한 곳에 둔다.

M-1(NEXT.md 항목 1)의 해소 자리다. 아카이브 뿌리가 `server/main.py`에서는
`data/report_archive`, `server/orchestrator_service.py`와 `agent/pipeline.py`
에서는 접두사 없는 `report_archive`로 갈라져 있었다. 지금까지 무해했던 이유는
server가 늘 `app.state.archive_root`를 명시로 넘겼기 때문인데, 그 배선이 하나만
빠져도 **찾는 쪽이 빈 폴더를 보게 된다**(예외도 안 난다 — 조용히 "이전 제안서
없음"이 된다).

`agent`는 `server`를 import하지 않는다(ports.py의 분리 관행). 그래서 정본을
`agent` 쪽에 두고 server가 가져다 쓴다 — 반대 방향은 그 관행을 깬다.
"""

from __future__ import annotations

# 완료 산출물 아카이브. 실제 배치는 `{여기}/{기관명}/{날짜}/…`로 두 단계 더 들어간다
# (`server/archive.py:archive_institution`) — 찾는 쪽이 재귀로 훑어야 하는 이유다.
DEFAULT_ARCHIVE_ROOT = "data/report_archive"
