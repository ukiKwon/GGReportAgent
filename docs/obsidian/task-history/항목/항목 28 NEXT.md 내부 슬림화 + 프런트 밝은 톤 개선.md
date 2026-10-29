---
tags: [item, open]
원본: NEXT.md
번호: 28
---

> 원본: `handoff/NEXT.md` (파생본)

### 28. NEXT.md 내부 슬림화 + 프런트 밝은 톤 개선 — **미착수** (2026-10-29)

- **출처**: `[[2026-10-29|2026-10-29_summary.md]]` `## Session 10:22`. 브랜치 `websphere-migration`(main 병합 후, 2026-10-29).
- **NEXT.md 슬림화**: 완료분 15개 섹션은 `done.md`로 옮겼다(1,633→1,022줄). 그래도 93KB라
  시작 훅 주입 한도를 넘는다. 다음은 항목 **#5(gpt-oss)·#9(WebLogic)** 안에 섞인 완료 하위 내용을
  `done.md`로 보내고, #20(조치 완료·이력만 남음) 이동 여부를 정한다. 사용자 승인 후 진행.
- **프런트 개선**: `kgi-ggreport-web/`은 Java 백엔드라 화면이 없다. 대상은 `frontend/index.html`
  (다크·고밀도 — `.impeccable/config.json`·`design.json`이 의도된 디자인으로 등록). 밝은 톤·여백·
  글자 14~16px로 바꾸면 그 규칙 파일도 같이 갱신. 순서: impeccable 읽기 전용 진단 → frontend-design
  시안(새 파일) → playwright 확인. 원본은 시안 승인 전까지 건드리지 않는다.
- 번호 정리: main에서 26번으로 만든 이 항목을 이 브랜치의 26(화면 개편)·27(시스템 관리)과 겹치지 않게 **28**로 옮겼다. NEXT.md 충돌은 병합 시 해소했다(이 브랜치 본문 기준 + 완료분 done.md 분리 재적용).
