# Patch error handlers for upload — backend-dev (sonnet)

> 자동 보존본: 서브에이전트가 메인에 돌려준 최종 보고서를 대화 기록에서 그대로 옮겼다(2026-11-05 10:26 KST, agentId a01b6e4d7e154c23e). 에이전트 출력이므로 사용자 결정이 아니다.

---

## NEXT 45 P0 후속 패치안 (backend-dev, 읽기 전용 · 적용/실행은 메인)

**대상·방법·못 본 것**: 예외 핸들러 2종, BoardWriteController, XlsxBook:121-159, BoardWriteService:77-110, BoardWriteLimitFilter, 기존 테스트(BoardWriteAdviceTest·ApiExceptionHandlerTest·BoardWriteApiTest 머리) 정독. ZipGuard·AppProperties는 이번 수정과 무관해 읽지 않았다(설정은 @Value 직접 사용). 실행 불가라 아래 동작(특히 실서버 왕복의 Tomcat 응답)은 **미검증 — 추정**이다.

**원인(재확인)**
- 깨진 multipart는 DispatcherServlet.checkMultipart에서 터진다(핸들러 미결정). 그래서 assignableTypes advice는 닿지 않고, 전역 ApiExceptionHandler에는 MaxUpload(:53)만 있다. 그 외 MultipartException은 Spring 기본 500이다.
- Error는 BoardWriteExceptionHandler:74(RuntimeException만), XlsxBook:153(Exception만), Controller:59(ApiException만)에서 안 잡힌다. 또 XlsxBook은 Error 시 `pkg.revert()`를 건너뛴다(자원 누수).
- 413 문구는 `spring.servlet.multipart.max-file-size`(기본 1MB)만 읽는다. 5개 환경 설정(config-envs)은 모두 50MB라, 어긋나는 경우는 PC 로컬 `config/application.properties`에 키가 빠졌을 때(CLAUDE.md의 1MB 사례)뿐이다. 한도는 `ggreport.board-write.max-mb`에서 읽을 수 있다.

### ① 변경 파일
**1) BoardWriteExceptionHandler** — Error 처리(OOM 은 다시 던짐)
```java
+    /** POI 등이 던지는 Error(NoClassDefFound·StackOverflow·ExceptionInInitializer…) → 500 일반 문구. OOM 은 삼키지 않는다. */
+    @ExceptionHandler(Error.class)
+    public ResponseEntity<Map<String, Object>> handleError(Error e) {
+        if (e instanceof OutOfMemoryError) {
+            throw e;
+        }
+        log.error("처리되지 않은 오류 {}", describe(e));
+        return respond(500, detail("SERVER_ERROR", ApiExceptionHandler.GENERIC_500));
+    }
```
DispatcherServlet이 Error를 NestedServletException으로 감싸 넘기지만, Spring 5.3의 핸들러 탐색이 cause 사슬을 따라가 이 메서드에 닿는다(추정, 아래 테스트가 확인한다).

**2) XlsxBook.open:151-158** — 자원 정리 + StackOverflow는 파일 탓이므로 422
```java
         } catch (Rejected r) {
             throw r;
-        } catch (Exception e) {                                // InvalidFormat·IO·POIXML·Runtime
+        } catch (Exception | StackOverflowError e) {           // InvalidFormat·IO·POIXML·Runtime·깊은 중첩 XML
             if (pkg != null) {
                 pkg.revert();
             }
             throw new Rejected(422, "BROKEN", e.getClass().getSimpleName());
+        } catch (Error e) {                                    // NoClassDefFound·ExceptionInInitializer 등 = 서버 환경 문제 → 위로(500)
+            if (pkg != null && !(e instanceof OutOfMemoryError)) {
+                try { pkg.revert(); } catch (RuntimeException ignore) { }
+            }
+            throw e;
         }
```

**3) BoardWriteController** — 예상 못 한 실패도 접근 이력에 남김(코드 500, 본문·값 없음). upload:59 와 draft:72 에 각각
```java
         } catch (ApiException e) {
             audit(req, codeOf(e), size, kinds(e.getDetailObject()));
             throw e;
+        } catch (RuntimeException | Error e) {
+            audit(req, "500", size, 0);
+            throw e;
         }
```
(draft는 size 대신 -1, `kinds` 0.)

**4) BoardWriteLimitFilter** — 경로 판별 공개
```java
+    /** 엑셀 업로드 경로인가 — 전역 413 처리기가 작성 모드 한도로 문구를 맞추는 데 쓴다. */
+    public static boolean isExcelUpload(HttpServletRequest req) {
+        return "POST".equalsIgnoreCase(req.getMethod()) && EXCEL.matcher(normalize(req.getRequestURI())).find();
+    }
```

**5) ApiExceptionHandler** — 생성자·413 문구·MultipartException
```java
-    private final long maxUploadMb;
+    static final String MSG_BAD_MULTIPART = "업로드한 내용을 읽을 수 없습니다. 파일을 다시 선택해 올려 주세요.";
+    private final long maxUploadMb;
+    private final long boardMaxMb;
 
-    public ApiExceptionHandler(boolean verbose) { this(verbose, "50MB"); }
+    public ApiExceptionHandler(boolean verbose) { this(verbose, "50MB", 5); }
+    public ApiExceptionHandler(boolean verbose, String maxFile) { this(verbose, maxFile, 5); }  // 기존 테스트 호환
-    @Autowired
-    public ApiExceptionHandler(@Value(errors.detail) boolean verbose, @Value(max-file-size) String maxFile) {
+    @org.springframework.beans.factory.annotation.Autowired
+    public ApiExceptionHandler(@Value("${ggreport.errors.detail:false}") boolean verbose,
+                               @Value("${spring.servlet.multipart.max-file-size:1MB}") String maxFile,
+                               @Value("${ggreport.board-write.max-mb:5}") long boardMaxMb) {
         this.verbose = verbose;
         this.maxUploadMb = DataSize.parse(maxFile).toMegabytes();
+        this.boardMaxMb = boardMaxMb;
     }
 
-    @ExceptionHandler(MaxUploadSizeExceededException.class)
-    public ResponseEntity<Map<String, Object>> handleUploadTooLarge(Exception e) {
+    public ResponseEntity<Map<String, Object>> handleUploadTooLarge(Exception e) { return handleUploadTooLarge(e, null); }
+
+    @ExceptionHandler(MaxUploadSizeExceededException.class)
+    public ResponseEntity<Map<String, Object>> handleUploadTooLarge(Exception e, HttpServletRequest req) {
         log.warn("업로드 크기 초과(전역 한도)");
+        // 작성 모드 엑셀 경로는 실제 적용되는 더 작은 쪽(전역 vs 작성 모드)으로 안내한다.
+        long mb = req != null && BoardWriteLimitFilter.isExcelUpload(req) ? Math.min(maxUploadMb, boardMaxMb) : maxUploadMb;
-        d.put("message", "파일이 너무 큽니다. " + maxUploadMb + "MB 이하만 올릴 수 있습니다.");
-        d.put("max_mb", maxUploadMb);
+        d.put("message", "파일이 너무 큽니다. " + mb + "MB 이하만 올릴 수 있습니다.");
+        d.put("max_mb", mb);
         ...
     }
+
+    /** 그 밖의 multipart 해석 실패(끊긴 본문·경계 오류·파트 수 초과 등) — 기본 500 대신 400. 원인 클래스만 로그에(메시지엔 파일명이 섞일 수 있다). */
+    @ExceptionHandler(org.springframework.web.multipart.MultipartException.class)
+    public ResponseEntity<Map<String, Object>> handleBadMultipart(org.springframework.web.multipart.MultipartException e,
+                                                                  HttpServletRequest req) {
+        log.warn("multipart 해석 실패 {}", BoardWriteExceptionHandler.describe(e));
+        if (BoardWriteLimitFilter.isExcelUpload(req)) {   // 작성 모드 화면은 detail 객체를 읽는다
+            Map<String, Object> d = new java.util.LinkedHashMap<>();
+            d.put("code", "BAD_REQUEST");
+            d.put("message", MSG_BAD_MULTIPART);
+            return ResponseEntity.status(400).body(detail(d));
+        }
+        return ResponseEntity.status(400).body(detail(MSG_BAD_MULTIPART));   // 기존 화면 규약(문자열 detail)
+    }
```
import 추가: `javax.servlet.http.HttpServletRequest`, `...config.BoardWriteLimitFilter`. MaxUploadSizeExceeded는 MultipartException의 하위라 더 구체적인 처리기가 우선한다. `describe`는 package-private static이라 같은 패키지에서 호출 가능. errors.detail=true여도 본문은 늘리지 않았다(기존이 Spring 기본 500이라 "유지할 방식"이 없음).

### ② 테스트
- **BoardWriteAdviceTest 추가**: `when(service.upload(...)).thenThrow(new NoClassDefFoundError(SECRET))`, `new StackOverflowError()`, `new ExceptionInInitializerError(new RuntimeException(SECRET))` 각각 → `uploadExpecting(500)` + `assertGeneric500` (본문에 secret/Exception 없음도 자동 확인). `thenThrow(new OutOfMemoryError())` → `mockMvc.perform` 이 NestedServletException 등으로 **던져짐**을 `try/catch`로 확인(JSON 500 아님).
- **ApiExceptionHandlerTest 추가(단위)**: `handleBadMultipart(new MultipartException("x secret.xlsx"), req)` — `MockHttpServletRequest("POST","/board-forms/default_doc/excel")` → 400, detail 객체 code BAD_REQUEST, 메시지에 secret 없음; `/tasks/1/files` → 400, detail이 문자열. `new ApiExceptionHandler(false,"1MB",5).handleUploadTooLarge(new MaxUploadSizeExceededException(-1), 엑셀 req)` → max_mb 1; `("50MB",5)` → 5; 비엑셀 경로 → 50.
- **실제 왕복 1건(신규 BoardWriteMultipartRoundTripTest)**: `@RunWith(SpringRunner.class) @SpringBootTest(webEnvironment = RANDOM_PORT)`, `@LocalServerPort`. `HttpURLConnection`으로 POST `/board-forms/default_doc/excel`, `Content-Type: multipart/form-data; boundary=x`, `setFixedLengthStreamingMode`(필터가 길이 필수), 본문은 닫는 경계가 없는 잘린 multipart(`--x\r\nContent-Disposition: form-data; name="file"; filename="a.xlsx"\r\n\r\nabc`). 기대: 응답 400, `application/json`, `detail.code=BAD_REQUEST`, 본문에 `Exception`·`org.apache` 없음. MockMvc는 MultipartResolver 단계를 거치지 않고 mock multipart를 쓰므로 이 경로를 못 재현한다 — 그래서 실서버가 필요하다. 인증 헤더는 필요 없다(파싱이 컨트롤러보다 먼저). **주의**: Tomcat이 잘린 본문을 예외 대신 "파트 없음"으로 받아들이면 400 EMPTY_FILE이 나올 수 있다. 그 경우 이 케이스는 핸들러를 못 타니, 호출자가 실제 응답을 보고 본문을 조정해야 한다(미검증).
- **깨질 기존 테스트**: 없을 것으로 본다(ApiExceptionHandlerTest의 1·2인자 생성자·1인자 handleUploadTooLarge 유지). 단 이번 변경에서 가장 큰 불확실성은 `@ExceptionHandler(Error.class)`의 cause 사슬 매칭이다.
- **실행**: `mvn -o test -Dtest=BoardWriteAdviceTest,ApiExceptionHandlerTest,BoardWriteMultipartRoundTripTest` → 전체 `mvn -o test`(기존 380 + 신규, 골든 04·05 포함). 실서버 왕복은 8080을 쓰지 않지만 로컬 DB를 쓰므로 다른 세션과 동시 실행 금지.

### ③ 위험
- XlsxBook의 StackOverflowError→422 BROKEN은 "악성/기형 파일"이라는 판단이다. 서버 스택이 아주 얕은 환경이면 정상 파일도 걸릴 수 있다(가능성 낮음).
- 비엑셀 업로드(institutions/import, tasks files)의 MultipartException도 이제 400 문자열 detail로 바뀐다(기존 기본 500). 화면 영향은 거의 없지만 의도된 변경이다.
- Error 핸들러는 board 컨트롤러 한정이다. 다른 컨트롤러의 Error는 여전히 기본 500이다(범위 밖; 필요하면 전역에도 같은 처리를 추가할 수 있다).
- `catch (RuntimeException | Error e)`가 audit을 호출한다. audit은 setAttribute뿐이라 OOM 시에도 안전하다고 본다.

### ④ 보안 확인 요청(security)
1) 응답 본문에는 상수 문구만 싣는다. 로그는 `describe`(클래스명·프레임 8개·cause 클래스명)만 쓰고 getMessage는 쓰지 않는다. 이 점을 확인해 달라. 2) 인증 전 단계(multipart 해석)에서 400이 나가는 것은 기존 413과 같은 노출 수준이다. X-Emp-No 자기신고 한계는 그대로다. 3) 접근 이력에 `code=500 size=…`만 남고 본문·파일명은 없음. 4) OOM 재던짐 정책이 컨테이너 기본 처리와 충돌하지 않는지.

### 이관 메모·열린 질문
- [이관: 기획] 없음. P3 문구는 "전역·작성 모드 중 작은 한도"로 정했다(근거: 실제 적용되는 한도가 더 작은 쪽). 한도 차이는 로컬 설정 누락 때만 생긴다 — 세션 시작 키 대조(ⓓ)가 이미 감지한다.
- 열린 질문: 없음.
