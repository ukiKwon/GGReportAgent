# data/ 폴더 안내

이 workspace의 모든 작업 스레드에 대한 **비정기 상세 로그**입니다. 채팅 출력은 2줄 요약만 하고, 상세 내용은 이 폴더에 파일로 남기는 규칙에 따라 생성됩니다.

## 현재 섞여 있는 두 스레드
1. **대시보드(report/5-report.html) 관련**: `dashboard-brainstorm.log.md`, `dashboard-plan.log.md`, `dashboard-progress-ledger.md`
2. **25개 자치구 spec/plan 문서 일괄생성 프로젝트**: `jongno-completion.log.md`, `jung-completion.log.md`, `progress-check-*.log.md`, `batch2-failed-paused.log.md` 등

## 파일 컨벤션
- `*.log.md`: 이벤트 1건당 신규 파일 (브레인스토밍 세션, 개별 완료, 진행상황 스냅샷 등)
- `*-ledger.md`: 태스크 1건당 한 줄씩 누적 append되는 단일 파일 (subagent-driven-development 스킬의 progress ledger)

## 용도
사실 확인용 상세 기록입니다 — "이때 어떤 근거로 판단했는지" 나중에 확인할 때 참조합니다. 세션 재개 시 빠르게 훑어보는 용도는 [`handoff/`](../handoff/README.md) 폴더를 참고하세요.
