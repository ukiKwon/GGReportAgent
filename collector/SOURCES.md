# 수집 출처·주기 작업 정리 (2026-11-11, 9f 데이터 수집 세션)

금고·주거래은행·공탁금 보관은행 **입찰 일정** 데이터(`frontend/data/institutions.js`·`institutions_nonmuni.js`·`kb-verified.js`)를 채우며 실제로 조회한 출처, 통했는지, 주기적으로 다시 봐야 하는 일과 자동화 가능성을 적는다.
데이터 규칙(lastBid·term·contractEnd·contractExpiry)은 `institutions.js` 머리말, 조회 요령 원본은 `docs/superpowers/specs/2026-08-09-nationwide-treasury-schedule-design.md` §⑨·㉕·㉚·㉛.

## 1. 출처별 — 무엇을, 어떻게, 통했나

| # | 출처 | 얻는 것 | 조회 방법 | 결과(2026-11-11) |
|---|---|---|---|---|
| S1 | **eminwon 고시공고**(지자체 공통 새올) `https://{host}/emwp/gov/mogaha/ntis/web/ofr/action/OfrAction.do` | 지자체 금고 계획·재공고·지정(결과) 공고 원문, 첨부 hwpx(약정기간·은행) | curl `--http1.1` + 브라우저 UA, 목록 `method=selectListOfrNotAncmt`·`not_ancmt_sj=금고`(UTF-8 퍼센트 인코딩), 상세 `method=selectOfrNotAncmt&not_ancmt_mgt_no=…`, 첨부 `/emwp/jsp/ofr/FileDown.jsp?user_file_nm&sys_file_nm&file_path`(상세의 goDownLoad 인자). hwpx는 zip → `Contents/section0.xml`의 `<hp:t>` | **가장 잘 통함.** 호스트 73개가 sources에 있음. 응답은 EUC-KR 또는 UTF-8. https가 안 되면 http(노원·광진·서해). **한계**: 많은 곳이 *게재 중인 글만* 노출 — 계획 공고는 게재기간이 끝나면 사라짐(그래서 결과 공고만 남는다) |
| S2 | **지자체 홈페이지 자체 고시/공고**(eminwon에 없는 곳) | 같은 공고(원문) | 사이트마다 파라미터가 다름 — 서울 중구 `content.do?cmsid=14232&searchField=title&searchValue=`, 용산 `B0000095/list.do?menuNo=200233&searchCnd=1&searchWrd=`, 성북 `selectEminwonList.do?key=6977&searchCnd2=notAncmtSj&searchKrwd=`, 제천 `searchCnd=SJ&searchKrwd=`, 남원 `searchType=postTtl&keyword=`, 고창 `board/list.gochang?boardId=BBS_0000180&searchType=DATA_TITLE&keyword=`, 무안·나주·목포 `search_type=title&search_word=`, 광양 `saeol/gosi.es` | **부분적으로 통함.** 강동·중랑·하남·노원은 검색이 안 먹거나 게재 중 글만 노출. 사이트별 설정이 필요 |
| S3 | **지방재정365 통합자료실 > 금고지정현황**(행안부) `https://www.lofin365.go.kr/portal/LF8310000.do?curPage=1&ntcaClsDvCd=FSL409` | 전 지자체 회계별 금고 은행·약정 시작·만료(엑셀, 매년 1월 1일 기준) — 2018~2026판 | 목록은 JS 렌더 → 브라우저로 열고 '첨부파일 다운로드'(POST `/lf/prtcCmct/brd/itgRfrmSvi/fileDown.do`, 행안부 웹필터 경유). curl 직접 호출은 안 됨 | **통함(브라우저).** 2026판(2026-06-08 게시)으로 contractExpiry 182곳·국민은행 금고 16곳. 같은 자료실에 '지방정부 금고 금리 통합공개'(2026-01-28)도 있음 |
| S4 | 기사(묶음 기사 우선) | 선정 은행·약정기간·심의·약정 체결일(근사 기준일) | WebSearch → WebFetch. 묶음 기사가 효율적(예: 뉴스저널리즘 2026-11-04 서울 25구 정리, 인천투데이 인천 구 정리) | **통함, 단 근사.** 기초 시군·공기업은 기사가 거의 없음. 일부 매체 인증서 만료(이데일리·대구일보)로 열람 불가 |
| S5 | **대법원 새소식 공고**(공탁금 보관은행 지정계획·지정) `https://www.scourt.go.kr/portal/news/NewsViewAction.work?gubun=3&seqnum=…` | 법원 공탁금 보관은행 지정 공고(번호·게시일), 첨부 hwp | WebFetch는 한글이 깨짐, 본문은 hwp 첨부 | **제목·번호만 통함.** hwp(구형 바이너리)는 아직 못 읽음 — hwpx와 달리 변환기가 필요 |
| S6 | 각 법원 홈페이지 새소식('보관은행 변경 안내') | 업무 개시일 | 예: 인천지법 `DcNewsViewAction.work?seqnum=13257&gubun=41` | 은행명이 깨져 읽힘 — 기사와 교차해서만 사용 |
| S7 | **행정표준 기관코드 전체자료**(code.go.kr) — 사용자가 받은 `docs/samples/기관코드 전체자료.zip`(미추적) | 기관코드 7자리·상위코드·소재지코드·존폐여부 | zip → txt(CP949, 탭 구분) → `iconv`로 UTF-8 | **통함.** 교육청 16·법원 75곳 코드 부여. 소재지코드는 비어 있는 행이 많음 |
| S8 | 교육청 고시·공고 / 지방교육재정알리미 | 교육금고 공고 원문 | — | **아직 시도 안 함**(교육청 16곳은 기사로만 채움). 강원·제주 미확보 |
| S9 | **나라장터**(g2b) — 조달청 '입찰공고정보서비스' OpenAPI `https://apis.data.go.kr/1230000/ad/BidPublicInfoService02` | 공공기관·공기업·지방공기업 '주거래은행(금고) 선정' 입찰 공고 원문 메타(공고번호·차수·공고기관·공고일) | 인증키는 `collector/.env.local`(`G2B_SERVICE_KEY`, git 제외). 기능 이름도 **끝에 02**: `getBidPblancListInfoServcPPSSrch02`(용역, `bidNtceNm` 제목 검색)·`getBidPblancListInfoServc02`. `inqryDiv=1`·`inqryBgnDt/EndDt=YYYYMMDDHHMM`, **조회 기간은 7일 이내**(넘으면 resultCode 07 '입력범위값 초과'), `numOfRows` 100 가능, `type=json`. **하루 호출 한도 1000회**(사용자 11-11) | **통함(2026-11-11).** 2026년 1주 단위 45회 조회 → '주거래은행' 공고 62건(기관 약 45곳: 국가유산진흥원·부산교통공사·인천교통공사·사학연금·한국부동산원·한국연구재단 등). 지자체 금고 지정 공고는 나라장터에 없다 |
| S10 | 알리오(공공기관)·클린아이(지방공기업) 공시 | 기관 목록·주소, (있다면) 주거래은행 | — | **아직 시도 안 함**(알리오는 접속 실패 보고). 지방공기업 목록 확정에 필요 |
| S11 | 의회 회의록·시보/군보 PDF | 약정기간·회차 정황 | WebFetch | 회의록은 일부 통함(밀양·포천·수성·목포), PDF는 압축 스트림이라 못 읽음(공주·사하·동래) |

## 2. 주기적으로 해야 하는 일

| # | 할 일 | 주기 | 쓰는 출처 | 지금 자동화 가능? |
|---|---|---|---|---|
| P1 | **금고 공고 감시** — 약정 만료가 다가오는 지자체의 계획·재공고·결과 공고를 잡아 contractEnd(진행 중)·lastBid(회차 종료)로 옮긴다 | 공고 철(대개 **6~11월**) **주 1회**, 그 밖 월 1회 | S1(+S2) | **가능(1순위).** S1은 curl만으로 되고 호스트 목록이 데이터 sources에 있다. 새 '금고' 제목 글만 비교해 보고서로 내면 사람(또는 data-auditor)이 원문을 열어 반영 |
| P2 | **경과 목록 확인** — 현황판 '공고 예정일 경과'(지금 21곳: 진행 중 4·72 조사 6·결과 미확인 11)를 하나씩 닫는다 | 주 1회 | P1 결과 + S2·S4 | 반자동(P1이 후보를 주면 사람이 확인) |
| P3 | **행안부 금고지정현황 갱신** — 새 연도판이 나오면 contractExpiry·kb-verified를 다시 만든다 | **연 1회**(예년 5~6월 게시, 2026판 06-08) | S3 | 반자동 — 다운로드는 브라우저, 반영은 스크립트(오늘 쓴 매칭 규칙: 일반회계 행, '낡은 약정'은 lastBid > 약정 시작이면 제외) |
| P4 | **회차 종료 처리** — 결과 공고가 나온 기관의 lastBid·term 갱신, 그 기관의 contractExpiry 행 삭제, kb-verified `next` 갱신(예: 청주 2027부터 국민 빠짐, 부산 동구 부금고 유지) | P1과 함께 | S1·S4 | 반자동 |
| P5 | **공탁금 보관은행 공고 감시** | 월 1회(공고는 연 수 건, 7~11월) | S5 | 목록 확인은 가능, hwp 본문은 변환기 필요 |
| P6 | **교육청 교육금고** | 연 1회(대부분 2028·2029 말 만료 — 그 전해 중반) | S8·S4 | 시도 전 |
| P7 | **기관코드 갱신**(폐지·신설, 예: 전남광주 통합·인천 신설 구) | 분기 1회 | S7 | 가능(파일 대조) |
| P8 | **공공기관·공기업 주거래은행 공고** | 주 1회 | S9 | **가능 — 인증키 확보(2026-11-11, collector/.env.local).** 소스(sources/g2b.py) 구현 남음. 1주 창 × 검색어당 1회, 하루 1000회 한도 안 |
| P9 | 근사 기준일을 원문으로 교체(기사 기준 수십 곳) | 틈날 때 | S1·S2 | 반자동 |

**가까운 일정(달력)**: 마포 접수 마감 11-19 뒤 결과 공고 · 약정 2026-12-31 만료인데 결과를 못 찾은 11곳(가평·양평·오산·하남·경산·문경·광주 광산·서구·담양·부여·진안) 11~12월 재조회 · 법원 2021 공개경쟁 묶음(전주·춘천·강릉 등) 2026-12 만료 차기 공고.

## 3. 자동화 — 1단계 구현됨(2026-11-11, NEXT 80)

- **실행**: `C:\dev\python\python.exe -m collector run --source eminwon [--since YYYY-MM-DD] [--hosts 호스트|기관key,…]` — 결과는 `data/collector/`(git 제외): 배치 `<시각>_eminwon/`(manifest·files), 원문 `_raw/eminwon/<호스트>/<공고번호>/`, 상태 `_state/state.json`(이미 본 공고·실행 기록). stdout 한 줄 JSON, 종료 코드 0/1/2/3/4. 콘솔이 cp949면 `PYTHONIOENCODING=utf-8`.
- **구성**: `collector/sources/eminwon.py`(소스) · `eminwon_parse.py`(실측 3유형 목록 파서) · `config/eminwon_hosts.json`(94 호스트 — 기관 key 연결) · `extract/`(종류 판정·hwpx 본문·약정기간) · `pipeline.py`·`cli.py`·`state.py`·`store.py`·`httpclient.py`. 배치에 `notice`(공고 사실)·`candidate`(기관 일정 '후보', 값마다 근거 문장) 칸 — 계약 검증기(`contract/batch_schema.py`)가 검사.
- **호스트 설정 만든 방법**: frontend/data/institutions.js 레코드 sources의 eminwon URL(73) + 2026-11-11 curl로 조회가 통한 호스트(지자체 key와 수동 연결)를 합쳐 생성 — 갱신할 때도 같은 두 출처를 합친다(생성 스크립트는 스크래치였음, 다음에 tools/로 옮길 것).
- **시험**: `python -m pytest collector -q`(실측 fixture, 네트워크 없음). 실측 3곳 시험(마포·순창·제물포) 25초, 마포 계획 공고 첨부에서 새 약정 2027~2030을 자동 추출.
- **Python**: `C:\dev\python`(3.12.7 embeddable, 2026-11-11 설치) + `Lib/site-packages/ggreportagent.pth`(저장소 경로). 패키지: pytest·fastapi·pydantic·httpx·python-multipart·uvicorn.
- **남은 것**: 나라장터 소스(`sources/g2b.py`, S9 조건대로 1주 창·하루 1000회 한도), 작업 스케줄러 등록(공고 철 주 1회), 미리보기 보고서(데이터 파일과 비교), xlsx 포장(운영 반입용).

### 처음 제안(참고)
- **1단계(권장)**: `collector/sources/eminwon.py` — 이 틀(`collector/sources/base.py`)의 소스로 S1 조회를 붙인다. 입력은 `institutions.js` sources의 eminwon 호스트(73개)+스펙 표, 출력은 '새 금고 공고 목록'(호스트·제목·공고번호·게시일·상세 URL). 이전 실행분과 비교해 새 글만 보고. 망 밖(DMZ) 수집기라는 이 폴더의 설계(§③)와도 맞는다.
- **실행**: 이 PC의 작업 스케줄러(마무리 `agent-dashboard/closing.js`와 같은 방식) 또는 Claude Code 예약 작업. 공고 철 주 1회.
- **2단계**: S2 사이트별 설정 표(파라미터) 추가, S3 연 1회 반영 스크립트를 저장소에 정식으로 둔다(오늘은 스크래치 스크립트로 했다).
- **사람이 남는 일**: 원문 판정(계획/재공고/결과 구분, 약정 연수), hwp 구형 첨부, 근사 기준일 판단.
