---
tags: [item, open]
원본: NEXT.md
번호: 18
---

> 원본: `handoff/NEXT.md` (파생본)

### 18-B. uploader 내부망 반입 — **준비 완료, 실제 반입·기동은 미수행** (2026-08-31)

> 🔄 **2026-10-21 상태 갱신(브랜치 통합 머지 때)**: 아래 준비물로 **2026-09-07에 내부망 기동이
> 성공했다** — 이후 진행은 **[[항목 25 uploader 내부망 WebLogic 기동 검증|항목 25]]**가 이어받는다(질문 1은 해소, 질문 2는 25-②).
> **질문 3(`GET /api/files/search` Oracle 실기 빈 배열 여부)만 미확인**이라 이 항목을 남긴다.

- **출처**: `[[2026-08-31|2026-08-31_summary.md]]` `## Session 11:21` 및 그 아래 오후 절.
- **무엇이 준비됐나** — 사용자가 내부망(Eclipse + WebLogic 12c)에서 **소스를 고칠
  수도 있다**고 해서, WAR 배포와 Eclipse 편집 **둘 다** 가능하게 만들어 뒀다.
  산출물은 사용자 **바탕화면**에 있다(리포에는 없다 — `dist/`는 gitignore):
  - `uploader-wtp.zip` (43.7MB) — Eclipse WTP 프로젝트. Import 하면 바로 열린다
  - `uploader-1.0.0.war` (52.2MB) — 소스를 안 고칠 때는 이것만으로 배포된다
  - `uploader-config-prod\application.properties` — `config/`에 놓을 설정
  - `uploader_반입_체크리스트.pdf` — `uploader/DEPLOY.md`의 PDF
- **재생성 방법**(바탕화면 파일이 없어졌을 때):
  `cd uploader && mvn -o clean package` → `py -3 uploader/tools/export_wtp.py`
  → `py -3 docs/tools/md2pdf.py uploader/DEPLOY.md <출력.pdf>`
- ⚠️ **정본은 리포의 Maven 프로젝트다.** WTP 폴더는 파생물이고, 내부망에서 고친
  것은 `uploader/tools/import_wtp.py <폴더>` → `--apply` → **`mvn -o clean test`**
  로 되돌린다. 내보내기 직후 왕복을 미리보기로 돌려 **59개 파일 전부 동일**함을
  확인했다(경로 대응 무손실).
- **다음 세션이 물어볼 것 3가지** — 내부망에서 진행했다면:
  1. Eclipse Targeted Runtime(WebLogic 12c)을 잡았는가 → 안 잡으면 컴파일 오류다
     (서블릿 API를 일부러 `WEB-INF/lib`에서 뺐다 — 넣으면 배포가 깨진다)
  2. **TimerManager JNDI가 잡혔는가** — 기동 로그의
     `반복 작업 실행: CommonJ TimerManager (...)`. `로컬 스케줄러로 돈다` WARN이면
     `DEPLOY.md` 3번의 A→B→C. **C(=`weblogic.xml` 매핑 추가)까지 가면 외부망에서
     재빌드해야 하므로 콘솔의 실제 JNDI 이름과 오류 메시지를 받아 올 것.**
  3. **`GET /api/files/search`가 빈 배열인가** — Oracle의 빈문자열↔NULL 처리.
     고쳤지만(`IS NULL`) Oracle 실기에서 처음 검증되는 자리다.

