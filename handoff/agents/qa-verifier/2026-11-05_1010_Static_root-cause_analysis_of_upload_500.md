# Static root-cause analysis of upload 500 — qa-verifier (opus)

> 자동 보존본: 서브에이전트가 메인에 돌려준 최종 보고서를 대화 기록에서 그대로 옮겼다(2026-11-05 10:10 KST, agentId a600210b5803eaaaf). 에이전트 출력이므로 사용자 결정이 아니다.

---

## NEXT 45 P0: 유효한 xlsx 업로드 500 정적 분석 (qa-verifier, 2026-11-05)

**1. 대상·방법·못 본 것**
- 코드만 읽었다: BoardWriteController, 두 예외 핸들러, BoardWriteService, XlsxBook, ZipGuard, BoardWriteLimitFilter, SecurityHeadersFilter, PoiLimitsConfig, AccessLogInterceptor, pom, config-envs, BoardWriteApiTest.
- 서버 로그, 11-03 QA 응답 원문, 실제 사용한 xlsx는 보지 못했다.
- 숨기지 않고 알린다: `*.properties`를 Grep하면서 `kgi-ggreport-web/config/application.properties`의 줄도 함께 걸렸다. 걸린 것은 multipart, errors.detail, board-write, server.port 줄뿐이고 비밀번호 줄은 출력되지 않았다. 그 결과 지금 로컬 설정에 7개 키가 out-local과 같은 값으로 들어 있음이 보였다.

**2. 판정: 원인은 아직 미확정이다.** 다만 핸들러 공백은 코드로 확인했다(아래 B).

**3. 500이 나는 경로 (가능성 높은 순)**
- 전제 [확인]: 사용자 정의 ErrorController가 없다. 그래서 "Spring 기본 본문"이 나왔다면 예외가 두 advice를 모두 빠져나가 `/error`(BasicErrorController)까지 간 것이다.
  - 반대로 BoardWriteExceptionHandler.java:74가 RuntimeException을 잡았다면 `{"detail":{"code":"SERVER_ERROR"}}` 형태의 JSON 500이 나왔어야 한다.
  - 그러므로 서비스·POI의 RuntimeException은 기본 본문의 원인이 아니다.
- **A [추정, 1순위]: multipart 해석 단계의 MultipartException**
  - 이 예외는 컨트롤러가 정해지기 전(DispatcherServlet.checkMultipart)에 난다.
  - ApiExceptionHandler.java:53은 MaxUploadSizeExceededException만 잡고, 일반 MultipartException은 잡는 곳이 없다 → 기본 본문 500.
  - 대표적인 원인: Boot 기본값은 `file-size-threshold=0`이라 모든 업로드 파일을 임시 폴더(`%TEMP%\tomcat.8080.*\work`)에 쓴다. 서버가 오래 떠 있는 동안 Windows가 이 폴더를 지우면 "temporary upload location is not valid"가 나고 **모든 업로드가 500**이 된다. 재기동하면 풀린다.
  - config-envs 어디에도 `spring.servlet.multipart.location`이 없다 [확인].
- **B [공백은 확인, 원인 여부는 추정, 2순위]: POI가 던지는 `java.lang.Error`**
  - 해당하는 것: NoClassDefFoundError, OutOfMemoryError, StackOverflowError, ExceptionInInitializerError.
  - 잡는 곳이 하나도 없다:
    - XlsxBook.java:153은 `catch (Exception)`만 한다.
    - BoardWriteService.java:103-109에는 catch가 없다.
    - BoardWriteController.java:59는 ApiException만 잡는다.
    - BoardWriteExceptionHandler.java:74는 RuntimeException만 잡는다.
  - Spring은 이런 Error를 NestedServletException으로 감싸지만, cause가 Error라서 어느 처리기에도 걸리지 않는다 → 기본 본문 500.
  - "유효한 xlsx만" 실패한다는 증상과 맞는다. 형식이 틀린 파일은 POI를 쓰기 전 단계(XlsxBook:122-133, ZipGuard)에서 415/422로 끝나기 때문이다.
  - 그럴듯한 원인 두 가지:
    - IDE 실행 클래스패스가 오래돼 poi-ooxml 5.2.3 / ooxml-lite / xmlbeans / commons-compress 중 일부가 빠진 경우. Maven 테스트 641건이 통과한 것과 모순되지 않는다.
    - 엑셀에서 저장한 실제 파일(테마·그림·calcChain 등)이 ooxml-lite에 없는 스키마 클래스를 건드리는 경우. 테스트 fixture(BoardExcelFixture)는 POI가 직접 만든 파일이라 이 경로를 타지 않는다.
- **C [추정, 3순위]:** 위와 다른 MultipartException (part 수·헤더 한도 등). 이번 요청은 part가 1~2개라 가능성이 낮다.

**4. 설정 누락만으로 500이 되는가: 코드상 그런 경로는 없다 [확인]**
- 키가 없으면 multipart 한도가 기본 1MB가 된다. 1MB를 넘는 파일은 MaxUploadSizeExceededException이 나고, 핸들러가 없는 상황(handler=null)에도 전역 advice가 받아 413 JSON(ApiExceptionHandler.java:53)으로 돌려준다.
  - 부수 결함 [P3]: 이 경우 안내 문구가 "1MB 이하"로 나와, 작성 모드 한도 5MB와 어긋난다.
- `ggreport.board-write.*`의 코드 기본값(5/20/40/2)은 설정값과 같다. `errors.detail`은 문구만 바꾼다.
- **NEXT 45의 "errors.detail=true로 응답 원문을 보고 판별" 계획은 통하지 않는다 [확인].** 기본 본문은 BasicErrorController가 만들고, 이쪽은 `server.error.include-message`(기본값 never)를 따른다. 원인은 서버 콘솔/로그에 찍히는 "Servlet.service() … threw exception … nested exception is java.lang.XXX"에서만 보인다.

**5. 재현 절차 (main이 실행)**
1. 8080 서버를 기동하고, 콘솔 로그를 볼 수 있게 둔다.
2. 아래 요청을 보낸다.
   - `POST /board-forms/default_doc/excel`
   - 헤더 `X-Emp-No`: tasks 작성권이 있거나 관리자인 사번 (시드 8203417).
   - `Content-Type: multipart/form-data`, part 이름은 `file`. 기본 양식이라 version은 보내지 않는다.
   - Content-Length는 반드시 있어야 한다(없으면 411). 파일은 6MB 이하.
3. 서로 다른 파일 세 개로 반복해 원인을 가른다.
   - (a) 엑셀에서 직접 저장한 정상 .xlsx, 1MB 미만
   - (b) 확장자만 .xlsx로 바꾼 텍스트 파일 → 기대값: 415 NOT_XLSX JSON
   - (c) POI fixture와 같은 단순 xlsx
4. 결과 읽는 법
   - (b)도 기본 본문 500이면 원인 A다.
   - (b)는 415인데 (a)만 500이면 원인 B다.
   - 어느 쪽이든 로그의 root cause 클래스 이름으로 확정한다.

**6. 테스트 공백**
- BoardWriteApiTest.java:106-111은 MockMvc의 MockMultipartFile을 쓴다. 그래서 실제 컨테이너의 multipart 해석(임시 폴더·한도)을 거치지 않고, BoardWriteLimitFilter.java:53도 이 요청은 통과시킨다.
- 추가 제안:
  - 서비스가 Error를 던지도록 mock → 기대값: JSON 500 SERVER_ERROR
  - MultipartException 주입 → 기대값: JSON 4xx/5xx
  - `@SpringBootTest(webEnvironment=RANDOM_PORT)`로 실제 multipart 왕복 1건 → 기대값: 200

**7. 호출자에게 요청할 실행**
- 위 5번의 (a)(b) 요청을 보내고 상태 코드, 본문, 콘솔의 root cause를 받아 와 달라.
- `mvn -q dependency:tree -Dincludes=org.apache.poi,org.apache.xmlbeans,org.apache.commons` 출력도 함께 받아 와 달라.

**8. 이관 메모**
- [이관: 백엔드] BoardWriteExceptionHandler에 다음 두 처리기를 추가한다.
  - MultipartException(다른 크기 초과 제외) → 400/413 JSON. 전역 advice 쪽 처리가 필요할 수 있다(handler=null 단계라서).
  - Error / NestedServletException의 cause가 Error인 경우 → JSON 500.
  - XlsxBook:153에서 NoClassDefFoundError·StackOverflowError를 BROKEN으로 바꿀지는 따로 판단한다. OOM은 삼키지 않는다.
- [이관: 백엔드] `spring.servlet.multipart.location`을 명시할지, 임시 폴더를 미리 만들어 둘지 검토한다.
- [이관: 기획] 413 안내 문구의 MB 값을 한도에 맞출지 정한다.

**9. 열린 질문**
- 11-03의 500 응답 본문이 정말 timestamp/status/error/path 형태였는가, 아니면 `{"detail":…}` 형태였는가? 이것에 따라 원인 후보가 완전히 갈린다.
- 서버를 IntelliJ로 띄웠는가, `mvn spring-boot:run`이나 jar로 띄웠는가?
