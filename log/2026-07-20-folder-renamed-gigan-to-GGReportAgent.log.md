# 폴더명 변경 — 2026-07-20

사용자 지시로 프로젝트 최상위 폴더를 gigan → GGReportAgent로 변경.

## 실행 방식 (판단 필요 사항)
직접 rename/move가 계속 "Device or resource busy"로 실패함 - 이 세션의 Bash/PowerShell
도구 자체의 작업 디렉터리가 gigan에 고정(pinned)되어 있어 매 호출마다 그리로 cwd가
자동 복귀되고, 그 결과 OS 핸들이 계속 열려있어 rename이 불가능한 구조적 제약으로 확인됨.

대안으로 robocopy `/E /COPY:DAT`를 사용해 gigan의 전체 내용(66개 디렉터리, 306개
파일, 2.08MB)을 GGReportAgent로 100% 복사 완료(Failed 0, Mismatch 0).

**기존 gigan 폴더는 삭제하지 못하고 그대로 남아있음** (동일한 cwd 고정 문제로 삭제도
불가). 세션 종료 후 사용자가 직접 삭제하거나, 새 세션을 GGReportAgent 기준으로 시작하면
gigan에 대한 핸들이 풀려 삭제 가능할 것으로 예상됨.

## 이후 작업 반영
- 앞으로 모든 신규 data/handoff 로그, spec/plan 산출물은 GGReportAgent/ 하위 경로 사용.
- 메모리 파일 3건(handoff-append-every-3-tasks, spec-vs-plan-fabrication-rule,
  terse-output-with-data-logs)의 경로 참조를 GGReportAgent로 업데이트함.
- 진행중이던 리서치 작업(완료 6/20, 대기 14/20 상태)은 그대로 유지 - 폴더명 변경은
  경로만 바뀐 것이며 작업 진행상황에는 영향 없음.
