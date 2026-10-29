---
tags: [item, done]
원본: done.md
번호: 18
---

> 원본: `handoff/done.md` (파생본)

### 18. ~~uploader — README §13-①(내부망 설정 누락 + Oracle DDL 부재)~~ — **완료** (2026-09-08)

- ✅ **2026-09-08 해소.** `git checkout main -- uploader/` 로 `main`의 uploader 를
  브랜치 `weblogic-java-migration` 에 가져오면서 두 항목이 함께 사라졌다
  (26파일 · 2200줄 추가 / 60줄 삭제, `mvn -o clean test` **62건 통과**).
  - **Oracle DDL** — `schema-oracle.sql` 이 들어왔다(테이블 2 + 시퀀스 2).
    Mapper 도 주석이 아니라 `databaseId` **방언 분기**로 바뀌었다(`43dc186`).
  - **`mybatis.*` 누락** — `config-envs` 의 `dev`/`stg`/`prod` 에 3줄이 모두 들어왔다.
  - ⚠️ 함께 있던 경고(`ReclassificationJob` 이 `@Scheduled` 로 자기 스레드를 만든다)도
    해소됐다 — `TimerManagerScheduler`/`LocalScheduler`/`ReclassificationTrigger` 로
    교체돼 CommonJ 경로가 들어와 있다. **다만 운영에서 켜는 것은 항목 25-② 로 남아 있다.**
  - 출처: `[[2026-09-08|2026-09-08_summary.md]]` `## Session 08:55`. 앞선 진단은
    `[[2026-09-07|2026-09-07_summary.md]]` `## Session 18:32`.
- **원 출처**: `[[2026-08-26|2026-08-26_summary.md]]` `## Session 13:00`. 브랜치 `weblogic-java-migration`.
- **무엇이 남았나** — `uploader/README.md` §13의 마지막 열린 항목이다(②③은 해소됨):
  - `config-envs/`의 **`dev`/`stg`/`prod`에 `mybatis.*` 설정이 없다**
    (`mapper-locations`·`type-aliases-package`·`map-underscore-to-camel-case`).
    `local`·`out-local`에만 있다. 내부망 배포 시 Mapper 미탐색 가능성.
    **의도된 것인지 사용자에게 확인이 필요하다** — 내부망에서 별도 방식으로 주입한다면
    그대로 두면 된다.
  - **uploader에 Oracle DDL이 없다** — `schema-mysql.sql` 한 벌뿐이다.
    `kgi-ggreport-web`은 2벌을 갖췄으므로 같은 방식으로 만들면 된다
    (`kgi-ggreport-web/src/main/resources/db/README.md`의 타입 대응표를 그대로 쓸 것).
- **비차단**: uploader를 내부망에 올릴 때 필요하다 — **[[항목 17 uploader 붙이기|항목 17]](단계 6)이 먼저다.**
- ⚠️ **함께 볼 것**: `ReclassificationJob`이 Spring `@Scheduled`로 **자기 스레드를
  만든다.** WAS 배포 표준에 어긋나므로(설계 §2·§4) 내부망에 올리기 전에 CommonJ
  WorkManager 경로로 옮기거나 꺼야 한다. `uploader/README.md` §10에 경고로 적어 뒀다.
