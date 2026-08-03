"""데모(화면 확인용) 전용 경로 — 개발/운영 자료와 파일 자체를 분리한다.

같은 DB에 데모를 섞으면 지우기가 어렵다. 실제로 `demo_seed --clear`가
`institutions.stage`를 되돌리지 못하는 문제가 있었다(그 행은 `demo-` 접두사가 아니라
실제 기관 행이기 때문). 파일을 나누면 **지우기가 파일 삭제 한 번**이 되고, 데모가
운영 자료를 건드릴 수 있는 경로 자체가 없어진다.

| | 개발/운영 | 데모 |
|---|---|---|
| DB | `data/registry.db` | `data/demo.db` |
| 산출물 | `data/report_new/` | `data/demo_report_new/` |
| 그래프 체크포인트 | `data/graph_checkpoints.db` | `data/demo_graph.db` |
| 아카이브 | `data/report_archive/` | `data/demo_report_archive/` |

`data/`는 통째로 gitignore 대상이라 어느 쪽도 커밋되지 않는다.
"""

DEMO_DB_PATH = "data/demo.db"
DEMO_OUTPUT_ROOT = "data/demo_report_new"
DEMO_GRAPH_DB_PATH = "data/demo_graph.db"
DEMO_ARCHIVE_ROOT = "data/demo_report_archive"

# --reset이 지우는 것 전부. 파일/디렉터리를 섞어 담는다.
DEMO_ARTIFACTS = (DEMO_DB_PATH, DEMO_OUTPUT_ROOT, DEMO_GRAPH_DB_PATH, DEMO_ARCHIVE_ROOT)
