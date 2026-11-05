# Design S3 S4 map v2 patch — backend-dev (sonnet)

> 자동 보존본: 서브에이전트가 메인에 돌려준 최종 보고서를 대화 기록에서 그대로 옮겼다(2026-11-05 10:38 KST, agentId ace47312b3c21019a). 에이전트 출력이므로 사용자 결정이 아니다.

---

<persisted-output>
Output too large (51.9KB). Full output saved to: C:\Users\superuser\.claude\projects\c--github-GGReportAgent\06d7746f-f3a6-4c40-86fb-53da627e6fd2\tool-results\toolu_01SJqWuXnbpxhwjbyPJWycsL.txt

Preview (first 2KB):
# NEXT 37 S3·S4·S6a 패치안 지시서 (backend-dev, 2026-11-05)

backend-dev가 작성한 지시서이고 적용은 메인이 한다. 코드를 직접 컴파일하거나 실행하지는 못했다. 아래 코드는 JDK 8 기준으로 쓴 안이라, 첫 `mvn -o test`에서 컴파일 오류가 나면 그것부터 잡아야 한다.

## 1. 대상·방법·못 본 것
- 읽은 것: 설계 요약, 확정 매핑표, `BoardExcelMap`·`BoardExcelFill`·`BoardExcelResolve`·`BoardLabel`·`BoardNumber`·`XlsxBook`·`BoardWriteService`, 관련 테스트, 샘플 생성기 `GenProfitSample.java.txt`.
- 못 본 것:
  - 샘플 xlsx 바이너리는 열지 못했다. 기대값은 생성기 소스를 손으로 계산했다. 명목가치는 정확하고, 현재가치(PV)·NPV·IRR은 근사다.
  - `BoardFormApiTest`와 `BoardDocSpec`의 나머지 부분.
  - 실제 사본의 시트 이름과 라벨.
- 순서: 이 문서는 S3 → S4 → S6a 순서이고 카탈로그(S5)는 건드리지 않는다. `catalog_ver`는 1로 유지한다.

## 2. 원인
- 지금 `excel-map.json`은 시트 '기부금' 등과 A1 주소를 요구한다(`excel-map.json:5-23`, `BoardExcelMap.java:69-126`). 실제 구조에서 시트가 없으면 `BoardExcelFill.structure`(`:36-52`)가 SHEET_MISSING으로 422를 낸다.
- S1(`BoardLabel`·`BoardNumber`)과 S2(`BoardExcelResolve`)는 아직 어디에도 연결되어 있지 않다.

## 구현 요약 (40줄 이내)
1. **지도 형식**
   - `mapping_ver` 2에 `areas`(구역)와 표별 `lines`를 새로 둔다.
   - 한 파일 안에서 표 단위로 옛 형식(`range`+`labels`+A1)과 새 형식(`lines`)이 공존한다. 옛 형식은 계속 읽는다.
   - 새 표는 `range`가 없다(`getRange()==null`).
2. **지도 검증 (S3, 어기면 기동 실패)**
   - 구역은 8개 이하, 구역별 열 10개 이하·행 60개 이하.
   - 칸 키는 카탈로그 매핑 칸 집합과 정확히 일치해야 한다.
   - 그 밖에 연산·구역·행·열 참조, 단위, 파생 칸을 검증한다(상세는 아래 3.1).
3. **칸 규칙**
   - 칸 규칙(`op`)은 `manual`, `plain`, `eok`, `paren`, `derive_sum` 다섯 가지다.
   - `eok`는 부품을 먼저 합산하고 ÷100을 한 번만 한다(둘째 자리 HALF_UP).
   - `paren`은 "5.00 (1.00)" 형태이며 값 두 개를 따로 내려 준다(`main_value`, `sub_value`).
   - `derive_sum`은 A 합계다. 억원 표시값(둘째 자리)을 합산한다.
4. **보안 재점검 ⓐ~ⓒ 반영**
   - ⓐ `mergedIndex`의 IllegalArgumentException은 `AREA_TOO_LARGE`로 바꾼다.
   - ⓑ `Area` 정의는 서버 지도에서만 온다.
   - ⓒ 요청 한 번에 구역당 `locate`는 1회(메모)이고 구역은 8개 이하다.
5. **빈 원본 칸**
   - 부품이 비었거나 오류면 `failed`(`PART_EMPTY`, `NO_CACHED_VALUE`, `EXCEL_ERROR`, `NOT_NUMERIC`)로 둔다. 0으로 치지 않는다.
   - 구역·행을 못 찾으면 그 칸만 failed다. `reason`은 `AREA_*`/`ROW_*`/`COL_*`이고 업로드 글자는 싣지 않는다.
6. **단위**
   - 구역에 `unit`(백만원)을 지도에 선언한다.
...
</persisted-output>
