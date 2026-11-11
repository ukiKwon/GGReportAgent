// 로그인 화면 오른쪽 슬라이드 내용 — 이 파일만 고치면 됩니다(코드는 건드리지 않습니다).
// 고치는 법: 아래 { … } 한 덩어리가 슬라이드 한 장입니다. 장을 더하거나 빼거나 순서를 바꾸고, 저장한 뒤 브라우저를 새로고침하세요.
//  - 공통 칸: id(장 이름표, 영문 소문자·숫자·-만, 겹치면 안 됨) · topic(점 옆 짧은 이름, 20자까지) · say(큰 문구, 줄바꿈은 \n, 60자까지) · src(맨 아래 출처 문구, 선택) · showUntil(이 날짜까지만 보임, 선택).
//  - kind 는 notice(접수 일정) · districts(구 목록과 지도) · heatmap(서울 색 지도) · flow(업무 순서) · timeline(6개월 안 입찰 줄, 자동) · cards(기관 카드 3~6장) 중 하나입니다. 칸 이름은 아래 예시를 따라 쓰세요.
//  - 날짜는 YYYY-MM-DD(예: 2026-11-16). notice 는 접수 마감일이 지나면 자동으로 빠지고, say·sayOpen 안의 {receiveFrom}·{receiveTo}·{noticeFrom}·{noticeTo}·{contractEnd}는 그 날짜(M월 D일)로 바뀝니다.
//  - timeline 은 기관 데이터(institutions.js, 있으면 institutions_nonmuni.js)에서 6개월 안 입찰을 가까운 순 8곳까지 자동으로 만들고, say 안의 {count}는 곳 수로 바뀝니다(0곳이면 장이 빠짐).
//  - cards 의 items 는 { name, kindLabel, bank, term, src, pending(true면 '확정 아님' 표시, 선택) }. 구 코드(code, 5자리)는 frontend/geo/seoul.js 의 properties.code 에서 찾습니다(예: 마포구 11140).
//  - 형식이 틀린 장(모르는 kind, 빈 say 등)은 화면에서 조용히 빠지고, 전부 빠지면 로그인 카드만 보입니다. 고친 뒤 frontend/test/login-slides.test.js 를 돌리면 틀린 칸을 알려 줍니다.
window.loginSlides = [
  {
    id: 'mapo-notice', kind: 'notice', topic: '마포구 제안 접수',
    say: '{receiveFrom},\n마포구 제안 접수가 열립니다',
    sayOpen: '{receiveTo}까지\n마포구 제안 접수 중입니다',
    org: '마포구', title: '마포구 금고지정 계획 공고', noticeNo: '제2026-1729호',
    noticeFrom: '2026-10-29', noticeTo: '2026-11-18',
    receiveFrom: '2026-11-16', receiveTo: '2026-11-19',
    contractEnd: '2026-12-31',
    showUntil: '2026-11-19',
    src: '출처: 마포구 eminwon 고시공고 원문, 2026-11-11 확인'
  },
  {
    id: 'new-three', kind: 'districts', mode: 'new', topic: '신규 3구',
    say: '세 구가 국민은행으로\n옮겨 왔습니다',
    items: [
      { code: '11190', name: '영등포구', what: '우리은행에서 국민은행으로', src: '결과 공고 제2026-2038호, 2026.10.29.' },
      { code: '11250', name: '강동구', what: '우리은행에서 국민은행으로, 약정 2027–2030', src: '보도 2026.11.04.' },
      { code: '11070', name: '중랑구', what: '우리은행에서 국민은행으로, 약정 2027–2030', src: '보도 2026.11.04.' }
    ],
    src: '출처: 영등포구 eminwon 결과 공고, 보도(2026-11-04). 구 경계: 통계청 2018 행정경계'
  },
  {
    id: 'keep-three', kind: 'districts', mode: 'keep', topic: '재선정 3구',
    say: '세 구는 국민은행을\n다시 골랐습니다',
    items: [
      { code: '11060', name: '동대문구', what: '약정 체결 2026.10.21., 약정 2027–2030', src: 'eminwon 지정 공고 제2026-1459호, 보도' },
      { code: '11050', name: '광진구', what: '지정 공고 2026.11.03.', src: '공고 제2026-1409호, 보도 2026.11.04.' },
      { code: '11110', name: '노원구', what: '재공고 2026.09.18., 약정 2027–2030', src: '구 고시공고 검색 결과, 보도 2026.11.04.' }
    ],
    src: '출처: 각 구 고시·공고와 보도, 2026-11-11 확인. 구 경계: 통계청 2018 행정경계'
  },
  {
    id: 'seoul-heat', kind: 'heatmap', topic: '서울 임박 지도',
    say: '서울 25개 구 가운데\n4곳은 아직 결과 전입니다',
    showUntil: '2026-11-20',
    hot: [
      { code: '11140', mark: '▲1' },
      { code: '11030', mark: '▲1' },
      { code: '11210', mark: '▲1' },
      { code: '11080', mark: '△1' }
    ],
    hotLabel: '결과 전, 6개월 안',
    hotText: '마포구(접수 11.16–11.19), 용산구(재공고), 관악구, 성북구(보도 기준, 추정 △)',
    farLabel: '2026 회차 끝남',
    farText: '다음 회차는 약 4년 뒤(약정 4년 기준 추정)',
    note: '구청 금고만 칠한 예시입니다. 실제 지도는 지역 안의 모든 기관을 섞어 칠합니다.',
    src: '출처: 각 구 고시·공고와 보도, 2026-11-11 확인. 구 경계: 통계청 2018 행정경계'
  },
  {
    id: 'bids-six-months', kind: 'timeline', topic: '6개월 안 입찰',
    say: '6개월 안에 입찰이 잡힌 곳\n{count}곳, 가까운 순입니다',
    src: '기관 데이터에서 자동으로 계산합니다. 공고가 뜬 곳은 확정, 나머지는 약정 만료 기준 추정입니다.'
  },
  {
    id: 'org-cards', kind: 'cards', topic: '지자체 밖 기관',
    say: '지자체 밖 기관의\n은행 선정 소식입니다',
    items: [
      { name: '서울교통공사', kindLabel: '지방공기업', bank: '국민은행 우선협상', term: '약정 2027~2030(4년)', pending: true,
        src: '기준일=우선협상대상자 선정 보도일(2026-07-15, 근사 — 공고일 미확인, 본계약 체결 여부 미확인): KB국민은행 3회 연속(2020년부터), 차기 2027~2030(4년)' },
      { name: '부산교통공사', kindLabel: '지방공기업', bank: '부산은행 차기 선정', term: '약정 2027~2029(3년)', pending: true,
        src: '기준일=약정·보도일(2026-10-08, 근사 — 공고일 미확인): BNK부산은행 차기 선정, 약정 2027~2029(3년). 기존 약정 2026년 말 만료' },
      { name: '경기주택도시공사', kindLabel: '지방공기업', bank: '우리은행 우선협상', term: '4년(시작·만료일 미명시)', pending: true,
        src: '월/일 미확보 — 우리은행 우선협상(2024년 초 보도, 일자 미상), 4년(기사, 시작·만료일 미명시). 도금고(농협)와 별도 선정' }
    ],
    src: '출처: institutions_nonmuni.js 해당 기관의 sources(2026-11-11). 선정 결과를 확인한 것이 아니라 보도 기준입니다.'
  },
  {
    id: 'work-flow', kind: 'flow', topic: '탐지부터 결재까지',
    say: '공고를 찾은 뒤의 일도\n여기서 이어집니다',
    steps: [
      { title: '공고 탐지', desc: '지도에서 약정 만료가 가까운 곳을 찾습니다.' },
      { title: '참여 결정', desc: '입찰에 나갈지 팀이 정합니다.' },
      { title: '제안서 작성', desc: '제안서와 첨부 자료를 만듭니다.' },
      { title: '결재', desc: '영업부장 결재로 제출을 확정합니다.' }
    ],
    src: '2–4단계는 로그인하면 열립니다.'
  }
];
