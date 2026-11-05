# Patch design for default-doc cell keys — backend-dev (sonnet)

> 자동 보존본: 서브에이전트가 메인에 돌려준 최종 보고서를 대화 기록에서 그대로 옮겼다(2026-11-05 10:08 KST, agentId a9c2bcb8c0bd0a349). 에이전트 출력이므로 사용자 결정이 아니다.

---

## NEXT 45 P1 패치안 (backend-dev, 읽기 전용 작성, 미적용)

### 1. 대상·방법·못 본 것
BoardDocSpec(Cell/Table/cellKey), BoardDocController, BoardFormService.view(394~442), BoardDocApiTest·BoardDocSpecTest, board-write.js 741~776(key 사용처), board.js 241~250을 읽었다. 서버·프런트 테스트는 실행하지 못했다. frontend/test 5개 파일의 key 픽스처는 건수만 확인했고 내용은 읽지 않았다.

### 2. 원인과 결정
- 원인: /board-docs/{id}는 컨트롤러가 `BoardDocSpec.Doc`을 Jackson으로 그대로 직렬화한다(BoardDocController.java:55). `Cell`에는 getText·getColspan·getRowspan·isHeader·isMapped·getAlign만 있고 key가 없다(BoardDocSpec.java:56~61). 복제 양식(/board-forms)만 BoardFormService.java:424에서 `cellKey(r,i)`를 붙인다. 그래서 board-write.js:762의 `str(o.key)`가 ''이 되고 `has(t.cells, key)`가 거짓이라 값 칸이 `staticCellHtml`로 빠진다.
- 결정은 서버 권장이다. `cellKey`가 이미 서버에서 BoardExcelMap(88·190)·BoardFormJson·editableKeys·build·withValues 6곳에 쓰이고, 엑셀 매핑의 key_row·seq가 이 규칙에 묶여 있다. 프런트가 병합 순번을 따로 계산하면 규칙이 두 군데로 갈라진다.
- 방식은 `Cell`에 key 필드를 두고 `Table` 생성자가 `cellKey(행, 순번)`으로 일괄 부여하는 것이다. Table을 만드는 모든 경로(defaultDoc, build, withValues)가 한 곳에서 처리된다. 그래서 /board-docs 응답과 BoardDocDocx 입력(Doc) 모두 key를 갖는다. key는 docx 출력에는 쓰이지 않는다.

### 3. 구현안 (BoardDocSpec.java 하나만 수정)
```diff
 public static final class Cell {
+        private final String key;
         private final String text;
@@
-        Cell(String text, int colspan, int rowspan, boolean header, boolean mapped, String align) {
+        Cell(String text, int colspan, int rowspan, boolean header, boolean mapped, String align) {
+            this(text, colspan, rowspan, header, mapped, align, null);
+        }
+
+        private Cell(String text, int colspan, int rowspan, boolean header, boolean mapped, String align, String key) {
             this.text = text;
@@
             this.align = align;
+            this.key = key;
         }
 
         Cell span(int cs, int rs) {
-            return new Cell(text, cs, rs, header, mapped, align);
+            return new Cell(text, cs, rs, header, mapped, align, key);
+        }
+
+        Cell withKey(String k) {
+            return new Cell(text, colspan, rowspan, header, mapped, align, k);
         }
 
+        /** 칸 주소표 r{행}c{순번}. Table 에 들어가면 항상 채워진다(Table 생성자가 부여). */
+        public String getKey() { return key; }
         public String getText() { return text; }
```
Table 생성자에서 `this.rows = Collections.unmodifiableList(rows);` 줄을 아래로 바꾼다. 이 줄은 `layout(this)`보다 앞에 있어야 한다.
```java
            List<List<Cell>> keyed = new ArrayList<>();
            for (int r = 0; r < rows.size(); r++) {
                List<Cell> kr = new ArrayList<>();
                for (int i = 0; i < rows.get(r).size(); i++) {
                    kr.add(rows.get(r).get(i).withKey(cellKey(r, i)));
                }
                keyed.add(Collections.unmodifiableList(kr));
            }
            this.rows = Collections.unmodifiableList(keyed);
```
- BoardFormService.java:424는 그대로 둬도 된다(`cellKey` 하나를 같이 쓴다). 원하면 `c.getKey()`로 바꿔도 같은 값이다.
- Jackson 직렬화 이름은 `key`다. JacksonConfig의 snake_case와 null 포함 규칙을 지켰고, Table 안의 Cell은 key가 null일 수 없다.
- DB 스크립트·프런트 코드 변경은 없다. board-write.js 756~767은 key가 오면 그대로 동작한다. board.js loadView는 `x.body.tables`를 그대로 넘기므로 key가 따라간다.
- 방어 폴백(프런트에서 key를 직접 계산)은 넣지 않기를 권한다. 규칙이 이중화된다.

### 4. 테스트
- 깨질 기존 테스트: 없다. Cell 6인자 생성자를 유지해서 BoardDocSpecTest:114·115가 그대로 컴파일된다. `/board-docs` 골든 스냅샷은 저장소에서 찾지 못했고(grep), 위 4개 파일에만 나온다. `/menus` 계약과 골든 04·05는 건드리지 않는다. DomainJsonContract 파일은 열어보지 못했으니 메인이 전체 테스트로 확인해 달라.
- 추가 1, BoardDocSpecTest: `defaultDoc(true)`의 A 표에서 rows[1][0].getKey()는 "r1c0"이다. 병합으로 가려진 칸 때문에 순번이 당겨져, rows[2][0]("예비비")은 "r2c0"이고 rows[2][1]은 "r2c1"이다. B 표 머리 "구분"(colspan 2)은 "r0c0", 다음 "총기대수익"은 "r0c1"이다. 모든 표·칸에 대해 `getKey().equals(cellKey(r,i))`이고 key가 서로 유일해야 한다.
- 추가 2, BoardDocSpecTest: `build(...)`와 `withValues(...)`가 만든 Doc도 같은 key를 갖고, `editableKeys`가 변하지 않는다.
- 추가 3, BoardDocApiTest "JSON_구조와_확정_샘플값"에 `assertEquals("r1c0", inst.get("key").asText())`와 `assertEquals("r2c0", a.get("rows").get(2).get(0).get("key").asText())`를 넣는다. values=blank에서도 같은 key가 나와야 한다.
- 추가 4, /board-forms 복제본의 key와 /board-docs의 key가 같은 칸에서 같다는 비교 1건. BoardFormApiTest:559 부근에서 만들 수 있다.
- 프런트(frontend/test/board-write*.test.js): key 있는 /board-docs 형태 픽스처로 `cardHtml`이 `data-key`가 있는 값 칸(td)을 그리는 케이스를 추가한다. key 없는 옛 형태에서는 값 칸이 정적 칸으로 그려지던 기존 동작이 그대로인지 확인하는 케이스도 둔다. 이 부분은 frontend-dev 몫이다.
- 호출자 실행 명령: `cd kgi-ggreport-web && mvn -o test -Dtest='BoardDoc*Test,BoardForm*Test,BoardWrite*Test'`로 먼저 돌리고, 이어 `mvn -o test` 전체(380건 기준 + 추가분)를 돌린다. 프런트는 `node --test frontend/test/` 형태로 돌린다.

### 5. 위험·보안
- 응답에 `key` 필드가 늘어난다. 추가 필드라 기존 소비자(board.js validate, 화면)는 영향이 없다. `board.validate`가 알 수 없는 필드를 거부하는지는 확인하지 못했으니 프런트 테스트로 확인한다.
- 권한 경로는 그대로다. `guard.require(req,"tasks")`가 401/403을 내고, 없는 id는 404 고정 문구, 입력 검증도 그대로다. key는 상수 규칙으로 만들어지는 값이라 사용자 입력이 섞이지 않는다.
- 보안 확인 요청: ⓐ엑셀 업로드 경로(`/board-write`)가 default_doc에서도 이 key를 서버 쪽 `cellKey`/`BoardExcelMap` 매핑과 대조해 받는지 확인해 달라. 클라이언트가 보낸 key를 신뢰하면 안 된다. ⓑ인증이 `X-Emp-No` 자기신고인 점은 변함이 없다. default_doc 작성 흐름이 열려도 권한 문지기(requireWrite)가 우회되지 않는지 봐 달라. ⓒ접근 이력에 본문·쿼리값이 안 들어가는 규칙은 새로 건드린 곳이 없다.
- 되돌리는 법: BoardDocSpec.java 변경을 되돌리면 된다. DB·설정·골든 변경은 없다.

### 6. 이관 메모
- [이관: 프런트] key 있는 형태·없는 형태 픽스처로 board-write.js 값 칸 렌더 테스트를 추가하고, default_doc에서 작성 모드로 진입하는 경로(board.js loadView의 editable:false 고정이 작성 모드를 막는지)를 확인해야 한다. 기다리는 것은 서버 key 적용. 근거는 board.js:248이다.
- [이관: 기획] 팀 소속이 없는 사용자가 default_doc 작성을 어떤 역할까지 허용할지는 정책 결정이 필요하다. 기다리는 것은 기획 확인. 근거는 BoardWriteController의 requireWrite 권한이다.

### 7. 열린 질문
없음.

변경 파일: c:\github\GGReportAgent\kgi-ggreport-web\src\main\java\com\kbstar\kgi\ggreport\web\boarddoc\BoardDocSpec.java (이 파일 하나만 고친다. 테스트는 같은 폴더 경로의 BoardDocSpecTest·web/BoardDocApiTest에 추가한다).
