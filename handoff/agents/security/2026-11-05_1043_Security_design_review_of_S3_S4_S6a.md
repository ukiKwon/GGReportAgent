# Security design review of S3 S4 S6a — security (opus)

> 자동 보존본: 서브에이전트가 메인에 돌려준 최종 보고서를 대화 기록에서 그대로 옮겼다(2026-11-05 10:43 KST, agentId af298ef09306e107e). 에이전트 출력이므로 사용자 결정이 아니다.

---

## NEXT 37 S3·S4·S6a 지시서 설계 보안 검토 (security, 2026-11-05, 읽기 전용)

**판정: 수정 후 적용.** 상-1은 반드시 고쳐야 하고, 나머지는 함께 고치기를 권한다. 코드를 읽기만 했고 실행하지는 않았다.
- 읽은 것: 지시서 전문(1~1040줄), NEXT 37 ⓐ~ⓒ, 설계요약 11-04 보안 반영분, Resolve·Fill·Map·Label·Number·XlsxBook·Pii·BoardWriteService·ExceptionHandler.
- 못 본 것: 이전 security 보고서 본문(11-04 조건은 설계요약 29-34줄로 대신 봤다), BoardFormApiTest, 실제 사본.

**조건 ⓐ~ⓒ (모두 닫힘, 코드 읽기로 확인)**
- ⓐ 지시서 3.2절에서 `mergedIndex`를 try로 감싸 AREA_TOO_LARGE로 돌린다. 원래도 `BoardExcelResolve.java:268`(라벨 열 4개 이하)와 `:271`(행 5,000 이하)이 먼저 막아서 실제로는 도달하지 않는다.
- ⓑ `Area`는 기동 때 `readAreas`(3.1e)에서만 만든다. `onSheet`가 받는 이름은 `resolveSheet`가 고른 지도 쪽 별칭이라 업로드 글자가 들어가지 않는다.
- ⓒ `Ctx`가 구역 id별로 결과를 저장하고, 구역은 8개 이하(`MAX_AREAS`), `Ctx`는 `fill()` 한 번에 하나다. 다만 locate 한 번의 비용은 중-2를 본다.

**업로드 글자 유출 ② (없음, 확인)**
- `lookup_errors`에는 지도 id·기대 경로·후보 수·행 번호만 실린다. SHEET_MISSING의 `sheet`, `parts.sheet`, 격자의 `sheet`도 모두 지도 문자열이다.
- 단위 검사는 코드만 돌려준다. `hasExternalRef`는 참/거짓만 돌려준다.
- 오류 처리기는 고정 문구만 쓰고, 로그는 클래스 이름과 스택만 남긴다(`BoardWriteExceptionHandler.java:74-104`). 새 코드는 로그를 남기지 않는다.

| 심각도 | 위치 | 위험 | 수정안(한 줄) | 확신도 / 판정 |
|---|---|---|---|---|
| 상-1 | 지시서 3.4 `source()` 695줄 `int n = (maxRow-minRow+1)*(maxCol+1)` | int 넘침. 표 B의 detail 구역과 calc 구역이 같은 시트에 있으므로, calc 머리글 '계'를 XFD열(16383)에 두고 두 구역 행을 약 20만 행 떨어뜨리면 n이 음수가 되어 상한 검사를 통과한다. 그러면 `XlsxBook.grid`(`:332-347`)가 약 33억 칸 목록을 만들다 OOM으로 서버가 멈춘다. 업로드 5MB, 칸 20만 한도로도 만들 수 있다. 인증이 자기신고라 사실상 누구나 보낼 수 있다. | `long n = (long)(acc.maxRow-acc.minRow+1)*(acc.maxCol+1);` 로 바꾸고, `acc.maxCol >= XlsxBook.MAX_INDEX_COLS`이면 `omitted:true` | 확인(실행 안 함) / **수정 후 적용** |
| 중-1 | `Pii.java:23` 휴대폰 정규식, `XlsxBook.java:309,323`의 원값 검사, 3.1(d) 시트 전체 범위 | 소수 원값 뒤쪽 숫자에 걸리는 오탐. 예: `0.01012345678`은 '.' 뒤에서 `010-1234-5678`로 잡힌다. 범위가 시트 전체로 넓어져 이전에는 경고였던 것이 업로드 거부(422)가 된다. | `kinds()`에서 원값 b에 '.'이 있으면 정수부만 검사: `b = b.indexOf('.')<0 ? b : b.substring(0, b.indexOf('.'))` | 추정(정규식으로 성립 확인, 실제 빈도는 모름) / 수정 후 적용 |
| 중-2 | `BoardExcelResolve.java:175-182,330-341` | 구역 하나마다 시트 전체 칸을 NFKC로 정규화하고 숫자 칸은 DataFormatter도 돈다. 20만 칸 × 구역 8개라 요청 한 번에 160만 번 이상이다. 동시 처리 슬롯으로 제한되지만 CPU를 오래 쓴다. | `rowMatches`·제목 찾기에서 STRING 셀(문자열 캐시 수식 포함)만 key를 계산하고 숫자 칸은 건너뛴다 | 추정(측정 안 함) / 함께 적용 권장 |
| 하-1 | 3.3 `hasExternalRef` | 공유 수식을 다시 해석하다 StackOverflowError가 날 수 있는데 RuntimeException만 잡는다. 그러면 500이 난다(일반 문구라 유출은 없다). 표 이름 참조(`Table1[열]`)도 '['가 있어 경고가 오탐된다. | `catch (RuntimeException \| StackOverflowError e) { return true; }` | 추정 / 적용해도 됨(같이 수정) |
| 하-2 | 3.4 `source()` 외접 사각형(A열~maxCol) | 격자에 매핑하지 않은 열(5년 J열·라벨 열)과 숨은 행이 들어간다. 지시서 4절의 "응답에 987654321012 없음" 테스트와 11-04 조건 "비고 열 격자 제외"에 어긋난다. 시트 전체가 개인정보 검사 범위라 유출은 아니다. | 사용하지 않는 열 칸은 `""`로 가리거나, 그 테스트 단언을 `tables[].cells`로 좁힌다 | 확인 / 수정 후 적용 |
| 하-3 | 3.1(e) `readAreas`·`named`·`spec` | 지도에 모르는 키가 있어도 그냥 넘어간다. 예: `unit_in_title`을 오타 내면 단위 검사가 조용히 꺼진다. | 구역·줄·칸 규칙마다 허용 키 목록 밖이면 `bad()` | 확인 / 적용해도 됨 |
| 하-4 | 3.5 옛 형식 `sources` | 옛 표 격자(2,000칸 이하)가 `ctx.gridCells` 예산에 들어가지 않아 최악이면 7,000칸이다. | 옛 형식 분기에서 `ctx.gridCells += range.getNumberOfCells()` | 확인 / 적용해도 됨 |

**나머지 점검 항목: 문제 없음(확인)**
- ③ 숫자는 정규식으로 40자리, 30+15자리 이하만 받는다. 부품 4개 이하, 행 10개 이하다. 파생 합계는 eok·paren 칸만 참조할 수 있어 재귀가 없다. 루프는 모두 실제 행·칸 수로 끝난다.
- ④ 지도 검증은 위 하-3 말고는 충분하다(구역·행·열·부품 상한, 칸 키 집합 일치, `mapping_ver<2` 거부).
- ⑤ 매크로·외부 링크 판정은 그대로다. 수식 글자는 응답에 싣지 않는다.
- ⑥ `parts`와 `convert.sum`은 매핑한 칸 값에서 나온 것이고, 시트 전체 개인정보 범위 안이다.

**5-1 질의 답**
- 1: 닫힘(위 ⓐ~ⓒ).
- 2: 시트 전체로 넓히는 것은 허용한다(더 엄격하다). 단 중-1을 함께 고친다.
- 3: 5,000칸은 상-1·하-4를 고치는 조건으로 허용한다(응답 최대 약 1MB).
- 4·6: 허용한다.
- 5: 허용한다. 단 하-1을 고친다.
- 7: 중-2를 본다.

**권장 순서**: 상-1 → 하-2(테스트 실패와 직결) → 중-1·중-2 → 하-1·하-3·하-4. 고친 뒤 샘플 업로드로 PII_DETECTED가 뜨지 않는지 확인한다(지시서 6번).

**이관 메모**
- [이관: 백엔드] 위 표의 수정안 7건을 지시서 3.4·3.3·3.1·3.5에 반영 — 기다리는 것: 메인 적용 — 근거: 위 표.
- [이관: 기획] 하-2: 격자에 매핑 안 한 열·숨은 행까지 보일지 결정(NEXT 35 정보보호 문의 "가려 둔 값도 나간다"에 포함) — 기다리는 것: 기획 결정.

참고 파일:
- C:\Users\superuser\.claude\projects\c--github-GGReportAgent\06d7746f-f3a6-4c40-86fb-53da627e6fd2\tool-results\toolu_01SJqWuXnbpxhwjbyPJWycsL.txt
- C:\github\GGReportAgent\kgi-ggreport-web\src\main\java\com\kbstar\kgi\ggreport\web\docfill\XlsxBook.java
- C:\github\GGReportAgent\kgi-ggreport-web\src\main\java\com\kbstar\kgi\ggreport\web\boarddoc\BoardExcelResolve.java
- C:\github\GGReportAgent\kgi-ggreport-web\src\main\java\com\kbstar\kgi\ggreport\web\support\Pii.java
