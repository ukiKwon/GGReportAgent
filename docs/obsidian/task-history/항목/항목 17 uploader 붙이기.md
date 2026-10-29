---
tags: [item, open]
원본: NEXT.md
번호: 17
---

> 원본: `handoff/NEXT.md` (파생본)

### 17. `uploader/` 붙이기 — **이관 완료 후로 확정**, 사전 조사는 끝났다 (2026-08-25)

- ⚠️ **[2026-08-28 추가] 붙이기 전에 정해야 할 결정이 하나 있다 — `INSTITUTION` 키 충돌.**
  uploader 의 `INSTITUTION`(`ID` BIGINT 자동증가 + `NAME`)과 본체
  `INSTITUTIONS`(`INSTITUTION_ID` VARCHAR2 문자열키 `dobong` + `NAME_KO`)는
  **같은 개념인데 키 체계가 다르다.**
  - **ⓐ 병존** — uploader 코드를 한 줄도 안 고친다. 대신 기관 목록이 두 벌이 되고,
    한쪽에만 기관을 추가하면 **조용히 갈린다.**
  - **ⓑ 본체 참조** — 진실이 하나가 되고 기관명이 바뀌어도 안 끊긴다. 대신 uploader
    매퍼·서비스를 고쳐야 하고, 업로드 시점에 **기관명 → 문자열키 해석**(실패 처리 포함)이
    새로 필요하다.
  - 관련: `UPLOADED_FILE.INSTITUTION_NAME` 이 **FK 가 아니라 이름 문자열**이라
    기관명이 바뀌면 오류 없이 끊긴다. ⓑ 를 고르면 이것도 함께 해소된다.
- **Oracle DDL 초안은 만들어 뒀다**(2026-08-28, 커밋 `c2fb804`) —
  `kgi-ggreport-web/src/main/resources/db/oracle/007_uploader.sql`. **적용하지 않았다.**
  MySQL→Oracle 변환 4가지(IDENTITY / `VARCHAR2(n CHAR)` / 시각을 ISO 문자열로 /
  `ENGINE`·`CHARSET` 제거)와 11g 폴백이 주석에 있다. 위 [결정 필요] 를 정하기 전에는
  **확정본이 아니다.**
  ⚠️ 종전에 이 항목이 "Oracle DDL 부재"라고만 적혀 있었는데, **원본 DDL 은 있었다** —
  `uploader/database_table 생성query.txt`(확장자가 `.sql` 이 아니라 `.txt` 라 검색에
  안 걸린다). 없는 것은 **Oracle 판**이었다.

- **출처**: `[[2026-08-25|2026-08-25_summary.md]]`. 브랜치 **`weblogic-java-migration`**(main에서 분기).
  *2026-08-26 갱신 — **push됨**(`origin/weblogic-java-migration`). 종전의 "아직 push
  안 됨"은 낡은 기술이다.*
- **무엇이 생겼나**: 사용자가 폐쇄망 밖에서 만들어 온 **파일 업로드/분류 서비스**를
  `uploader/`로 편입했다(커밋 `2e294b3`, 원본 무수정 73파일). Spring Boot 2.7.18 ·
  JDK 1.8 · WebLogic WAR · MyBatis · PDFBox 2.0.29 · POI 5.2.3 — **[[항목 9 WebLogic Java 이관|항목 9]] 이관의
  목표 스택과 정확히 같다.**
- **요구사항(사용자)**: `IT담당자`·`RPA`가 접속하면 **파일 업로드 상태가 화면에
  보이면 좋겠다.** 화면은 uploader의 Thymeleaf가 아니라 **기존 `frontend/` 디자인**
  으로. 붙이는 방식은 **`frontend/`에 새 탭 + uploader API 호출**(사용자 확정 '1안').
- ⛔ **착수 시점: 이관([[항목 9 WebLogic Java 이관|항목 9]]) 완료 후.** 사용자 확정 — 전제가 "Java로 간다"이고
  uploader는 이미 Java다. 이관 전에 붙이면 **버릴 Python 중계 라우터**를 새로 써야
  한다(브라우저에 서비스 토큰을 실을 수 없어 `server/`가 중계할 수밖에 없다).
  이관 후에는 둘 다 같은 WAS 안이라 서버끼리 부르면 끝이다.
- ✅ **사전 조사 완료 — 다시 조사하지 말 것.** 상세는 구현계획
  `docs/superpowers/plans/2026-08-10-weblogic-java-migration.md`의 **단계 6**에 있다.
  요지만 옮기면:
  - **역할 추가 0건.** `server/menus.py`에 `out["전산팀"][ADMIN_MENU] = True`가 이미
    있다 — **IT담당자 = 전산팀 팀원/팀장**으로 존재한다(사용자 확정).
    ⚠️ **역할 체계는 건드리지 말 것**(소속 3그룹은 사용자 확정, 역할은 합쳐진 문자열
    하나로 저장 — 새 소속을 끼우면 알림 수신자·`role_menus` 키가 갈라진다).
  - **`RPA`는 역할 목록에 넣지 않는다.** `roles.ALL`은 결재 라인·알림 수신자의
    근거라 프로그램이 섞이면 "RPA의 결재자"가 생긴다. RPA는 올리는 쪽이다.
  - **탭 추가는 6곳**(`menus.py` / `menu_rules.js` / `index.html` / `app.js` /
    신규 `uploads.js` / 테스트). **권한관리 화면은 자동으로 따라온다**(`admin.js`가
    `GET /menus` 목록을 그대로 그린다).
  - ⚠️ **함정**: 탭 key ≠ section id인 전례가 있다(`tasks` 키 ↔ `tab-designer`).
    새 탭은 키와 id를 같게 할 것.
- **미해결 2건 (사용자 확인 필요)**:
  1. **`UPLOADED_FILE`에 업로드 주체 컬럼이 없다** — 사람이 올린 것과 RPA가 올린
     것을 화면에서 구분할 수 없다. 구분이 필요하면 컬럼 추가가 선행된다.
  2. **`GET /api/files/search`가 목록용으로 무겁다** — 결과마다 파일 본문 전체
     텍스트를 담고(PDF를 전부 파싱) 페이징이 없다. **문의 6-2(API 표준 규격) 회신
     때 함께 정리**하기로 했다.
- **비차단**: 항목 9가 먼저다.
