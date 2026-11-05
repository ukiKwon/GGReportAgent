# Apply S3 S4 S6a patch with security fixes — backend-dev-write (sonnet)

> 자동 보존본: 서브에이전트가 메인에 돌려준 최종 보고서를 대화 기록에서 그대로 옮겼다(2026-11-05 11:01 KST, agentId a72b946d11ce41ae2). 에이전트 출력이므로 사용자 결정이 아니다.

---

NEXT 37 S3·S4·S6a 적용을 마쳤다. 컴파일과 테스트는 못 돌렸고, 코드를 읽어 점검만 했다.

**① 만든·고친 파일** (모두 `kgi-ggreport-web/` 아래)
- main 수정: `boarddoc/BoardExcelMap`(구역·줄·칸 규칙 파서와 검증), `BoardExcelResolve`(Area 복사본·`hasRow`/`hasCol`, `titleRow`, `mergedIndex` 예외를 `AREA_TOO_LARGE`로, 문자열 셀만 key 계산), `BoardNumber`(`eokValue`/`format`/`eok`), `BoardExcelFill`(새 표 분기, 옛 칸에 균일 키 추가, `assumptions`, `summary.manual`, `omitted`), `docfill/XlsxBook`(`hasExternalRef`, 소수 원값 PII 오탐 방지, 마스킹 격자 `grid` 오버로드), `service/BoardWriteService.excelMap`(`range` null 허용, `kind`).
- main 신규: `boarddoc/BoardExcelNamedFill.java`.
- 지도: `src/main/resources/boarddoc/excel-map.json`을 v2로 교체했다(A·B·C-2·C-3·C-4, `catalog_ver` 1 유지). 단위는 detail·calc·judge 모두 `unit_assumed:false`로 확정 처리했고, 지시서의 '임시 가정' 주석은 "확정 — 사용자 2026-11-05"로 고쳤다.
- test 신규: `src/test/resources/boarddoc/excel-map-legacy.json`(옛 지도 복사), `LegacyBoardMapConfig`, `BoardNamedMapFixture`, `BoardExcelNamedMapTest`, `BoardExcelNamedFillTest`, `BoardProfitSampleTest`.
- test 수정: `BoardExcelFixture`(`LEGACY`, `legacyMap()`), `BoardExcelMapTest`, `BoardExcelFillTest`(옛 형식 균일 키 1건 추가), `BoardWriteServiceTest`, `BoardWriteApiTest`와 `BoardWriteSlotsTest`(`@Import(LegacyBoardMapConfig.class)`).
- security 7건은 모두 반영했다. `NamedFill.source()`는 `long n`과 `maxCol >= MAX_INDEX_COLS` 검사로 바꿨다.

**② 지시서와 달리 판단한 것**
1. 하-2 격자 마스킹: 지도가 읽은 열과 라벨(구분) 열(`labelLimit`) 밖의 열, 읽지 않은 숨은 행은 `""`로 가린다. 이를 위해 `XlsxBook.grid(sheet, range, showCols, usedRows)` 오버로드를 추가했다. 라벨 열 한계는 사용한 구역들의 첫 값 열 중 가장 큰 값이다.
2. 하-3 허용 키: 구역·행·줄·칸 규칙·새 표마다 허용 키 밖이면 기동 실패한다. 지시서 3.1의 `t.has("range")` 등 개별 검사는 새 표의 `onlyKeys(ref, lines)`로 대체했다. 줄 안에서 `cells`와 `cols`/`spec`을 같이 쓰는 것도 거부한다.
3. `ctx.gridCells`를 private에서 package-private으로 바꿨다(`BoardExcelFill` 옛 분기에서 더해야 해서). 옛 형식에 `omitted:false`를 추가했다.
4. `BoardProfitSampleTest`: 바이너리 복사를 못 해서, 샘플을 먼저 테스트 자원 `boarddoc/profit_sample.xlsx`에서 찾고 없으면 `../docs/samples/*가짜값.xlsx`에서 읽는다. 둘 다 없으면 실패한다. 오라클 비교는 지시서 표(고정값 + POI 직접 읽기)대로 짰다.
5. `NamedFillTest`의 `assumptions` 단언은 테스트 지도의 judge만 `unit_assumed:true`로 둔 구성이다. 실제 지도는 모두 확정이라 `assumptions`가 빈 배열이며, `ProfitSampleTest`도 그걸 단언한다.
6. 새 `BoardExcelMap(String)`은 public이다(service 패키지 테스트 때문). 지시서에는 접근자가 없었다.

**③ 불확실한 부분 (컴파일·동작 위험)**
- Jackson 호출: `ObjectNode.deepCopy`, `ArrayNode.removeAll().add`, `ObjectNode.set` 반환형(테스트).
- Spring이 `BoardExcelMap`의 생성자 3개 중 기본 생성자를 고르는지. 그럴 것으로 봤지만 `ApplicationContextSmokeTest`로 확인이 필요하다.
- `setCellFormula("1+1")` 직후 `NO_CACHED_VALUE`가 되는 것(`NamedFillTest`).
- 샘플 바이너리는 못 열었다. 실제 샘플의 PV·IRR 문자열은 오라클이 읽어 비교하고, 손계산 고정값은 지시서 그대로다.
- 샘플 제목 행 `(단위:백만원)`(L열)과 라벨 키 매칭이 의도대로인지는 실행해 봐야 안다. 어긋나면 `UNIT_UNKNOWN` 경고로 `warnings 0` 단언이 깨진다.

**기존 테스트가 깨질 수 있는 곳**
- `/board-forms/excel-map` 응답에 `kind` 키가 추가됐다. 테스트가 `LegacyBoardMapConfig`로 v1 지도를 쓰므로 `mapping_ver` 1과 표 5개 단언은 그대로 통과해야 한다.
- 골든 04·05는 건드리지 않았다. `BoardFormApiTest`와 `BoardDocApiTest`는 업로드 경로를 안 쓰는 것으로 보이는데, 전체 실행에서 확인이 필요하다.

**④ 메인이 돌릴 명령**
1. 바이너리 복사: `copy docs\samples\수익성분석표_샘플_가짜값.xlsx kgi-ggreport-web\src\test\resources\boarddoc\profit_sample.xlsx`
2. `cd C:\github\GGReportAgent\kgi-ggreport-web`, 8080 서버를 멈춘 뒤 아래 순서로 실행한다.
   - `mvn -o test -Dtest="BoardExcelNamedMapTest"` (컴파일 오류가 있으면 여기서 먼저 걸린다)
   - `mvn -o test -Dtest="BoardExcel*Test,BoardLabelTest,BoardNumberTest,BoardProfitSampleTest,BoardExcelNamed*Test,BoardExcelResolveTest"`
   - `mvn -o test` (380건 이상 + 골든)
3. 손으로 확인: 앱을 띄워 샘플을 `POST /board-forms/default_doc/excel`로 올려 200이 오는지 본다(쓰기 호출이라 메인 승인 뒤). `PII_DETECTED`가 뜨면 `cells` 좌표만 본다.

README와 `handoff/NEXT.md`는 고치지 않았다.
